#!/usr/bin/env python3
"""
PUO Memo MCP Server - Simplified Version
Clean, reliable MCP server with 8 essential tools
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


class PuoMemoServer:
    """MCP Server for PUO Memo"""
    
    def __init__(self):
        self.puo = PuoMemoSimple()
        self.server = Server("puo-memo")
        
    async def initialize(self):
        """Initialize the memory system"""
        success = await self.puo.initialize()
        if not success:
            logger.error("Failed to initialize PUO Memo")
            raise Exception("Initialization failed")
        logger.info("✅ PUO Memo MCP Server initialized")
    
    async def cleanup(self):
        """Clean up resources"""
        await self.puo.cleanup()
    
    def get_tools(self) -> List[Tool]:
        """Define the 8 essential MCP tools"""
        return [
            Tool(
                name="save_memory",
                description="💾 Save a new memory with optional title and tags",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "content": {
                            "type": "string",
                            "description": "The content to remember"
                        },
                        "title": {
                            "type": "string",
                            "description": "Optional title for the memory"
                        },
                        "tags": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Optional tags for categorization"
                        },
                        "type": {
                            "type": "string",
                            "description": "Memory type (general, decision, code, idea, etc.)",
                            "default": "general"
                        }
                    },
                    "required": ["content"]
                }
            ),
            Tool(
                name="find_memory",
                description="🔍 Search for memories by query",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum results to return",
                            "default": 10
                        }
                    },
                    "required": ["query"]
                }
            ),
            Tool(
                name="ask_memory",
                description="❓ Ask questions about your memories",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "question": {
                            "type": "string",
                            "description": "Question to ask about your memories"
                        }
                    },
                    "required": ["question"]
                }
            ),
            Tool(
                name="update_memory",
                description="✏️ Update an existing memory",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "memory_id": {
                            "type": "string",
                            "description": "ID of the memory to update"
                        },
                        "content": {
                            "type": "string",
                            "description": "New content (optional)"
                        },
                        "title": {
                            "type": "string",
                            "description": "New title (optional)"
                        },
                        "tags": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "New tags (optional)"
                        }
                    },
                    "required": ["memory_id"]
                }
            ),
            Tool(
                name="delete_memory",
                description="🗑️ Delete a memory",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "memory_id": {
                            "type": "string",
                            "description": "ID of the memory to delete"
                        }
                    },
                    "required": ["memory_id"]
                }
            ),
            Tool(
                name="list_memories",
                description="📋 List recent memories",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "limit": {
                            "type": "integer",
                            "description": "Number of memories to list",
                            "default": 20
                        },
                        "offset": {
                            "type": "integer",
                            "description": "Offset for pagination",
                            "default": 0
                        }
                    }
                }
            ),
            Tool(
                name="memory_stats",
                description="📊 Get memory system statistics",
                inputSchema={
                    "type": "object",
                    "properties": {}
                }
            ),
            Tool(
                name="switch_context",
                description="🔄 Switch project context",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "context": {
                            "type": "string",
                            "description": "Project context name"
                        }
                    },
                    "required": ["context"]
                }
            )
        ]
    
    async def handle_tool_call(self, name: str, arguments: dict) -> Sequence[TextContent]:
        """Handle tool execution"""
        try:
            result = None
            
            if name == "save_memory":
                result = await self.puo.create_memory(
                    content=arguments["content"],
                    title=arguments.get("title"),
                    memory_type=arguments.get("type", "general"),
                    tags=arguments.get("tags", [])
                )
                
            elif name == "find_memory":
                result = await self.puo.search_memories(
                    query=arguments["query"],
                    limit=arguments.get("limit", 10)
                )
                
            elif name == "ask_memory":
                result = await self.puo.ask_memory(
                    question=arguments["question"]
                )
                
            elif name == "update_memory":
                result = await self.puo.update_memory(
                    memory_id=arguments["memory_id"],
                    content=arguments.get("content"),
                    title=arguments.get("title"),
                    tags=arguments.get("tags")
                )
                
            elif name == "delete_memory":
                result = await self.puo.delete_memory(
                    memory_id=arguments["memory_id"]
                )
                
            elif name == "list_memories":
                result = await self.puo.list_memories(
                    limit=arguments.get("limit", 20),
                    offset=arguments.get("offset", 0)
                )
                
            elif name == "memory_stats":
                result = await self.puo.get_stats()
                
            elif name == "switch_context":
                result = await self.puo.switch_context(
                    context_name=arguments["context"]
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
    server_instance = PuoMemoServer()
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
        logger.info("🚀 PUO Memo MCP Server - Simple & Reliable")
        logger.info("📝 8 essential memory tools available")
        
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