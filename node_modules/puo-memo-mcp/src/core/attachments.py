"""
Attachment handling for PUO Memo
Manages file uploads, processing, and storage
"""
import os
import hashlib
import mimetypes
from pathlib import Path
from typing import Dict, Any, Optional, List, BinaryIO
import logging
import uuid
from datetime import datetime, timezone
import json
import asyncio
from io import BytesIO

# Image processing
try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False
    
# PDF processing
try:
    import PyPDF2
    PYPDF_AVAILABLE = True
except ImportError:
    PYPDF_AVAILABLE = False

# Google Cloud Storage
try:
    from google.cloud import storage as gcs
    GCS_AVAILABLE = True
except ImportError:
    GCS_AVAILABLE = False

# Vision processing
from src.core.vision import VisionProcessor

logger = logging.getLogger(__name__)


class AttachmentProcessor:
    """Process and store file attachments"""
    
    # Configuration
    MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
    THUMBNAIL_SIZE = (200, 200)
    ALLOWED_MIME_TYPES = {
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf',
        'text/plain', 'text/markdown', 'text/html',
        'application/json', 'application/xml',
        # Code files
        'text/x-python', 'text/x-javascript', 'text/x-typescript',
        'text/x-java', 'text/x-c', 'text/x-cpp', 'text/x-csharp',
        'text/x-go', 'text/x-rust', 'text/x-swift'
    }
    
    def __init__(self, db_connection, ai_assistant=None, storage_backend='local'):
        self.db = db_connection
        self.ai = ai_assistant
        self.storage_backend = storage_backend
        self.gcs_client = None
        self.gcs_bucket = None
        self.vision = VisionProcessor()
        
        # Initialize storage
        if storage_backend == 'gcs' and GCS_AVAILABLE:
            self._init_gcs()
        
    def _init_gcs(self):
        """Initialize Google Cloud Storage"""
        try:
            from src.utils.config import get_settings
            settings = get_settings()
            
            # Get GCS configuration from settings
            bucket_name = settings.gcs_bucket_name
            project_id = settings.gcs_project_id
            credentials_path = settings.gcs_credentials_path
            
            if not bucket_name:
                logger.warning("GCS_BUCKET_NAME not configured, falling back to local storage")
                self.storage_backend = 'local'
                return
                
            # Initialize GCS client
            if credentials_path and os.path.exists(credentials_path):
                self.gcs_client = gcs.Client.from_service_account_json(
                    credentials_path,
                    project=project_id
                )
            else:
                # Try default credentials
                self.gcs_client = gcs.Client(project=project_id)
                
            self.gcs_bucket = self.gcs_client.bucket(bucket_name)
            logger.info(f"✅ Initialized GCS storage with bucket: {bucket_name}")
            
        except Exception as e:
            logger.error(f"Failed to initialize GCS: {e}")
            self.storage_backend = 'local'
    
    async def attach_file(self, memory_id: str, file_path: str, 
                         user_description: Optional[str] = None,
                         metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Attach a file to a memory"""
        try:
            # Validate memory exists - handle both string and UUID formats
            try:
                memory_uuid = uuid.UUID(memory_id) if isinstance(memory_id, str) else memory_id
            except ValueError:
                return {"error": f"Invalid memory ID format: {memory_id}"}
                
            async with self.db.get_connection() as conn:
                memory_exists = await conn.fetchrow(
                    "SELECT id FROM memory_entities WHERE id = $1",
                    memory_uuid
                )
                if not memory_exists:
                    return {"error": f"Memory {memory_id} not found"}
            # Validate file
            file_path = Path(file_path)
            if not file_path.exists():
                return {"error": "File not found"}
                
            file_size = file_path.stat().st_size
            if file_size > self.MAX_FILE_SIZE:
                return {"error": f"File too large (max {self.MAX_FILE_SIZE / 1024 / 1024}MB)"}
            
            # Detect MIME type
            mime_type, _ = mimetypes.guess_type(str(file_path))
            if not mime_type:
                mime_type = 'application/octet-stream'
                
            if mime_type not in self.ALLOWED_MIME_TYPES and not mime_type.startswith(('image/', 'text/')):
                return {"error": f"File type not allowed: {mime_type}"}
            
            # Read file and calculate hash
            with open(file_path, 'rb') as f:
                file_data = f.read()
                file_hash = hashlib.sha256(file_data).hexdigest()
            
            # Check for duplicate
            async with self.db.get_connection() as conn:
                existing = await conn.fetchrow("""
                    SELECT id, filename FROM attachments 
                    WHERE file_hash = $1 AND memory_id = $2
                """, file_hash, memory_id)
                
                if existing:
                    logger.info(f"File already attached: {existing['filename']}")
                    return {"id": str(existing['id']), "duplicate": True}
            
            # Create attachment record
            attachment_id = str(uuid.uuid4())
            filename = file_path.name
            
            # Store file
            storage_path, storage_url = await self._store_file(
                attachment_id, memory_id, file_data, filename
            )
            
            # Create database record
            async with self.db.get_connection() as conn:
                await conn.execute("""
                    INSERT INTO attachments 
                    (id, memory_id, filename, original_filename, mime_type, 
                     file_size, file_hash, storage_type, storage_path, storage_url,
                     user_description, upload_status)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'completed')
                """, attachment_id, memory_id, filename, filename, mime_type,
                    file_size, file_hash, self.storage_backend, storage_path, 
                    storage_url, user_description)
            
            # Process file asynchronously
            try:
                from src.utils.background_tasks import task_queue, TaskPriority
                if task_queue.running:
                    # Use background task queue
                    task_id = await task_queue.add_task(
                        task_type="process_attachment",
                        name=f"Process {filename}",
                        priority=TaskPriority.NORMAL,
                        attachment_id=attachment_id,
                        file_data=file_data,
                        mime_type=mime_type,
                        processor=self
                    )
                    logger.info(f"Scheduled attachment processing: {task_id}")
                else:
                    # Fallback to simple async task
                    asyncio.create_task(self._process_attachment(attachment_id, file_data, mime_type))
            except Exception as e:
                logger.warning(f"Could not schedule async processing: {e}")
                # Fallback to simple async task
                asyncio.create_task(self._process_attachment(attachment_id, file_data, mime_type))
            
            return {
                "id": attachment_id,
                "filename": filename,
                "mime_type": mime_type,
                "size": file_size,
                "url": storage_url
            }
            
        except Exception as e:
            logger.error(f"Failed to attach file: {e}")
            return {"error": str(e)}
    
    async def _store_file(self, attachment_id: str, memory_id: str, 
                         file_data: bytes, filename: str) -> tuple[str, Optional[str]]:
        """Store file and return (storage_path, url)"""
        if self.storage_backend == 'gcs' and self.gcs_bucket:
            # Store in GCS
            blob_path = f"attachments/{memory_id}/{attachment_id}/{filename}"
            blob = self.gcs_bucket.blob(blob_path)
            
            # Upload file
            blob.upload_from_string(file_data)
            
            # For now, just return the GCS path
            # To generate signed URLs, you'll need a service account key
            gcs_url = f"gs://{self.gcs_bucket.name}/{blob_path}"
            logger.info(f"File uploaded to {gcs_url}")
            
            return blob_path, gcs_url
            
        else:
            # Store locally
            local_dir = Path("attachments") / str(memory_id) / str(attachment_id)
            local_dir.mkdir(parents=True, exist_ok=True)
            
            file_path = local_dir / filename
            with open(file_path, 'wb') as f:
                f.write(file_data)
            
            return str(file_path), None
    
    async def _process_attachment(self, attachment_id: str, file_data: bytes, mime_type: str):
        """Process attachment based on type"""
        try:
            async with self.db.get_connection() as conn:
                # Update status
                await conn.execute("""
                    UPDATE attachments 
                    SET processing_status = 'processing' 
                    WHERE id = $1
                """, attachment_id)
            
            # Process based on type
            if mime_type.startswith('image/'):
                await self._process_image(attachment_id, file_data, mime_type)
            elif mime_type == 'application/pdf':
                await self._process_pdf(attachment_id, file_data)
            elif mime_type.startswith('text/'):
                await self._process_text(attachment_id, file_data, mime_type)
            
            # Update status
            async with self.db.get_connection() as conn:
                await conn.execute("""
                    UPDATE attachments 
                    SET processing_status = 'completed',
                        processed_at = $2
                    WHERE id = $1
                """, attachment_id, datetime.now(timezone.utc))
                
        except Exception as e:
            logger.error(f"Failed to process attachment {attachment_id}: {e}")
            async with self.db.get_connection() as conn:
                await conn.execute("""
                    UPDATE attachments 
                    SET processing_status = 'failed',
                        error_message = $2
                    WHERE id = $1
                """, attachment_id, str(e))
    
    async def _process_image(self, attachment_id: str, image_data: bytes, mime_type: str):
        """Process image attachment with enhanced vision capabilities"""
        try:
            # First, save image to temp file for vision processing
            import tempfile
            with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp_file:
                tmp_file.write(image_data)
                tmp_path = tmp_file.name
            
            # Use vision processor for comprehensive analysis
            vision_analysis = None
            if self.vision.enabled:
                # Detect if it's a screenshot
                if 'screenshot' in str(attachment_id).lower() or PIL_AVAILABLE:
                    try:
                        img = Image.open(BytesIO(image_data))
                        # Simple heuristic: screenshots often have specific aspect ratios
                        is_screenshot = (img.width > 800 and img.height > 600 and 
                                       img.width / img.height in [16/9, 16/10, 4/3])
                        
                        if is_screenshot:
                            vision_analysis = await self.vision.analyze_screenshot(tmp_path)
                        else:
                            vision_analysis = await self.vision.analyze_image(tmp_path)
                    except:
                        vision_analysis = await self.vision.analyze_image(tmp_path)
                else:
                    vision_analysis = await self.vision.analyze_image(tmp_path)
            
            # Clean up temp file
            Path(tmp_path).unlink(missing_ok=True)
            
            # Extract all relevant information
            metadata = vision_analysis.get('metadata', {}) if vision_analysis else {}
            description = vision_analysis.get('description', '') if vision_analysis else None
            extracted_text = vision_analysis.get('extracted_text', '') if vision_analysis else ''
            entities = vision_analysis.get('entities', []) if vision_analysis else []
            
            # Combine all text for embedding
            combined_text = f"{description or ''}\n{extracted_text}".strip()
            if vision_analysis and 'technical_details' in vision_analysis:
                combined_text += f"\n{vision_analysis['technical_details']}"
            
            # Generate thumbnail if PIL available
            thumb_path = None
            thumb_url = None
            if PIL_AVAILABLE:
                try:
                    image = Image.open(BytesIO(image_data))
                    thumbnail = image.copy()
                    thumbnail.thumbnail(self.THUMBNAIL_SIZE)
                    
                    thumb_buffer = BytesIO()
                    thumbnail.save(thumb_buffer, format=image.format or 'PNG')
                    thumb_data = thumb_buffer.getvalue()
                    
                    async with self.db.get_connection() as conn:
                        attachment = await conn.fetchrow("""
                            SELECT memory_id, filename FROM attachments WHERE id = $1
                        """, attachment_id)
                        
                        thumb_path, thumb_url = await self._store_file(
                            attachment_id, 
                            str(attachment['memory_id']),
                            thumb_data,
                            f"thumb_{attachment['filename']}"
                        )
                except Exception as e:
                    logger.error(f"Thumbnail generation failed: {e}")
            
            # Generate embedding
            embedding = None
            embedding_model = None
            if self.ai and self.ai.enabled and combined_text:
                embedding = await self.ai.generate_embedding(combined_text)
                if embedding:
                    embedding_model = self.ai.embedding_model_name
            
            # Update database with comprehensive vision analysis
            async with self.db.get_connection() as conn:
                update_params = [
                    attachment_id,
                    json.dumps(metadata),
                    description,
                    thumb_path,
                    thumb_url,
                    extracted_text,
                    json.dumps(vision_analysis) if vision_analysis else None
                ]
                
                if embedding:
                    embedding_str = '[' + ','.join(str(x) for x in embedding) + ']'
                    await conn.execute("""
                        UPDATE attachments
                        SET extracted_metadata = $2,
                            content_description = $3,
                            thumbnail_path = $4,
                            thumbnail_url = $5,
                            extracted_text = $6,
                            vision_analysis = $7,
                            content_embedding = $8::vector,
                            embedding_model = $9
                        WHERE id = $1
                    """, *update_params, embedding_str, embedding_model)
                else:
                    await conn.execute("""
                        UPDATE attachments
                        SET extracted_metadata = $2,
                            content_description = $3,
                            thumbnail_path = $4,
                            thumbnail_url = $5,
                            extracted_text = $6,
                            vision_analysis = $7
                        WHERE id = $1
                    """, *update_params)
            
            # Store entities for knowledge graph
            if entities and hasattr(self.db, 'store_attachment_entities'):
                await self.db.store_attachment_entities(attachment_id, entities)
                    
        except Exception as e:
            logger.error(f"Image processing failed: {e}")
            raise
    
    async def _process_pdf(self, attachment_id: str, pdf_data: bytes):
        """Process PDF attachment with enhanced vision capabilities"""
        try:
            # Save PDF to temp file for vision processing
            import tempfile
            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp_file:
                tmp_file.write(pdf_data)
                tmp_path = tmp_file.name
            
            # Use vision processor for smart PDF analysis
            vision_result = None
            if self.vision.enabled:
                vision_result = await self.vision.analyze_pdf_with_vision(
                    tmp_path,
                    auto_detect_complex_pages=True
                )
            
            # Clean up temp file
            Path(tmp_path).unlink(missing_ok=True)
            
            # Extract information from vision analysis or fallback to PyPDF2
            if vision_result and 'full_text' in vision_result:
                extracted_text = vision_result['full_text']
                metadata = {
                    "pages": vision_result.get('page_count', 0),
                    "has_vision_analysis": vision_result.get('has_vision_analysis', False),
                    "entities": vision_result.get('entities', [])
                }
                
                # Store detailed page analyses
                page_analyses = vision_result.get('page_analyses', [])
                
            elif PYPDF_AVAILABLE:
                # Fallback to basic PyPDF2 extraction
                pdf_reader = PyPDF2.PdfReader(BytesIO(pdf_data))
                
                metadata = {
                    "pages": len(pdf_reader.pages),
                    "encrypted": pdf_reader.is_encrypted
                }
                
                if pdf_reader.metadata:
                    metadata.update({
                        "title": pdf_reader.metadata.get('/Title'),
                        "author": pdf_reader.metadata.get('/Author'),
                        "subject": pdf_reader.metadata.get('/Subject'),
                        "creator": pdf_reader.metadata.get('/Creator'),
                    })
                
                # Extract text
                text_content = []
                for i, page in enumerate(pdf_reader.pages[:50]):  # Increased limit
                    try:
                        text = page.extract_text()
                        if text:
                            text_content.append(f"Page {i+1}:\n{text}")
                    except Exception as e:
                        logger.warning(f"Failed to extract text from page {i+1}: {e}")
                
                extracted_text = "\n\n".join(text_content)
                page_analyses = None
            else:
                logger.warning("No PDF processing available")
                return
            
            # Generate embedding
            embedding = None
            embedding_model = None
            if extracted_text and self.ai and self.ai.enabled:
                # Use more text for better context
                embedding = await self.ai.generate_embedding(extracted_text[:8000])
                if embedding:
                    embedding_model = self.ai.embedding_model_name
            
            # Create comprehensive description
            description = None
            if vision_result and 'page_analyses' in vision_result:
                # Extract key points from vision analysis
                key_points = []
                for page in vision_result['page_analyses']:
                    if page['type'] == 'vision_analysis' and 'key_points' in page.get('content', {}):
                        key_points.extend(page['content']['key_points'])
                
                if key_points:
                    description = "Key points: " + "; ".join(key_points[:5])
            
            # Update database with comprehensive analysis
            async with self.db.get_connection() as conn:
                update_params = [
                    attachment_id,
                    json.dumps(metadata),
                    extracted_text,
                    description,
                    json.dumps(page_analyses) if page_analyses else None
                ]
                
                if embedding:
                    embedding_str = '[' + ','.join(str(x) for x in embedding) + ']'
                    await conn.execute("""
                        UPDATE attachments
                        SET extracted_metadata = $2,
                            extracted_text = $3,
                            content_description = $4,
                            vision_analysis = $5,
                            content_embedding = $6::vector,
                            embedding_model = $7
                        WHERE id = $1
                    """, *update_params, embedding_str, embedding_model)
                else:
                    await conn.execute("""
                        UPDATE attachments
                        SET extracted_metadata = $2,
                            extracted_text = $3,
                            content_description = $4,
                            vision_analysis = $5
                        WHERE id = $1
                    """, *update_params)
            
            # Store entities if found
            if metadata.get('entities') and hasattr(self.db, 'store_attachment_entities'):
                await self.db.store_attachment_entities(attachment_id, metadata['entities'])
                    
        except Exception as e:
            logger.error(f"PDF processing failed: {e}")
            raise
    
    async def _process_text(self, attachment_id: str, text_data: bytes, mime_type: str):
        """Process text/code attachment"""
        try:
            # Decode text
            try:
                text_content = text_data.decode('utf-8')
            except UnicodeDecodeError:
                text_content = text_data.decode('latin-1')
            
            # Detect programming language from mime type
            language = None
            if 'python' in mime_type:
                language = 'python'
            elif 'javascript' in mime_type:
                language = 'javascript'
            elif 'typescript' in mime_type:
                language = 'typescript'
            # Add more language detection as needed
            
            metadata = {
                "lines": len(text_content.splitlines()),
                "characters": len(text_content),
                "language": language
            }
            
            # Generate embedding
            embedding = None
            embedding_model = None
            if self.ai and self.ai.enabled:
                embedding = await self.ai.generate_embedding(text_content[:5000])
                if embedding:
                    embedding_model = self.ai.embedding_model_name
            
            # Update database
            async with self.db.get_connection() as conn:
                if embedding:
                    embedding_str = '[' + ','.join(str(x) for x in embedding) + ']'
                    await conn.execute("""
                        UPDATE attachments
                        SET extracted_metadata = $2,
                            extracted_text = $3,
                            content_embedding = $4::vector,
                            embedding_model = $5
                        WHERE id = $1
                    """, attachment_id, json.dumps(metadata), text_content,
                        embedding_str, embedding_model)
                else:
                    await conn.execute("""
                        UPDATE attachments
                        SET extracted_metadata = $2,
                            extracted_text = $3
                        WHERE id = $1
                    """, attachment_id, json.dumps(metadata), text_content)
                    
        except Exception as e:
            logger.error(f"Text processing failed: {e}")
            raise
    
    async def get_memory_attachments(self, memory_id: str) -> List[Dict[str, Any]]:
        """Get all attachments for a memory"""
        try:
            async with self.db.get_connection() as conn:
                results = await conn.fetch("""
                    SELECT id, filename, mime_type, file_size, 
                           user_description, content_description,
                           storage_url, thumbnail_url, created_at,
                           upload_status, processing_status
                    FROM attachments
                    WHERE memory_id = $1
                    ORDER BY created_at DESC
                """, memory_id)
                
                attachments = []
                for row in results:
                    attachments.append({
                        "id": str(row['id']),
                        "filename": row['filename'],
                        "mime_type": row['mime_type'],
                        "size": row['file_size'],
                        "description": row['user_description'] or row['content_description'],
                        "url": row['storage_url'],
                        "thumbnail_url": row['thumbnail_url'],
                        "created_at": row['created_at'].isoformat(),
                        "status": {
                            "upload": row['upload_status'],
                            "processing": row['processing_status']
                        }
                    })
                
                return attachments
                
        except Exception as e:
            logger.error(f"Failed to get attachments: {e}")
            return []