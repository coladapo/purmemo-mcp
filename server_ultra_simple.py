#!/usr/bin/env python3
"""
PUO Memo MCP Server - Ultra Simple Version
Just 2 tools: memory and recall
"""
import asyncio
import json
import sys
import logging
from typing import Sequence, List
from datetime import datetime

# MCP SDK imports
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent
from mcp.shared.exceptions import McpError

# Import our simple memory system
from puo_memo_simple import PuoMemoSimple

# Configure logging to stderr for MCP
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger(__name__)


class PuoMemoUltraSimple:
    """Ultra Simple MCP Server - Just 2 tools"""
    
    def __init__(self):
        self.puo = PuoMemoSimple()
        self.server = Server("puo-memo")
        
    async def initialize(self):
        """Initialize the memory system"""
        success = await self.puo.initialize()
        if not success:
            logger.error("Failed to initialize PUO Memo")
            raise Exception("Initialization failed")
        logger.info("✅ PUO Memo Ultra Simple initialized")
    
    async def cleanup(self):
        """Clean up resources"""
        await self.puo.cleanup()
    
    def get_tools(self) -> List[Tool]:
        """Define just 2 tools"""
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
                # Save or update based on whether memory_id is provided
                memory_id = arguments.get("memory_id")
                content = arguments["content"]
                
                if memory_id:
                    # Update existing memory
                    result = await self.puo.update_memory(
                        memory_id=memory_id,
                        content=content
                    )
                else:
                    # Create new memory
                    result = await self.puo.create_memory(
                        content=content,
                        memory_type="general"
                    )
                    
            elif name == "recall":
                # Search memories
                query = arguments.get("query", "")
                limit = arguments.get("limit", 10)
                
                if query:
                    # Search with query
                    result = await self.puo.search_memories(
                        query=query,
                        limit=limit
                    )
                else:
                    # List recent memories
                    result = await self.puo.list_memories(
                        limit=limit,
                        offset=0
                    )
                    
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


# Global server instance
server_instance = None

async def main():
    """Run the MCP server"""
    global server_instance
    
    # Create server instance
    server_instance = PuoMemoUltraSimple()
    server = server_instance.server
    
    # Register tool handlers
    @server.list_tools()
    async def list_tools() -> List[Tool]:
        """List available tools"""
        return server_instance.get_tools()
    
    @server.call_tool()
    async def call_tool(name: str, arguments: dict) -> Sequence[TextContent]:
        """Execute tool calls"""
        return await server_instance.handle_tool_call(name, arguments)
    
    # Initialize the server
    await server_instance.initialize()
    
    # Run the server
    try:
        logger.info("🚀 PUO Memo Ultra Simple - Just 2 tools!")
        logger.info("💾 memory: Save anything")
        logger.info("🔍 recall: Find anything")
        
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
        await server_instance.cleanup()


if __name__ == "__main__":
    asyncio.run(main())