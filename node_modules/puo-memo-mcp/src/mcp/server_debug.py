#!/usr/bin/env python3
"""
PUO Memo MCP Server - Debug version with enhanced error handling
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

# Ensure fresh environment - must be before any other imports
from src.utils.fresh_env import ensure_fresh_env

import asyncio
import json
import logging
from typing import Sequence, List, Dict, Any, Optional

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

# Configure logging to stderr for MCP with DEBUG level
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger(__name__)


class PuoMemoMCPDebug:
    """MCP Server with enhanced debugging and error handling"""
    
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
        try:
            logger.info("🔧 Starting initialization...")
            
            # Load configuration
            self.config = get_settings()
            logger.info("✅ Configuration loaded")
            
            # Initialize connection pool
            from src.utils.connection_pool import connection_pool
            await connection_pool.initialize({
                'redis_url': 'redis://localhost:6379'  # Configure as needed
            })
            logger.info("✅ Connection pools initialized")
            
            # Initialize cache manager
            from src.core.cache import cache_manager
            await cache_manager.initialize()
            logger.info("✅ Cache manager initialized")
            
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
            logger.info("✅ Database connected")
            
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
            logger.info("✅ Memory store initialized")
            
            # Create chat importer
            self.chat_importer = ChatImporter(self.memory, self.db)
            logger.info("✅ Chat importer initialized")
            
            logger.info("✅ PUO Memo MCP Server initialized successfully")
            
        except Exception as e:
            logger.error(f"❌ Initialization failed: {e}", exc_info=True)
            raise
    
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
        """Define the core tools"""
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
            )
        ]
    
    async def handle_tool_call(self, name: str, arguments: Optional[Dict[str, Any]]) -> Sequence[TextContent]:
        """Handle tool execution with enhanced error handling"""
        logger.debug(f"🔧 handle_tool_call called with name={name}, arguments type={type(arguments)}, arguments={arguments}")
        
        try:
            # Check if arguments is None or not a dict
            if arguments is None:
                logger.warning(f"⚠️ Arguments is None for tool {name}, using empty dict")
                arguments = {}
            elif not isinstance(arguments, dict):
                logger.warning(f"⚠️ Arguments is not a dict (type: {type(arguments)}), converting")
                arguments = {}
            
            result = None
            
            if name == "memory":
                # Handle memory creation or update
                content = arguments.get("content")
                if not content:
                    return [TextContent(
                        type="text",
                        text=json.dumps({"error": "Missing required parameter: content"}, indent=2)
                    )]
                
                memory_id = arguments.get("memory_id")
                title = arguments.get("title")
                tags = arguments.get("tags")
                attachments = arguments.get("attachments")
                force = arguments.get("force", False)
                dedup_window = arguments.get("dedup_window", 300)
                merge_strategy = arguments.get("merge_strategy", "smart")
                
                logger.debug(f"Memory tool - content length: {len(content)}, has_id: {bool(memory_id)}")
                
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
                
                logger.debug(f"Recall tool - query: '{query}', limit: {limit}, search_type: {search_type}")
                
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
                
                logger.debug(f"Entities tool - name: '{entity_name}', type: {entity_type}, depth: {depth}")
                
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
                memory_id = arguments.get("memory_id")
                file_paths = arguments.get("file_paths", [])
                descriptions = arguments.get("descriptions", [])
                
                if not memory_id:
                    return [TextContent(
                        type="text",
                        text=json.dumps({"error": "Missing required parameter: memory_id"}, indent=2)
                    )]
                
                if not file_paths:
                    return [TextContent(
                        type="text",
                        text=json.dumps({"error": "Missing required parameter: file_paths"}, indent=2)
                    )]
                
                logger.debug(f"Attach tool - memory_id: {memory_id}, files: {len(file_paths)}")
                
                result = await self.memory.add_attachments(memory_id, file_paths, descriptions)
                    
            else:
                raise McpError(f"Unknown tool: {name}")
            
            logger.debug(f"✅ Tool {name} completed successfully")
            
            return [TextContent(
                type="text",
                text=json.dumps(result, indent=2, default=str)
            )]
            
        except Exception as e:
            logger.error(f"❌ Tool execution failed: {name} - {e}", exc_info=True)
            return [TextContent(
                type="text",
                text=json.dumps({"error": str(e)}, indent=2)
            )]


async def main():
    """Run the MCP server with debug logging"""
    logger.info("🚀 Starting PUO Memo MCP Server (Debug Mode)")
    
    # Create server instance
    puo_server = PuoMemoMCPDebug()
    server = puo_server.server
    
    # Register tool handlers
    @server.list_tools()
    async def list_tools() -> List[Tool]:
        """List available tools"""
        logger.debug("📋 list_tools called")
        tools = puo_server.get_tools()
        logger.debug(f"📋 Returning {len(tools)} tools")
        return tools
    
    @server.call_tool()
    async def call_tool(name: str, arguments: Any) -> Sequence[TextContent]:
        """Execute tool calls with debug logging"""
        logger.debug(f"🔨 call_tool called - name: {name}, arguments type: {type(arguments)}")
        logger.debug(f"🔨 Arguments content: {arguments}")
        return await puo_server.handle_tool_call(name, arguments)
    
    # Initialize the server
    await puo_server.initialize()
    
    # Run the server
    try:
        logger.info("🚀 PUO Memo MCP Server - Debug Mode Active")
        logger.info("💾 memory: Save anything to memory")
        logger.info("🔍 recall: Search and retrieve memories")
        logger.info("🧠 entities: Explore knowledge graph")
        logger.info("📎 attach: Attach files to memories")
        logger.info("🔧 Debug logging enabled - check stderr for details")
        
        # Run with stdio transport
        async with stdio_server() as (read_stream, write_stream):
            await server.run(read_stream, write_stream, puo_server.initialize, raise_exceptions=True)
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    except Exception as e:
        logger.error(f"Server error: {e}", exc_info=True)
    finally:
        await puo_server.cleanup()


if __name__ == "__main__":
    asyncio.run(main())