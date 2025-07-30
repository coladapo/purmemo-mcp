"""
Gemini Vision capabilities for PUO Memo
Provides advanced image understanding, OCR, and PDF analysis
"""
import logging
import json
import io
from typing import Dict, Any, Optional, List, Tuple
from pathlib import Path
import asyncio

from src.utils.config import get_settings

logger = logging.getLogger(__name__)

# Import required libraries
try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    logger.warning("Gemini not available - vision features disabled")

try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False
    logger.warning("PIL not available - image processing limited")

try:
    import fitz  # PyMuPDF
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False
    logger.warning("PyMuPDF not available - enhanced PDF processing disabled")


class VisionProcessor:
    """Advanced vision processing using Gemini Vision"""
    
    def __init__(self):
        self.enabled = False
        self.vision_model = None
        
        if GEMINI_AVAILABLE:
            settings = get_settings(reload=True)
            api_key = settings.gemini_api_key
            if api_key:
                try:
                    genai.configure(api_key=api_key)
                    # Use Gemini 1.5 Pro for vision capabilities
                    self.vision_model = genai.GenerativeModel('gemini-1.5-pro')
                    self.enabled = True
                    logger.info("✅ Vision features enabled with Gemini 1.5 Pro")
                except Exception as e:
                    logger.error(f"Failed to initialize Gemini Vision: {e}")
    
    async def analyze_image(self, image_path: str) -> Dict[str, Any]:
        """
        Comprehensive image analysis using Gemini Vision
        """
        if not self.enabled or not PIL_AVAILABLE:
            return self._basic_image_info(image_path)
        
        try:
            # Open image
            img = Image.open(image_path)
            
            # Create comprehensive analysis prompt
            prompt = """Analyze this image and provide a detailed response in JSON format with the following structure:
{
    "description": "Detailed description of what you see",
    "extracted_text": "Any text visible in the image (perform OCR)",
    "image_type": "Type of image (screenshot, diagram, photo, chart, etc.)",
    "entities": ["List", "of", "key", "entities", "or", "concepts"],
    "technical_details": "Any code, technical details, or data structures shown",
    "colors": ["Dominant", "colors"],
    "layout": "Description of visual layout and structure",
    "data_visualization": "If chart/graph, describe data and trends",
    "ui_elements": "If screenshot, describe UI components",
    "relationships": ["Entity relationships or connections shown"]
}

Be thorough and extract ALL information, especially text and technical details."""
            
            # Generate analysis
            response = await asyncio.to_thread(
                self.vision_model.generate_content,
                [prompt, img],
                generation_config={'temperature': 0.1, 'max_output_tokens': 2048}
            )
            
            # Parse response
            try:
                analysis = json.loads(response.text)
            except json.JSONDecodeError:
                # Try to extract JSON from response
                import re
                json_match = re.search(r'\{.*\}', response.text, re.DOTALL)
                if json_match:
                    analysis = json.loads(json_match.group())
                else:
                    # Fallback structure
                    analysis = {
                        "description": response.text,
                        "extracted_text": "",
                        "image_type": "unknown",
                        "entities": [],
                        "technical_details": ""
                    }
            
            # Add image metadata
            analysis['metadata'] = {
                'width': img.width,
                'height': img.height,
                'format': img.format,
                'mode': img.mode,
                'size_bytes': Path(image_path).stat().st_size
            }
            
            # Extract EXIF data if available
            if hasattr(img, '_getexif') and img._getexif():
                exif = img._getexif()
                analysis['metadata']['exif'] = {
                    k: str(v) for k, v in exif.items() 
                    if isinstance(v, (str, int, float))
                }
            
            return analysis
            
        except Exception as e:
            logger.error(f"Vision analysis failed: {e}")
            return self._basic_image_info(image_path)
    
    async def analyze_pdf_with_vision(self, pdf_path: str, 
                                     use_vision_for_pages: Optional[List[int]] = None,
                                     auto_detect_complex_pages: bool = True) -> Dict[str, Any]:
        """
        Smart PDF processing with vision for complex pages
        """
        if not PYMUPDF_AVAILABLE:
            return {"error": "PyMuPDF not available for enhanced PDF processing"}
        
        try:
            pdf_document = fitz.open(pdf_path)
            full_content = []
            page_analyses = []
            all_entities = set()
            
            for page_num in range(pdf_document.page_count):
                page = pdf_document[page_num]
                
                # Extract text
                text = page.get_text()
                
                # Determine if vision analysis is needed
                needs_vision = False
                if use_vision_for_pages and page_num in use_vision_for_pages:
                    needs_vision = True
                elif auto_detect_complex_pages:
                    # Auto-detect complex pages
                    has_images = len(page.get_images()) > 0
                    has_tables = "table" in text.lower() or "|" in text
                    is_sparse = len(text.strip()) < 100
                    has_diagram_keywords = any(word in text.lower() for word in 
                                             ['diagram', 'chart', 'graph', 'figure'])
                    
                    needs_vision = has_images or has_tables or is_sparse or has_diagram_keywords
                
                if needs_vision and self.enabled:
                    # Convert page to image for vision analysis
                    pix = page.get_pixmap(dpi=150)
                    img_data = pix.tobytes("png")
                    img = Image.open(io.BytesIO(img_data))
                    
                    # Analyze with vision
                    prompt = f"""Analyze page {page_num + 1} of this PDF document.
Extract and structure ALL information including:
- Complete text content (perform thorough OCR)
- Tables (preserve exact structure and all data)
- Diagrams or charts (describe in detail with labels and relationships)
- Code snippets (extract verbatim with syntax)
- Mathematical formulas or equations
- Key points, findings, or takeaways
- Any visual elements and their meanings

Format as JSON with keys: text_content, tables, diagrams, code_snippets, formulas, key_points, visual_elements"""
                    
                    response = await asyncio.to_thread(
                        self.vision_model.generate_content,
                        [prompt, img],
                        generation_config={'temperature': 0.1, 'max_output_tokens': 4096}
                    )
                    
                    try:
                        page_analysis = json.loads(response.text)
                    except:
                        page_analysis = {"text_content": response.text}
                    
                    page_analyses.append({
                        "page": page_num + 1,
                        "type": "vision_analysis",
                        "content": page_analysis
                    })
                    
                    # Extract entities from vision analysis
                    if 'key_points' in page_analysis:
                        for point in page_analysis.get('key_points', []):
                            if isinstance(point, str):
                                # Simple entity extraction from key points
                                import re
                                # Extract capitalized phrases as potential entities
                                entities = re.findall(r'[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*', point)
                                all_entities.update(entities)
                    
                    # Build page content
                    page_content = f"[Page {page_num + 1} - Vision Enhanced]\n"
                    if 'text_content' in page_analysis:
                        page_content += page_analysis['text_content'] + "\n"
                    if 'tables' in page_analysis:
                        page_content += f"Tables: {json.dumps(page_analysis['tables'], indent=2)}\n"
                    if 'code_snippets' in page_analysis:
                        page_content += f"Code: {json.dumps(page_analysis['code_snippets'], indent=2)}\n"
                    
                    full_content.append(page_content)
                else:
                    # Regular text extraction
                    page_analyses.append({
                        "page": page_num + 1,
                        "type": "text_extraction",
                        "content": {"text_content": text}
                    })
                    full_content.append(f"[Page {page_num + 1}]\n{text}\n")
            
            pdf_document.close()
            
            return {
                "full_text": "\n".join(full_content),
                "page_count": len(page_analyses),
                "page_analyses": page_analyses,
                "entities": list(all_entities),
                "has_vision_analysis": any(p['type'] == 'vision_analysis' for p in page_analyses)
            }
            
        except Exception as e:
            logger.error(f"PDF vision analysis failed: {e}")
            return {"error": str(e)}
    
    async def analyze_screenshot(self, image_path: str) -> Dict[str, Any]:
        """
        Specialized analysis for screenshots with UI understanding
        """
        if not self.enabled:
            return self._basic_image_info(image_path)
        
        try:
            img = Image.open(image_path)
            
            prompt = """This is a screenshot. Analyze it comprehensively:
1. Identify the application or website
2. Extract ALL visible text (menus, buttons, content, etc.)
3. Describe the UI layout and components
4. Identify any error messages, warnings, or notifications
5. Extract any code, logs, or technical information visible
6. Describe the current state or action being shown
7. List all UI elements and their purposes

Return as JSON with keys: application, all_text, ui_components, errors_warnings, technical_info, current_state, elements"""
            
            response = await asyncio.to_thread(
                self.vision_model.generate_content,
                [prompt, img],
                generation_config={'temperature': 0.1}
            )
            
            try:
                analysis = json.loads(response.text)
            except:
                analysis = {"description": response.text}
            
            analysis['image_type'] = 'screenshot'
            analysis['metadata'] = {
                'width': img.width,
                'height': img.height,
                'aspect_ratio': f"{img.width}:{img.height}"
            }
            
            return analysis
            
        except Exception as e:
            logger.error(f"Screenshot analysis failed: {e}")
            return self._basic_image_info(image_path)
    
    async def extract_code_from_image(self, image_path: str) -> Dict[str, Any]:
        """
        Extract code snippets from images
        """
        if not self.enabled:
            return {"error": "Vision not enabled"}
        
        try:
            img = Image.open(image_path)
            
            prompt = """Extract any code visible in this image:
1. Extract the complete code exactly as shown
2. Identify the programming language
3. Preserve all formatting, indentation, and syntax
4. Include any comments or annotations
5. Note any syntax highlighting or themes used

Return as JSON with keys: code_blocks (array of {language, code, description}), theme, quality_notes"""
            
            response = await asyncio.to_thread(
                self.vision_model.generate_content,
                [prompt, img],
                generation_config={'temperature': 0.1}
            )
            
            try:
                result = json.loads(response.text)
            except:
                result = {"code_blocks": [], "raw_response": response.text}
            
            return result
            
        except Exception as e:
            logger.error(f"Code extraction failed: {e}")
            return {"error": str(e)}
    
    def _basic_image_info(self, image_path: str) -> Dict[str, Any]:
        """Fallback basic image information"""
        try:
            path = Path(image_path)
            info = {
                "description": f"Image file: {path.name}",
                "image_type": "unknown",
                "metadata": {
                    "filename": path.name,
                    "size_bytes": path.stat().st_size
                }
            }
            
            if PIL_AVAILABLE:
                try:
                    img = Image.open(image_path)
                    info['metadata'].update({
                        'width': img.width,
                        'height': img.height,
                        'format': img.format,
                        'mode': img.mode
                    })
                except:
                    pass
            
            return info
        except Exception as e:
            return {"error": str(e)}
    
    async def batch_analyze_images(self, image_paths: List[str], 
                                  parallel: bool = True) -> List[Dict[str, Any]]:
        """
        Analyze multiple images efficiently
        """
        if parallel and self.enabled:
            # Process in parallel with rate limiting
            tasks = []
            for path in image_paths:
                task = self.analyze_image(path)
                tasks.append(task)
                # Small delay to avoid rate limits
                await asyncio.sleep(0.1)
            
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Convert exceptions to error dicts
            final_results = []
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    final_results.append({
                        "error": str(result),
                        "path": image_paths[i]
                    })
                else:
                    final_results.append(result)
            
            return final_results
        else:
            # Sequential processing
            results = []
            for path in image_paths:
                result = await self.analyze_image(path)
                results.append(result)
            return results