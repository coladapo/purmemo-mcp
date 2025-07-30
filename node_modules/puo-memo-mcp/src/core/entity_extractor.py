"""
Entity extraction and knowledge graph building for PUO Memo
"""
import json
import logging
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
import asyncio

from src.core.ai import AIAssistant

logger = logging.getLogger(__name__)


@dataclass
class ExtractedEntity:
    """Represents an extracted entity"""
    name: str
    entity_type: str
    aliases: List[str] = None
    attributes: Dict[str, Any] = None
    confidence: float = 1.0


@dataclass
class ExtractedRelation:
    """Represents a relation between entities"""
    from_entity: str
    to_entity: str
    relation_type: str
    attributes: Dict[str, Any] = None
    confidence: float = 1.0


class EntityExtractor:
    """Extract entities and relations from text using Gemini"""
    
    EXTRACTION_PROMPT = """
    Extract entities and relationships from the following text. 
    
    Entities should be categorized as: person, organization, location, event, project, technology, concept, document, or other.
    
    For each entity, provide:
    - name: The primary name/identifier
    - type: The entity type
    - aliases: Alternative names or references (if any)
    - attributes: Key properties or descriptions
    
    For relationships, provide:
    - from_entity: Source entity name
    - to_entity: Target entity name  
    - relation_type: Type of relationship (e.g., works_at, located_in, created_by, related_to)
    
    Return the result as JSON with this structure:
    {
        "entities": [
            {
                "name": "Entity Name",
                "type": "person",
                "aliases": ["Alt Name"],
                "attributes": {"role": "developer", "skills": ["python", "ai"]}
            }
        ],
        "relations": [
            {
                "from_entity": "Person Name",
                "to_entity": "Company Name",
                "relation_type": "works_at",
                "attributes": {"since": "2023"}
            }
        ]
    }
    
    Text to analyze:
    """
    
    def __init__(self, ai_assistant: AIAssistant):
        self.ai = ai_assistant
        
    async def extract_entities_and_relations(self, text: str) -> Tuple[List[ExtractedEntity], List[ExtractedRelation]]:
        """Extract entities and relations from text"""
        if not self.ai or not self.ai.enabled:
            logger.warning("AI not available for entity extraction")
            return [], []
            
        try:
            # Use Gemini to extract entities and relations
            prompt = self.EXTRACTION_PROMPT + text
            
            response = await asyncio.to_thread(
                self.ai.model.generate_content,
                prompt,
                generation_config={
                    'temperature': 0.1,  # Low temperature for consistent extraction
                    'response_mime_type': 'application/json'
                }
            )
            
            # Parse the JSON response
            result = json.loads(response.text)
            
            # Convert to dataclasses with validation
            entities = []
            for entity_data in result.get('entities', []):
                try:
                    # Validate required fields
                    if not entity_data.get('name'):
                        logger.warning(f"Skipping entity without name: {entity_data}")
                        continue
                        
                    # Sanitize and validate entity type
                    entity_type = entity_data.get('type', 'other').lower()
                    valid_types = ['person', 'organization', 'location', 'event', 'project', 'technology', 'concept', 'document', 'other']
                    if entity_type not in valid_types:
                        logger.debug(f"Unknown entity type '{entity_type}', defaulting to 'other'")
                        entity_type = 'other'
                    
                    entities.append(ExtractedEntity(
                        name=entity_data['name'].strip(),
                        entity_type=entity_type,
                        aliases=[a.strip() for a in entity_data.get('aliases', []) if a and a.strip()],
                        attributes=entity_data.get('attributes', {}),
                        confidence=min(max(entity_data.get('confidence', 1.0), 0.0), 1.0)  # Clamp between 0-1
                    ))
                except Exception as e:
                    logger.warning(f"Failed to process entity {entity_data}: {e}")
                    continue
            
            relations = []
            for relation_data in result.get('relations', []):
                try:
                    # Validate required fields
                    if not all([relation_data.get('from_entity'), 
                               relation_data.get('to_entity'), 
                               relation_data.get('relation_type')]):
                        logger.warning(f"Skipping relation with missing fields: {relation_data}")
                        continue
                        
                    relations.append(ExtractedRelation(
                        from_entity=relation_data['from_entity'].strip(),
                        to_entity=relation_data['to_entity'].strip(),
                        relation_type=self.normalize_relation_type(relation_data['relation_type']),
                        attributes=relation_data.get('attributes', {}),
                        confidence=min(max(relation_data.get('confidence', 1.0), 0.0), 1.0)  # Clamp between 0-1
                    ))
                except Exception as e:
                    logger.warning(f"Failed to process relation {relation_data}: {e}")
                    continue
            
            logger.info(f"Extracted {len(entities)} entities and {len(relations)} relations")
            return entities, relations
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse entity extraction response: {e}")
            logger.debug(f"Raw response: {response.text if 'response' in locals() else 'No response'}")
            return [], []
        except KeyError as e:
            logger.error(f"Missing required field in entity extraction: {e}")
            logger.debug(f"Partial result: {result if 'result' in locals() else 'No result'}")
            return [], []
        except Exception as e:
            logger.error(f"Entity extraction failed: {type(e).__name__}: {e}")
            import traceback
            logger.debug(f"Traceback: {traceback.format_exc()}")
            return [], []
    
    async def extract_entities_only(self, text: str) -> List[ExtractedEntity]:
        """Extract only entities (no relations)"""
        entities, _ = await self.extract_entities_and_relations(text)
        return entities
    
    async def merge_entities(self, entity1: ExtractedEntity, entity2: ExtractedEntity) -> ExtractedEntity:
        """Merge two entities that refer to the same thing"""
        # Combine aliases
        all_aliases = list(set((entity1.aliases or []) + (entity2.aliases or []) + [entity1.name, entity2.name]))
        
        # Choose primary name (prefer longer or more specific)
        primary_name = entity1.name if len(entity1.name) >= len(entity2.name) else entity2.name
        all_aliases.remove(primary_name)
        
        # Merge attributes
        merged_attributes = {**(entity1.attributes or {}), **(entity2.attributes or {})}
        
        # Average confidence
        avg_confidence = (entity1.confidence + entity2.confidence) / 2
        
        return ExtractedEntity(
            name=primary_name,
            entity_type=entity1.entity_type,  # Assume same type
            aliases=all_aliases,
            attributes=merged_attributes,
            confidence=avg_confidence
        )
    
    def normalize_entity_name(self, name: str) -> str:
        """Normalize entity name for consistency"""
        # Basic normalization - can be enhanced
        return name.strip().replace('_', ' ').title()
    
    def normalize_relation_type(self, relation_type: str) -> str:
        """Normalize relation type for consistency"""
        # Convert to snake_case
        return relation_type.lower().replace(' ', '_').replace('-', '_')