"""
Core memory operations for PUO Memo
"""
import json
import uuid
from typing import Dict, Any, List, Optional, Literal
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)


class MemoryStore:
    """Core memory operations - handles CRUD operations for memories"""
    
    def __init__(self, db_connection, ai_assistant=None, knowledge_graph=None, entity_extractor=None, attachment_processor=None):
        self.db = db_connection
        self.ai = ai_assistant
        self.knowledge_graph = knowledge_graph
        self.entity_extractor = entity_extractor
        self.attachment_processor = attachment_processor
        self.current_context = "default"
    
    async def create(self, content: str, title: Optional[str] = None,
                    memory_type: str = "general", tags: Optional[List[str]] = None,
                    attachments: Optional[List[str]] = None) -> Dict[str, Any]:
        """Create a new memory with optional embedding"""
        try:
            # Generate title if not provided
            if not title:
                title = content[:100] + "..." if len(content) > 100 else content
            
            # Generate embedding if AI is available
            embedding = None
            embedding_model = None
            if self.ai and self.ai.enabled:
                logger.info("Generating embedding for new memory...")
                embedding = await self.ai.generate_embedding(content)
                if embedding:
                    embedding_model = self.ai.embedding_model_name
                    logger.info("✅ Embedding generated successfully")
                else:
                    logger.warning("Failed to generate embedding, saving without it")
            
            # Prepare data
            memory_id = str(uuid.uuid4())
            tags = tags or []
            metadata = {
                "created_via": "puo_memo",
                "version": "2.0"
            }
            
            # Insert into database
            async with self.db.get_connection() as conn:
                if embedding:
                    # Convert embedding list to PostgreSQL vector format
                    embedding_str = '[' + ','.join(str(x) for x in embedding) + ']'
                    await conn.execute("""
                        INSERT INTO memory_entities 
                        (id, content, title, memory_type, tags, metadata, project_context, 
                         created_at, embedding, embedding_model)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector, $10)
                    """, memory_id, content, title, memory_type, tags, json.dumps(metadata),
                        self.current_context, datetime.now(timezone.utc), embedding_str, embedding_model)
                else:
                    await conn.execute("""
                        INSERT INTO memory_entities 
                        (id, content, title, memory_type, tags, metadata, project_context, created_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    """, memory_id, content, title, memory_type, tags, json.dumps(metadata),
                        self.current_context, datetime.now(timezone.utc))
            
            # Extract entities and relations if extractor is available
            extracted_entities = []
            if self.entity_extractor and self.knowledge_graph:
                try:
                    logger.info("Extracting entities and relations...")
                    entities, relations = await self.entity_extractor.extract_entities_and_relations(content)
                    
                    # Store entities
                    for entity in entities:
                        await self.knowledge_graph.create_or_update_entity(entity)
                        extracted_entities.append(entity.name)
                    
                    # Store relations
                    for relation in relations:
                        await self.knowledge_graph.create_relation(relation, memory_id)
                    
                    # Associate memory with entities
                    await self.knowledge_graph.associate_memory_with_entities(memory_id, entities)
                    
                    # Mark memory as entities extracted
                    async with self.db.get_connection() as conn:
                        await conn.execute("""
                            UPDATE memory_entities
                            SET entities_extracted = true,
                                extraction_metadata = $2
                            WHERE id = $1
                        """, memory_id, json.dumps({
                            "entities_count": len(entities),
                            "relations_count": len(relations),
                            "extracted_at": datetime.now(timezone.utc).isoformat()
                        }))
                    
                    logger.info(f"✅ Extracted {len(entities)} entities and {len(relations)} relations")
                    
                except Exception as e:
                    logger.error(f"Entity extraction failed: {e}")
            
            # Process attachments if provided
            attached_files = []
            if attachments and self.attachment_processor:
                logger.info(f"Processing {len(attachments)} attachments...")
                for attachment_path in attachments:
                    try:
                        # Handle URLs differently
                        if attachment_path.startswith(('http://', 'https://')):
                            # TODO: Download and attach URL content
                            logger.info(f"URL attachment: {attachment_path}")
                        else:
                            # Attach local file
                            result = await self.attachment_processor.attach_file(
                                memory_id=memory_id,
                                file_path=attachment_path
                            )
                            if "error" not in result:
                                attached_files.append(result)
                                logger.info(f"✅ Attached: {result['filename']}")
                            else:
                                logger.error(f"Failed to attach {attachment_path}: {result['error']}")
                    except Exception as e:
                        logger.error(f"Failed to process attachment {attachment_path}: {e}")
            
            return {
                "id": memory_id,
                "title": title,
                "type": memory_type,
                "tags": tags,
                "context": self.current_context,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "has_embedding": embedding is not None,
                "extracted_entities": extracted_entities,
                "attachments": attached_files
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
                memory_dict = {
                    "id": str(row['id']),
                    "title": row['title'],
                    "content": row['content'][:200] + "..." if len(row['content']) > 200 else row['content'],
                    "type": row['memory_type'],
                    "tags": row['tags'],
                    "created_at": row['created_at'].isoformat()
                }
                
                # Get attachments for this memory if processor is available
                if self.attachment_processor:
                    attachments = await self.attachment_processor.get_memory_attachments(str(row['id']))
                    if attachments:
                        memory_dict['attachments'] = attachments
                
                memories.append(memory_dict)
            
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
        """Update an existing memory and regenerate embedding if content changed"""
        try:
            # Build update query dynamically
            updates = []
            params = []
            param_count = 1
            regenerate_embedding = False
            
            if content is not None:
                updates.append(f"content = ${param_count}")
                params.append(content)
                param_count += 1
                regenerate_embedding = True  # Content changed, need new embedding
            
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
            
            # Generate new embedding if content changed and AI is available
            if regenerate_embedding and self.ai and self.ai.enabled:
                logger.info("Regenerating embedding for updated content...")
                embedding = await self.ai.generate_embedding(content)
                if embedding:
                    # Convert embedding list to PostgreSQL vector format
                    embedding_str = '[' + ','.join(str(x) for x in embedding) + ']'
                    updates.append(f"embedding = ${param_count}::vector")
                    params.append(embedding_str)
                    param_count += 1
                    
                    updates.append(f"embedding_model = ${param_count}")
                    params.append(self.ai.embedding_model_name)
                    param_count += 1
                    logger.info("✅ New embedding generated")
            
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
    
    async def semantic_search(self, query: str, limit: int = 10, similarity_threshold: float = 0.7) -> Dict[str, Any]:
        """Search memories using semantic similarity with embeddings"""
        try:
            # Generate query embedding
            if not self.ai or not self.ai.enabled:
                logger.warning("AI not available, falling back to keyword search")
                return await self.search(query, limit)
            
            query_embedding = await self.ai.generate_query_embedding(query)
            if not query_embedding:
                logger.warning("Failed to generate query embedding, falling back to keyword search")
                return await self.search(query, limit)
            
            # Convert query embedding to PostgreSQL vector format
            query_embedding_str = '[' + ','.join(str(x) for x in query_embedding) + ']'
            
            # Search using cosine similarity
            async with self.db.get_connection() as conn:
                results = await conn.fetch("""
                    SELECT id, title, content, memory_type, tags, created_at,
                           1 - (embedding <=> $1::vector) as similarity
                    FROM memory_entities
                    WHERE embedding IS NOT NULL
                    AND project_context = $2
                    AND 1 - (embedding <=> $1::vector) >= $3
                    ORDER BY embedding <=> $1::vector
                    LIMIT $4
                """, query_embedding_str, self.current_context, similarity_threshold, limit)
            
            memories = []
            for row in results:
                memories.append({
                    "id": str(row['id']),
                    "title": row['title'],
                    "content": row['content'][:200] + "..." if len(row['content']) > 200 else row['content'],
                    "type": row['memory_type'],
                    "tags": row['tags'],
                    "created_at": row['created_at'].isoformat(),
                    "similarity": float(row['similarity'])
                })
            
            return {
                "query": query,
                "search_type": "semantic",
                "count": len(memories),
                "results": memories
            }
            
        except Exception as e:
            logger.error(f"Semantic search failed: {e}")
            logger.warning("Falling back to keyword search")
            return await self.search(query, limit)
    
    async def hybrid_search(self, query: str, limit: int = 10) -> Dict[str, Any]:
        """Hybrid search: try semantic first, fall back to keyword if needed"""
        try:
            # Try semantic search first
            result = await self.semantic_search(query, limit)
            
            # If semantic search returned results, use them
            if result.get("count", 0) > 0:
                result["search_type"] = "hybrid-semantic"
                return result
            
            # Fall back to keyword search if no semantic results
            logger.info("No semantic results, falling back to keyword search")
            keyword_result = await self.search(query, limit)
            keyword_result["search_type"] = "hybrid-keyword"
            return keyword_result
            
        except Exception as e:
            logger.error(f"Hybrid search failed: {e}")
            return {"error": str(e), "results": []}
    
    def set_context(self, context: str):
        """Set the current project context"""
        self.current_context = context
    
    async def search_by_entity(self, entity_name: str, limit: int = 10) -> Dict[str, Any]:
        """Search memories associated with a specific entity"""
        try:
            async with self.db.get_connection() as conn:
                # First find the entity
                entity = await conn.fetchrow("""
                    SELECT id, name, entity_type 
                    FROM entities 
                    WHERE LOWER(name) = LOWER($1) 
                    OR $1 = ANY(aliases)
                """, entity_name)
                
                if not entity:
                    return {
                        "query": entity_name,
                        "search_type": "entity",
                        "count": 0,
                        "results": [],
                        "error": "Entity not found"
                    }
                
                # Get memories associated with this entity
                results = await conn.fetch("""
                    SELECT DISTINCT m.*, mea.relevance_score
                    FROM memory_entities m
                    JOIN memory_entity_associations mea ON m.id = mea.memory_id
                    WHERE mea.entity_id = $1
                    AND m.project_context = $2
                    ORDER BY mea.relevance_score DESC, m.created_at DESC
                    LIMIT $3
                """, entity['id'], self.current_context, limit)
                
                memories = []
                for row in results:
                    memories.append({
                        "id": str(row['id']),
                        "title": row['title'],
                        "content": row['content'][:200] + "..." if len(row['content']) > 200 else row['content'],
                        "type": row['memory_type'],
                        "tags": row['tags'],
                        "created_at": row['created_at'].isoformat(),
                        "relevance_score": float(row['relevance_score']),
                        "entity": {
                            "name": entity['name'],
                            "type": entity['entity_type']
                        }
                    })
                
                return {
                    "query": entity_name,
                    "search_type": "entity",
                    "count": len(memories),
                    "results": memories
                }
                
        except Exception as e:
            logger.error(f"Entity search failed: {e}")
            return {"error": str(e), "results": []}