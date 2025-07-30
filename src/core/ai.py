"""
AI features for PUO Memo (optional Gemini integration)
"""
import logging
from typing import List, Dict, Any, Optional
import asyncio

from src.utils.config import get_settings
from src.utils.retry import retry, GEMINI_RETRY_CONFIG, with_circuit_breaker, CircuitBreakerConfig
from src.core.cache import cache_manager

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
        self.embedding_model = None
        self.embedding_model_name = 'text-embedding-004'
        
        if GEMINI_AVAILABLE:
            # Always get fresh settings
            settings = get_settings(reload=True)
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
    
    @retry(config=GEMINI_RETRY_CONFIG)
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
            
            response = await asyncio.to_thread(self.model.generate_content, prompt)
            return response.text
            
        except Exception as e:
            logger.error(f"AI answer generation failed: {e}")
            return self._fallback_answer(question, memories)
    
    @retry(config=GEMINI_RETRY_CONFIG)
    async def generate_title(self, content: str) -> str:
        """Generate a title for memory content"""
        if not self.enabled:
            return content[:100] + "..." if len(content) > 100 else content
        
        try:
            prompt = f"""Generate a short, descriptive title (max 100 chars) for this content:

{content[:500]}

Title:"""
            
            response = await asyncio.to_thread(self.model.generate_content, prompt)
            title = response.text.strip()
            return title[:100] if len(title) > 100 else title
            
        except Exception as e:
            logger.error(f"Title generation failed: {e}")
            return content[:100] + "..." if len(content) > 100 else content
    
    @retry(config=GEMINI_RETRY_CONFIG)
    async def suggest_tags(self, content: str) -> List[str]:
        """Suggest relevant tags for memory content"""
        if not self.enabled:
            return []
        
        try:
            prompt = f"""Suggest 3-5 relevant tags for this content (comma-separated):

{content[:500]}

Tags:"""
            
            response = await asyncio.to_thread(self.model.generate_content, prompt)
            tags = [tag.strip() for tag in response.text.split(',')]
            return tags[:5]  # Limit to 5 tags
            
        except Exception as e:
            logger.error(f"Tag suggestion failed: {e}")
            return []
    
    @with_circuit_breaker(
        circuit_config=CircuitBreakerConfig(failure_threshold=3, timeout=60),
        retry_config=GEMINI_RETRY_CONFIG
    )
    async def generate_embedding(self, text: str) -> Optional[List[float]]:
        """Generate embedding vector for text using Gemini - with circuit breaker and caching"""
        if not self.enabled:
            return None
        
        try:
            # Check cache first
            text_hash = await cache_manager.get_text_hash(text)
            cached_embedding = await cache_manager.get_embedding(text_hash)
            
            if cached_embedding:
                logger.debug(f"Using cached embedding for text hash: {text_hash}")
                return cached_embedding
            
            # Truncate text if too long (Gemini has token limits)
            max_chars = 8000  # Conservative limit
            if len(text) > max_chars:
                text = text[:max_chars]
                logger.warning(f"Truncated text from {len(text)} to {max_chars} chars for embedding")
            
            # Generate embedding using Gemini's embedding model
            result = await asyncio.to_thread(
                genai.embed_content,
                model=f'models/{self.embedding_model_name}',
                content=text,
                task_type="retrieval_document",
                title="Memory content"
            )
            
            # Gemini returns embeddings in result['embedding']
            embedding = result['embedding']
            
            # Verify embedding dimension (should be 768 for text-embedding-004)
            if len(embedding) != 768:
                logger.error(f"Unexpected embedding dimension: {len(embedding)}, expected 768")
                return None
            
            # Cache the embedding
            await cache_manager.set_embedding(text_hash, embedding)
            logger.debug(f"Cached new embedding for text hash: {text_hash}")
            
            return embedding
            
        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            return None
    
    async def generate_query_embedding(self, query: str) -> Optional[List[float]]:
        """Generate embedding vector for a search query"""
        if not self.enabled:
            return None
        
        try:
            # Generate embedding optimized for query
            result = await asyncio.to_thread(
                genai.embed_content,
                model=f'models/{self.embedding_model_name}',
                content=query,
                task_type="retrieval_query"
            )
            
            return result['embedding']
            
        except Exception as e:
            logger.error(f"Query embedding generation failed: {e}")
            return None
    
    def _fallback_answer(self, question: str, memories: List[Dict[str, Any]]) -> str:
        """Simple non-AI answer when AI is not available"""
        if not memories:
            return "I don't have any memories related to your question."
        
        return f"I found {len(memories)} related memories. The most relevant is: {memories[0]['title']}"