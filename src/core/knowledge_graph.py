"""
Knowledge graph operations for PUO Memo
"""
import json
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import uuid

from src.core.entity_extractor import ExtractedEntity, ExtractedRelation

logger = logging.getLogger(__name__)


class KnowledgeGraphStore:
    """Manages entities and relations in the knowledge graph"""
    
    def __init__(self, db_connection, ai_assistant=None):
        self.db = db_connection
        self.ai = ai_assistant
    
    async def create_or_update_entity(self, entity: ExtractedEntity) -> str:
        """Create or update an entity, returning its ID"""
        try:
            async with self.db.get_connection() as conn:
                # Check if entity already exists by name
                existing = await conn.fetchrow("""
                    SELECT id, aliases, occurrence_count 
                    FROM entities 
                    WHERE LOWER(name) = LOWER($1) 
                    OR $1 = ANY(aliases)
                """, entity.name)
                
                if existing:
                    # Update existing entity
                    entity_id = existing['id']
                    
                    # Merge aliases
                    new_aliases = list(set(existing['aliases'] + (entity.aliases or [])))
                    
                    # Generate embedding if AI is available
                    embedding = None
                    embedding_model = None
                    if self.ai and self.ai.enabled:
                        embedding = await self.ai.generate_embedding(entity.name)
                        if embedding:
                            embedding_model = self.ai.embedding_model_name
                    
                    # Update entity
                    if embedding:
                        embedding_str = '[' + ','.join(str(x) for x in embedding) + ']'
                        await conn.execute("""
                            UPDATE entities
                            SET aliases = $2,
                                attributes = attributes || $3,
                                occurrence_count = occurrence_count + 1,
                                last_seen = $4,
                                updated_at = $4,
                                embedding = $5::vector,
                                embedding_model = $6
                            WHERE id = $1
                        """, entity_id, new_aliases, json.dumps(entity.attributes or {}),
                            datetime.now(timezone.utc), embedding_str, embedding_model)
                    else:
                        await conn.execute("""
                            UPDATE entities
                            SET aliases = $2,
                                attributes = attributes || $3,
                                occurrence_count = occurrence_count + 1,
                                last_seen = $4,
                                updated_at = $4
                            WHERE id = $1
                        """, entity_id, new_aliases, json.dumps(entity.attributes or {}),
                            datetime.now(timezone.utc))
                    
                    logger.info(f"Updated entity: {entity.name}")
                    
                else:
                    # Create new entity
                    entity_id = str(uuid.uuid4())
                    
                    # Generate embedding if AI is available
                    embedding = None
                    embedding_model = None
                    if self.ai and self.ai.enabled:
                        embedding = await self.ai.generate_embedding(entity.name)
                        if embedding:
                            embedding_model = self.ai.embedding_model_name
                    
                    if embedding:
                        embedding_str = '[' + ','.join(str(x) for x in embedding) + ']'
                        await conn.execute("""
                            INSERT INTO entities 
                            (id, name, entity_type, aliases, attributes, embedding, embedding_model)
                            VALUES ($1, $2, $3, $4, $5, $6::vector, $7)
                        """, entity_id, entity.name, entity.entity_type, 
                            entity.aliases or [], json.dumps(entity.attributes or {}),
                            embedding_str, embedding_model)
                    else:
                        await conn.execute("""
                            INSERT INTO entities 
                            (id, name, entity_type, aliases, attributes)
                            VALUES ($1, $2, $3, $4, $5)
                        """, entity_id, entity.name, entity.entity_type, 
                            entity.aliases or [], json.dumps(entity.attributes or {}))
                    
                    logger.info(f"Created entity: {entity.name}")
                
                return str(entity_id)
                
        except Exception as e:
            logger.error(f"Failed to create/update entity: {e}")
            raise
    
    async def create_relation(self, relation: ExtractedRelation, source_memory_id: Optional[str] = None) -> str:
        """Create a relation between entities"""
        try:
            async with self.db.get_connection() as conn:
                # Get entity IDs
                from_entity = await conn.fetchrow("""
                    SELECT id FROM entities 
                    WHERE LOWER(name) = LOWER($1) 
                    OR $1 = ANY(aliases)
                """, relation.from_entity)
                
                to_entity = await conn.fetchrow("""
                    SELECT id FROM entities 
                    WHERE LOWER(name) = LOWER($1) 
                    OR $1 = ANY(aliases)
                """, relation.to_entity)
                
                if not from_entity or not to_entity:
                    logger.warning(f"Cannot create relation: entities not found")
                    return None
                
                # Check if relation already exists
                existing = await conn.fetchrow("""
                    SELECT id FROM relations
                    WHERE from_entity_id = $1 
                    AND to_entity_id = $2 
                    AND relation_type = $3
                """, from_entity['id'], to_entity['id'], relation.relation_type)
                
                if existing:
                    # Update confidence and attributes
                    await conn.execute("""
                        UPDATE relations
                        SET confidence = GREATEST(confidence, $2),
                            attributes = attributes || $3,
                            updated_at = $4
                        WHERE id = $1
                    """, existing['id'], relation.confidence, 
                        json.dumps(relation.attributes or {}),
                        datetime.now(timezone.utc))
                    
                    return str(existing['id'])
                else:
                    # Create new relation
                    relation_id = str(uuid.uuid4())
                    
                    await conn.execute("""
                        INSERT INTO relations 
                        (id, from_entity_id, to_entity_id, relation_type, 
                         attributes, confidence, source_memory_id)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                    """, relation_id, from_entity['id'], to_entity['id'],
                        relation.relation_type, json.dumps(relation.attributes or {}),
                        relation.confidence, source_memory_id)
                    
                    logger.info(f"Created relation: {relation.from_entity} -{relation.relation_type}-> {relation.to_entity}")
                    return relation_id
                    
        except Exception as e:
            logger.error(f"Failed to create relation: {e}")
            return None
    
    async def associate_memory_with_entities(self, memory_id: str, entities: List[ExtractedEntity]):
        """Associate a memory with extracted entities"""
        try:
            async with self.db.get_connection() as conn:
                for entity in entities:
                    # Get entity ID
                    entity_record = await conn.fetchrow("""
                        SELECT id FROM entities 
                        WHERE LOWER(name) = LOWER($1) 
                        OR $1 = ANY(aliases)
                    """, entity.name)
                    
                    if entity_record:
                        # Create association
                        await conn.execute("""
                            INSERT INTO memory_entity_associations 
                            (memory_id, entity_id, relevance_score)
                            VALUES ($1, $2, $3)
                            ON CONFLICT (memory_id, entity_id) 
                            DO UPDATE SET relevance_score = EXCLUDED.relevance_score
                        """, memory_id, entity_record['id'], entity.confidence)
                        
        except Exception as e:
            logger.error(f"Failed to associate memory with entities: {e}")
    
    async def get_entity_graph(self, entity_name: str, depth: int = 2) -> Dict[str, Any]:
        """Get the graph of connections for an entity"""
        try:
            async with self.db.get_connection() as conn:
                # Get connections manually since function creation failed
                # This is a simplified version that gets direct connections only
                connections = await conn.fetch("""
                    WITH entity_connections AS (
                        SELECT 
                            1 as depth,
                            e1.name as from_entity,
                            r.relation_type,
                            e2.name as to_entity
                        FROM relations r
                        JOIN entities e1 ON r.from_entity_id = e1.id
                        JOIN entities e2 ON r.to_entity_id = e2.id
                        WHERE e1.name = $1 OR e2.name = $1
                    )
                    SELECT * FROM entity_connections
                """, entity_name)
                
                # Get entity details
                entity = await conn.fetchrow("""
                    SELECT * FROM entities 
                    WHERE LOWER(name) = LOWER($1) 
                    OR $1 = ANY(aliases)
                """, entity_name)
                
                if not entity:
                    return {"error": "Entity not found"}
                
                # Build graph structure
                nodes = set([entity_name])
                edges = []
                
                for conn_row in connections:
                    nodes.add(conn_row['from_entity'])
                    nodes.add(conn_row['to_entity'])
                    edges.append({
                        "from": conn_row['from_entity'],
                        "to": conn_row['to_entity'],
                        "type": conn_row['relation_type'],
                        "depth": conn_row['depth']
                    })
                
                return {
                    "central_entity": {
                        "name": entity['name'],
                        "type": entity['entity_type'],
                        "attributes": entity['attributes'],
                        "occurrence_count": entity['occurrence_count']
                    },
                    "nodes": list(nodes),
                    "edges": edges,
                    "total_connections": len(edges)
                }
                
        except Exception as e:
            logger.error(f"Failed to get entity graph: {e}")
            return {"error": str(e)}
    
    async def search_entities(self, query: str, entity_type: Optional[str] = None, 
                             limit: int = 10) -> List[Dict[str, Any]]:
        """Search for entities by name or attributes"""
        try:
            async with self.db.get_connection() as conn:
                if entity_type:
                    results = await conn.fetch("""
                        SELECT id, name, entity_type, aliases, attributes, occurrence_count
                        FROM entities
                        WHERE (
                            name ILIKE $1 
                            OR $2 = ANY(aliases)
                            OR to_tsvector('english', name) @@ plainto_tsquery('english', $2)
                        )
                        AND entity_type = $3
                        ORDER BY occurrence_count DESC
                        LIMIT $4
                    """, f"%{query}%", query, entity_type, limit)
                else:
                    results = await conn.fetch("""
                        SELECT id, name, entity_type, aliases, attributes, occurrence_count
                        FROM entities
                        WHERE name ILIKE $1 
                        OR $2 = ANY(aliases)
                        OR to_tsvector('english', name) @@ plainto_tsquery('english', $2)
                        ORDER BY occurrence_count DESC
                        LIMIT $3
                    """, f"%{query}%", query, limit)
                
                entities = []
                for row in results:
                    entities.append({
                        "id": str(row['id']),
                        "name": row['name'],
                        "type": row['entity_type'],
                        "aliases": row['aliases'],
                        "attributes": row['attributes'],
                        "occurrence_count": row['occurrence_count']
                    })
                
                return entities
                
        except Exception as e:
            logger.error(f"Entity search failed: {e}")
            return []
    
    async def get_memory_entities(self, memory_id: str) -> List[Dict[str, Any]]:
        """Get all entities associated with a memory"""
        try:
            async with self.db.get_connection() as conn:
                results = await conn.fetch("""
                    SELECT e.*, mea.relevance_score
                    FROM entities e
                    JOIN memory_entity_associations mea ON e.id = mea.entity_id
                    WHERE mea.memory_id = $1
                    ORDER BY mea.relevance_score DESC
                """, memory_id)
                
                entities = []
                for row in results:
                    entities.append({
                        "id": str(row['id']),
                        "name": row['name'],
                        "type": row['entity_type'],
                        "aliases": row['aliases'],
                        "attributes": row['attributes'],
                        "relevance_score": float(row['relevance_score'])
                    })
                
                return entities
                
        except Exception as e:
            logger.error(f"Failed to get memory entities: {e}")
            return []