"""
Core memory operations for PUO Memo
"""
import json
import uuid
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)


class MemoryStore:
    """Core memory operations - handles CRUD operations for memories"""
    
    def __init__(self, db_connection):
        self.db = db_connection
        self.current_context = "default"
    
    async def create(self, content: str, title: Optional[str] = None,
                    memory_type: str = "general", tags: Optional[List[str]] = None) -> Dict[str, Any]:
        """Create a new memory"""
        try:
            # Generate title if not provided
            if not title:
                title = content[:100] + "..." if len(content) > 100 else content
            
            # Prepare data
            memory_id = str(uuid.uuid4())
            tags = tags or []
            metadata = {
                "created_via": "puo_memo",
                "version": "2.0"
            }
            
            # Insert into database
            async with self.db.get_connection() as conn:
                await conn.execute("""
                    INSERT INTO memory_entities 
                    (id, content, title, memory_type, tags, metadata, project_context, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                """, memory_id, content, title, memory_type, tags, json.dumps(metadata),
                    self.current_context, datetime.now(timezone.utc))
            
            return {
                "id": memory_id,
                "title": title,
                "type": memory_type,
                "tags": tags,
                "context": self.current_context,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
        except Exception as e:
            logger.error(f"Failed to create memory: {e}")
            return {"error": str(e)}
    
    async def search(self, query: str, limit: int = 10) -> Dict[str, Any]:
        """Search memories using text search"""
        try:
            async with self.db.get_connection() as conn:
                results = await conn.fetch("""
                    SELECT id, title, content, memory_type, tags, created_at
                    FROM memory_entities
                    WHERE (
                        content ILIKE $1 OR 
                        title ILIKE $1 OR 
                        $2 = ANY(tags)
                    )
                    AND project_context = $3
                    ORDER BY created_at DESC
                    LIMIT $4
                """, f"%{query}%", query, self.current_context, limit)
            
            memories = []
            for row in results:
                memories.append({
                    "id": str(row['id']),
                    "title": row['title'],
                    "content": row['content'][:200] + "..." if len(row['content']) > 200 else row['content'],
                    "type": row['memory_type'],
                    "tags": row['tags'],
                    "created_at": row['created_at'].isoformat()
                })
            
            return {
                "query": query,
                "count": len(memories),
                "results": memories
            }
            
        except Exception as e:
            logger.error(f"Search failed: {e}")
            return {"error": str(e), "results": []}
    
    async def update(self, memory_id: str, content: Optional[str] = None,
                    title: Optional[str] = None, tags: Optional[List[str]] = None) -> Dict[str, Any]:
        """Update an existing memory"""
        try:
            # Build update query dynamically
            updates = []
            params = []
            param_count = 1
            
            if content is not None:
                updates.append(f"content = ${param_count}")
                params.append(content)
                param_count += 1
            
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
    
    async def delete(self, memory_id: str) -> Dict[str, Any]:
        """Delete a memory"""
        try:
            async with self.db.get_connection() as conn:
                result = await conn.execute("""
                    DELETE FROM memory_entities WHERE id = $1
                """, memory_id)
            
            if result == "DELETE 0":
                return {"error": "Memory not found"}
            
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
    
    def set_context(self, context: str):
        """Set the current project context"""
        self.current_context = context