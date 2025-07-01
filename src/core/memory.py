"""
Core memory operations for PUO Memo
"""
import json
import uuid
from typing import Dict, Any, List, Optional, Literal
from datetime import datetime, timezone
import logging
import re

from src.core.cache import cache_manager

logger = logging.getLogger(__name__)

# UUID pattern for validation
UUID_PATTERN = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.IGNORECASE)

def is_valid_uuid(value: str) -> bool:
    """Check if a string is a valid UUID format"""
    return bool(UUID_PATTERN.match(value))

# Import deduplication if available
try:
    from src.core.deduplication import DeduplicationManager, DeduplicationMemoryStore
    DEDUP_AVAILABLE = True
except ImportError:
    DEDUP_AVAILABLE = False
    logger.info("Deduplication module not available")


class MemoryStore:
    """Core memory operations - handles CRUD operations for memories"""
    
    def __init__(self, db_connection, ai_assistant=None, knowledge_graph=None, entity_extractor=None, attachment_processor=None, config=None):
        self.db = db_connection
        self.ai = ai_assistant
        self.knowledge_graph = knowledge_graph
        self.entity_extractor = entity_extractor
        self.attachment_processor = attachment_processor
        self.current_context = "default"
        self.config = config
        
        # Initialize versioning
        from src.core.memory_versioning import MemoryVersioning
        self.versioning = MemoryVersioning(db_connection)
        
        # Initialize date validator
        from src.core.date_validator import DateValidator
        self.date_validator = DateValidator()
        
        # Initialize NLP search
        self.nlp_search = None
        
        # Initialize deduplication if available
        self.dedup_enabled = False
        self.dedup_store = None
        if DEDUP_AVAILABLE and ai_assistant and ai_assistant.enabled:
            try:
                self.dedup_manager = DeduplicationManager(db_connection, ai_assistant, config)
                self.dedup_store = DeduplicationMemoryStore(self, self.dedup_manager)
                self.dedup_enabled = True
                logger.info("✅ Deduplication enabled")
            except Exception as e:
                logger.warning(f"Could not enable deduplication: {e}")
    
    async def create(self, content: str, title: Optional[str] = None,
                    memory_type: str = "general", tags: Optional[List[str]] = None,
                    attachments: Optional[List[str]] = None,
                    metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Create a new memory with optional embedding"""
        # Input validation
        if not content or not content.strip():
            raise ValueError("Content cannot be empty")
        
        # Validate dates in content
        date_validation = self.date_validator.validate_content(content)
        if date_validation['has_warnings']:
            logger.warning(f"Date validation warnings: {date_validation['warnings']}")
            # Add warnings to metadata
            if metadata is None:
                metadata = {}
            metadata['date_warnings'] = date_validation['warnings']
            metadata['date_validation'] = {
                'checked_at': datetime.now(timezone.utc).isoformat(),
                'found_dates': date_validation['found_dates'],
                'suggestions': date_validation['suggestions']
            }
        
        try:
            # Generate title if not provided
            if not title:
                title = content[:100] + "..." if len(content) > 100 else content
            
            # Generate embedding if AI is available
            embedding = None
            embedding_model = None
            generate_async = metadata and metadata.get('async_embedding', False)
            
            if self.ai and self.ai.enabled and not generate_async:
                logger.info("Generating embedding for new memory...")
                embedding = await self.ai.generate_embedding(content)
                if embedding:
                    embedding_model = self.ai.embedding_model_name
                    logger.info("✅ Embedding generated successfully")
                else:
                    logger.warning("Failed to generate embedding, saving without it")
            
            # Prepare data
            memory_id = str(uuid.uuid4())
            tags = tags or []
            if metadata is None:
                metadata = {}
            metadata.update({
                "created_via": "puo_memo",
                "version": "2.0"
            })
            
            # Insert into database
            async with self.db.get_connection() as conn:
                if embedding:
                    # Convert embedding list to PostgreSQL vector format
                    embedding_str = '[' + ','.join(str(x) for x in embedding) + ']'
                    await conn.execute("""
                        INSERT INTO memory_entities 
                        (id, content, title, memory_type, tags, metadata, project_context, 
                         created_at, embedding, embedding_model)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector, $10)
                    """, memory_id, content, title, memory_type, tags, json.dumps(metadata),
                        self.current_context, datetime.now(timezone.utc), embedding_str, embedding_model)
                else:
                    await conn.execute("""
                        INSERT INTO memory_entities 
                        (id, content, title, memory_type, tags, metadata, project_context, created_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    """, memory_id, content, title, memory_type, tags, json.dumps(metadata),
                        self.current_context, datetime.now(timezone.utc))
            
            # Extract entities and relations if extractor is available
            extracted_entities = []
            if self.entity_extractor and self.knowledge_graph:
                try:
                    logger.info("Extracting entities and relations...")
                    entities, relations = await self.entity_extractor.extract_entities_and_relations(content)
                    
                    # Store entities
                    for entity in entities:
                        await self.knowledge_graph.create_or_update_entity(entity)
                        extracted_entities.append(entity.name)
                    
                    # Store relations
                    for relation in relations:
                        await self.knowledge_graph.create_relation(relation, memory_id)
                    
                    # Associate memory with entities
                    await self.knowledge_graph.associate_memory_with_entities(memory_id, entities)
                    
                    # Mark memory as entities extracted
                    async with self.db.get_connection() as conn:
                        await conn.execute("""
                            UPDATE memory_entities
                            SET entities_extracted = true,
                                extraction_metadata = $2
                            WHERE id = $1
                        """, memory_id, json.dumps({
                            "entities_count": len(entities),
                            "relations_count": len(relations),
                            "extracted_at": datetime.now(timezone.utc).isoformat()
                        }))
                    
                    logger.info(f"✅ Extracted {len(entities)} entities and {len(relations)} relations")
                    
                except Exception as e:
                    logger.error(f"Entity extraction failed: {e}")
            
            # Process attachments if provided
            attached_files = []
            failed_attachments = []
            if attachments and self.attachment_processor:
                logger.info(f"Processing {len(attachments)} attachments...")
                for attachment_path in attachments:
                    try:
                        # Handle URLs differently
                        if attachment_path.startswith(('http://', 'https://')):
                            # Download and attach URL content
                            logger.info(f"Downloading URL attachment: {attachment_path}")
                            from src.utils.url_downloader import download_url_content
                            
                            try:
                                text_content, temp_file, url_metadata = await download_url_content(attachment_path)
                                
                                # Attach the downloaded file
                                result = await self.attachment_processor.attach_file(
                                    memory_id=memory_id,
                                    file_path=temp_file,
                                    metadata={
                                        'source_url': attachment_path,
                                        'content_type': url_metadata.get('content_type'),
                                        'original_filename': url_metadata.get('filename'),
                                    }
                                )
                                
                                # Clean up temp file
                                import os
                                if os.path.exists(temp_file):
                                    os.unlink(temp_file)
                                    
                                if "error" not in result:
                                    attached_files.append(result)
                                    logger.info(f"✅ Attached URL content: {url_metadata.get('filename')}")
                                    
                                    # If it's a text-based file, append content to memory
                                    if url_metadata.get('content_type', '').startswith('text/') and len(text_content) < 10000:
                                        content += f"\n\n--- Content from {attachment_path} ---\n{text_content[:5000]}"
                                        if len(text_content) > 5000:
                                            content += f"\n... (truncated, {len(text_content) - 5000} chars omitted)"
                                else:
                                    logger.error(f"Failed to attach URL {attachment_path}: {result['error']}")
                                    failed_attachments.append({
                                        'path': attachment_path,
                                        'error': result['error']
                                    })
                                    
                            except Exception as url_error:
                                logger.error(f"Failed to download URL {attachment_path}: {url_error}")
                                failed_attachments.append({
                                    'path': attachment_path,
                                    'error': str(url_error)
                                })
                        else:
                            # Attach local file
                            result = await self.attachment_processor.attach_file(
                                memory_id=memory_id,
                                file_path=attachment_path
                            )
                            if "error" not in result:
                                attached_files.append(result)
                                logger.info(f"✅ Attached: {result['filename']}")
                            else:
                                logger.error(f"Failed to attach {attachment_path}: {result['error']}")
                                failed_attachments.append({
                                    'path': attachment_path,
                                    'error': result['error']
                                })
                    except Exception as e:
                        logger.error(f"Failed to process attachment {attachment_path}: {e}")
                        failed_attachments.append({
                            'path': attachment_path,
                            'error': str(e)
                        })
            
            # Schedule async tasks if needed
            if generate_async and self.ai and self.ai.enabled:
                try:
                    from src.utils.background_tasks import task_queue, TaskPriority
                    if task_queue.running:
                        # Schedule embedding generation
                        task_id = await task_queue.add_task(
                            task_type="generate_embedding",
                            name=f"Embedding for memory {memory_id[:8]}",
                            priority=TaskPriority.NORMAL,
                            memory_id=memory_id,
                            content=content,
                            ai_client=self.ai,
                            db_connection=self.db
                        )
                        logger.info(f"Scheduled async embedding generation: {task_id}")
                except Exception as e:
                    logger.warning(f"Could not schedule async task: {e}")
            
            result = {
                "id": memory_id,
                "title": title,
                "type": memory_type,
                "tags": tags,
                "context": self.current_context,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "has_embedding": embedding is not None,
                "extracted_entities": extracted_entities,
                "attachments": attached_files,
                "async_tasks": metadata.get('async_tasks', []) if generate_async else []
            }
            
            # Add failed attachments info if any
            if failed_attachments:
                result["failed_attachments"] = failed_attachments
                result["attachment_errors"] = f"{len(failed_attachments)} attachment(s) failed"
                
            return result
            
        except Exception as e:
            logger.error(f"Failed to create memory: {e}")
            return {"error": str(e)}
    
    async def create_with_dedup(self, 
                               content: str, 
                               title: Optional[str] = None,
                               memory_type: str = "general", 
                               tags: Optional[List[str]] = None,
                               attachments: Optional[List[str]] = None,
                               metadata: Optional[Dict[str, Any]] = None,
                               dedup_window: Optional[int] = None,
                               force: bool = False,
                               merge_strategy: str = 'smart') -> Dict[str, Any]:
        """
        Create memory with deduplication check
        
        Returns dict with status:
        - 'created': New memory created
        - 'duplicate_found': Similar memory exists
        - 'updated': Existing memory updated (for MemoryLane auto-merge)
        """
        if self.dedup_enabled and self.dedup_store:
            return await self.dedup_store.create_with_dedup(
                content=content,
                title=title,
                memory_type=memory_type,
                tags=tags,
                attachments=attachments,
                metadata=metadata,
                dedup_window=dedup_window,
                force=force,
                merge_strategy=merge_strategy
            )
        else:
            # Fallback to regular create
            memory = await self.create(content, title, memory_type, tags, attachments)
            return {
                'status': 'created',
                'memory': memory,
                'message': 'Deduplication not available, created normally'
            }
    
    async def update_or_merge(self,
                             memory_id: str,
                             new_content: Optional[str] = None,
                             new_tags: Optional[List[str]] = None,
                             new_attachments: Optional[List[str]] = None,
                             merge_strategy: str = 'smart') -> Dict[str, Any]:
        """Update existing memory with smart merging"""
        if self.dedup_enabled and self.dedup_store:
            return await self.dedup_store.update_or_merge(
                memory_id=memory_id,
                new_content=new_content,
                new_tags=new_tags,
                new_attachments=new_attachments,
                merge_strategy=merge_strategy
            )
        else:
            # Fallback to regular update
            result = await self.update(memory_id, new_content, tags=new_tags)
            if new_attachments and self.attachment_processor:
                for attachment in new_attachments:
                    await self.attachment_processor.attach_file(memory_id, attachment)
            return {'status': 'updated', 'memory_id': memory_id}
    
    async def find_duplicates(self, 
                             context: Optional[str] = None,
                             time_range: Optional[int] = None) -> List[Dict[str, Any]]:
        """Find exact duplicate memories"""
        if self.dedup_enabled and self.dedup_store:
            return await self.dedup_store.find_exact_duplicates(context, time_range)
        else:
            return []
    
    async def search(self, query: str, limit: int = 10, offset: int = 0, include_full_content: bool = False) -> Dict[str, Any]:
        """Search memories using text search - with UUID detection for direct access"""
        try:
            # Check if query is a UUID - if so, use direct database access
            if is_valid_uuid(query.strip()):
                logger.info(f"UUID detected in search query, using direct database access for: {query}")
                return await self.get_memory_by_id(query.strip(), include_full_content)
            
            # Regular text search
            async with self.db.get_connection() as conn:
                results = await conn.fetch("""
                    SELECT id, title, content, memory_type, tags, created_at, has_correction
                    FROM memory_entities
                    WHERE (
                        content ILIKE $1 OR 
                        title ILIKE $1 OR 
                        $2 = ANY(tags)
                    )
                    AND project_context = $3
                    ORDER BY created_at DESC
                    LIMIT $4 OFFSET $5
                """, f"%{query}%", query, self.current_context, limit, offset)
            
            memories = []
            for row in results:
                memory_dict = {
                    "id": str(row['id']),
                    "title": row['title'],
                    "content": row['content'] if include_full_content else (row['content'][:200] + "..." if len(row['content']) > 200 else row['content']),
                    "type": row['memory_type'],
                    "tags": row['tags'],
                    "created_at": row['created_at'].isoformat(),
                    "has_correction": row['has_correction'] if 'has_correction' in row else False
                }
                
                # If content was truncated, indicate that full content is available
                if not include_full_content and len(row['content']) > 200:
                    memory_dict['content_truncated'] = True
                    memory_dict['content_length'] = len(row['content'])
                
                # Get attachments for this memory if processor is available
                if self.attachment_processor:
                    attachments = await self.attachment_processor.get_memory_attachments(str(row['id']))
                    if attachments:
                        memory_dict['attachments'] = attachments
                
                memories.append(memory_dict)
            
            return {
                "query": query,
                "search_type": "keyword",
                "count": len(memories),
                "results": memories
            }
            
        except Exception as e:
            logger.error(f"Search failed: {e}")
            return {"error": str(e), "results": []}
    
    async def update(self, memory_id: str, content: Optional[str] = None,
                    title: Optional[str] = None, tags: Optional[List[str]] = None) -> Dict[str, Any]:
        """Update an existing memory and regenerate embedding if content changed"""
        try:
            # Build update query dynamically
            updates = []
            params = []
            param_count = 1
            regenerate_embedding = False
            
            if content is not None:
                updates.append(f"content = ${param_count}")
                params.append(content)
                param_count += 1
                regenerate_embedding = True  # Content changed, need new embedding
            
            if title is not None:
                updates.append(f"title = ${param_count}")
                params.append(title)
                param_count += 1
                
            if tags is not None:
                updates.append(f"tags = ${param_count}")
                params.append(tags)
                param_count += 1
            
            if not updates:
                return {"error": "No updates provided"}
            
            # Generate new embedding if content changed and AI is available
            if regenerate_embedding and self.ai and self.ai.enabled:
                logger.info("Regenerating embedding for updated content...")
                embedding = await self.ai.generate_embedding(content)
                if embedding:
                    # Convert embedding list to PostgreSQL vector format
                    embedding_str = '[' + ','.join(str(x) for x in embedding) + ']'
                    updates.append(f"embedding = ${param_count}::vector")
                    params.append(embedding_str)
                    param_count += 1
                    
                    updates.append(f"embedding_model = ${param_count}")
                    params.append(self.ai.embedding_model_name)
                    param_count += 1
                    logger.info("✅ New embedding generated")
            
            # Add updated_at
            updates.append(f"updated_at = ${param_count}")
            params.append(datetime.now(timezone.utc))
            param_count += 1
            
            # Add memory_id as last parameter
            params.append(memory_id)
            
            # Execute update
            async with self.db.get_connection() as conn:
                result = await conn.execute(f"""
                    UPDATE memory_entities
                    SET {', '.join(updates)}
                    WHERE id = ${param_count}
                """, *params)
            
            if result == "UPDATE 0":
                return {"error": "Memory not found"}
            
            return {"success": True, "id": memory_id}
            
        except Exception as e:
            logger.error(f"Update failed: {e}")
            return {"error": str(e)}
    
    async def get(self, memory_id: str) -> Dict[str, Any]:
        """Get a single memory with full content"""
        try:
            async with self.db.get_connection() as conn:
                row = await conn.fetchrow("""
                    SELECT id, title, content, memory_type, tags, metadata, 
                           project_context, created_at, updated_at
                    FROM memory_entities
                    WHERE id = $1
                """, memory_id)
            
            if not row:
                return {"error": "Memory not found"}
            
            memory_dict = {
                "id": str(row['id']),
                "title": row['title'],
                "content": row['content'],  # Full content, not truncated
                "type": row['memory_type'],
                "tags": row['tags'],
                "metadata": json.loads(row['metadata']) if row['metadata'] else {},
                "project_context": row['project_context'],
                "created_at": row['created_at'].isoformat(),
                "updated_at": row['updated_at'].isoformat() if row['updated_at'] else None
            }
            
            # Get attachments if processor is available
            if self.attachment_processor:
                attachments = await self.attachment_processor.get_memory_attachments(memory_id)
                if attachments:
                    memory_dict['attachments'] = attachments
            
            # Get associated entities if knowledge graph is available
            if self.knowledge_graph:
                try:
                    entities = await self.knowledge_graph.get_memory_entities(memory_id)
                    if entities:
                        memory_dict['entities'] = entities
                except Exception as e:
                    logger.warning(f"Could not get entities for memory: {e}")
            
            return memory_dict
            
        except Exception as e:
            logger.error(f"Get memory failed: {e}")
            return {"error": str(e)}
    
    async def get_memory_by_id(self, memory_id: str, include_full_content: bool = True) -> Dict[str, Any]:
        """
        Direct database access for memory retrieval by ID - bypasses search entirely
        Optimized for UUID-based lookups with proper search result formatting
        """
        try:
            # Validate UUID format first
            if not is_valid_uuid(memory_id):
                return {
                    "query": memory_id,
                    "search_type": "direct_db_query",
                    "count": 0,
                    "results": [],
                    "error": "Invalid UUID format"
                }
            
            async with self.db.get_connection() as conn:
                row = await conn.fetchrow("""
                    SELECT id, title, content, memory_type, tags, metadata, 
                           project_context, created_at, updated_at, has_correction
                    FROM memory_entities
                    WHERE id = $1
                """, memory_id)
            
            if not row:
                return {
                    "query": memory_id,
                    "search_type": "direct_db_query", 
                    "count": 0,
                    "results": []
                }
            
            memory_dict = {
                "id": str(row['id']),
                "title": row['title'],
                "content": row['content'] if include_full_content else (row['content'][:200] + "..." if len(row['content']) > 200 else row['content']),
                "type": row['memory_type'],
                "tags": row['tags'],
                "created_at": row['created_at'].isoformat(),
                "has_correction": row['has_correction'] if 'has_correction' in row else False
            }
            
            # If content was truncated, indicate that full content is available
            if not include_full_content and len(row['content']) > 200:
                memory_dict['content_truncated'] = True
                memory_dict['content_length'] = len(row['content'])
            
            # Get attachments if processor is available
            if self.attachment_processor:
                attachments = await self.attachment_processor.get_memory_attachments(memory_id)
                if attachments:
                    memory_dict['attachments'] = attachments
            
            return {
                "query": memory_id,
                "search_type": "direct_db_query",
                "count": 1,
                "results": [memory_dict]
            }
            
        except Exception as e:
            logger.error(f"Get memory by ID failed: {e}")
            return {
                "query": memory_id,
                "search_type": "direct_db_query",
                "count": 0,
                "results": [],
                "error": str(e)
            }
    
    async def delete(self, memory_id: str) -> Dict[str, Any]:
        """Delete a memory"""
        try:
            async with self.db.get_connection() as conn:
                result = await conn.execute("""
                    DELETE FROM memory_entities WHERE id = $1
                """, memory_id)
            
            if result == "DELETE 0":
                return {"error": "Memory not found"}
            
            # Invalidate cache for this memory
            await cache_manager.invalidate_memory(memory_id)
            
            return {"success": True, "id": memory_id}
            
        except Exception as e:
            logger.error(f"Delete failed: {e}")
            return {"error": str(e)}
    
    async def list(self, limit: int = 20, offset: int = 0) -> Dict[str, Any]:
        """List recent memories"""
        try:
            async with self.db.get_connection() as conn:
                # Get total count
                count_result = await conn.fetchval("""
                    SELECT COUNT(*) FROM memory_entities WHERE project_context = $1
                """, self.current_context)
                
                # Get memories
                results = await conn.fetch("""
                    SELECT id, title, memory_type, tags, created_at
                    FROM memory_entities
                    WHERE project_context = $1
                    ORDER BY created_at DESC
                    LIMIT $2 OFFSET $3
                """, self.current_context, limit, offset)
            
            memories = []
            for row in results:
                memories.append({
                    "id": str(row['id']),
                    "title": row['title'],
                    "type": row['memory_type'],
                    "tags": row['tags'],
                    "created_at": row['created_at'].isoformat()
                })
            
            return {
                "total": count_result,
                "limit": limit,
                "offset": offset,
                "memories": memories
            }
            
        except Exception as e:
            logger.error(f"List memories failed: {e}")
            return {"error": str(e)}
    
    async def semantic_search(self, query: str, limit: int = 10, offset: int = 0, similarity_threshold: float = None, include_full_content: bool = False) -> Dict[str, Any]:
        """Search memories using semantic similarity with embeddings - with UUID detection"""
        try:
            # Check if query is a UUID - if so, use direct database access
            if is_valid_uuid(query.strip()):
                logger.info(f"UUID detected in semantic search, using direct database access for: {query}")
                return await self.get_memory_by_id(query.strip(), include_full_content)
            
            # Use configured threshold if not provided
            if similarity_threshold is None:
                if self.config:
                    from src.utils.config import get_settings
                    settings = get_settings()
                    similarity_threshold = settings.semantic_search_threshold
                else:
                    similarity_threshold = 0.5  # Default fallback
            
            # Generate query embedding
            if not self.ai or not self.ai.enabled:
                logger.warning("AI not available, falling back to keyword search")
                return await self.search(query, limit, offset, include_full_content)
            
            query_embedding = await self.ai.generate_query_embedding(query)
            if not query_embedding:
                logger.warning("Failed to generate query embedding, falling back to keyword search")
                return await self.search(query, limit, offset, include_full_content)
            
            # Convert query embedding to PostgreSQL vector format
            query_embedding_str = '[' + ','.join(str(x) for x in query_embedding) + ']'
            
            # Search using cosine similarity
            async with self.db.get_connection() as conn:
                results = await conn.fetch("""
                    SELECT id, title, content, memory_type, tags, created_at, has_correction,
                           1 - (embedding <=> $1::vector) as similarity
                    FROM memory_entities
                    WHERE embedding IS NOT NULL
                    AND project_context = $2
                    AND 1 - (embedding <=> $1::vector) >= $3
                    ORDER BY embedding <=> $1::vector
                    LIMIT $4 OFFSET $5
                """, query_embedding_str, self.current_context, similarity_threshold, limit, offset)
            
            memories = []
            for row in results:
                memory_dict = {
                    "id": str(row['id']),
                    "title": row['title'],
                    "content": row['content'] if include_full_content else (row['content'][:200] + "..." if len(row['content']) > 200 else row['content']),
                    "type": row['memory_type'],
                    "tags": row['tags'],
                    "created_at": row['created_at'].isoformat(),
                    "similarity": float(row['similarity']),
                    "has_correction": row['has_correction'] if 'has_correction' in row else False
                }
                
                # If content was truncated, indicate that full content is available
                if not include_full_content and len(row['content']) > 200:
                    memory_dict['content_truncated'] = True
                    memory_dict['content_length'] = len(row['content'])
                
                memories.append(memory_dict)
            
            return {
                "query": query,
                "search_type": "semantic",
                "count": len(memories),
                "results": memories
            }
            
        except Exception as e:
            logger.error(f"Semantic search failed: {e}")
            logger.warning("Falling back to keyword search")
            return await self.search(query, limit, offset, include_full_content)
    
    async def hybrid_search(self, query: str, limit: int = 10, offset: int = 0, include_full_content: bool = False) -> Dict[str, Any]:
        """Hybrid search: try semantic first, fall back to keyword if needed - with UUID detection"""
        try:
            # Check if query is a UUID - if so, use direct database access
            if is_valid_uuid(query.strip()):
                logger.info(f"UUID detected in hybrid search, using direct database access for: {query}")
                return await self.get_memory_by_id(query.strip(), include_full_content)
            
            # Try semantic search first
            result = await self.semantic_search(query, limit, offset, include_full_content=include_full_content)
            
            # If semantic search returned results, use them
            if result.get("count", 0) > 0:
                result["search_type"] = "hybrid-semantic"
                logger.info(f"Hybrid search using semantic results: {result.get('count')} found")
                return result
            
            # Fall back to keyword search if no semantic results
            # Get threshold for logging
            threshold = 0.5  # default
            if self.config:
                from src.utils.config import get_settings
                settings = get_settings()
                threshold = settings.semantic_search_threshold
            logger.info(f"No semantic results (threshold: {threshold:.2f}), falling back to keyword search")
            keyword_result = await self.search(query, limit, offset, include_full_content)
            keyword_result["search_type"] = "hybrid-keyword"
            return keyword_result
            
        except Exception as e:
            logger.error(f"Hybrid search failed: {e}")
            return {"error": str(e), "results": []}
    
    def set_context(self, context: str):
        """Set the current project context"""
        self.current_context = context
    
    async def search_by_entity(self, entity_name: str, limit: int = 10, offset: int = 0, include_full_content: bool = False) -> Dict[str, Any]:
        """Search memories associated with a specific entity"""
        try:
            async with self.db.get_connection() as conn:
                # First find the entity
                entity = await conn.fetchrow("""
                    SELECT id, name, entity_type 
                    FROM entities 
                    WHERE LOWER(name) = LOWER($1) 
                    OR $1 = ANY(aliases)
                """, entity_name)
                
                if not entity:
                    return {
                        "query": entity_name,
                        "search_type": "entity",
                        "count": 0,
                        "results": [],
                        "error": "Entity not found"
                    }
                
                # Get memories associated with this entity
                results = await conn.fetch("""
                    SELECT DISTINCT m.*, mea.relevance_score
                    FROM memory_entities m
                    JOIN memory_entity_associations mea ON m.id = mea.memory_id
                    WHERE mea.entity_id = $1
                    AND m.project_context = $2
                    ORDER BY mea.relevance_score DESC, m.created_at DESC
                    LIMIT $3 OFFSET $4
                """, entity['id'], self.current_context, limit, offset)
                
                memories = []
                for row in results:
                    memory_dict = {
                        "id": str(row['id']),
                        "title": row['title'],
                        "content": row['content'] if include_full_content else (row['content'][:200] + "..." if len(row['content']) > 200 else row['content']),
                        "type": row['memory_type'],
                        "tags": row['tags'],
                        "created_at": row['created_at'].isoformat(),
                        "relevance_score": float(row['relevance_score']),
                        "entity": {
                            "name": entity['name'],
                            "type": entity['entity_type']
                        }
                    }
                    
                    # If content was truncated, indicate that full content is available
                    if not include_full_content and len(row['content']) > 200:
                        memory_dict['content_truncated'] = True
                        memory_dict['content_length'] = len(row['content'])
                    
                    memories.append(memory_dict)
                
                return {
                    "query": entity_name,
                    "search_type": "entity",
                    "count": len(memories),
                    "results": memories
                }
                
        except Exception as e:
            logger.error(f"Entity search failed: {e}")
            return {"error": str(e), "results": []}
    
    # ========== Versioning Methods ==========
    
    async def get_memory_versions(self, memory_id: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Get version history for a memory"""
        return await self.versioning.get_version_history(memory_id, limit)
        
    async def get_memory_at_version(self, memory_id: str, version_number: int) -> Optional[Dict[str, Any]]:
        """Get a specific version of a memory"""
        return await self.versioning.get_specific_version(memory_id, version_number)
        
    async def compare_memory_versions(self, memory_id: str, version1: int, version2: int) -> List[Dict[str, Any]]:
        """Compare two versions of a memory"""
        return await self.versioning.compare_versions(memory_id, version1, version2)
        
    async def rollback_memory(self, memory_id: str, target_version: int, reason: str = None) -> bool:
        """Rollback a memory to a previous version"""
        return await self.versioning.rollback_to_version(memory_id, target_version, reason)
        
    async def get_memories_with_history(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get memories that have been edited (have version history)"""
        return await self.versioning.get_memories_with_history(self.current_context, limit)
    
    # ========== Natural Language Search ==========
    
    async def nlp_search(self, query: str, limit: int = 10, offset: int = 0) -> Dict[str, Any]:
        """Search using natural language query"""
        if not self.nlp_search:
            from src.core.nlp_search import NLPSearchEngine
            self.nlp_search = NLPSearchEngine(self)
            
        return await self.nlp_search.search(query, limit, offset)
    
    # ========== Correction Methods ==========
    
    async def add_correction(self, memory_id: str, correction_content: str, reason: str = None) -> Dict[str, Any]:
        """Add a correction to a memory"""
        try:
            # First verify the memory exists
            memory = await self.get(memory_id)
            if not memory:
                return {"error": f"Memory {memory_id} not found"}
            
            async with self.db.get_connection() as conn:
                # Insert the correction
                correction_id = await conn.fetchval("""
                    INSERT INTO memory_corrections 
                    (memory_id, correction_content, original_content, reason)
                    VALUES ($1, $2, $3, $4)
                    RETURNING id
                """, uuid.UUID(memory_id), correction_content, memory['content'], reason)
                
                logger.info(f"✅ Added correction {correction_id} for memory {memory_id}")
                
                return {
                    "success": True,
                    "memory_id": memory_id,
                    "correction_id": str(correction_id),
                    "original_content": memory['content'],
                    "correction_content": correction_content,
                    "reason": reason
                }
                
        except Exception as e:
            logger.error(f"Failed to add correction: {e}")
            return {"error": str(e)}
    
    async def get_memory_with_correction(self, memory_id: str) -> Optional[Dict[str, Any]]:
        """Get a memory with its correction applied if it has one"""
        try:
            async with self.db.get_connection() as conn:
                result = await conn.fetchrow("""
                    SELECT * FROM memories_with_corrections
                    WHERE id = $1
                """, uuid.UUID(memory_id))
                
                if not result:
                    return None
                
                return {
                    "id": str(result['id']),
                    "title": result['title'],
                    "content": result['content'],
                    "effective_content": result['effective_content'],
                    "has_correction": result['has_correction'],
                    "correction_content": result['correction_content'],
                    "correction_reason": result['correction_reason'],
                    "corrected_by": result['corrected_by'],
                    "corrected_at": result['corrected_at'].isoformat() if result['corrected_at'] else None,
                    "type": result['memory_type'],
                    "tags": result['tags'],
                    "created_at": result['created_at'].isoformat(),
                    "updated_at": result['updated_at'].isoformat()
                }
                
        except Exception as e:
            logger.error(f"Failed to get memory with correction: {e}")
            return None
    
    async def get_corrections_for_memory(self, memory_id: str) -> List[Dict[str, Any]]:
        """Get all corrections for a memory (in case there are multiple)"""
        try:
            async with self.db.get_connection() as conn:
                results = await conn.fetch("""
                    SELECT * FROM memory_corrections
                    WHERE memory_id = $1
                    ORDER BY corrected_at DESC
                """, uuid.UUID(memory_id))
                
                corrections = []
                for row in results:
                    corrections.append({
                        "id": str(row['id']),
                        "memory_id": str(row['memory_id']),
                        "correction_content": row['correction_content'],
                        "original_content": row['original_content'],
                        "reason": row['reason'],
                        "corrected_by": row['corrected_by'],
                        "corrected_at": row['corrected_at'].isoformat()
                    })
                
                return corrections
                
        except Exception as e:
            logger.error(f"Failed to get corrections: {e}")
            return []