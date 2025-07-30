"""
Chat Importer - Integrates chat parsing with PUO Memo storage
"""
import asyncio
import logging
import re
from pathlib import Path
from typing import Dict, List, Any, Optional
from datetime import datetime
import json

from .chat_parser import ChatParser, Conversation, Message
from .memory import MemoryStore
from .database import DatabaseConnection
from .ai import AIAssistant
from .knowledge_graph import KnowledgeGraphStore
from .entity_extractor import EntityExtractor
from .attachments import AttachmentProcessor

logger = logging.getLogger(__name__)


class ChatImporter:
    """Import conversations into PUO Memo with context extraction"""
    
    def __init__(self, memory_store: MemoryStore, db: DatabaseConnection):
        self.memory = memory_store
        self.db = db
        
    async def import_conversation(self, 
                                file_path: str,
                                project_tag: Optional[str] = None,
                                extract_entities: bool = True,
                                extract_actions: bool = True,
                                merge_strategy: str = 'smart') -> Dict[str, Any]:
        """
        Import a conversation from a file
        
        Args:
            file_path: Path to the chat export file
            project_tag: Optional project to associate with this import
            extract_entities: Whether to extract entities using AI
            extract_actions: Whether to extract action items
            merge_strategy: How to handle duplicates ('smart', 'skip', 'force')
            
        Returns:
            Import summary with statistics
        """
        try:
            # Parse the conversation file
            path = Path(file_path)
            if not path.exists():
                raise FileNotFoundError(f"File not found: {file_path}")
            
            logger.info(f"Importing conversation from {file_path}")
            conversations = ChatParser.parse_file(path)
            
            if not conversations:
                return {
                    'status': 'error',
                    'message': 'No conversations found in file'
                }
            
            # Import statistics
            stats = {
                'conversations': len(conversations),
                'messages': 0,
                'memories_created': 0,
                'memories_updated': 0,
                'action_items': 0,
                'entities_extracted': 0,
                'references_found': 0,
                'errors': []
            }
            
            for conversation in conversations:
                try:
                    # Store conversation metadata
                    await self._store_conversation_metadata(conversation, project_tag)
                    
                    # Process each message
                    for message in conversation.messages:
                        stats['messages'] += 1
                        
                        # Create memory entry
                        memory_result = await self._create_memory_from_message(
                            message, 
                            conversation,
                            project_tag,
                            merge_strategy
                        )
                        
                        if memory_result['status'] == 'created':
                            stats['memories_created'] += 1
                        elif memory_result['status'] == 'updated':
                            stats['memories_updated'] += 1
                        
                        memory_id = memory_result.get('memory_id')
                        
                        if memory_id:
                            # Extract and store action items
                            if extract_actions and message.has_action_items:
                                action_count = await self._extract_and_store_actions(
                                    memory_id, 
                                    message.content
                                )
                                stats['action_items'] += action_count
                            
                            # Extract and store references
                            ref_count = await self._extract_and_store_references(
                                memory_id,
                                message.content
                            )
                            stats['references_found'] += ref_count
                            
                            # Extract entities if AI is available
                            if extract_entities and self.memory.entity_extractor:
                                entity_count = await self._extract_entities_for_memory(memory_id)
                                stats['entities_extracted'] += entity_count
                    
                    # Link related conversations
                    await self._detect_and_link_conversations(conversation)
                    
                except Exception as e:
                    logger.error(f"Error processing conversation {conversation.id}: {e}")
                    stats['errors'].append(f"Conversation {conversation.id}: {str(e)}")
            
            return {
                'status': 'success',
                'stats': stats,
                'message': f"Imported {stats['messages']} messages from {stats['conversations']} conversations"
            }
            
        except Exception as e:
            logger.error(f"Import failed: {e}")
            return {
                'status': 'error',
                'message': str(e)
            }
    
    async def _store_conversation_metadata(self, conversation: Conversation, project_tag: Optional[str]):
        """Store conversation metadata in the database"""
        await self.db.execute("""
            INSERT INTO conversation_metadata (
                conversation_id, title, source_platform, model_version,
                started_at, ended_at, message_count, has_code_blocks,
                has_action_items, total_tokens, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (conversation_id) DO UPDATE SET
                title = EXCLUDED.title,
                message_count = EXCLUDED.message_count,
                ended_at = EXCLUDED.ended_at,
                metadata = EXCLUDED.metadata
        """, 
            conversation.id,
            conversation.title,
            conversation.source_platform,
            conversation.model_version,
            conversation.started_at,
            conversation.ended_at,
            len(conversation.messages),
            any(msg.has_code for msg in conversation.messages),
            any(msg.has_action_items for msg in conversation.messages),
            conversation.total_tokens,
            json.dumps(conversation.metadata or {})
        )
    
    async def _create_memory_from_message(self, 
                                        message: Message, 
                                        conversation: Conversation,
                                        project_tag: Optional[str],
                                        merge_strategy: str) -> Dict[str, Any]:
        """Create a memory entry from a message"""
        # Build content with role prefix
        content = f"[{message.role.upper()}]: {message.content}"
        
        # Create title
        title = f"{conversation.source_platform.title()} - {conversation.title or 'Untitled'}"
        if message.message_index == 0:
            title += " (Start)"
        
        # Build tags
        tags = [conversation.source_platform, f"import-{datetime.now().strftime('%Y%m%d')}"]
        if project_tag:
            tags.append(project_tag)
        if message.has_code:
            tags.append('has-code')
        if message.has_action_items:
            tags.append('has-actions')
        
        # Additional metadata
        metadata = {
            'conversation_id': conversation.id,
            'message_role': message.role,
            'message_index': message.message_index,
            'source_platform': conversation.source_platform,
            'has_action_items': message.has_action_items,
            'is_edited': message.is_edited,
            'original_timestamp': message.timestamp.isoformat() if message.timestamp else None
        }
        
        # Create memory with deduplication
        result = await self.memory.create_with_dedup(
            content=content,
            title=title,
            tags=tags,
            metadata=metadata,
            dedup_window=86400,  # 24 hours for imports
            merge_strategy=merge_strategy
        )
        
        # Update memory_entities with chat-specific fields
        if result.get('memory_id'):
            await self.db.execute("""
                UPDATE memory_entities SET
                    source_platform = $2,
                    conversation_id = $3,
                    message_role = $4,
                    message_index = $5,
                    has_action_items = $6,
                    is_edited = $7,
                    original_timestamp = $8
                WHERE id = $1
            """,
                result['memory_id'],
                conversation.source_platform,
                conversation.id,
                message.role,
                message.message_index,
                message.has_action_items,
                message.is_edited,
                message.timestamp
            )
        
        return result
    
    async def _extract_and_store_actions(self, memory_id: str, content: str) -> int:
        """Extract and store action items from content"""
        action_items = ChatParser.extract_action_items(content)
        
        for action_text in action_items:
            await self.db.execute("""
                INSERT INTO action_items (memory_entity_id, action_text, status)
                VALUES ($1, $2, 'pending')
            """, memory_id, action_text)
        
        return len(action_items)
    
    async def _extract_and_store_references(self, memory_id: str, content: str) -> int:
        """Extract and store external references"""
        references = ChatParser.extract_references(content)
        
        for ref in references:
            await self.db.execute("""
                INSERT INTO external_references (
                    memory_entity_id, reference_type, reference_value, reference_context
                ) VALUES ($1, $2, $3, $4)
            """, memory_id, ref['type'], ref['value'], ref.get('context'))
        
        return len(references)
    
    async def _extract_entities_for_memory(self, memory_id: str) -> int:
        """Extract entities using AI if available"""
        try:
            # Get memory content
            result = await self.db.fetchrow("""
                SELECT content FROM memory_entities WHERE id = $1
            """, memory_id)
            
            if not result:
                return 0
            
            # Extract entities
            entities = await self.memory.entity_extractor.extract(result['content'])
            
            # Store entity associations
            for entity in entities:
                # First ensure entity exists
                await self.memory.knowledge_graph.add_entity(
                    name=entity['name'],
                    entity_type=entity['type'],
                    metadata={'source': 'chat_import'}
                )
                
                # Then create association
                await self.db.execute("""
                    INSERT INTO memory_entity_associations (memory_id, entity_name)
                    VALUES ($1, $2)
                    ON CONFLICT DO NOTHING
                """, memory_id, entity['name'])
            
            return len(entities)
            
        except Exception as e:
            logger.error(f"Entity extraction failed for {memory_id}: {e}")
            return 0
    
    async def _detect_and_link_conversations(self, conversation: Conversation):
        """Detect and link related conversations"""
        # Extract conversation references from all messages
        for message in conversation.messages:
            # Look for patterns like "as we discussed", "in our previous chat", etc.
            ref_patterns = [
                r'(?i)(?:as we |we |I )?(?:discussed|talked about|mentioned) (?:yesterday|earlier|before|previously|last time)',
                r'(?i)(?:in our |from our )?(?:previous|last|earlier) (?:conversation|chat|discussion)',
                r'(?i)continuing (?:our|the) (?:conversation|discussion|chat)',
            ]
            
            for pattern in ref_patterns:
                if re.search(pattern, message.content):
                    # This conversation likely references another
                    # Store as a potential link to be resolved later
                    await self.db.execute("""
                        INSERT INTO conversation_links (
                            source_conversation_id, target_conversation_id, 
                            link_type, link_context
                        ) VALUES ($1, $2, $3, $4)
                        ON CONFLICT DO NOTHING
                    """,
                        conversation.id,
                        'pending_resolution',  # Will be resolved in a separate process
                        'reference',
                        f"Pattern match in message {message.message_index}"
                    )
                    break
    
    async def find_related_conversations(self, conversation_id: str, similarity_threshold: float = 0.7) -> List[Dict[str, Any]]:
        """Find conversations that might be related based on content similarity"""
        # This would use semantic search if embeddings are available
        # For now, we'll use keyword matching
        
        # Get conversation content
        messages = await self.db.fetch("""
            SELECT content FROM memory_entities 
            WHERE conversation_id = $1
            ORDER BY message_index
        """, conversation_id)
        
        if not messages:
            return []
        
        # Extract key terms (simplified - would use NLP in production)
        content = ' '.join(msg['content'] for msg in messages)
        
        # Find similar conversations
        # This is a placeholder - would use vector similarity in production
        similar = await self.db.fetch("""
            SELECT DISTINCT conversation_id, title, source_platform
            FROM conversation_metadata
            WHERE conversation_id != $1
            LIMIT 10
        """, conversation_id)
        
        return [dict(row) for row in similar]