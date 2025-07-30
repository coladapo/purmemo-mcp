#!/usr/bin/env python3
"""
PUO Memo MCP Server - Clean refactored version
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

# Ensure fresh environment - must be before any other imports
from src.utils.fresh_env import ensure_fresh_env

import asyncio
import json
import logging
from typing import Sequence, List, Dict, Any

# MCP SDK imports
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent
from mcp.shared.exceptions import McpError

# Import core components
from src.core.database import DatabaseConnection
from src.core.memory import MemoryStore
from src.core.ai import AIAssistant
from src.core.knowledge_graph import KnowledgeGraphStore
from src.core.entity_extractor import EntityExtractor
from src.core.attachments import AttachmentProcessor
from src.core.chat_importer import ChatImporter
from src.utils.config import get_settings

# Configure logging to stderr for MCP
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger(__name__)


class PuoMemoMCP:
    """MCP Server with memory, recall, entities, attach, and chat import tools"""
    
    def __init__(self):
        self.server = Server("puo-memo")
        self.db = DatabaseConnection()
        self.memory = None
        self.ai = AIAssistant()
        self.knowledge_graph = None
        self.entity_extractor = None
        self.attachment_processor = None
        self.chat_importer = None
        
    async def initialize(self):
        """Initialize the server components"""
        # Load configuration
        self.config = get_settings()
        
        # Initialize connection pool
        from src.utils.connection_pool import connection_pool
        await connection_pool.initialize({
            'redis_url': 'redis://localhost:6379'  # Configure as needed
        })
        logger.info("✅ Connection pools initialized")
        
        # Initialize cache manager
        from src.core.cache import cache_manager
        await cache_manager.initialize()
        
        # Initialize background task queue
        from src.utils.background_tasks import task_queue, generate_embedding_task, extract_entities_task, process_attachment_task
        task_queue.register_handler("generate_embedding", generate_embedding_task)
        task_queue.register_handler("extract_entities", extract_entities_task)
        task_queue.register_handler("process_attachment", process_attachment_task)
        await task_queue.start()
        logger.info("✅ Background task queue started")
        
        # Initialize database
        if not await self.db.initialize():
            raise Exception("Failed to initialize database connection")
        
        # Verify tables exist
        if not await self.db.verify_tables():
            logger.warning("Database tables missing - run setup_database.py")
        
        # Create knowledge graph and entity extractor if AI is available
        if self.ai and self.ai.enabled:
            self.knowledge_graph = KnowledgeGraphStore(self.db, self.ai)
            self.entity_extractor = EntityExtractor(self.ai)
            logger.info("✅ Knowledge graph features enabled")
        
        # Create attachment processor (using GCS)
        self.attachment_processor = AttachmentProcessor(self.db, self.ai, storage_backend='gcs')
        logger.info("✅ Attachment processor initialized")
        
        # Create memory store with all components and config
        self.memory = MemoryStore(self.db, self.ai, self.knowledge_graph, self.entity_extractor, self.attachment_processor, self.config)
        
        # Create chat importer
        self.chat_importer = ChatImporter(self.memory, self.db)
        logger.info("✅ Chat importer initialized")
        
        logger.info("✅ PUO Memo MCP Server initialized")
    
    async def cleanup(self):
        """Clean up resources"""
        await self.db.cleanup()
        
        # Close connection pools
        from src.utils.connection_pool import connection_pool
        await connection_pool.close()
        
        # Close cache manager
        from src.core.cache import cache_manager
        await cache_manager.close()
        
        # Stop background task queue
        from src.utils.background_tasks import task_queue
        await task_queue.stop()
    
    def get_tools(self) -> List[Tool]:
        """Define the 2 core tools"""
        return [
            Tool(
                name="memory",
                description="💾 Save anything to memory (creates new or updates existing if ID provided)",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "content": {
                            "type": "string",
                            "description": "What to remember"
                        },
                        "memory_id": {
                            "type": "string",
                            "description": "Optional: ID to update existing memory"
                        },
                        "title": {
                            "type": "string",
                            "description": "Optional: Title for the memory"
                        },
                        "tags": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Optional: Tags for categorization"
                        },
                        "attachments": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Optional: File paths or URLs to attach"
                        },
                        "force": {
                            "type": "boolean",
                            "description": "Skip duplicate check and force save",
                            "default": False
                        },
                        "dedup_window": {
                            "type": "integer",
                            "description": "Seconds to check for duplicates (default: 300)",
                            "default": 300
                        },
                        "merge_strategy": {
                            "type": "string",
                            "description": "How to merge duplicates: 'smart', 'append', 'replace'",
                            "enum": ["smart", "append", "replace"],
                            "default": "smart"
                        }
                    },
                    "required": ["content"]
                }
            ),
            Tool(
                name="recall",
                description="🔍 Search your memories",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "What to search for (leave empty to list recent)"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "How many results per page (default: 10)",
                            "default": 10
                        },
                        "offset": {
                            "type": "integer",
                            "description": "Number of results to skip for pagination (default: 0)",
                            "default": 0
                        },
                        "search_type": {
                            "type": "string",
                            "description": "Search method: 'keyword', 'semantic', 'hybrid', 'entity', or 'nlp' (default: hybrid)",
                            "enum": ["keyword", "semantic", "hybrid", "entity", "nlp"],
                            "default": "hybrid"
                        },
                        "model": {
                            "type": "string",
                            "description": "AI model for adaptive content delivery (e.g., 'gpt-4', 'claude-3-opus')"
                        }
                    }
                }
            ),
            Tool(
                name="entities",
                description="🧠 List entities or get entity graph",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "entity_name": {
                            "type": "string",
                            "description": "Entity to get graph for (leave empty to list all)"
                        },
                        "entity_type": {
                            "type": "string",
                            "description": "Filter by entity type",
                            "enum": ["person", "organization", "location", "event", "project", "technology", "concept", "document", "other"]
                        },
                        "depth": {
                            "type": "integer",
                            "description": "Graph traversal depth (default: 2)",
                            "default": 2
                        }
                    }
                }
            ),
            Tool(
                name="attach",
                description="📎 Attach files to an existing memory",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "memory_id": {
                            "type": "string",
                            "description": "Memory ID to attach files to"
                        },
                        "file_paths": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "File paths or URLs to attach"
                        },
                        "descriptions": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Optional descriptions for each file"
                        }
                    },
                    "required": ["memory_id", "file_paths"]
                }
            ),
            Tool(
                name="import_chat",
                description="📥 Import conversations from Claude, ChatGPT, or other AI assistants",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "file_path": {
                            "type": "string",
                            "description": "Path to the chat export file (JSON, HTML, or Markdown)"
                        },
                        "project_tag": {
                            "type": "string",
                            "description": "Optional project to associate with this import"
                        },
                        "extract_entities": {
                            "type": "boolean",
                            "description": "Extract entities using AI (default: true)",
                            "default": True
                        },
                        "extract_actions": {
                            "type": "boolean",
                            "description": "Extract TODO/action items (default: true)",
                            "default": True
                        },
                        "merge_strategy": {
                            "type": "string",
                            "description": "How to handle duplicates: 'smart', 'skip', 'force'",
                            "enum": ["smart", "skip", "force"],
                            "default": "smart"
                        }
                    },
                    "required": ["file_path"]
                }
            ),
            Tool(
                name="find_references",
                description="🔗 Find external references, action items, and cross-conversation links",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "reference_type": {
                            "type": "string",
                            "description": "Type of reference to search for",
                            "enum": ["github", "url", "slack_user", "action_item", "conversation", "all"]
                        },
                        "status": {
                            "type": "string",
                            "description": "For action items: filter by status",
                            "enum": ["pending", "in_progress", "completed", "cancelled", "all"]
                        },
                        "conversation_id": {
                            "type": "string",
                            "description": "Filter by specific conversation"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum results to return (default: 20)",
                            "default": 20
                        }
                    }
                }
            ),
            Tool(
                name="link_conversations",
                description="🔄 Link related conversations together",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "source_conversation_id": {
                            "type": "string",
                            "description": "Source conversation ID"
                        },
                        "target_conversation_id": {
                            "type": "string",
                            "description": "Target conversation ID to link to"
                        },
                        "link_type": {
                            "type": "string",
                            "description": "Type of relationship",
                            "enum": ["continuation", "reference", "related", "followup"],
                            "default": "reference"
                        },
                        "context": {
                            "type": "string",
                            "description": "Optional context about the relationship"
                        }
                    },
                    "required": ["source_conversation_id", "target_conversation_id"]
                }
            ),
            Tool(
                name="correction",
                description="✏️ Add a correction to an existing memory",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "memory_id": {
                            "type": "string",
                            "description": "ID of the memory to correct"
                        },
                        "correction": {
                            "type": "string",
                            "description": "The corrected content (what is actually true)"
                        },
                        "reason": {
                            "type": "string",
                            "description": "Optional: Reason for the correction"
                        }
                    },
                    "required": ["memory_id", "correction"]
                }
            )
        ]
    
    async def handle_tool_call(self, name: str, arguments: dict) -> Sequence[TextContent]:
        """Handle tool execution"""
        try:
            result = None
            
            if name == "memory":
                # Handle memory creation or update
                memory_id = arguments.get("memory_id")
                content = arguments["content"]
                title = arguments.get("title")
                tags = arguments.get("tags")
                attachments = arguments.get("attachments")
                force = arguments.get("force", False)
                dedup_window = arguments.get("dedup_window", 300)
                merge_strategy = arguments.get("merge_strategy", "smart")
                
                if memory_id:
                    # Update existing memory
                    result = await self.memory.update_or_merge(
                        memory_id=memory_id,
                        new_content=content,
                        new_tags=tags,
                        merge_strategy=merge_strategy
                    )
                else:
                    # Create new memory with deduplication check
                    result = await self.memory.create_with_dedup(
                        content=content,
                        title=title,
                        tags=tags,
                        attachments=attachments,
                        force=force,
                        dedup_window=dedup_window,
                        merge_strategy=merge_strategy
                    )
                    
                    # Handle duplicate found response
                    if result.get('status') == 'duplicate_found':
                        duplicate = result['existing_memory']
                        similarity = result['similarity']
                        
                        # Auto-merge if it's from MemoryLane
                        if 'memorylane' in duplicate.get('tags', []) or 'memorylane-auto' in duplicate.get('tags', []):
                            # Auto-merge with existing
                            merge_result = await self.memory.update_or_merge(
                                duplicate['id'],
                                new_content=content,
                                new_tags=tags,
                                new_attachments=attachments,
                                merge_strategy='append'
                            )
                            result = {
                                'status': 'auto_merged',
                                'message': f"✅ Updated existing MemoryLane capture",
                                'memory_id': duplicate['id']
                            }
                        else:
                            # Return duplicate warning
                            result['message'] = f"""⚠️ Found {similarity}% similar memory: '{duplicate['title']}'
