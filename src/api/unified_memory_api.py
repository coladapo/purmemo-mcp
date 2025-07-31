"""
Unified Memory API that queries both memories and memory_entities tables
This ensures June 2024 memories stored in memory_entities are accessible
"""

import os
import json
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional, Union
from uuid import UUID

from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel, Field
import asyncpg

from .auth import get_current_user, User

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/v5", tags=["Unified Memory"])


class UnifiedMemory(BaseModel):
    """Unified memory model that works for both tables"""
    id: str
    user_id: str
    content: str
    title: Optional[str] = None
    tags: List[str] = []
    metadata: Dict[str, Any] = {}
    source_table: str  # 'memories' or 'memory_entities'
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    # Fields specific to memory_entities
    entity_name: Optional[str] = None
    entity_type: Optional[str] = None
    attributes: Optional[Dict[str, Any]] = None
    associations: Optional[List[Dict[str, Any]]] = None


class UnifiedSearchRequest(BaseModel):
    """Search request that works across both tables"""
    query: str
    search_type: str = "hybrid"  # keyword, semantic, hybrid
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)
    tags: Optional[List[str]] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    include_entities: bool = True  # Include memory_entities in search
    source_filter: Optional[str] = None  # 'memories', 'entities', or None for both


class UnifiedSearchResponse(BaseModel):
    """Unified search response"""
    results: List[UnifiedMemory]
    total_count: int
    memories_count: int
    entities_count: int
    query: str
    search_type: str


async def get_db_pool(request) -> asyncpg.Pool:
    """Get database pool from app state"""
    return request.app.state.db_pool


