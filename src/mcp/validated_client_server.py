#!/usr/bin/env python3
"""
PUO Memo MCP Client Server with Input Validation
"""
import os
import sys
import json
import logging
import asyncio
from typing import Any, Dict, List, Optional

import aiohttp
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent
from mcp.shared.exceptions import McpError

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger(__name__)


def validate_tool_input(tool_name: str, arguments: Dict[str, Any]) -> Optional[str]:
    """Validate tool inputs and return error message if invalid"""
    
    # Handle None or missing arguments
    if arguments is None:
        arguments = {}
    
    if tool_name == "memory":
        # Check required fields
        if "content" not in arguments:
            return "Missing required field: content"
        
        # Check types
        if not isinstance(arguments.get("content"), str):
            return "Field 'content' must be a string"
        
        if "title" in arguments and not isinstance(arguments["title"], str):
            return "Field 'title' must be a string"
        
        if "tags" in arguments:
            if not isinstance(arguments["tags"], list):
                return "Field 'tags' must be an array"
            for tag in arguments["tags"]:
                if not isinstance(tag, str):
                    return "All tags must be strings"
    
    elif tool_name == "recall":
        # Check required fields
        if "query" not in arguments:
            return "Missing required field: query"
        
        # Check types
        if not isinstance(arguments.get("query"), str):
            return "Field 'query' must be a string"
        
        if "limit" in arguments:
            if not isinstance(arguments["limit"], int):
                return "Field 'limit' must be an integer"
            if arguments["limit"] < 0:
                return "Field 'limit' must be non-negative"
    
    elif tool_name == "entities":
        # All fields are optional, but check types if present
        if "entity_name" in arguments and not isinstance(arguments["entity_name"], str):
            return "Field 'entity_name' must be a string"
        
        if "entity_type" in arguments:
            valid_types = ["person", "organization", "location", "event", "project", 
                          "technology", "concept", "document", "other"]
            if arguments["entity_type"] not in valid_types:
                return f"Field 'entity_type' must be one of: {', '.join(valid_types)}"
    
    return None  # No validation errors


class PuoMemoClient:
    """Client for PUO Memo API"""
    
    def __init__(self, api_url: str, api_key: str):
        self.api_url = api_url.rstrip('/')
        self.api_key = api_key
        self.session = None
    
    async def __aenter__(self):
        self.session = aiohttp.ClientSession(
            headers={
                'Authorization': f'Bearer {self.api_key}',
                'Content-Type': 'application/json'
            }
        )
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def memory(self, content: str, **kwargs) -> Dict[str, Any]:
        """Store a memory"""
        data = {
            'content': content,
            **kwargs
        }
        
        async with self.session.post(f'{self.api_url}/api/memories', json=data) as resp:
            if resp.status != 200:
                error_text = await resp.text()
                raise McpError(f"API error: {resp.status} - {error_text}")
            return await resp.json()
    
    async def recall(self, query: str, **kwargs) -> Dict[str, Any]:
        """Search memories"""
        params = {
            'query': query,
            **kwargs
        }
        
        async with self.session.get(f'{self.api_url}/api/memories/search', params=params) as resp:
            if resp.status != 200:
                error_text = await resp.text()
                raise McpError(f"API error: {resp.status} - {error_text}")
            return await resp.json()
    
    async def entities(self, **kwargs) -> Dict[str, Any]:
        """List entities"""
        async with self.session.get(f'{self.api_url}/api/entities', params=kwargs) as resp:
            if resp.status != 200:
                error_text = await resp.text()
                raise McpError(f"API error: {resp.status} - {error_text}")
            return await resp.json()


