#!/usr/bin/env python3
"""
Vector Embeddings for Semantic Search
Supports multiple embedding providers and hybrid search
"""

import os
import asyncio
import logging
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
import hashlib
import json

# Embedding providers
try:
    import openai
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False

try:
    from sentence_transformers import SentenceTransformer
    HAS_SENTENCE_TRANSFORMERS = True
except ImportError:
    HAS_SENTENCE_TRANSFORMERS = False

try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False

logger = logging.getLogger(__name__)

@dataclass
class EmbeddingConfig:
    """Configuration for embedding generation"""
    provider: str = "sentence-transformers"  # openai, sentence-transformers, cohere
    model: str = "all-MiniLM-L6-v2"  # Model name
    dimension: int = 384  # Embedding dimension
    batch_size: int = 32
    max_tokens: int = 512
    normalize: bool = True
    cache_embeddings: bool = True
    
    # Provider-specific
    openai_api_key: Optional[str] = None
    cohere_api_key: Optional[str] = None
    api_timeout: int = 30

class EmbeddingProvider:
    """Base class for embedding providers"""
    
    def __init__(self, config: EmbeddingConfig):
        self.config = config
    
    async def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for texts"""
        raise NotImplementedError
    
    async def embed_query(self, query: str) -> List[float]:
        """Generate embedding for a single query (may use different model/params)"""
        embeddings = await self.embed_texts([query])
        return embeddings[0]

class SentenceTransformerProvider(EmbeddingProvider):
    """Local sentence transformer embeddings"""
    
    def __init__(self, config: EmbeddingConfig):
        super().__init__(config)
        if not HAS_SENTENCE_TRANSFORMERS:
            raise ImportError("sentence-transformers not installed")
        
        self.model = SentenceTransformer(config.model)
        self.config.dimension = self.model.get_sentence_embedding_dimension()
    
    async def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings using sentence transformers"""
        # Run in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        embeddings = await loop.run_in_executor(
            None,
            lambda: self.model.encode(
                texts,
                batch_size=self.config.batch_size,
                normalize_embeddings=self.config.normalize,
                show_progress_bar=False
            )
        )
        return embeddings.tolist()

class OpenAIProvider(EmbeddingProvider):
    """OpenAI embeddings"""
    
    def __init__(self, config: EmbeddingConfig):
        super().__init__(config)
        if not HAS_OPENAI:
            raise ImportError("openai not installed")
        
        self.client = openai.AsyncOpenAI(
            api_key=config.openai_api_key or os.getenv('OPENAI_API_KEY')
        )
        
        # Set dimension based on model
        if config.model == "text-embedding-3-small":
            self.config.dimension = 1536
        elif config.model == "text-embedding-3-large":
            self.config.dimension = 3072
        else:
            self.config.dimension = 1536  # Default
    
    async def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings using OpenAI"""
        embeddings = []
        
        # Process in batches
        for i in range(0, len(texts), self.config.batch_size):
            batch = texts[i:i + self.config.batch_size]
            
            try:
                response = await self.client.embeddings.create(
                    model=self.config.model,
                    input=batch,
                    encoding_format="float"
                )
                
                batch_embeddings = [item.embedding for item in response.data]
                
                # Normalize if requested
                if self.config.normalize:
                    batch_embeddings = [
                        self._normalize(emb) for emb in batch_embeddings
                    ]
                
                embeddings.extend(batch_embeddings)
                
            except Exception as e:
                logger.error(f"OpenAI embedding error: {e}")
                # Return zero embeddings on error
                embeddings.extend([[0.0] * self.config.dimension] * len(batch))
        
        return embeddings
    
    def _normalize(self, embedding: List[float]) -> List[float]:
        """Normalize embedding vector"""
        norm = np.linalg.norm(embedding)
        if norm == 0:
            return embedding
        return (np.array(embedding) / norm).tolist()

class CohereProvider(EmbeddingProvider):
    """Cohere embeddings"""
    
    def __init__(self, config: EmbeddingConfig):
        super().__init__(config)
        if not HAS_HTTPX:
            raise ImportError("httpx not installed for Cohere provider")
        
        self.api_key = config.cohere_api_key or os.getenv('COHERE_API_KEY')
        if not self.api_key:
            raise ValueError("Cohere API key required")
        
        self.client = httpx.AsyncClient(
            base_url="https://api.cohere.ai/v1",
            headers={"Authorization": f"Bearer {self.api_key}"},
            timeout=config.api_timeout
        )
        
        # Set dimension based on model
        if config.model == "embed-english-v3.0":
            self.config.dimension = 1024
        elif config.model == "embed-multilingual-v3.0":
            self.config.dimension = 1024
        else:
            self.config.dimension = 4096  # embed-english-v2.0
    
    async def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings using Cohere"""
        embeddings = []
        
        # Process in batches
        for i in range(0, len(texts), self.config.batch_size):
            batch = texts[i:i + self.config.batch_size]
            
            try:
                response = await self.client.post(
                    "/embed",
                    json={
                        "texts": batch,
                        "model": self.config.model,
                        "input_type": "search_document",
                        "truncate": "END"
                    }
                )
                response.raise_for_status()
                
                data = response.json()
                batch_embeddings = data["embeddings"]
                
                # Normalize if requested
                if self.config.normalize:
                    batch_embeddings = [
                        self._normalize(emb) for emb in batch_embeddings
                    ]
                
                embeddings.extend(batch_embeddings)
                
            except Exception as e:
                logger.error(f"Cohere embedding error: {e}")
                # Return zero embeddings on error
                embeddings.extend([[0.0] * self.config.dimension] * len(batch))
        
        return embeddings
    
    async def embed_query(self, query: str) -> List[float]:
        """Generate query embedding with different input type"""
        try:
            response = await self.client.post(
                "/embed",
                json={
                    "texts": [query],
                    "model": self.config.model,
                    "input_type": "search_query",  # Different for queries
                    "truncate": "END"
                }
            )
            response.raise_for_status()
            
            data = response.json()
            embedding = data["embeddings"][0]
            
            if self.config.normalize:
                embedding = self._normalize(embedding)
            
            return embedding
            
        except Exception as e:
            logger.error(f"Cohere query embedding error: {e}")
            return [0.0] * self.config.dimension
    
    def _normalize(self, embedding: List[float]) -> List[float]:
        """Normalize embedding vector"""
        norm = np.linalg.norm(embedding)
        if norm == 0:
            return embedding
        return (np.array(embedding) / norm).tolist()
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.client.aclose()

