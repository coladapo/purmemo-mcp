"""
Memory versioning and history tracking for PUO Memo
Provides version control capabilities for memories
"""

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from uuid import UUID

logger = logging.getLogger(__name__)


class MemoryVersioning:
    """Handles memory version control and history"""
    
    def __init__(self, db_connection):
        self.db = db_connection
        
    async def get_version_history(self, memory_id: str, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get version history for a memory
        
        Args:
            memory_id: Memory ID to get history for
            limit: Maximum number of versions to return
            
        Returns:
            List of version records
        """
        query = """
            SELECT 
                id,
                version_number,
                content,
                title,
                type,
                tags,
                metadata,
                changed_by,
                change_type,
                change_reason,
                created_at
            FROM memory_versions
            WHERE memory_id = $1
            ORDER BY version_number DESC
            LIMIT $2
        """
        
        async with self.db.get_connection() as conn:
            rows = await conn.fetch(query, memory_id, limit)
            
        return [
            {
                'id': str(row['id']),
                'version_number': row['version_number'],
                'content': row['content'],
                'title': row['title'],
                'type': row['type'],
                'tags': row['tags'] or [],
                'metadata': dict(row['metadata'] or {}),
                'changed_by': row['changed_by'],
                'change_type': row['change_type'],
                'change_reason': row['change_reason'],
                'created_at': row['created_at'].isoformat() if row['created_at'] else None
            }
            for row in rows
        ]
        
    async def get_specific_version(self, memory_id: str, version_number: int) -> Optional[Dict[str, Any]]:
        """
        Get a specific version of a memory
        
        Args:
            memory_id: Memory ID
            version_number: Version number to retrieve
            
        Returns:
            Version record or None if not found
        """
        query = """
            SELECT * FROM get_memory_version($1, $2)
        """
        
        async with self.db.get_connection() as conn:
            row = await conn.fetchrow(query, memory_id, version_number)
            
        if not row:
            return None
            
        return {
            'id': str(row['id']),
            'memory_id': str(row['memory_id']),
            'version_number': row['version_number'],
            'content': row['content'],
            'title': row['title'],
            'type': row['type'],
            'tags': row['tags'] or [],
            'metadata': dict(row['metadata'] or {}),
            'changed_by': row['changed_by'],
            'change_type': row['change_type'],
            'created_at': row['created_at'].isoformat() if row['created_at'] else None
        }
        
    async def compare_versions(self, memory_id: str, version1: int, version2: int) -> List[Dict[str, Any]]:
        """
        Compare two versions of a memory
        
        Args:
            memory_id: Memory ID
            version1: First version number
            version2: Second version number
            
        Returns:
            List of differences between versions
        """
        query = """
            SELECT * FROM compare_memory_versions($1, $2, $3)
        """
        
        async with self.db.get_connection() as conn:
            rows = await conn.fetch(query, memory_id, version1, version2)
            
        return [
            {
                'field': row['field_name'],
                'version1_value': row['version1_value'],
                'version2_value': row['version2_value'],
                'changed': row['changed']
            }
            for row in rows
        ]
        
    async def rollback_to_version(self, memory_id: str, target_version: int, reason: str = None) -> bool:
        """
        Rollback a memory to a previous version
        
        Args:
            memory_id: Memory ID
            target_version: Version number to rollback to
            reason: Reason for rollback
            
        Returns:
            True if successful, False otherwise
        """
        query = """
            SELECT rollback_memory_version($1, $2, $3)
        """
        
        reason = reason or f"Rollback to version {target_version}"
        
        try:
            async with self.db.get_connection() as conn:
                result = await conn.fetchval(query, memory_id, target_version, reason)
                
            if result:
                logger.info(f"Successfully rolled back memory {memory_id} to version {target_version}")
            else:
                logger.error(f"Failed to rollback memory {memory_id} to version {target_version}")
                
            return result
            
        except Exception as e:
            logger.error(f"Error rolling back memory: {e}")
            return False
            
    async def get_version_count(self, memory_id: str) -> int:
        """
        Get total number of versions for a memory
        
        Args:
            memory_id: Memory ID
            
        Returns:
            Number of versions
        """
        query = """
            SELECT version_count 
            FROM memory_entities 
            WHERE id = $1
        """
        
        async with self.db.get_connection() as conn:
            count = await conn.fetchval(query, memory_id)
            
        return count or 0
        
    async def get_memories_with_history(self, context: Optional[str] = None, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get memories that have version history
        
        Args:
            context: Optional context filter
            limit: Maximum number of memories to return
            
        Returns:
            List of memories with version information
        """
        query = """
            SELECT 
                m.id,
                m.title,
                m.content,
                m.version_count,
                m.current_version,
                m.last_modified_by,
                m.last_modified_at,
                m.created_at,
                COUNT(DISTINCT mv.version_number) as actual_versions
            FROM memory_entities m
            LEFT JOIN memory_versions mv ON m.id = mv.memory_id
            WHERE m.version_count > 1
            AND ($1::text IS NULL OR m.context = $1)
            GROUP BY m.id
            ORDER BY m.last_modified_at DESC NULLS LAST
            LIMIT $2
        """
        
        async with self.db.get_connection() as conn:
            rows = await conn.fetch(query, context, limit)
            
        return [
            {
                'id': str(row['id']),
                'title': row['title'],
                'content': row['content'][:200] + '...' if len(row['content']) > 200 else row['content'],
                'version_count': row['version_count'],
                'current_version': row['current_version'],
                'last_modified_by': row['last_modified_by'],
                'last_modified_at': row['last_modified_at'].isoformat() if row['last_modified_at'] else None,
                'created_at': row['created_at'].isoformat() if row['created_at'] else None,
                'has_full_history': row['actual_versions'] == row['version_count']
            }
            for row in rows
        ]
        
    async def prune_old_versions(self, memory_id: str, keep_versions: int = 10) -> int:
        """
        Remove old versions keeping only the most recent ones
        
        Args:
            memory_id: Memory ID
            keep_versions: Number of versions to keep
            
        Returns:
            Number of versions deleted
        """
        # First get the versions to keep
        query_keep = """
            SELECT version_number 
            FROM memory_versions 
            WHERE memory_id = $1 
            ORDER BY version_number DESC 
            LIMIT $2
        """
        
        # Then delete the rest
        query_delete = """
            DELETE FROM memory_versions
            WHERE memory_id = $1 
            AND version_number NOT IN (
                SELECT version_number 
                FROM memory_versions 
                WHERE memory_id = $1 
                ORDER BY version_number DESC 
                LIMIT $2
            )
        """
        
        try:
            async with self.db.get_connection() as conn:
                # Get count before deletion
                count_before = await conn.fetchval(
                    "SELECT COUNT(*) FROM memory_versions WHERE memory_id = $1",
                    memory_id
                )
                
                # Delete old versions
                await conn.execute(query_delete, memory_id, keep_versions)
                
                # Get count after deletion
                count_after = await conn.fetchval(
                    "SELECT COUNT(*) FROM memory_versions WHERE memory_id = $1",
                    memory_id
                )
                
                deleted = count_before - count_after
                
                if deleted > 0:
                    logger.info(f"Pruned {deleted} old versions for memory {memory_id}")
                    
                return deleted
                
        except Exception as e:
            logger.error(f"Error pruning versions: {e}")
            return 0