class PuoMemoMCPClient:
    """MCP Server that connects to PUO Memo API with validation"""
    
    def __init__(self):
        self.server = Server("puo-memo")
        self.api_url = os.getenv('PUO_MEMO_API_URL', 'http://localhost:8000')
        self.api_key = os.getenv('PUO_MEMO_API_KEY', 'test-api-key')
        
        # Register handlers using decorators
        @self.server.list_tools()
        async def handle_list_tools() -> List[Tool]:
            return await self.handle_list_tools()
        
        @self.server.call_tool()
        async def handle_call_tool(name: str, arguments: Dict[str, Any]) -> List[TextContent]:
            return await self.handle_call_tool(name, arguments)
    
    async def handle_list_tools(self) -> List[Tool]:
        """List available tools"""
        return [
            Tool(
                name="memory",
                description="Store anything to memory",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "content": {
                            "type": "string",
                            "description": "What to remember"
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
                    "required": ["content"],
                    "additionalProperties": False
                }
            ),
            Tool(
                name="recall",
                description="Search your memories",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "What to search for"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "How many results (default: 10)",
                            "default": 10,
                            "minimum": 0
                        }
                    },
                    "required": ["query"],
                    "additionalProperties": False
                }
            ),
            Tool(
                name="entities",
                description="List entities or get entity graph",
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
                        }
                    },
                    "additionalProperties": False
                }
            )
        ]
    
    async def handle_call_tool(self, name: str, arguments: Dict[str, Any]) -> List[TextContent]:
        """Handle tool calls with validation"""
        logger.info(f"Tool called: {name} with arguments: {arguments}")
        
        # Manual validation for additional checks
        validation_error = validate_tool_input(name, arguments)
        if validation_error:
            logger.error(f"Validation error: {validation_error}")
            raise McpError(f"Invalid input: {validation_error}")
        
        try:
            async with PuoMemoClient(self.api_url, self.api_key) as client:
                if name == "memory":
                    result = await client.memory(**arguments)
                    return [TextContent(
                        type="text",
                        text=f"✅ Memory stored successfully!\nID: {result.get('id', 'unknown')}"
                    )]
                
                elif name == "recall":
                    result = await client.recall(**arguments)
                    memories = result.get('memories', [])
                    
                    if not memories:
                        return [TextContent(
                            type="text",
                            text="No memories found matching your search."
                        )]
                    
                    text = f"Found {len(memories)} memories:\n\n"
                    for mem in memories:
                        text += f"**{mem.get('title', 'Untitled')}**\n"
                        text += f"{mem.get('content', '')}\n"
                        if mem.get('tags'):
                            text += f"Tags: {', '.join(mem['tags'])}\n"
                        text += "\n"
                    
                    return [TextContent(type="text", text=text)]
                
                elif name == "entities":
                    result = await client.entities(**arguments)
                    entities = result.get('entities', [])
                    
                    if not entities:
                        return [TextContent(
                            type="text",
                            text="No entities found."
                        )]
                    
                    text = "Entities:\n\n"
                    for entity in entities:
                        text += f"• {entity.get('name')} ({entity.get('type', 'unknown')})\n"
                        if entity.get('references'):
                            text += f"  References: {entity['references']}\n"
                    
                    return [TextContent(type="text", text=text)]
                
                else:
                    raise McpError(f"Unknown tool: {name}")
                    
        except Exception as e:
            logger.error(f"Error calling tool {name}: {e}")
            # Re-raise MCP errors as-is
            if isinstance(e, McpError):
                raise
            # Wrap other errors
            return [TextContent(
                type="text",
                text=f"❌ Error: {str(e)}"
            )]
    
    async def run(self):
        """Run the MCP server"""
        logger.info(f"Starting PUO Memo MCP Client with Validation")
        logger.info(f"API URL: {self.api_url}")
        logger.info(f"API Key: {'*' * 8 if self.api_key else 'Not set'}")
        
        # Run the server
        async with stdio_server() as (read_stream, write_stream):
            await self.server.run(
                read_stream,
                write_stream,
                self.server.create_initialization_options()
            )


async def main():
    """Main entry point"""
    server = PuoMemoMCPClient()
    await server.run()


if __name__ == "__main__":
    asyncio.run(main())