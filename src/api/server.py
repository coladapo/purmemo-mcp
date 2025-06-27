#!/usr/bin/env python3
"""
PUO Memo API Server - Refactored with clean architecture
"""
import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from aiohttp import web
from aiohttp.web import Request, Response
import aiohttp_cors

# Import core components
from src.core.database import DatabaseConnection
from src.core.memory import MemoryStore
from src.core.ai import AIAssistant

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class PuoMemoAPI:
    """HTTP API server for browser extension integration"""
    
    def __init__(self):
        self.app = web.Application()
        self.db = DatabaseConnection()
        self.memory = None
        self.ai = AIAssistant()
        self.setup_routes()
        self.setup_cors()
        
    def setup_routes(self):
        """Setup HTTP routes"""
        self.app.router.add_get('/', self.handle_health)
        self.app.router.add_post('/memory', self.handle_memory_capture)
        self.app.router.add_get('/memories', self.handle_list_memories)
        self.app.router.add_get('/search', self.handle_search_memories)
        self.app.router.add_put('/memory/{memory_id}', self.handle_update_memory)
        self.app.router.add_delete('/memory/{memory_id}', self.handle_delete_memory)
        
    def setup_cors(self):
        """Setup CORS for browser extension access"""
        cors = aiohttp_cors.setup(self.app, defaults={
            "*": aiohttp_cors.ResourceOptions(
                allow_credentials=True,
                expose_headers="*",
                allow_headers="*",
                allow_methods="*"
            )
        })
        
        # Configure CORS on all routes
        for route in list(self.app.router.routes()):
            cors.add(route)
    
    async def initialize(self):
        """Initialize API server components"""
        # Initialize database
        if not await self.db.initialize():
            raise Exception("Failed to initialize database connection")
        
        # Create memory store
        self.memory = MemoryStore(self.db)
        
        logger.info("✅ PUO Memo API Server initialized")
        
    async def cleanup(self):
        """Cleanup resources"""
        await self.db.cleanup()
    
    async def handle_health(self, request: Request) -> Response:
        """Health check endpoint"""
        return web.json_response({
            "status": "healthy",
            "service": "puo-memo-api",
            "version": "2.0.0",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "database": "connected" if self.db.pool else "disconnected",
            "ai_enabled": self.ai.enabled
        })
    
    async def handle_memory_capture(self, request: Request) -> Response:
        """Handle memory capture from browser extension"""
        try:
            data = await request.json()
            
            # Extract data from extension payload
            content = data.get('content', '')
            source = data.get('source', 'unknown')
            metadata = data.get('metadata', {})
            
            # Determine memory type based on source
            memory_type = 'conversation'
            if 'chatgpt' in source.lower():
                memory_type = 'chatgpt_conversation'
            elif 'claude' in source.lower():
                memory_type = 'claude_conversation'
            
            # Generate title if not provided
            title = data.get('title') or self._generate_title(content, metadata)
            
            # Extract or suggest tags
            tags = data.get('tags', [])
            if not tags and self.ai.enabled:
                tags = await self.ai.suggest_tags(content)
            
            # Create memory
            result = await self.memory.create(
                content=content,
                title=title,
                memory_type=memory_type,
                tags=tags
            )
            
            if "error" in result:
                return web.json_response(result, status=500)
            
            logger.info(f"Created memory: {result['id']} from {source}")
            return web.json_response(result)
            
        except Exception as e:
            logger.error(f"Memory capture failed: {e}")
            return web.json_response({"error": str(e)}, status=500)
    
    async def handle_list_memories(self, request: Request) -> Response:
        """List recent memories"""
        try:
            limit = int(request.query.get('limit', 20))
            offset = int(request.query.get('offset', 0))
            
            result = await self.memory.list(limit=limit, offset=offset)
            
            if "error" in result:
                return web.json_response(result, status=500)
                
            return web.json_response(result)
            
        except Exception as e:
            logger.error(f"List memories failed: {e}")
            return web.json_response({"error": str(e)}, status=500)
    
    async def handle_search_memories(self, request: Request) -> Response:
        """Search memories"""
        try:
            query = request.query.get('q', '')
            limit = int(request.query.get('limit', 10))
            
            if not query:
                return web.json_response({"error": "Query parameter 'q' is required"}, status=400)
            
            result = await self.memory.search(query=query, limit=limit)
            
            if "error" in result:
                return web.json_response(result, status=500)
                
            return web.json_response(result)
            
        except Exception as e:
            logger.error(f"Search failed: {e}")
            return web.json_response({"error": str(e)}, status=500)
    
    async def handle_update_memory(self, request: Request) -> Response:
        """Update a memory"""
        try:
            memory_id = request.match_info['memory_id']
            data = await request.json()
            
            result = await self.memory.update(
                memory_id=memory_id,
                content=data.get('content'),
                title=data.get('title'),
                tags=data.get('tags')
            )
            
            if "error" in result:
                status = 404 if result["error"] == "Memory not found" else 500
                return web.json_response(result, status=status)
                
            return web.json_response(result)
            
        except Exception as e:
            logger.error(f"Update failed: {e}")
            return web.json_response({"error": str(e)}, status=500)
    
    async def handle_delete_memory(self, request: Request) -> Response:
        """Delete a memory"""
        try:
            memory_id = request.match_info['memory_id']
            
            result = await self.memory.delete(memory_id)
            
            if "error" in result:
                status = 404 if result["error"] == "Memory not found" else 500
                return web.json_response(result, status=status)
                
            return web.json_response(result)
            
        except Exception as e:
            logger.error(f"Delete failed: {e}")
            return web.json_response({"error": str(e)}, status=500)
    
    def _generate_title(self, content: str, metadata: Dict) -> str:
        """Generate a title from content or metadata"""
        # Try to get title from metadata
        if metadata.get('title'):
            return metadata['title']
        
        # Generate from content
        first_line = content.split('\n')[0].strip()
        if len(first_line) > 100:
            return first_line[:97] + "..."
        return first_line or "Untitled memory"


async def main():
    """Run the API server"""
    server = PuoMemoAPI()
    
    # Initialize server
    await server.initialize()
    
    # Setup startup/cleanup handlers
    async def on_startup(app):
        logger.info("🚀 Starting PUO Memo API Server")
    
    async def on_cleanup(app):
        logger.info("Shutting down API server")
        await server.cleanup()
    
    server.app.on_startup.append(on_startup)
    server.app.on_cleanup.append(on_cleanup)
    
    # Run the server
    runner = web.AppRunner(server.app)
    await runner.setup()
    site = web.TCPSite(runner, 'localhost', 8000)
    
    logger.info("📡 API Server running on http://localhost:8000")
    logger.info("📦 Ready for browser extension connections")
    
    await site.start()
    
    # Keep the server running
    try:
        await asyncio.Event().wait()
    except KeyboardInterrupt:
        pass
    finally:
        await runner.cleanup()


if __name__ == "__main__":
    asyncio.run(main())