@router.get("/memories/search", response_model=UnifiedSearchResponse)
async def unified_search(
    query: str = Query(..., description="Search query"),
    search_type: str = Query("hybrid", description="Search type: keyword, semantic, or hybrid"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    tags: Optional[str] = Query(None, description="Comma-separated tags"),
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    include_entities: bool = Query(True, description="Include memory_entities in search"),
    source_filter: Optional[str] = Query(None, description="Filter by source: memories, entities, or both"),
    current_user: User = Depends(get_current_user),
    db_pool: asyncpg.Pool = Depends(get_db_pool)
):
    """
    Unified search across both memories and memory_entities tables.
    This ensures June 2024 memories stored in memory_entities are accessible.
    """
    
    # Parse tags
    tag_list = tags.split(",") if tags else None
    
    results = []
    memories_count = 0
    entities_count = 0
    total_count = 0
    
    async with db_pool.acquire() as conn:
        # Search memories table
        if source_filter != "entities":
            memories_query = """
                WITH ranked_memories AS (
                    SELECT 
                        id, user_id, content, title, tags, 
                        type, context, metadata,
                        created_at, updated_at,
                        GREATEST(
                            similarity(content, $2),
                            similarity(COALESCE(title, ''), $2)
                        ) AS score
                    FROM memories
                    WHERE user_id = $1
                    AND (
                        content % $2
                        OR COALESCE(title, '') % $2
                    )
            """
            
            params = [current_user.id, query]
            param_count = 3
            
            # Add filters
            if tag_list:
                memories_query += f" AND tags && ${param_count}::text[]"
                params.append(tag_list)
                param_count += 1
            
            if date_from:
                memories_query += f" AND created_at >= ${param_count}"
                params.append(date_from)
                param_count += 1
            
            if date_to:
                memories_query += f" AND created_at <= ${param_count}"
                params.append(date_to)
                param_count += 1
            
            memories_query += """
                    ORDER BY score DESC, created_at DESC
                )
                SELECT * FROM ranked_memories
            """
            
            memories_result = await conn.fetch(memories_query, *params)
            
            for row in memories_result:
                results.append(UnifiedMemory(
                    id=str(row['id']),
                    user_id=str(row['user_id']),
                    content=row['content'],
                    title=row['title'],
                    tags=row['tags'] or [],
                    metadata=json.loads(row['metadata']) if row['metadata'] else {},
                    source_table='memories',
                    created_at=row['created_at'],
                    updated_at=row['updated_at']
                ))
            
            memories_count = len(memories_result)
        
        # Search memory_entities table (June 2024 memories)
        if include_entities and source_filter != "memories":
            entities_query = """
                WITH ranked_entities AS (
                    SELECT 
                        id, user_id, entity_name, entity_type,
                        attributes, associations,
                        created_at, updated_at,
                        GREATEST(
                            similarity(entity_name, $2),
                            similarity(COALESCE(attributes->>'description', ''), $2),
                            similarity(COALESCE(attributes->>'content', ''), $2)
                        ) AS score
                    FROM memory_entities
                    WHERE user_id = $1
                    AND (
                        entity_name % $2
                        OR COALESCE(attributes->>'description', '') % $2
                        OR COALESCE(attributes->>'content', '') % $2
                    )
            """
            
            params = [current_user.id, query]
            param_count = 3
            
            # Add date filters (adjusting for the date issue where June 2024 shows as 2025)
            if date_from:
                # If searching for June 2024, also check June 2025 due to the date issue
                if date_from.year == 2024 and date_from.month == 6:
                    entities_query += f" AND (created_at >= ${param_count} OR created_at >= '2025-06-01'::timestamp)"
                else:
                    entities_query += f" AND created_at >= ${param_count}"
                params.append(date_from)
                param_count += 1
            
            if date_to:
                # Similar adjustment for date_to
                if date_to.year == 2024 and date_to.month == 7:
                    entities_query += f" AND (created_at <= ${param_count} OR created_at <= '2025-07-31'::timestamp)"
                else:
                    entities_query += f" AND created_at <= ${param_count}"
                params.append(date_to)
                param_count += 1
            
            entities_query += """
                    ORDER BY score DESC, created_at DESC
                )
                SELECT * FROM ranked_entities
            """
            
            entities_result = await conn.fetch(entities_query, *params)
            
            for row in entities_result:
                # Convert entity to memory format
                content = row['entity_name']
                if row['attributes'] and 'content' in row['attributes']:
                    content = row['attributes']['content']
                elif row['attributes'] and 'description' in row['attributes']:
                    content = row['attributes']['description']
                
                # Extract tags from entity type and attributes
                entity_tags = [row['entity_type']] if row['entity_type'] else []
                if row['attributes'] and 'tags' in row['attributes']:
                    entity_tags.extend(row['attributes']['tags'])
                
                results.append(UnifiedMemory(
                    id=str(row['id']),
                    user_id=str(row['user_id']),
                    content=content,
                    title=row['entity_name'],
                    tags=entity_tags,
                    metadata=row['attributes'] or {},
                    source_table='memory_entities',
                    created_at=row['created_at'],
                    updated_at=row['updated_at'],
                    entity_name=row['entity_name'],
                    entity_type=row['entity_type'],
                    attributes=row['attributes'],
                    associations=row['associations']
                ))
            
            entities_count = len(entities_result)
        
        # Sort combined results by relevance/date
        results.sort(key=lambda x: x.created_at, reverse=True)
        
        # Apply pagination to combined results
        total_count = len(results)
        paginated_results = results[offset:offset + limit]
    
    return UnifiedSearchResponse(
        results=paginated_results,
        total_count=total_count,
        memories_count=memories_count,
        entities_count=entities_count,
        query=query,
        search_type=search_type
    )


@router.get("/memories/{memory_id}", response_model=UnifiedMemory)
async def get_unified_memory(
    memory_id: str,
    current_user: User = Depends(get_current_user),
    db_pool: asyncpg.Pool = Depends(get_db_pool)
):
    """
    Get a memory by ID from either memories or memory_entities table
    """
    async with db_pool.acquire() as conn:
        # Try memories table first
        memory = await conn.fetchrow("""
            SELECT id, user_id, content, title, tags, type, context, 
                   metadata, created_at, updated_at
            FROM memories
            WHERE id = $1 AND user_id = $2
        """, memory_id, current_user.id)
        
        if memory:
            return UnifiedMemory(
                id=str(memory['id']),
                user_id=str(memory['user_id']),
                content=memory['content'],
                title=memory['title'],
                tags=memory['tags'] or [],
                metadata=json.loads(memory['metadata']) if memory['metadata'] else {},
                source_table='memories',
                created_at=memory['created_at'],
                updated_at=memory['updated_at']
            )
        
        # Try memory_entities table
        entity = await conn.fetchrow("""
            SELECT id, user_id, entity_name, entity_type, 
                   attributes, associations, created_at, updated_at
            FROM memory_entities
            WHERE id = $1 AND user_id = $2
        """, memory_id, current_user.id)
        
        if entity:
            # Convert entity to memory format
            content = entity['entity_name']
            if entity['attributes'] and 'content' in entity['attributes']:
                content = entity['attributes']['content']
            elif entity['attributes'] and 'description' in entity['attributes']:
                content = entity['attributes']['description']
            
            return UnifiedMemory(
                id=str(entity['id']),
                user_id=str(entity['user_id']),
                content=content,
                title=entity['entity_name'],
                tags=[entity['entity_type']] if entity['entity_type'] else [],
                metadata=entity['attributes'] or {},
                source_table='memory_entities',
                created_at=entity['created_at'],
                updated_at=entity['updated_at'],
                entity_name=entity['entity_name'],
                entity_type=entity['entity_type'],
                attributes=entity['attributes'],
                associations=entity['associations']
            )
        
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Memory not found in either table"
        )


