"""
Entity management with merging, deduplication, and timeline tracking
"""
import logging
from typing import List, Dict, Any, Optional, Tuple, Set
from datetime import datetime, timezone
import asyncio
from collections import defaultdict
import uuid

logger = logging.getLogger(__name__)


class EntityManager:
    """Manages entities with deduplication, merging, and timeline tracking"""
    
    def __init__(self, db_connection, ai_assistant=None):
        self.db = db_connection
        self.ai = ai_assistant
        
    async def find_duplicate_entities(self, 
                                    similarity_threshold: float = 0.85) -> List[Dict[str, Any]]:
        """
        Find potential duplicate entities using various strategies
        """
        duplicates = []
        
        async with self.db.get_connection() as conn:
            # Strategy 1: Exact name matches (case-insensitive)
            exact_matches = await conn.fetch("""
                SELECT 
                    e1.id as id1, e1.name as name1, e1.type as type1,
                    e2.id as id2, e2.name as name2, e2.type as type2,
                    COUNT(DISTINCT mer1.memory_id) as shared_memories
                FROM entities e1
                JOIN entities e2 ON LOWER(e1.name) = LOWER(e2.name) 
                    AND e1.id < e2.id
                LEFT JOIN memory_entity_associations mea1 ON e1.id = mea1.entity_id
                LEFT JOIN memory_entity_associations mea2 ON e2.id = mea2.entity_id
                    AND mea1.memory_id = mea2.memory_id
                GROUP BY e1.id, e1.name, e1.entity_type, e2.id, e2.name, e2.entity_type
            """)
            
            for match in exact_matches:
                duplicates.append({
                    'type': 'exact_name',
                    'entity1': {
                        'id': str(match['id1']), 
                        'name': match['name1'], 
                        'type': match['entity_type1']
                    },
                    'entity2': {
                        'id': str(match['id2']), 
                        'name': match['name2'], 
                        'type': match['entity_type2']
                    },
                    'confidence': 1.0,
                    'shared_memories': match['shared_memories']
                })
            
            # Strategy 2: Similar names using trigram similarity
            similar_names = await conn.fetch("""
                SELECT 
                    e1.id as id1, e1.name as name1, e1.type as type1,
                    e2.id as id2, e2.name as name2, e2.type as type2,
                    similarity(e1.name, e2.name) as name_similarity
                FROM entities e1
                CROSS JOIN entities e2
                WHERE e1.id < e2.id
                    AND e1.type = e2.type
                    AND similarity(e1.name, e2.name) > $1
                ORDER BY name_similarity DESC
            """, similarity_threshold)
            
            for match in similar_names:
                duplicates.append({
                    'type': 'similar_name',
                    'entity1': {
                        'id': str(match['id1']), 
                        'name': match['name1'], 
                        'type': match['entity_type1']
                    },
                    'entity2': {
                        'id': str(match['id2']), 
                        'name': match['name2'], 
                        'type': match['entity_type2']
                    },
                    'confidence': float(match['name_similarity']),
                    'reason': f"Name similarity: {match['name_similarity']:.2%}"
                })
            
            # Strategy 3: Entities with same aliases
            if self.ai and self.ai.enabled:
                # Find entities that might be aliases of each other
                potential_aliases = await self._find_potential_aliases()
                duplicates.extend(potential_aliases)
        
        # Sort by confidence
        duplicates.sort(key=lambda x: x['confidence'], reverse=True)
        
        return duplicates
    
    async def _find_potential_aliases(self) -> List[Dict[str, Any]]:
        """Use AI to find potential aliases"""
        if not self.ai or not self.ai.enabled:
            return []
        
        aliases = []
        
        async with self.db.get_connection() as conn:
            # Get all entities grouped by type
            entities_by_type = await conn.fetch("""
                SELECT id, name, entity_type as type 
                FROM entities 
                ORDER BY entity_type, name
            """)
            
            # Group by type
            type_groups = defaultdict(list)
            for entity in entities_by_type:
                type_groups[entity['type']].append(entity)
            
            # Check each type group for aliases
            for entity_type, entities in type_groups.items():
                if len(entities) < 2:
                    continue
                
                # Ask AI to identify potential aliases
                entity_names = [e['name'] for e in entities]
                prompt = f"""Given these {entity_type} entities, identify which ones might be aliases or refer to the same thing:

{', '.join(entity_names)}

Return as JSON array of groups, where each group contains names that refer to the same entity.
Example: [["John Smith", "J. Smith", "Smith, John"], ["API Gateway", "Gateway"]]
Only include groups with 2 or more names."""
                
                try:
                    response = await asyncio.to_thread(
                        self.ai.model.generate_content,
                        prompt,
                        generation_config={'temperature': 0.1}
                    )
                    
                    import json
                    alias_groups = json.loads(response.text)
                    
                    # Convert to duplicate pairs
                    for group in alias_groups:
                        if len(group) >= 2:
                            # Create pairs from group
                            for i in range(len(group)):
                                for j in range(i + 1, len(group)):
                                    # Find entity IDs
                                    e1 = next((e for e in entities if e['name'] == group[i]), None)
                                    e2 = next((e for e in entities if e['name'] == group[j]), None)
                                    
                                    if e1 and e2:
                                        aliases.append({
                                            'type': 'ai_detected_alias',
                                            'entity1': {
                                                'id': str(e1['id']),
                                                'name': e1['name'],
                                                'type': e1['type']
                                            },
                                            'entity2': {
                                                'id': str(e2['id']),
                                                'name': e2['name'],
                                                'type': e2['type']
                                            },
                                            'confidence': 0.8,
                                            'reason': 'AI detected as likely aliases'
                                        })
                
                except Exception as e:
                    logger.error(f"Failed to detect aliases with AI: {e}")
        
        return aliases
    
    async def merge_entities(self, primary_id: str, secondary_id: str,
                           merge_strategy: str = 'keep_primary') -> Dict[str, Any]:
        """
        Merge two entities into one
        
        Args:
            primary_id: The entity to keep
            secondary_id: The entity to merge into primary
            merge_strategy: 'keep_primary', 'keep_secondary', 'combine'
        """
        try:
            async with self.db.get_connection() as conn:
                # Start transaction
                async with conn.transaction():
                    # Get both entities
                    primary = await conn.fetchrow(
                        "SELECT * FROM entities WHERE id = $1", 
                        uuid.UUID(primary_id)
                    )
                    secondary = await conn.fetchrow(
                        "SELECT * FROM entities WHERE id = $1", 
                        uuid.UUID(secondary_id)
                    )
                    
                    if not primary or not secondary:
                        return {"error": "One or both entities not found"}
                    
                    # Determine final name and description
                    if merge_strategy == 'keep_secondary':
                        final_name = secondary['name']
                        final_description = secondary['description']
                    elif merge_strategy == 'combine':
                        final_name = f"{primary['name']} ({secondary['name']})"
                        final_description = f"{primary['description'] or ''}\n\nAlso known as: {secondary['name']}\n{secondary['description'] or ''}"
                    else:  # keep_primary
                        final_name = primary['name']
                        final_description = primary['description']
                        if secondary['name'] != primary['name']:
                            final_description = f"{final_description or ''}\n\nAlso known as: {secondary['name']}"
                    
                    # Update primary entity
                    await conn.execute("""
                        UPDATE entities 
                        SET name = $2, 
                            description = $3,
                            updated_at = $4
                        WHERE id = $1
                    """, uuid.UUID(primary_id), final_name, final_description, 
                        datetime.now(timezone.utc))
                    
                    # Record merge in history
                    await conn.execute("""
                        INSERT INTO entity_merge_history 
                        (id, primary_entity_id, secondary_entity_id, 
                         merge_strategy, merged_at, merged_data)
                        VALUES ($1, $2, $3, $4, $5, $6)
                    """, uuid.uuid4(), uuid.UUID(primary_id), uuid.UUID(secondary_id),
                        merge_strategy, datetime.now(timezone.utc),
                        {'secondary_name': secondary['name'], 
                         'secondary_description': secondary['description']})
                    
                    # Transfer all relations from secondary to primary
                    # Memory relations
                    await conn.execute("""
                        UPDATE memory_entity_associations 
                        SET entity_id = $1 
                        WHERE entity_id = $2
                        AND NOT EXISTS (
                            SELECT 1 FROM memory_entity_associations 
                            WHERE memory_id = memory_entity_associations.memory_id 
                            AND entity_id = $1
                        )
                    """, uuid.UUID(primary_id), uuid.UUID(secondary_id))
                    
                    # Entity relations (as from_entity)
                    await conn.execute("""
                        UPDATE relations 
                        SET from_entity_id = $1 
                        WHERE from_entity_id = $2
                        AND NOT EXISTS (
                            SELECT 1 FROM relations 
                            WHERE from_entity_id = $1 
                            AND to_entity_id = relations.to_entity_id
                            AND relation_type = relations.relation_type
                        )
                    """, uuid.UUID(primary_id), uuid.UUID(secondary_id))
                    
                    # Entity relations (as to_entity)
                    await conn.execute("""
                        UPDATE relations 
                        SET to_entity_id = $1 
                        WHERE to_entity_id = $2
                        AND NOT EXISTS (
                            SELECT 1 FROM relations 
                            WHERE to_entity_id = $1 
                            AND from_entity_id = relations.from_entity_id
                            AND relation_type = relations.relation_type
                        )
                    """, uuid.UUID(primary_id), uuid.UUID(secondary_id))
                    
                    # Delete secondary entity
                    await conn.execute(
                        "DELETE FROM entities WHERE id = $1", 
                        uuid.UUID(secondary_id)
                    )
                    
                    # Get merge statistics
                    stats = await conn.fetchrow("""
                        SELECT 
                            COUNT(DISTINCT mea.memory_id) as memory_count,
                            COUNT(DISTINCT r1.id) + COUNT(DISTINCT r2.id) as relation_count
                        FROM entities e
                        LEFT JOIN memory_entity_associations mea ON e.id = mea.entity_id
                        LEFT JOIN relations r1 ON e.id = r1.from_entity_id
                        LEFT JOIN relations r2 ON e.id = r2.to_entity_id
                        WHERE e.id = $1
                    """, uuid.UUID(primary_id))
                    
                    return {
                        "success": True,
                        "merged_entity": {
                            "id": primary_id,
                            "name": final_name,
                            "description": final_description
                        },
                        "statistics": {
                            "memories_affected": stats['memory_count'],
                            "relations_affected": stats['relation_count']
                        }
                    }
                    
        except Exception as e:
            logger.error(f"Entity merge failed: {e}")
            return {"error": str(e)}
    
    async def get_entity_timeline(self, entity_id: str) -> List[Dict[str, Any]]:
        """
        Get timeline of entity appearances and changes
        """
        async with self.db.get_connection() as conn:
            # Get all memories mentioning this entity
            timeline_events = await conn.fetch("""
                SELECT 
                    m.id,
                    m.title,
                    m.content,
                    m.created_at,
                    mer.mentioned_at,
                    mer.context_snippet,
                    'memory_mention' as event_type
                FROM memory_entities m
                JOIN memory_entity_associations mea ON m.id = mea.memory_id
                WHERE mea.entity_id = $1
                
                UNION ALL
                
                -- Get entity creation
                SELECT 
                    e.id,
                    e.name as title,
                    e.description as content,
                    e.created_at,
                    e.created_at as mentioned_at,
                    'Entity created' as context_snippet,
                    'entity_created' as event_type
                FROM entities e
                WHERE e.id = $1
                
                UNION ALL
                
                -- Get merge events
                SELECT 
                    emh.id,
                    'Entity Merge' as title,
                    emh.merged_data::text as content,
                    emh.merged_at as created_at,
                    emh.merged_at as mentioned_at,
                    'Merged with ' || emh.merged_data->>'secondary_name' as context_snippet,
                    'entity_merged' as event_type
                FROM entity_merge_history emh
                WHERE emh.primary_entity_id = $1 OR emh.secondary_entity_id = $1
                
                ORDER BY mentioned_at DESC
            """, uuid.UUID(entity_id))
            
            # Format timeline
            timeline = []
            for event in timeline_events:
                timeline.append({
                    'id': str(event['id']),
                    'type': event['event_type'],
                    'title': event['title'],
                    'content': event['content'][:200] + '...' if len(event['content'] or '') > 200 else event['content'],
                    'timestamp': event['mentioned_at'].isoformat(),
                    'context': event['context_snippet']
                })
            
            return timeline
    
    async def bulk_deduplicate(self, auto_merge: bool = False,
                             confidence_threshold: float = 0.95) -> Dict[str, Any]:
        """
        Perform bulk deduplication of entities
        """
        # Find duplicates
        duplicates = await self.find_duplicate_entities()
        
        results = {
            'duplicates_found': len(duplicates),
            'auto_merged': 0,
            'manual_review': [],
            'errors': []
        }
        
        for dup in duplicates:
            if dup['confidence'] >= confidence_threshold and auto_merge:
                # Auto-merge high confidence duplicates
                merge_result = await self.merge_entities(
                    dup['entity1']['id'],
                    dup['entity2']['id'],
                    'combine' if dup['type'] == 'ai_detected_alias' else 'keep_primary'
                )
                
                if 'error' not in merge_result:
                    results['auto_merged'] += 1
                else:
                    results['errors'].append({
                        'entities': [dup['entity1']['name'], dup['entity2']['name']],
                        'error': merge_result['error']
                    })
            else:
                # Add to manual review list
                results['manual_review'].append({
                    'entity1': dup['entity1'],
                    'entity2': dup['entity2'],
                    'confidence': dup['confidence'],
                    'reason': dup.get('reason', dup['type'])
                })
        
        return results