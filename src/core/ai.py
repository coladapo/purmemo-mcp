"""
AI features for PUO Memo (optional Gemini integration)
"""
import logging
from typing import List, Dict, Any, Optional

from src.utils.config import settings

logger = logging.getLogger(__name__)

# Try to import Gemini
try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    logger.info("Gemini not available - AI features disabled")


class AIAssistant:
    """Handles AI-powered features for memory system"""
    
    def __init__(self):
        self.enabled = False
        self.model = None
        
        if GEMINI_AVAILABLE:
            api_key = settings.gemini_api_key
            if api_key:
                try:
                    genai.configure(api_key=api_key)
                    self.model = genai.GenerativeModel('gemini-1.5-flash')
                    self.enabled = True
                    logger.info("✅ AI features enabled with Gemini")
                except Exception as e:
                    logger.error(f"Failed to initialize Gemini: {e}")
            else:
                logger.info("ℹ️  No Gemini API key found")
    
    async def answer_question(self, question: str, memories: List[Dict[str, Any]]) -> str:
        """Generate an answer based on memories"""
        if not self.enabled or not memories:
            return self._fallback_answer(question, memories)
        
        try:
            # Build context from memories
            context = "\n\n".join([
                f"Memory: {mem['title']}\nContent: {mem['content']}"
                for mem in memories
            ])
            
            prompt = f"""Based on these memories, answer the question concisely:

Memories:
{context}

Question: {question}

Answer:"""
            
            response = self.model.generate_content(prompt)
            return response.text
            
        except Exception as e:
            logger.error(f"AI answer generation failed: {e}")
            return self._fallback_answer(question, memories)
    
    async def generate_title(self, content: str) -> str:
        """Generate a title for memory content"""
        if not self.enabled:
            return content[:100] + "..." if len(content) > 100 else content
        
        try:
            prompt = f"""Generate a short, descriptive title (max 100 chars) for this content:

{content[:500]}

Title:"""
            
            response = self.model.generate_content(prompt)
            title = response.text.strip()
            return title[:100] if len(title) > 100 else title
            
        except Exception as e:
            logger.error(f"Title generation failed: {e}")
            return content[:100] + "..." if len(content) > 100 else content
    
    async def suggest_tags(self, content: str) -> List[str]:
        """Suggest relevant tags for memory content"""
        if not self.enabled:
            return []
        
        try:
            prompt = f"""Suggest 3-5 relevant tags for this content (comma-separated):

{content[:500]}

Tags:"""
            
            response = self.model.generate_content(prompt)
            tags = [tag.strip() for tag in response.text.split(',')]
            return tags[:5]  # Limit to 5 tags
            
        except Exception as e:
            logger.error(f"Tag suggestion failed: {e}")
            return []
    
    def _fallback_answer(self, question: str, memories: List[Dict[str, Any]]) -> str:
        """Simple non-AI answer when AI is not available"""
        if not memories:
            return "I don't have any memories related to your question."
        
        return f"I found {len(memories)} related memories. The most relevant is: {memories[0]['title']}"