"""
Redis caching layer for PUO Memo MCP
Provides fast caching for embeddings, search results, and frequently accessed data
"""

import json
import logging
import asyncio
from typing import Optional, Any, Dict, List, Union
from datetime import timedelta
import hashlib

logger = logging.getLogger(__name__)

# Try to import Redis
try:
    import redis.asyncio as redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    logger.info("Redis not available - caching disabled")


class CacheManager:
    """Manages Redis caching for performance optimization"""
    
    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.enabled = False
        self.redis_url = redis_url
        self.redis_client: Optional[redis.Redis] = None
        
        # Cache configuration
        self.ttl_config = {
            'embedding': timedelta(days=30),      # Embeddings rarely change
            'search_result': timedelta(hours=1),  # Search results can change
            'memory': timedelta(hours=12),        # Individual memories
            'entity': timedelta(hours=24),        # Entity data
            'metadata': timedelta(hours=6),       # Various metadata
        }
        
    async def initialize(self) -> bool:
        """Initialize Redis connection"""
        if not REDIS_AVAILABLE:
            logger.info("Redis not available, running without cache")
            return False
            
        try:
            self.redis_client = await redis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True
            )
            
            # Test connection
            await self.redis_client.ping()
            self.enabled = True
            logger.info("✅ Redis cache initialized")
            return True
            
        except Exception as e:
            logger.warning(f"Failed to initialize Redis: {e}. Running without cache.")
            self.enabled = False
            return False
            
    async def close(self):
        """Close Redis connection"""
        if self.redis_client:
            await self.redis_client.close()
            
    def _generate_key(self, prefix: str, identifier: str) -> str:
        """Generate cache key with prefix"""
        return f"puo_memo:{prefix}:{identifier}"
        
    def _hash_query(self, query: str, **kwargs) -> str:
        """Generate hash for query + parameters"""
        # Create stable hash from query and parameters
        params = json.dumps(kwargs, sort_keys=True)
        content = f"{query}:{params}"
        return hashlib.md5(content.encode()).hexdigest()
        
    # ========== Embedding Cache ==========
    
    async def get_embedding(self, text_hash: str) -> Optional[List[float]]:
        """Get cached embedding for text"""
        if not self.enabled:
            return None
            
        try:
            key = self._generate_key("embedding", text_hash)
            data = await self.redis_client.get(key)
            
            if data:
                return json.loads(data)
            return None
            
        except Exception as e:
            logger.error(f"Cache get error: {e}")
            return None
            
    async def set_embedding(self, text_hash: str, embedding: List[float]):
        """Cache embedding for text"""
        if not self.enabled:
            return
            
        try:
            key = self._generate_key("embedding", text_hash)
            await self.redis_client.set(
                key,
                json.dumps(embedding),
                ex=int(self.ttl_config['embedding'].total_seconds())
            )
        except Exception as e:
            logger.error(f"Cache set error: {e}")
            
    async def get_text_hash(self, text: str) -> str:
        """Generate hash for text (for embedding cache)"""
        return hashlib.md5(text.encode()).hexdigest()
        
    # ========== Search Result Cache ==========
    
    async def get_search_results(self, query: str, search_type: str, **kwargs) -> Optional[List[Dict[str, Any]]]:
        """Get cached search results"""
        if not self.enabled:
            return None
            
        try:
            query_hash = self._hash_query(query, search_type=search_type, **kwargs)
            key = self._generate_key("search", query_hash)
            data = await self.redis_client.get(key)
            
            if data:
                return json.loads(data)
            return None
            
        except Exception as e:
            logger.error(f"Cache get error: {e}")
            return None
            
    async def set_search_results(self, query: str, search_type: str, results: List[Dict[str, Any]], **kwargs):
        """Cache search results"""
        if not self.enabled:
            return
            
        try:
            query_hash = self._hash_query(query, search_type=search_type, **kwargs)
            key = self._generate_key("search", query_hash)
            
            await self.redis_client.set(
                key,
                json.dumps(results),
                ex=int(self.ttl_config['search_result'].total_seconds())
            )
        except Exception as e:
            logger.error(f"Cache set error: {e}")
            
    # ========== Memory Cache ==========
    
    async def get_memory(self, memory_id: str) -> Optional[Dict[str, Any]]:
        """Get cached memory by ID"""
        if not self.enabled:
            return None
            
        try:
            key = self._generate_key("memory", memory_id)
            data = await self.redis_client.get(key)
            
            if data:
                return json.loads(data)
            return None
            
        except Exception as e:
            logger.error(f"Cache get error: {e}")
            return None
            
    async def set_memory(self, memory_id: str, memory_data: Dict[str, Any]):
        """Cache memory data"""
        if not self.enabled:
            return
            
        try:
            key = self._generate_key("memory", memory_id)
            await self.redis_client.set(
                key,
                json.dumps(memory_data),
                ex=int(self.ttl_config['memory'].total_seconds())
            )
        except Exception as e:
            logger.error(f"Cache set error: {e}")
            
    async def invalidate_memory(self, memory_id: str):
        """Invalidate cached memory"""
        if not self.enabled:
            return
            
        try:
            key = self._generate_key("memory", memory_id)
            await self.redis_client.delete(key)
            
            # Also invalidate any search results (they might contain this memory)
            await self._invalidate_pattern("search:*")
            
        except Exception as e:
            logger.error(f"Cache invalidation error: {e}")
            
    # ========== Batch Operations ==========
    
    async def get_memories_batch(self, memory_ids: List[str]) -> Dict[str, Optional[Dict[str, Any]]]:
        """Get multiple memories from cache"""
        if not self.enabled:
            return {mid: None for mid in memory_ids}
            
        try:
            # Use pipeline for efficiency
            pipe = self.redis_client.pipeline()
            keys = [self._generate_key("memory", mid) for mid in memory_ids]
            
            for key in keys:
                pipe.get(key)
                
            results = await pipe.execute()
            
            # Map results back to memory IDs
            return {
                memory_ids[i]: json.loads(data) if data else None
                for i, data in enumerate(results)
            }
            
        except Exception as e:
            logger.error(f"Batch cache get error: {e}")
            return {mid: None for mid in memory_ids}
            
    # ========== Entity Cache ==========
    
    async def get_entity_graph(self, entity_name: str) -> Optional[Dict[str, Any]]:
        """Get cached entity graph"""
        if not self.enabled:
            return None
            
        try:
            key = self._generate_key("entity_graph", entity_name.lower())
            data = await self.redis_client.get(key)
            
            if data:
                return json.loads(data)
            return None
            
        except Exception as e:
            logger.error(f"Cache get error: {e}")
            return None
            
    async def set_entity_graph(self, entity_name: str, graph_data: Dict[str, Any]):
        """Cache entity graph"""
        if not self.enabled:
            return
            
        try:
            key = self._generate_key("entity_graph", entity_name.lower())
            await self.redis_client.set(
                key,
                json.dumps(graph_data),
                ex=int(self.ttl_config['entity'].total_seconds())
            )
        except Exception as e:
            logger.error(f"Cache set error: {e}")
            
    # ========== Cache Management ==========
    
    async def _invalidate_pattern(self, pattern: str):
        """Invalidate all keys matching pattern"""
        if not self.enabled:
            return
            
        try:
            # Use SCAN to find keys (more efficient than KEYS)
            cursor = 0
            pattern_full = f"puo_memo:{pattern}"
            
            while True:
                cursor, keys = await self.redis_client.scan(
                    cursor, match=pattern_full, count=100
                )
                
                if keys:
                    await self.redis_client.delete(*keys)
                    
                if cursor == 0:
                    break
                    
        except Exception as e:
            logger.error(f"Pattern invalidation error: {e}")
            
    async def clear_all_cache(self):
        """Clear all PUO Memo cache entries"""
        if not self.enabled:
            return
            
        try:
            await self._invalidate_pattern("*")
            logger.info("All cache cleared")
        except Exception as e:
            logger.error(f"Cache clear error: {e}")
            
    async def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        if not self.enabled:
            return {"enabled": False}
            
        try:
            info = await self.redis_client.info()
            
            # Count keys by type
            embedding_count = len(await self.redis_client.keys("puo_memo:embedding:*"))
            search_count = len(await self.redis_client.keys("puo_memo:search:*"))
            memory_count = len(await self.redis_client.keys("puo_memo:memory:*"))
            entity_count = len(await self.redis_client.keys("puo_memo:entity_graph:*"))
            
            return {
                "enabled": True,
                "used_memory": info.get("used_memory_human", "unknown"),
                "total_keys": info.get("db0", {}).get("keys", 0),
                "puo_memo_keys": {
                    "embeddings": embedding_count,
                    "searches": search_count,
                    "memories": memory_count,
                    "entities": entity_count,
                },
                "hit_rate": info.get("keyspace_hits", 0) / max(info.get("keyspace_hits", 0) + info.get("keyspace_misses", 1), 1)
            }
            
        except Exception as e:
            logger.error(f"Cache stats error: {e}")
            return {"enabled": True, "error": str(e)}


# Global cache instance (initialized in main app)
cache_manager = CacheManager()