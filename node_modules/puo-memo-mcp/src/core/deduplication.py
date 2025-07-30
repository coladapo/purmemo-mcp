"""
Content deduplication system for PUO Memo
Prevents duplicate saves and handles overlaps intelligently
"""
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone, timedelta
import uuid

logger = logging.getLogger(__name__)


class DeduplicationManager:
    """Manages content deduplication for memories"""
    
    def __init__(self, db_connection, ai_assistant=None, config=None):
        self.db = db_connection
        self.ai = ai_assistant
        
        # Configuration - use settings from config or defaults
        if config:
            self.similarity_threshold = config.dedup_similarity_threshold
            self.time_window_default = config.dedup_time_window_seconds
            self.time_window_by_context = {
                'claude': config.dedup_time_window_claude,
                'chatgpt': config.dedup_time_window_chatgpt,
                'cursor': config.dedup_time_window_cursor,
            }
        else:
            self.similarity_threshold = 0.9  # 90% similarity
            self.time_window_default = 300  # 5 minutes
            self.time_window_by_context = {}
            
        self.content_length = 1000  # Characters to compare
        self.auto_merge_memorylane = True
        
    async def check_duplicate_content(self, 
                                    content: str, 
                                    context: str = None,
                                    time_window: Optional[int] = None) -> Optional[Dict[str, Any]]:
        """
        Check if similar content was saved recently
        
        Args:
            content: The content to check
            context: Context to search within
            time_window: Seconds to look back (default 5 minutes)
        
        Returns:
            dict with duplicate info or None
        """
        if not self.ai or not self.ai.enabled:
            logger.info("AI not enabled, skipping deduplication")
            return None
            
        # Use context-specific time window if available
        if time_window is None:
            time_window = self.time_window_by_context.get(context, self.time_window_default)
        
        try:
            # Generate embedding for content sample
            content_sample = content[:self.content_length]
            new_embedding = await self.ai.generate_embedding(content_sample)
            
            if not new_embedding:
                logger.warning("Could not generate embedding for dedup check")
                return None
            
            # Convert to PostgreSQL vector format
            embedding_str = '[' + ','.join(str(x) for x in new_embedding) + ']'
            
            async with self.db.get_connection() as conn:
                # Check recent memories for similarity
                query = """
                    SELECT 
                        id, 
                        title, 
                        content,
                        created_at,
                        tags,
                        1 - (embedding <=> $1::vector) as similarity
                    FROM memory_entities
                    WHERE 
                        created_at > NOW() - INTERVAL '%s seconds'
                        AND embedding IS NOT NULL
                        AND 1 - (embedding <=> $1::vector) > $2
                        {}
                    ORDER BY similarity DESC
                    LIMIT 1
                """.format("AND project_context = $3" if context else "")
                
                params = [embedding_str, self.similarity_threshold]
                if context:
                    params.append(context)
                
                result = await conn.fetchrow(
                    query.replace('%s', str(time_window)), 
                    *params
                )
                
                if result:
                    return {
                        'id': str(result['id']),
                        'title': result['title'],
                        'similarity': float(result['similarity']),
                        'created_at': result['created_at'],
                        'tags': result['tags'] or [],
                        'content_preview': result['content'][:200] + '...' if len(result['content']) > 200 else result['content']
                    }
                    
        except Exception as e:
            logger.error(f"Error checking for duplicates: {e}")
            
        return None
    
    async def merge_content_smart(self, 
                                 existing_content: str, 
                                 new_content: str) -> str:
        """
        Use AI to intelligently merge two versions of content
        """
        if not self.ai or not self.ai.enabled:
            # Simple append if no AI
            return f"{existing_content}\n\n[Updated {datetime.now(timezone.utc).isoformat()}]\n{new_content}"
        
        try:
            prompt = f"""Merge these two versions intelligently, preserving all unique information:

ORIGINAL VERSION:
{existing_content[:1500]}

NEW VERSION:
{new_content[:1500]}

Create a unified version that:
1. Preserves all unique information from both
2. Avoids redundancy
3. Maintains chronological order where relevant
4. Clearly marks any updates or additions
5. Keeps the overall structure coherent

Return only the merged content without explanation."""

            response = await self.ai.model.generate_content_async(prompt)
            return response.text
            
        except Exception as e:
            logger.error(f"AI merge failed: {e}")
            # Fallback to simple append
            return f"{existing_content}\n\n[Updated {datetime.now(timezone.utc).isoformat()}]\n{new_content}"
    
    def is_memorylane_capture(self, memory: Dict[str, Any]) -> bool:
        """Check if a memory is from MemoryLane automatic capture"""
        tags = memory.get('tags', [])
        return any(tag in tags for tag in ['memorylane', 'memorylane-auto', 'auto-capture'])
    
    def calculate_content_hash(self, content: str) -> str:
        """Generate a hash for exact duplicate detection"""
        import hashlib
        # Normalize whitespace and case for comparison
        normalized = ' '.join(content.lower().split())
        return hashlib.sha256(normalized.encode()).hexdigest()[:16]


