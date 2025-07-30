"""
Optimized Memory Store with Redis Caching and Performance Improvements
"""
import json
import logging
import asyncio
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from uuid import uuid4

from src.core.memory import MemoryStore
from src.core.cache import cache_manager
from src.utils.background_tasks import task_queue
from src.core.performance_monitor import performance_monitor
from src.utils.error_tracking import error_tracker, with_error_tracking

logger = logging.getLogger(__name__)


class OptimizedMemoryStore(MemoryStore):
    """Enhanced memory store with caching, batching, and background processing"""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._cache_warming_complete = False
        
    async def initialize_cache(self):
        """Warm up cache with frequently accessed data"""
        if not self.config.cache_enabled or self._cache_warming_complete:
            return
            
        try:
            logger.info("🔥 Starting cache warm-up...")
            
            # Warm up recent memories
            recent_memories = await self.db.fetch("""
                SELECT id, title, content, tags, created_at, has_embedding
                FROM memories
                WHERE context = $1
                ORDER BY created_at DESC
                LIMIT 100
            """, self.context)
            
            # Cache recent memories
            for memory in recent_memories:
                cache_key = f"memory:{memory['id']}"
                await cache_manager.cache_memory(
                    cache_key,
                    dict(memory),
                    ttl=self.config.cache_ttl_memory
                )
            
            # Warm up popular entities
            if self.knowledge_graph:
                popular_entities = await self.db.fetch("""
                    SELECT DISTINCT entity_name, entity_type, COUNT(*) as frequency
                    FROM memory_entities
                    GROUP BY entity_name, entity_type
                    ORDER BY frequency DESC
                    LIMIT 50
                """)
                
                for entity in popular_entities:
                    cache_key = f"entity:{entity['entity_name']}"
                    await cache_manager.cache_result(
                        cache_key,
                        dict(entity),
                        ttl=3600  # 1 hour for entities
                    )
            
            self._cache_warming_complete = True
            logger.info(f"✅ Cache warmed with {len(recent_memories)} memories")
            
        except Exception as e:
            logger.error(f"Cache warm-up failed: {e}")
    
    @performance_monitor.track_operation("memory_create")
    async def create(self, content: str, memory_type: str = "general",
                    title: Optional[str] = None, source_url: Optional[str] = None,
                    tags: Optional[List[str]] = None, context: Optional[str] = None,
                    async_embedding: bool = True, async_entities: bool = True) -> Dict[str, Any]:
        """Create memory with async processing by default"""
        try:
            memory_id = str(uuid4())
            now = datetime.now(timezone.utc)
            
            # Use provided context or default
            memory_context = context or self.context
            
            # Prepare basic memory data
            memory_data = {
                "id": memory_id,
                "content": content,
                "type": memory_type,
                "title": title or content[:100] + "..." if len(content) > 100 else content,
                "source_url": source_url,
                "tags": tags or [],
                "context": memory_context,
                "created_at": now.isoformat(),
                "has_embedding": False,
                "extracted_entities": []
            }
            
            # Insert memory first
            await self.db.execute("""
                INSERT INTO memories (
                    id, content, type, title, source_url, tags, context, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            """, memory_id, content, memory_type, memory_data["title"], 
                source_url, tags or [], memory_context, now)
            
            # Queue background tasks for expensive operations
            async_tasks = []
            
            if self.ai and self.ai.enabled and async_embedding:
                # Queue embedding generation
                task_id = await task_queue.enqueue(
                    "generate_embedding",
                    {"memory_id": memory_id, "content": content},
                    priority=2
                )
                async_tasks.append({"task": "embedding", "id": task_id})
                logger.info(f"📋 Queued embedding generation: {task_id}")
            
            if self.entity_extractor and async_entities:
                # Queue entity extraction
                task_id = await task_queue.enqueue(
                    "extract_entities",
                    {"memory_id": memory_id, "content": content},
                    priority=3
                )
                async_tasks.append({"task": "entities", "id": task_id})
                logger.info(f"📋 Queued entity extraction: {task_id}")
            
            # If not async, process synchronously (but still use cache)
            if not async_embedding and self.ai and self.ai.enabled:
                embedding = await self.ai.generate_embedding(content)
                if embedding:
                    await self._store_embedding(memory_id, embedding)
                    memory_data["has_embedding"] = True
            
            if not async_entities and self.entity_extractor:
                entities = await self.entity_extractor.extract(content)
                if entities:
                    await self._store_entities(memory_id, entities)
                    memory_data["extracted_entities"] = entities
            
            # Cache the new memory
            if self.config.cache_enabled:
                await cache_manager.cache_memory(
                    f"memory:{memory_id}",
                    memory_data,
                    ttl=self.config.cache_ttl_memory
                )
            
            return {
                "status": "created",
                "memory": memory_data,
                "async_tasks": async_tasks,
                "message": f"Memory saved: {memory_id}"
            }
            
        except Exception as e:
            logger.error(f"Memory creation failed: {e}")
            return {"error": str(e)}
    
    @performance_monitor.track_operation("memory_get")
    async def get(self, memory_id: str) -> Optional[Dict[str, Any]]:
        """Get memory with caching"""
        # Try cache first
        if self.config.cache_enabled:
            cached = await cache_manager.get_memory(f"memory:{memory_id}")
            if cached:
                logger.debug(f"🎯 Cache hit for memory: {memory_id}")
                return cached
        
        # Fetch from database
        memory = await self.db.fetchrow("""
            SELECT * FROM memories
            WHERE id = $1 AND context = $2
        """, memory_id, self.context)
        
        if memory:
            memory_dict = dict(memory)
            
            # Cache for future requests
            if self.config.cache_enabled:
                await cache_manager.cache_memory(
                    f"memory:{memory_id}",
                    memory_dict,
                    ttl=self.config.cache_ttl_memory
                )
            
            return memory_dict
        
        return None
    
    @performance_monitor.track_operation("memory_list")
    async def list(self, limit: int = 20, offset: int = 0, 
                   model: Optional[str] = None) -> List[Dict[str, Any]]:
        """List recent memories with caching"""
        cache_key = f"list:{self.context}:{limit}:{offset}"
        
        # Try cache first
        if self.config.cache_enabled:
            cached = await cache_manager.get_result(cache_key)
            if cached:
                logger.debug(f"🎯 Cache hit for memory list")
                return cached
        
        # Fetch from database
        memories = await self.db.fetch("""
            SELECT id, title, type, tags, created_at, has_embedding,
                   CASE WHEN char_length(content) > 200 
                        THEN substring(content, 1, 200) || '...'
                        ELSE content
                   END as preview
            FROM memories
            WHERE context = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        """, self.context, limit, offset)
        
        result = [dict(m) for m in memories]
        
        # Cache the result
        if self.config.cache_enabled:
            await cache_manager.cache_result(
                cache_key,
                result,
                ttl=300  # 5 minutes for lists
            )
        
        return result
    
    @performance_monitor.track_operation("memory_search")
    async def search(self, query: str, limit: int = 10, offset: int = 0,
                    model: Optional[str] = None) -> Dict[str, Any]:
        """Search with caching"""
        cache_key = f"search:keyword:{self.context}:{query}:{limit}:{offset}"
        
        # Try cache first
        if self.config.cache_enabled:
            cached = await cache_manager.get_result(cache_key)
            if cached:
                logger.debug(f"🎯 Cache hit for search: {query}")
                return cached
        
        # Perform search
        result = await super().search(query, limit, offset, model)
        
        # Cache the result
        if self.config.cache_enabled and "error" not in result:
            await cache_manager.cache_result(
                cache_key,
                result,
                ttl=self.config.cache_ttl_search
            )
        
        return result
    
    @performance_monitor.track_operation("memory_semantic_search")
    async def semantic_search(self, query: str, limit: int = 10, offset: int = 0,
                            threshold: float = 0.5, model: Optional[str] = None) -> Dict[str, Any]:
        """Semantic search with caching"""
        # Generate embedding for query
        if not self.ai or not self.ai.enabled:
            return {"error": "AI not available for semantic search", "results": []}
        
        # Check cache for query embedding
        embedding_cache_key = f"embedding:query:{query}"
        query_embedding = None
        
        if self.config.cache_enabled:
            query_embedding = await cache_manager.get_embedding(embedding_cache_key)
        
        if not query_embedding:
            query_embedding = await self.ai.generate_embedding(query)
            if not query_embedding:
                return {"error": "Failed to generate query embedding", "results": []}
            
            # Cache query embedding
            if self.config.cache_enabled:
                await cache_manager.cache_embedding(
                    embedding_cache_key,
                    query_embedding,
                    ttl=3600  # 1 hour for query embeddings
                )
        
        # Check cache for search results
        cache_key = f"search:semantic:{self.context}:{query}:{limit}:{offset}:{threshold}"
        
        if self.config.cache_enabled:
            cached = await cache_manager.get_result(cache_key)
            if cached:
                logger.debug(f"🎯 Cache hit for semantic search: {query}")
                return cached
        
        # Perform semantic search
        result = await super().semantic_search(query, limit, offset, threshold, model)
        
        # Cache the result
        if self.config.cache_enabled and "error" not in result:
            await cache_manager.cache_result(
                cache_key,
                result,
                ttl=self.config.cache_ttl_search
            )
        
        return result
    
    @performance_monitor.track_operation("memory_update")
    async def update(self, memory_id: str, **kwargs) -> Dict[str, Any]:
        """Update memory and invalidate cache"""
        result = await super().update(memory_id, **kwargs)
        
        # Invalidate cache
        if self.config.cache_enabled:
            await cache_manager.delete(f"memory:{memory_id}")
            # Also invalidate list caches
            await cache_manager.invalidate_pattern(f"list:{self.context}:*")
            # Invalidate search caches if content changed
            if "content" in kwargs:
                await cache_manager.invalidate_pattern(f"search:*:{self.context}:*")
        
        return result
    
    @performance_monitor.track_operation("memory_delete")
    async def delete(self, memory_id: str) -> Dict[str, Any]:
        """Delete memory and invalidate cache"""
        result = await super().delete(memory_id)
        
        # Invalidate cache
        if self.config.cache_enabled:
            await cache_manager.delete(f"memory:{memory_id}")
            await cache_manager.invalidate_pattern(f"list:{self.context}:*")
            await cache_manager.invalidate_pattern(f"search:*:{self.context}:*")
        
        return result
    
    @performance_monitor.track_operation("memory_batch_create")
    async def batch_create(self, memories: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Batch create memories for better performance"""
        created = []
        failed = []
        
        for memory_data in memories:
            try:
                result = await self.create(
                    content=memory_data.get("content", ""),
                    memory_type=memory_data.get("type", "general"),
                    title=memory_data.get("title"),
                    tags=memory_data.get("tags"),
                    async_embedding=True,
                    async_entities=True
                )
                
                if "error" not in result:
                    created.append(result["memory"])
                else:
                    failed.append({
                        "data": memory_data,
                        "error": result["error"]
                    })
                    
            except Exception as e:
                failed.append({
                    "data": memory_data,
                    "error": str(e)
                })
        
        return {
            "created": created,
            "failed": failed,
            "total": len(memories),
            "success_count": len(created),
            "failure_count": len(failed)
        }
    
    async def get_performance_stats(self) -> Dict[str, Any]:
        """Get performance statistics"""
        stats = {
            "cache_enabled": self.config.cache_enabled,
            "cache_stats": {},
            "task_queue_stats": {},
            "database_stats": {}
        }
        
        # Get cache statistics
        if self.config.cache_enabled:
            stats["cache_stats"] = await cache_manager.get_stats()
        
        # Get task queue statistics
        stats["task_queue_stats"] = await task_queue.get_stats()
        
        # Get database statistics
        db_stats = await self.db.fetchrow("""
            SELECT 
                COUNT(*) as total_memories,
                COUNT(CASE WHEN has_embedding THEN 1 END) as memories_with_embeddings,
                AVG(char_length(content)) as avg_content_length
            FROM memories
            WHERE context = $1
        """, self.context)
        
        stats["database_stats"] = dict(db_stats) if db_stats else {}
        
        # Get performance metrics
        stats["performance_metrics"] = await performance_monitor.get_metrics()
        
        return stats