@router.get("/memories", response_model=UnifiedSearchResponse)
async def list_all_memories(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    include_entities: bool = Query(True),
    source_filter: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db_pool: asyncpg.Pool = Depends(get_db_pool)
):
    """
    List all memories from both tables with pagination
    """
    results = []
    memories_count = 0
    entities_count = 0
    
    async with db_pool.acquire() as conn:
        # Get memories
        if source_filter != "entities":
            memories = await conn.fetch("""
                SELECT id, user_id, content, title, tags, type, context,
                       metadata, created_at, updated_at
                FROM memories
                WHERE user_id = $1
                ORDER BY created_at DESC
            """, current_user.id)
            
            for row in memories:
                results.append(UnifiedMemory(
                    id=str(row['id']),
                    user_id=str(row['user_id']),
                    content=row['content'],
                    title=row['title'],
                    tags=row['tags'] or [],
                    metadata=json.loads(row['metadata']) if row['metadata'] else {},
                    source_table='memories',
                    created_at=row['created_at'],
                    updated_at=row['updated_at']
                ))
            
            memories_count = len(memories)
        
        # Get entities
        if include_entities and source_filter != "memories":
            entities = await conn.fetch("""
                SELECT id, user_id, entity_name, entity_type,
                       attributes, associations, created_at, updated_at
                FROM memory_entities
                WHERE user_id = $1
                ORDER BY created_at DESC
            """, current_user.id)
            
            for row in entities:
                content = row['entity_name']
                if row['attributes'] and 'content' in row['attributes']:
                    content = row['attributes']['content']
                
                results.append(UnifiedMemory(
                    id=str(row['id']),
                    user_id=str(row['user_id']),
                    content=content,
                    title=row['entity_name'],
                    tags=[row['entity_type']] if row['entity_type'] else [],
                    metadata=row['attributes'] or {},
                    source_table='memory_entities',
                    created_at=row['created_at'],
                    updated_at=row['updated_at'],
                    entity_name=row['entity_name'],
                    entity_type=row['entity_type'],
                    attributes=row['attributes'],
                    associations=row['associations']
                ))
            
            entities_count = len(entities)
        
        # Sort combined results
        results.sort(key=lambda x: x.created_at, reverse=True)
        
        # Apply pagination
        total_count = len(results)
        paginated_results = results[offset:offset + limit]
    
    return UnifiedSearchResponse(
        results=paginated_results,
        total_count=total_count,
        memories_count=memories_count,
        entities_count=entities_count,
        query="",
        search_type="list"
    )


@router.get("/stats")
async def get_memory_stats(
    current_user: User = Depends(get_current_user),
    db_pool: asyncpg.Pool = Depends(get_db_pool)
):
    """
    Get statistics about memories across both tables
    """
    async with db_pool.acquire() as conn:
        # Get memories count
        memories_count = await conn.fetchval("""
            SELECT COUNT(*) FROM memories WHERE user_id = $1
        """, current_user.id)
        
        # Get entities count
        entities_count = await conn.fetchval("""
            SELECT COUNT(*) FROM memory_entities WHERE user_id = $1
        """, current_user.id)
        
        # Get June 2024 memories (checking both 2024 and 2025 due to date issue)
        june_2024_count = await conn.fetchval("""
            SELECT COUNT(*) FROM memory_entities 
            WHERE user_id = $1 
            AND (
                (created_at >= '2024-06-01' AND created_at < '2024-08-01')
                OR (created_at >= '2025-06-01' AND created_at < '2025-08-01')
            )
        """, current_user.id)
        
        # Get date range
        date_range = await conn.fetchrow("""
            SELECT 
                MIN(LEAST(
                    (SELECT MIN(created_at) FROM memories WHERE user_id = $1),
                    (SELECT MIN(created_at) FROM memory_entities WHERE user_id = $1)
                )) as earliest,
                MAX(GREATEST(
                    (SELECT MAX(created_at) FROM memories WHERE user_id = $1),
                    (SELECT MAX(created_at) FROM memory_entities WHERE user_id = $1)
                )) as latest
        """, current_user.id)
        
        return {
            "total_memories": memories_count + entities_count,
            "memories_table_count": memories_count,
            "entities_table_count": entities_count,
            "june_2024_memories": june_2024_count,
            "date_range": {
                "earliest": date_range['earliest'],
                "latest": date_range['latest']
            },
            "note": "June 2024 memories may appear as 2025 due to a timezone issue in memory_entities table"
        }