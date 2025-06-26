#!/usr/bin/env python3
"""
PUO Memo Simple - Simplified Memory System
Clean, reliable memory management without over-engineering
"""
import asyncio
import json
import os
import logging
import uuid
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from dotenv import load_dotenv

# Database imports
import asyncpg

# AI imports (optional)
try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class PuoMemoSimple:
    """Simplified memory system focused on reliability"""
    
    def __init__(self):
        self.conn = None
        self.ai_enabled = False
        self.model = None
        self.current_context = "default"
        
    async def initialize(self):
        """Initialize database connection and optional AI"""
        try:
            # Database connection
            db_config = {
                'host': os.getenv('DB_HOST'),
                'port': int(os.getenv('DB_PORT', 5432)),
                'database': os.getenv('DB_NAME'),
                'user': os.getenv('DB_USER'),
                'password': os.getenv('DB_PASSWORD')
            }
            
            self.conn = await asyncpg.connect(**db_config)
            logger.info("✅ Connected to PostgreSQL")
            
            # Optional AI setup
            if GEMINI_AVAILABLE:
                api_key = os.getenv('GEMINI_API_KEY')
                if api_key:
                    genai.configure(api_key=api_key)
                    self.model = genai.GenerativeModel('gemini-1.5-flash')
                    self.ai_enabled = True
                    logger.info("✅ AI features enabled")
                else:
                    logger.info("ℹ️  No Gemini API key, AI features disabled")
            
            return True
            
        except Exception as e:
            logger.error(f"Initialization failed: {e}")
            return False
    
    async def cleanup(self):
        """Clean up resources"""
        if self.conn:
            await self.conn.close()
    
    # Core Memory Operations
    
    async def create_memory(self, content: str, title: Optional[str] = None,
                          memory_type: str = "general", tags: List[str] = None) -> Dict[str, Any]:
        """Create a new memory"""
        try:
            # Generate title if not provided
            if not title:
                title = content[:100] + "..." if len(content) > 100 else content
            
            # Prepare data
            memory_id = str(uuid.uuid4())
            tags = tags or []
            metadata = {
                "created_via": "puo_memo_simple",
                "version": "1.0"
            }
            
            # Insert into database
            await self.conn.execute("""
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
    
    async def search_memories(self, query: str, limit: int = 10) -> Dict[str, Any]:
        """Search memories using basic text search"""
        try:
            # Basic text search
            results = await self.conn.fetch("""
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
    
    async def ask_memory(self, question: str) -> Dict[str, Any]:
        """Answer questions using memories and optional AI"""
        try:
            # First, search for relevant memories
            search_result = await self.search_memories(question, limit=5)
            
            if not search_result.get('results'):
                return {
                    "question": question,
                    "answer": "I don't have any memories related to your question.",
                    "sources": []
                }
            
            # If AI is available, use it to generate a better answer
            if self.ai_enabled and self.model:
                context = "\n\n".join([
                    f"Memory: {mem['title']}\nContent: {mem['content']}"
                    for mem in search_result['results']
                ])
                
                prompt = f"""Based on these memories, answer the question concisely:

Memories:
{context}

Question: {question}

Answer:"""
                
                response = self.model.generate_content(prompt)
                answer = response.text
            else:
                # Simple non-AI response
                answer = f"I found {len(search_result['results'])} related memories. The most relevant is: {search_result['results'][0]['title']}"
            
            return {
                "question": question,
                "answer": answer,
                "sources": [mem['id'] for mem in search_result['results'][:3]]
            }
            
        except Exception as e:
            logger.error(f"Ask memory failed: {e}")
            return {"error": str(e)}
    
    async def update_memory(self, memory_id: str, content: Optional[str] = None,
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
            result = await self.conn.execute(f"""
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
    
    async def delete_memory(self, memory_id: str) -> Dict[str, Any]:
        """Delete a memory"""
        try:
            result = await self.conn.execute("""
                DELETE FROM memory_entities WHERE id = $1
            """, memory_id)
            
            if result == "DELETE 0":
                return {"error": "Memory not found"}
            
            return {"success": True, "id": memory_id}
            
        except Exception as e:
            logger.error(f"Delete failed: {e}")
            return {"error": str(e)}
    
    async def list_memories(self, limit: int = 20, offset: int = 0) -> Dict[str, Any]:
        """List recent memories"""
        try:
            # Get total count
            count_result = await self.conn.fetchval("""
                SELECT COUNT(*) FROM memory_entities WHERE project_context = $1
            """, self.current_context)
            
            # Get memories
            results = await self.conn.fetch("""
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
    
    async def get_stats(self) -> Dict[str, Any]:
        """Get memory statistics"""
        try:
            # Total memories
            total = await self.conn.fetchval("""
                SELECT COUNT(*) FROM memory_entities
            """)
            
            # By context
            context_stats = await self.conn.fetch("""
                SELECT project_context, COUNT(*) as count
                FROM memory_entities
                GROUP BY project_context
            """)
            
            # By type
            type_stats = await self.conn.fetch("""
                SELECT memory_type, COUNT(*) as count
                FROM memory_entities
                GROUP BY memory_type
            """)
            
            # Recent activity
            recent = await self.conn.fetchval("""
                SELECT COUNT(*) FROM memory_entities
                WHERE created_at > NOW() - INTERVAL '24 hours'
            """)
            
            return {
                "total_memories": total,
                "recent_24h": recent,
                "by_context": {row['project_context']: row['count'] for row in context_stats},
                "by_type": {row['memory_type']: row['count'] for row in type_stats},
                "current_context": self.current_context,
                "ai_enabled": self.ai_enabled
            }
            
        except Exception as e:
            logger.error(f"Get stats failed: {e}")
            return {"error": str(e)}
    
    async def switch_context(self, context_name: str) -> Dict[str, Any]:
        """Switch project context"""
        try:
            # Check if context exists
            exists = await self.conn.fetchval("""
                SELECT COUNT(*) FROM project_contexts WHERE name = $1
            """, context_name)
            
            if not exists:
                # Create new context
                await self.conn.execute("""
                    INSERT INTO project_contexts (id, name, created_at)
                    VALUES ($1, $2, $3)
                """, str(uuid.uuid4()), context_name, datetime.now(timezone.utc))
            
            self.current_context = context_name
            
            # Get memory count for this context
            count = await self.conn.fetchval("""
                SELECT COUNT(*) FROM memory_entities WHERE project_context = $1
            """, context_name)
            
            return {
                "context": context_name,
                "memory_count": count,
                "created": not exists
            }
            
        except Exception as e:
            logger.error(f"Context switch failed: {e}")
            return {"error": str(e)}