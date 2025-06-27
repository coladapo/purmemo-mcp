#!/usr/bin/env python3
"""
PUO Memo MCP Server - Clean refactored version
"""
import asyncio
import json
import sys
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

# Configure logging to stderr for MCP
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger(__name__)


class PuoMemoMCP:
    """Clean MCP Server with just 2 tools: memory and recall"""
    
    def __init__(self):
        self.server = Server("puo-memo")
        self.db = DatabaseConnection()
        self.memory = None
        self.ai = AIAssistant()
        
    async def initialize(self):
        """Initialize the server components"""
        # Initialize database
        if not await self.db.initialize():
            raise Exception("Failed to initialize database connection")
        
        # Verify tables exist
        if not await self.db.verify_tables():
            logger.warning("Database tables missing - run setup_database.py")
        
        # Create memory store with database connection
        self.memory = MemoryStore(self.db)
        
        logger.info("✅ PUO Memo MCP Server initialized")
    
    async def cleanup(self):
        """Clean up resources"""
        await self.db.cleanup()
    
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
                            "description": "How many results (default: 10)",
                            "default": 10
                        }
                    }
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
                
                if memory_id:
                    # Update existing memory
                    result = await self.memory.update(
                        memory_id=memory_id,
                        content=content,
                        title=title,
                        tags=tags
                    )
                else:
                    # Create new memory
                    result = await self.memory.create(
                        content=content,
                        title=title,
                        tags=tags
                    )
                    
            elif name == "recall":
                # Handle memory search/recall
                query = arguments.get("query", "")
                limit = arguments.get("limit", 10)
                
                if query:
                    # Search with query
                    result = await self.memory.search(query=query, limit=limit)
                else:
                    # List recent memories
                    result = await self.memory.list(limit=limit)
                    
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
        logger.info("🚀 PUO Memo MCP Server - Clean Architecture")
        logger.info("💾 memory: Save anything to memory")
        logger.info("🔍 recall: Search and retrieve memories")
        
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