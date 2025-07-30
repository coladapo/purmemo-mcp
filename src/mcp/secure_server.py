#!/usr/bin/env python3
"""
Secure MCP Server with API Key Authentication
"""
import sys
import os
import json
import logging
import asyncio
from pathlib import Path
from typing import Sequence, List, Dict, Any
from functools import wraps

# Add project root to Python path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger(__name__)

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent
from mcp.shared.exceptions import McpError

# Import core components
from src.core.database import DatabaseConnection
from src.core.optimized_memory import OptimizedMemoryStore
from src.core.ai import AIAssistant
from src.core.knowledge_graph import KnowledgeGraphStore
from src.core.entity_extractor import EntityExtractor
from src.core.attachments import AttachmentProcessor
from src.core.chat_importer import ChatImporter
from src.core.auth import auth_manager
from src.utils.config import get_settings
from src.utils.error_tracking import error_tracker, with_error_tracking
from src.core.data_porter import DataPorter


class SecurePuoMemoMCP:
    """Secure MCP Server with authentication and request validation"""
    
    def __init__(self):
        self.server = Server("puo-memo")
        self.db = DatabaseConnection()
        self.memory = None
        self.ai = AIAssistant()
        self.knowledge_graph = None
        self.entity_extractor = None
        self.attachment_processor = None
        self.chat_importer = None
        self.data_porter = None
        self.settings = get_settings()
        self._validate_security_config()
        
    def _validate_security_config(self):
        """Validate security configuration on startup"""
        if not self.settings.api_key:
            logger.warning("⚠️  WARNING: No API_KEY configured - MCP server is unprotected!")
            logger.warning("Set API_KEY in your .env file to enable authentication")
            error_tracker.capture_message(
                "MCP server started without authentication",
                level="warning",
                extra={"environment": self.settings.environment}
            )
        else:
            logger.info("✅ API key authentication enabled")
    
    def require_auth(self, func):
        """Decorator to require API key authentication for tool calls"""
        @wraps(func)
        async def wrapper(name: str, arguments: dict) -> Sequence[TextContent]:
            # Check if API key validation is enabled
            if self.settings.api_key:
                # In a real implementation, we'd extract the API key from the request context
                # For MCP over stdio, this would typically be handled at the transport level
                # or passed as part of the tool arguments
                api_key = arguments.pop('_api_key', None)
                
                if not api_key:
                    logger.warning(f"Unauthorized tool call attempt: {name}")
                    return [TextContent(
                        type="text",
                        text=json.dumps({
                            "error": "Authentication required",
                            "message": "Please provide API key"
                        }, indent=2)
                    )]
                
                if not auth_manager.verify_api_key(api_key):
                    logger.warning(f"Invalid API key for tool call: {name}")
                    return [TextContent(
                        type="text",
                        text=json.dumps({
                            "error": "Invalid API key",
                            "message": "Authentication failed"
                        }, indent=2)
                    )]
            
            # Call the original function
            return await func(name, arguments)
        return wrapper
    
    @with_error_tracking("mcp_initialization")
    async def initialize(self):
        """Initialize the server components"""
        # Load configuration
        self.config = get_settings()
        
        # Initialize connection pool
        from src.utils.connection_pool import connection_pool
        await connection_pool.initialize({
            'redis_url': self.config.redis_url or 'redis://localhost:6379'
        })
        logger.info("✅ Connection pools initialized")
        
        # Initialize cache manager if Redis is available
        if self.config.cache_enabled:
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
        
        # Verify tables exist
        if not await self.db.verify_tables():
            logger.warning("Database tables missing - run setup_database.py")
        
        # Create knowledge graph and entity extractor if AI is available
        if self.ai and self.ai.enabled:
            self.knowledge_graph = KnowledgeGraphStore(self.db, self.ai)
            self.entity_extractor = EntityExtractor(self.ai)
            logger.info("✅ AI features enabled")
        
        # Create attachment processor
        self.attachment_processor = AttachmentProcessor(self.db, self.ai)
        logger.info("✅ Attachment processor initialized")
        
        # Create optimized memory store with all components
        self.memory = OptimizedMemoryStore(
            db=self.db,
            config=self.config,
            context="mcp_context"
        )
        # Set additional components
        self.memory.knowledge_graph = self.knowledge_graph
        self.memory.entity_extractor = self.entity_extractor
        self.memory.attachment_processor = self.attachment_processor
        
        # Warm up cache for better performance
        await self.memory.initialize_cache()
        
        # Create chat importer
        self.chat_importer = ChatImporter(self.memory, self.db)
        logger.info("✅ Chat importer initialized")
        
        # Create data porter
        self.data_porter = DataPorter(self.db, self.memory)
        logger.info("✅ Data porter initialized")
        
        logger.info("✅ Secure PUO Memo MCP Server initialized")
    
    async def cleanup(self):
        """Clean up resources"""
        await self.db.cleanup()
        
        # Close connection pools
        from src.utils.connection_pool import connection_pool
        await connection_pool.close()
        
        # Close cache manager if enabled
        if self.config.cache_enabled:
            from src.core.cache import cache_manager
            await cache_manager.close()
        
        # Stop background task queue
        from src.utils.background_tasks import task_queue
        await task_queue.stop()
    
    def _validate_input(self, data: dict, required: list, max_lengths: dict = None) -> tuple[bool, str]:
        """Validate input data"""
        # Check required fields
        for field in required:
            if field not in data or not data[field]:
                return False, f"Missing required field: {field}"
        
        # Check max lengths
        if max_lengths:
            for field, max_len in max_lengths.items():
                if field in data and isinstance(data[field], str) and len(data[field]) > max_len:
                    return False, f"{field} exceeds maximum length of {max_len}"
        
        return True, ""
    
    def get_tools(self) -> List[Tool]:
        """Define all available tools with proper schemas"""
        return [
            Tool(
                name="memory",
                description="💾 Save anything to memory (creates new or updates existing if ID provided)",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "content": {
                            "type": "string",
                            "description": "What to remember",
                            "maxLength": 50000
                        },
                        "memory_id": {
                            "type": "string",
                            "description": "Optional: ID to update existing memory"
                        },
                        "title": {
                            "type": "string",
                            "description": "Optional: Title for the memory",
                            "maxLength": 200
                        },
                        "tags": {
                            "type": "array",
                            "items": {"type": "string", "maxLength": 50},
                            "description": "Optional: Tags for categorization",
                            "maxItems": 20
                        },
                        "attachments": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Optional: File paths or URLs to attach",
                            "maxItems": 10
                        },
                        "force": {
                            "type": "boolean",
                            "description": "Skip duplicate check and force save",
                            "default": False
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
                            "description": "What to search for (leave empty to list recent)",
                            "maxLength": 500
                        },
                        "limit": {
                            "type": "integer",
                            "description": "How many results per page (default: 10)",
                            "default": 10,
                            "minimum": 1,
                            "maximum": 100
                        },
                        "offset": {
                            "type": "integer",
                            "description": "Number of results to skip for pagination (default: 0)",
                            "default": 0,
                            "minimum": 0
                        },
                        "search_type": {
                            "type": "string",
                            "description": "Search method",
                            "enum": ["keyword", "semantic", "hybrid", "entity", "nlp"],
                            "default": "hybrid"
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
                            "description": "Entity to get graph for (leave empty to list all)",
                            "maxLength": 200
                        },
                        "entity_type": {
                            "type": "string",
                            "description": "Filter by entity type",
                            "enum": ["person", "organization", "location", "event", "project", "technology", "concept", "document", "other"]
                        },
                        "depth": {
                            "type": "integer",
                            "description": "Graph traversal depth (default: 2)",
                            "default": 2,
                            "minimum": 1,
                            "maximum": 5
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
                            "description": "File paths or URLs to attach",
                            "maxItems": 10
                        },
                        "descriptions": {
                            "type": "array",
                            "items": {"type": "string", "maxLength": 500},
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
                        "extract_entities": {
                            "type": "boolean",
                            "description": "Extract entities using AI (default: true)",
                            "default": True
                        },
                        "extract_actions": {
                            "type": "boolean",
                            "description": "Extract TODO/action items (default: true)",
                            "default": True
                        }
                    },
                    "required": ["file_path"]
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
                            "description": "The corrected content",
                            "maxLength": 50000
                        },
                        "reason": {
                            "type": "string",
                            "description": "Optional: Reason for the correction",
                            "maxLength": 500
                        }
                    },
                    "required": ["memory_id", "correction"]
                }
            ),
            Tool(
                name="export",
                description="📤 Export memories to file",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "format": {
                            "type": "string",
                            "description": "Export format",
                            "enum": ["json", "csv", "markdown"],
                            "default": "json"
                        },
                        "context": {
                            "type": "string",
                            "description": "Optional: Filter by context"
                        },
                        "tags": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Optional: Filter by tags"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Optional: Limit number of memories",
                            "minimum": 1,
                            "maximum": 10000
                        }
                    }
                }
            ),
            Tool(
                name="stats",
                description="📊 Get memory statistics",
                inputSchema={
                    "type": "object",
                    "properties": {}
                }
            )
        ]
    
    @require_auth
    async def handle_tool_call(self, name: str, arguments: dict) -> Sequence[TextContent]:
        """Handle tool execution with input validation"""
        try:
            result = None
            
            if name == "memory":
                # Validate input
                valid, error = self._validate_input(
                    arguments, 
                    required=['content'],
                    max_lengths={'content': 50000, 'title': 200}
                )
                if not valid:
                    return [TextContent(type="text", text=json.dumps({"error": error}, indent=2))]
                
                # Handle memory creation or update
                memory_id = arguments.get("memory_id")
                content = arguments["content"]
                title = arguments.get("title")
                tags = arguments.get("tags", [])
                attachments = arguments.get("attachments")
                force = arguments.get("force", False)
                
                # Validate tags
                if len(tags) > 20:
                    return [TextContent(type="text", text=json.dumps({"error": "Too many tags (max 20)"}, indent=2))]
                
                if memory_id:
                    # Update existing memory
                    result = await self.memory.update_or_merge(
                        memory_id=memory_id,
                        new_content=content,
                        new_tags=tags,
                        merge_strategy="smart"
                    )
                else:
                    # Create new memory
                    result = await self.memory.create_with_dedup(
                        content=content,
                        title=title,
                        tags=tags,
                        attachments=attachments,
                        force=force
                    )
                    
            elif name == "recall":
                # Validate input
                query = arguments.get("query", "")
                limit = min(max(1, arguments.get("limit", 10)), 100)
                offset = max(0, arguments.get("offset", 0))
                search_type = arguments.get("search_type", "hybrid")
                
                if query and len(query) > 500:
                    return [TextContent(type="text", text=json.dumps({"error": "Query too long (max 500 chars)"}, indent=2))]
                
                # Execute search
                if query:
                    if search_type == "semantic":
                        result = await self.memory.semantic_search(query=query, limit=limit, offset=offset)
                    elif search_type == "keyword":
                        result = await self.memory.search(query=query, limit=limit, offset=offset)
                    elif search_type == "entity":
                        result = await self.memory.search_by_entity(query, limit=limit, offset=offset)
                    elif search_type == "nlp":
                        result = await self.memory.nlp_search(query=query, limit=limit, offset=offset)
                    else:  # hybrid
                        result = await self.memory.hybrid_search(query=query, limit=limit, offset=offset)
                else:
                    # List recent memories
                    result = await self.memory.list(limit=limit, offset=offset)
                    
            elif name == "entities":
                # Handle entity operations
                if not self.knowledge_graph:
                    result = {"error": "Knowledge graph features not available"}
                else:
                    entity_name = arguments.get("entity_name")
                    entity_type = arguments.get("entity_type")
                    depth = min(max(1, arguments.get("depth", 2)), 5)
                    
                    if entity_name:
                        result = await self.knowledge_graph.get_entity_graph(entity_name, depth)
                    else:
                        entities = await self.knowledge_graph.search_entities(
                            entity_name or "", entity_type, limit=20
                        )
                        result = {
                            "entities": entities,
                            "count": len(entities),
                            "filter": {"type": entity_type} if entity_type else None
                        }
                        
            elif name == "attach":
                # Validate input
                valid, error = self._validate_input(
                    arguments,
                    required=['memory_id', 'file_paths']
                )
                if not valid:
                    return [TextContent(type="text", text=json.dumps({"error": error}, indent=2))]
                
                file_paths = arguments["file_paths"]
                if len(file_paths) > 10:
                    return [TextContent(type="text", text=json.dumps({"error": "Too many files (max 10)"}, indent=2))]
                
                result = await self.attachment_processor.attach_to_memory(
                    memory_id=arguments["memory_id"],
                    file_paths=file_paths,
                    descriptions=arguments.get("descriptions", [])
                )
                
            elif name == "import_chat":
                # Validate input
                valid, error = self._validate_input(
                    arguments,
                    required=['file_path']
                )
                if not valid:
                    return [TextContent(type="text", text=json.dumps({"error": error}, indent=2))]
                
                result = await self.chat_importer.import_chat(
                    file_path=arguments["file_path"],
                    extract_entities=arguments.get("extract_entities", True),
                    extract_actions=arguments.get("extract_actions", True)
                )
                
            elif name == "correction":
                # Validate input
                valid, error = self._validate_input(
                    arguments,
                    required=['memory_id', 'correction'],
                    max_lengths={'correction': 50000, 'reason': 500}
                )
                if not valid:
                    return [TextContent(type="text", text=json.dumps({"error": error}, indent=2))]
                
                result = await self.memory.add_correction(
                    memory_id=arguments["memory_id"],
                    correction=arguments["correction"],
                    reason=arguments.get("reason")
                )
                
            elif name == "export":
                # Handle export
                format = arguments.get("format", "json")
                context = arguments.get("context")
                tags = arguments.get("tags")
                limit = arguments.get("limit")
                
                # Export to memory (not file) for MCP
                export_result = await self.data_porter.export_memories(
                    format=format,
                    context=context,
                    tags=tags,
                    include_attachments=True,
                    include_entities=True,
                    include_corrections=True
                )
                
                if export_result['success'] and 'data' in export_result:
                    # For MCP, return the data directly
                    data = export_result['data']
                    
                    # Apply limit if specified
                    if limit and isinstance(data, dict) and 'memories' in data:
                        data['memories'] = data['memories'][:limit]
                        data['total_memories'] = len(data['memories'])
                    
                    result = {
                        "format": format,
                        "memories_exported": export_result['memories_exported'],
                        "data": data
                    }
                else:
                    result = export_result
                
            elif name == "stats":
                # Get statistics
                result = await self.data_porter.export_statistics()
                
            else:
                raise McpError(f"Unknown tool: {name}")
            
            return [TextContent(
                type="text",
                text=json.dumps(result, indent=2, default=str)
            )]
            
        except Exception as e:
            # Track error with Sentry
            error_tracker.capture_exception(e, extra={
                "tool_name": name,
                "arguments": arguments
            })
            
            logger.error(f"Tool execution failed: {name} - {e}")
            return [TextContent(
                type="text",
                text=json.dumps({"error": str(e)}, indent=2)
            )]