class EmbeddingService:
    """Main service for managing embeddings"""
    
    def __init__(self, config: Optional[EmbeddingConfig] = None):
        self.config = config or EmbeddingConfig()
        self.provider = self._create_provider()
        self._cache: Dict[str, List[float]] = {}
    
    def _create_provider(self) -> EmbeddingProvider:
        """Create embedding provider based on config"""
        if self.config.provider == "sentence-transformers":
            return SentenceTransformerProvider(self.config)
        elif self.config.provider == "openai":
            return OpenAIProvider(self.config)
        elif self.config.provider == "cohere":
            return CohereProvider(self.config)
        else:
            raise ValueError(f"Unknown provider: {self.config.provider}")
    
    def _cache_key(self, text: str) -> str:
        """Generate cache key for text"""
        return hashlib.md5(f"{self.config.provider}:{self.config.model}:{text}".encode()).hexdigest()
    
    async def embed_memory(self, memory: Dict[str, Any]) -> List[float]:
        """Generate embedding for a memory"""
        # Combine relevant fields for embedding
        text_parts = []
        
        if memory.get('title'):
            text_parts.append(f"Title: {memory['title']}")
        
        if memory.get('content'):
            text_parts.append(f"Content: {memory['content']}")
        
        if memory.get('tags'):
            text_parts.append(f"Tags: {', '.join(memory['tags'])}")
        
        text = "\n".join(text_parts)
        
        # Truncate if needed
        if len(text) > self.config.max_tokens * 4:  # Rough char to token ratio
            text = text[:self.config.max_tokens * 4]
        
        # Check cache
        if self.config.cache_embeddings:
            cache_key = self._cache_key(text)
            if cache_key in self._cache:
                return self._cache[cache_key]
        
        # Generate embedding
        embeddings = await self.provider.embed_texts([text])
        embedding = embeddings[0]
        
        # Cache result
        if self.config.cache_embeddings:
            self._cache[cache_key] = embedding
        
        return embedding
    
    async def embed_query(self, query: str) -> List[float]:
        """Generate embedding for a search query"""
        # Queries might use different parameters
        return await self.provider.embed_query(query)
    
    async def embed_batch(self, memories: List[Dict[str, Any]]) -> List[List[float]]:
        """Generate embeddings for multiple memories"""
        texts = []
        cache_keys = []
        uncached_indices = []
        embeddings = [None] * len(memories)
        
        # Check cache first
        for i, memory in enumerate(memories):
            text_parts = []
            if memory.get('title'):
                text_parts.append(f"Title: {memory['title']}")
            if memory.get('content'):
                text_parts.append(f"Content: {memory['content']}")
            if memory.get('tags'):
                text_parts.append(f"Tags: {', '.join(memory['tags'])}")
            
            text = "\n".join(text_parts)
            if len(text) > self.config.max_tokens * 4:
                text = text[:self.config.max_tokens * 4]
            
            if self.config.cache_embeddings:
                cache_key = self._cache_key(text)
                if cache_key in self._cache:
                    embeddings[i] = self._cache[cache_key]
                else:
                    texts.append(text)
                    cache_keys.append(cache_key)
                    uncached_indices.append(i)
            else:
                texts.append(text)
                uncached_indices.append(i)
        
        # Generate embeddings for uncached texts
        if texts:
            new_embeddings = await self.provider.embed_texts(texts)
            
            # Fill in results and update cache
            for idx, (i, embedding, cache_key) in enumerate(zip(uncached_indices, new_embeddings, cache_keys)):
                embeddings[i] = embedding
                if self.config.cache_embeddings and cache_key:
                    self._cache[cache_key] = embedding
        
        return embeddings
    
    def cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity between two vectors"""
        vec1 = np.array(vec1)
        vec2 = np.array(vec2)
        
        # Handle zero vectors
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return np.dot(vec1, vec2) / (norm1 * norm2)
    
    def rank_by_similarity(
        self,
        query_embedding: List[float],
        embeddings: List[Tuple[str, List[float]]],
        threshold: float = 0.0
    ) -> List[Tuple[str, float]]:
        """Rank items by similarity to query"""
        results = []
        
        for item_id, embedding in embeddings:
            similarity = self.cosine_similarity(query_embedding, embedding)
            if similarity >= threshold:
                results.append((item_id, similarity))
        
        # Sort by similarity descending
        results.sort(key=lambda x: x[1], reverse=True)
        
        return results

# Hybrid search utilities
class HybridSearcher:
    """Combines keyword and semantic search"""
    
    def __init__(self, embedding_service: EmbeddingService):
        self.embedding_service = embedding_service
    
    async def hybrid_search(
        self,
        query: str,
        keyword_results: List[Tuple[str, float]],  # (id, score)
        semantic_candidates: List[Tuple[str, List[float]]],  # (id, embedding)
        keyword_weight: float = 0.5,
        semantic_weight: float = 0.5,
        rerank_top_k: int = 100
    ) -> List[Tuple[str, float]]:
        """Perform hybrid search combining keyword and semantic results"""
        # Generate query embedding
        query_embedding = await self.embedding_service.embed_query(query)
        
        # Get semantic scores
        semantic_results = self.embedding_service.rank_by_similarity(
            query_embedding,
            semantic_candidates[:rerank_top_k]  # Limit candidates for efficiency
        )
        
        # Normalize scores
        keyword_scores = {id: score for id, score in keyword_results}
        semantic_scores = {id: score for id, score in semantic_results}
        
        # Normalize keyword scores (assuming BM25 or similar)
        if keyword_scores:
            max_keyword = max(keyword_scores.values())
            if max_keyword > 0:
                keyword_scores = {id: score / max_keyword for id, score in keyword_scores.items()}
        
        # Combine scores
        all_ids = set(keyword_scores.keys()) | set(semantic_scores.keys())
        hybrid_scores = []
        
        for id in all_ids:
            keyword_score = keyword_scores.get(id, 0.0)
            semantic_score = semantic_scores.get(id, 0.0)
            
            # Weighted combination
            combined_score = (
                keyword_weight * keyword_score +
                semantic_weight * semantic_score
            )
            
            hybrid_scores.append((id, combined_score))
        
        # Sort by combined score
        hybrid_scores.sort(key=lambda x: x[1], reverse=True)
        
        return hybrid_scores
    
    def reciprocal_rank_fusion(
        self,
        *result_lists: List[Tuple[str, float]],
        k: int = 60
    ) -> List[Tuple[str, float]]:
        """Combine multiple ranked lists using Reciprocal Rank Fusion"""
        scores: Dict[str, float] = {}
        
        for results in result_lists:
            for rank, (id, _) in enumerate(results, 1):
                if id not in scores:
                    scores[id] = 0.0
                scores[id] += 1.0 / (k + rank)
        
        # Sort by RRF score
        sorted_results = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        
        return sorted_results

# Create default embedding service
default_embedding_service = None

def get_embedding_service(config: Optional[EmbeddingConfig] = None) -> EmbeddingService:
    """Get or create embedding service"""
    global default_embedding_service
    
    if config:
        return EmbeddingService(config)
    
    if default_embedding_service is None:
        # Use environment variables for configuration
        provider = os.getenv('EMBEDDING_PROVIDER', 'sentence-transformers')
        model = os.getenv('EMBEDDING_MODEL', 'all-MiniLM-L6-v2')
        
        config = EmbeddingConfig(
            provider=provider,
            model=model,
            openai_api_key=os.getenv('OPENAI_API_KEY'),
            cohere_api_key=os.getenv('COHERE_API_KEY')
        )
        
        default_embedding_service = EmbeddingService(config)
    
    return default_embedding_service