Created: {duplicate['created_at']}

Options:
1. Use force=True to save anyway
2. Use memory_id='{duplicate['id']}' to update existing
3. Skip this save"""
                    
            elif name == "recall":
                # Handle memory search/recall with pagination
                query = arguments.get("query", "")
                limit = arguments.get("limit", 10)
                offset = arguments.get("offset", 0)
                search_type = arguments.get("search_type", "hybrid")
                model = arguments.get("model")
                
                if query:
                    # Search with query using specified search type with model support
                    if search_type == "semantic":
                        result = await self.memory.semantic_search(query=query, limit=limit, offset=offset, model=model)
                    elif search_type == "keyword":
                        result = await self.memory.search(query=query, limit=limit, offset=offset, model=model)
                    elif search_type == "entity":
                        result = await self.memory.search_by_entity(query, limit=limit, offset=offset, model=model)
                    elif search_type == "nlp":
                        result = await self.memory.nlp_search(query=query, limit=limit, offset=offset, model=model)
                    else:  # hybrid
                        result = await self.memory.hybrid_search(query=query, limit=limit, offset=offset, model=model)
                else:
                    # List recent memories with pagination
                    result = await self.memory.list(limit=limit, offset=offset, model=model)
                    
                # Add pagination metadata if result is a list
                if isinstance(result, list):
                    result = {
                        "memories": result,
                        "pagination": {
                            "offset": offset,
                            "limit": limit,
                            "count": len(result),
                            "has_more": len(result) == limit
                        }
                    }
                # If result is already a dict (from search methods), add pagination info
                elif isinstance(result, dict) and "results" in result:
                    result["pagination"] = {
                        "offset": offset,
                        "limit": limit,
                        "count": len(result.get("results", [])),
                        "has_more": len(result.get("results", [])) == limit
                    }
                    
            elif name == "entities":
                # Handle entity operations
                entity_name = arguments.get("entity_name")
                entity_type = arguments.get("entity_type")
                depth = arguments.get("depth", 2)
                
                if not self.knowledge_graph:
                    result = {"error": "Knowledge graph features not available"}
                elif entity_name:
                    # Get entity graph
                    result = await self.knowledge_graph.get_entity_graph(entity_name, depth)
                else:
                    # List entities
                    query = entity_name or ""
                    entities = await self.knowledge_graph.search_entities(query, entity_type, limit=20)
                    result = {
                        "entities": entities,
                        "count": len(entities),
                        "filter": {"type": entity_type} if entity_type else None
                    }
                    
            elif name == "attach":
                # Handle file attachments
                memory_id = arguments["memory_id"]
                file_paths = arguments["file_paths"]
                descriptions = arguments.get("descriptions", [])
                
                if not self.attachment_processor:
                    result = {"error": "Attachment processor not available"}
                else:
                    attached_files = []
                    for i, file_path in enumerate(file_paths):
                        description = descriptions[i] if i < len(descriptions) else None
                        
                        try:
                            attachment_result = await self.attachment_processor.attach_file(
                                memory_id=memory_id,
                                file_path=file_path,
                                user_description=description
                            )
                            attached_files.append(attachment_result)
                        except Exception as e:
                            attached_files.append({"error": str(e), "file": file_path})
                    
                    result = {
                        "memory_id": memory_id,
                        "attached": len([f for f in attached_files if "error" not in f]),
                        "failed": len([f for f in attached_files if "error" in f]),
                        "files": attached_files
                    }
                    
            elif name == "import_chat":
                # Handle chat import
                file_path = arguments["file_path"]
                project_tag = arguments.get("project_tag")
                extract_entities = arguments.get("extract_entities", True)
                extract_actions = arguments.get("extract_actions", True)
                merge_strategy = arguments.get("merge_strategy", "smart")
                
                result = await self.chat_importer.import_conversation(
                    file_path=file_path,
                    project_tag=project_tag,
                    extract_entities=extract_entities,
                    extract_actions=extract_actions,
                    merge_strategy=merge_strategy
                )
                
            elif name == "find_references":
                # Handle reference search
                reference_type = arguments.get("reference_type", "all")
                status = arguments.get("status", "all")
                conversation_id = arguments.get("conversation_id")
                limit = arguments.get("limit", 20)
                
                results = []
                
                if reference_type in ["action_item", "all"]:
                    # Query action items
                    query = """
                        SELECT 
                            ai.id,
                            ai.action_text,
                            ai.status,
                            ai.priority,
                            ai.due_date,
                            ai.extracted_at,
                            me.title as memory_title,
                            me.conversation_id
                        FROM action_items ai
                        JOIN memory_entities me ON ai.memory_entity_id = me.id
                        WHERE 1=1
                    """
                    params = []
                    
                    if status != "all":
                        query += f" AND ai.status = ${len(params) + 1}"
                        params.append(status)
                    
                    if conversation_id:
                        query += f" AND me.conversation_id = ${len(params) + 1}"
                        params.append(conversation_id)
                    
                    query += f" ORDER BY ai.extracted_at DESC LIMIT ${len(params) + 1}"
                    params.append(limit)
                    
                    action_items = await self.db.fetch(query, *params)
                    for item in action_items:
                        results.append({
                            "type": "action_item",
                            "data": dict(item)
                        })
                
                if reference_type in ["github", "url", "slack_user", "all"]:
                    # Query external references
                    query = """
                        SELECT 
                            er.id,
                            er.reference_type,
                            er.reference_value,
                            er.reference_context,
                            er.is_valid,
                            me.title as memory_title,
                            me.conversation_id
                        FROM external_references er
                        JOIN memory_entities me ON er.memory_entity_id = me.id
                        WHERE 1=1
                    """
                    params = []
                    
                    if reference_type != "all":
                        query += f" AND er.reference_type = ${len(params) + 1}"
                        params.append(reference_type)
                    
                    if conversation_id:
                        query += f" AND me.conversation_id = ${len(params) + 1}"
                        params.append(conversation_id)
                    
                    query += f" ORDER BY er.created_at DESC LIMIT ${len(params) + 1}"
                    params.append(limit)
                    
                    references = await self.db.fetch(query, *params)
                    for ref in references:
                        results.append({
                            "type": "external_reference",
                            "data": dict(ref)
                        })
                
                result = {
                    "count": len(results),
                    "results": results
                }
                
            elif name == "link_conversations":
                # Handle conversation linking
                source_id = arguments["source_conversation_id"]
                target_id = arguments["target_conversation_id"]
                link_type = arguments.get("link_type", "reference")
                context = arguments.get("context", "")
                
                # Create the link
                await self.db.execute("""
                    INSERT INTO conversation_links (
                        source_conversation_id, target_conversation_id, 
                        link_type, link_context
                    ) VALUES ($1, $2, $3, $4)
                    ON CONFLICT (source_conversation_id, target_conversation_id) 
                    DO UPDATE SET
                        link_type = EXCLUDED.link_type,
                        link_context = EXCLUDED.link_context
                """, source_id, target_id, link_type, context)
                
                result = {
                    "status": "success",
                    "source": source_id,
                    "target": target_id,
                    "link_type": link_type,
                    "message": f"Conversations linked successfully"
                }
                    
            elif name == "correction":
                # Handle memory correction
                memory_id = arguments["memory_id"]
                correction_content = arguments["correction"]
                reason = arguments.get("reason")
                
                result = await self.memory.add_correction(memory_id, correction_content, reason)
                    
            else:
                raise McpError(f"Unknown tool: {name}")
            
            return [TextContent(
                type="text",
                text=json.dumps(result, indent=2, default=str)
            )]
            
        except Exception as e:
            logger.error(f"Tool execution failed: {name} - {e}")
            return [TextContent(
                type="text",
                text=json.dumps({"error": str(e)}, indent=2)
            )]


async def main():
    """Run the MCP server"""
    # Create server instance
    puo_server = PuoMemoMCP()
    server = puo_server.server
    
    # Register tool handlers
    @server.list_tools()
    async def list_tools() -> List[Tool]:
        """List available tools"""
        return puo_server.get_tools()
    
    @server.call_tool()
    async def call_tool(name: str, arguments: dict) -> Sequence[TextContent]:
        """Execute tool calls"""
        return await puo_server.handle_tool_call(name, arguments)
    
    # Initialize the server
    await puo_server.initialize()
    
    # Run the server
    try:
        logger.info("🚀 PUO Memo MCP Server - Enhanced with Chat Import & Corrections")
        logger.info("💾 memory: Save anything to memory")
        logger.info("🔍 recall: Search and retrieve memories")
        logger.info("🧠 entities: Explore knowledge graph")
        logger.info("📎 attach: Attach files to memories")
        logger.info("📥 import_chat: Import AI conversations")
        logger.info("🔗 find_references: Find actions and references")
        logger.info("🔄 link_conversations: Link related chats")
        logger.info("✏️ correction: Add corrections to memories")
        
        async with stdio_server() as (read_stream, write_stream):
            await server.run(
                read_stream,
                write_stream,
                server.create_initialization_options()
            )
    except Exception as e:
        logger.error(f"Server error: {e}")
        raise
    finally:
        await puo_server.cleanup()


if __name__ == "__main__":
    asyncio.run(main())