async def main():
    """Run the secure MCP server"""
    # Create server instance
    puo_server = SecurePuoMemoMCP()
    server = puo_server.server
    
    # Add authentication wrapper to handle_tool_call
    puo_server.handle_tool_call = puo_server.require_auth(puo_server.handle_tool_call)
    
    # Register tool handlers
    @server.list_tools()
    async def list_tools() -> List[Tool]:
        """List available tools"""
        return puo_server.get_tools()
    
    @server.call_tool()
    async def call_tool(name: str, arguments: dict) -> Sequence[TextContent]:
        """Execute tool calls with authentication"""
        return await puo_server.handle_tool_call(name, arguments)
    
    # Initialize the server
    await puo_server.initialize()
    
    # Run the server
    try:
        logger.info("🔒 Secure PUO Memo MCP Server - Starting")
        logger.info("🔐 Authentication: " + ("ENABLED" if puo_server.settings.api_key else "DISABLED (WARNING!)"))
        
        # Run with stdio transport
        async with stdio_server() as (read_stream, write_stream):
            await server.run(
                read_stream,
                write_stream,
                server.create_initialization_options()
            )
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    except Exception as e:
        logger.error(f"Server error: {e}")
    finally:
        await puo_server.cleanup()


if __name__ == "__main__":
    asyncio.run(main())