class DeduplicationMemoryStore:
    """Enhanced memory store with deduplication"""
    
    def __init__(self, base_memory_store, dedup_manager: DeduplicationManager):
        self.base_store = base_memory_store
        self.dedup = dedup_manager
        self.db = base_memory_store.db
        
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
        
        Args:
            content: Memory content
            title: Optional title
            memory_type: Type of memory
            tags: Optional tags
            attachments: Optional file paths
            metadata: Optional metadata
            dedup_window: Time window for dedup check (seconds)
            force: Skip dedup check if True
            merge_strategy: How to merge if duplicate found ('smart', 'append', 'skip')
            
        Returns:
            Result dict with status and details
        """
        # Input validation
        if not content or not content.strip():
            raise ValueError("Content cannot be empty")
        
        # Skip dedup check if forced
        if not force:
            duplicate = await self.dedup.check_duplicate_content(
                content, 
                self.base_store.current_context,
                dedup_window
            )
            
            if duplicate:
                similarity_pct = round(duplicate['similarity'] * 100, 1)
                
                # If very similar (>95%), handle based on type
                if similarity_pct > 95:
                    # Auto-merge if it's from MemoryLane
                    if self.dedup.is_memorylane_capture(duplicate):
                        return await self.update_or_merge(
                            duplicate['id'],
                            new_content=content,
                            new_tags=tags,
                            new_attachments=attachments,
                            merge_strategy=merge_strategy
                        )
                    
                    # Otherwise return duplicate info
                    return {
                        'status': 'duplicate_found',
                        'existing_memory': duplicate,
                        'similarity': similarity_pct,
                        'message': f"Found {similarity_pct}% similar memory from {duplicate['created_at']}",
                        'options': {
                            'update': f"Use update_memory('{duplicate['id']}', ...) to update",
                            'force': "Use force=True to save anyway",
                            'skip': "Skip saving"
                        }
                    }
        
        # Add dedup metadata
        if metadata is None:
            metadata = {}
        metadata['content_hash'] = self.dedup.calculate_content_hash(content)
        metadata['dedup_checked'] = datetime.now(timezone.utc).isoformat()
        
        # Proceed with normal creation
        memory = await self.base_store.create(
            content=content,
            title=title,
            memory_type=memory_type,
            tags=tags,
            attachments=attachments,
            metadata=metadata
        )
        
        result = {
            'status': 'created',
            'memory': memory,
            'message': f"Memory saved: {memory['id']}"
        }
        
        # Include attachment error info if present
        if 'failed_attachments' in memory:
            result['failed_attachments'] = memory['failed_attachments']
            result['attachment_errors'] = memory.get('attachment_errors')
            
        return result
    
    async def update_or_merge(self,
                             memory_id: str,
                             new_content: Optional[str] = None,
                             new_tags: Optional[List[str]] = None,
                             new_attachments: Optional[List[str]] = None,
                             merge_strategy: str = 'smart') -> Dict[str, Any]:
        """
        Update existing memory with new information
        
        Args:
            memory_id: ID of memory to update
            new_content: New content to add
            new_tags: Additional tags
            new_attachments: Additional attachments
            merge_strategy: 'append', 'replace', 'smart'
        """
        try:
            async with self.db.get_connection() as conn:
                # Get existing memory
                existing = await conn.fetchrow(
                    "SELECT * FROM memory_entities WHERE id = $1",
                    uuid.UUID(memory_id)
                )
                
                if not existing:
                    return {
                        'status': 'error',
                        'message': f"Memory {memory_id} not found"
                    }
                
                # Prepare updates
                updates = {}
                
                # Handle content merge
                if new_content:
                    if merge_strategy == 'append':
                        merged_content = f"{existing['content']}\n\n[Updated {datetime.now(timezone.utc).isoformat()}]\n{new_content}"
                    elif merge_strategy == 'replace':
                        merged_content = new_content
                    elif merge_strategy == 'smart':
                        merged_content = await self.dedup.merge_content_smart(
                            existing['content'], 
                            new_content
                        )
                    else:
                        merged_content = existing['content']
                    
                    updates['content'] = merged_content
                
                # Merge tags (union)
                if new_tags:
                    existing_tags = existing['tags'] or []
                    all_tags = list(set(existing_tags + new_tags))
                    updates['tags'] = all_tags
                
                # Update the memory
                if updates:
                    updates['updated_at'] = datetime.now(timezone.utc)
                    
                    # Build update query
                    set_clauses = [f"{k} = ${i+2}" for i, k in enumerate(updates.keys())]
                    query = f"""
                        UPDATE memory_entities 
                        SET {', '.join(set_clauses)}
                        WHERE id = $1
                        RETURNING *
                    """
                    
                    result = await conn.fetchrow(
                        query,
                        uuid.UUID(memory_id),
                        *updates.values()
                    )
                    
                    # Regenerate embedding if content changed
                    if 'content' in updates and self.base_store.ai and self.base_store.ai.enabled:
                        embedding = await self.base_store.ai.generate_embedding(updates['content'])
                        if embedding:
                            embedding_str = '[' + ','.join(str(x) for x in embedding) + ']'
                            await conn.execute(
                                "UPDATE memory_entities SET embedding = $2::vector WHERE id = $1",
                                uuid.UUID(memory_id), embedding_str
                            )
                
                # Add new attachments if any
                if new_attachments and self.base_store.attachment_processor:
                    for attachment in new_attachments:
                        await self.base_store.attachment_processor.attach_file(
                            memory_id, attachment
                        )
                
                # Log the update
                logger.info(f"Updated memory {memory_id} with strategy {merge_strategy}")
                
                return {
                    'status': 'updated',
                    'memory_id': memory_id,
                    'message': f"Memory updated successfully",
                    'merge_strategy': merge_strategy
                }
                
        except Exception as e:
            logger.error(f"Failed to update memory: {e}")
            return {
                'status': 'error',
                'message': str(e)
            }
    
    async def find_exact_duplicates(self, 
                                   context: Optional[str] = None,
                                   time_range: Optional[int] = None) -> List[Dict[str, Any]]:
        """Find exact content duplicates using hash"""
        try:
            async with self.db.get_connection() as conn:
                query = """
                    SELECT 
                        metadata->>'content_hash' as hash,
                        COUNT(*) as count,
                        array_agg(id) as memory_ids,
                        array_agg(title) as titles,
                        MIN(created_at) as first_created,
                        MAX(created_at) as last_created
                    FROM memory_entities
                    WHERE 
                        metadata->>'content_hash' IS NOT NULL
                        {}
                        {}
                    GROUP BY metadata->>'content_hash'
                    HAVING COUNT(*) > 1
                    ORDER BY count DESC
                """
                
                conditions = []
                params = []
                
                if context:
                    conditions.append("AND project_context = $1")
                    params.append(context)
                    
                if time_range:
                    param_num = len(params) + 1
                    conditions.append(f"AND created_at > NOW() - INTERVAL '{time_range} seconds'")
                
                query = query.format(*conditions) if conditions else query.format('', '')
                
                results = await conn.fetch(query, *params)
                
                duplicates = []
                for row in results:
                    duplicates.append({
                        'hash': row['hash'],
                        'count': row['count'],
                        'memory_ids': [str(id) for id in row['memory_ids']],
                        'titles': row['titles'],
                        'first_created': row['first_created'],
                        'last_created': row['last_created'],
                        'time_span': (row['last_created'] - row['first_created']).total_seconds()
                    })
                
                return duplicates
                
        except Exception as e:
            logger.error(f"Error finding exact duplicates: {e}")
            return []