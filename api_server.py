#!/usr/bin/env python3
"""
PUO Memo API Server - HTTP Bridge for Unified Memory
Accepts captures from memorylane extension and stores in shared database
"""
import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional
import uuid

from aiohttp import web
from aiohttp.web import Request, Response
import aiohttp_cors

from puo_memo_simple import PuoMemoSimple

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class PuoMemoAPI:
    """HTTP API server for unified memory system"""
    
    def __init__(self):
        self.puo = PuoMemoSimple()
        self.app = web.Application()
        self.setup_routes()
        self.setup_cors()
        
    def setup_routes(self):
        """Setup HTTP routes"""
        self.app.router.add_get('/', self.handle_health)
        self.app.router.add_post('/memory', self.handle_memory_capture)
        self.app.router.add_get('/memories', self.handle_list_memories)
        self.app.router.add_get('/search', self.handle_search_memories)
        
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
        """Initialize memory system"""
        success = await self.puo.initialize()
        if not success:
            raise Exception("Failed to initialize PUO Memo")
        logger.info("✅ PUO Memo API Server initialized")
        
    async def cleanup(self):
        """Cleanup resources"""
        await self.puo.cleanup()
    
    async def handle_health(self, request: Request) -> Response:
        """Health check endpoint"""
        return web.json_response({
            "status": "healthy",
            "service": "puo-memo-api",
            "version": "1.0.0",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
    
    async def handle_memory_capture(self, request: Request) -> Response:
        """Handle memory capture from extension"""
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
            
            # Generate title from content or metadata
            title = self._generate_title(content, metadata)
            
            # Extract tags from metadata
            tags = self._extract_tags(metadata)
            
            # Enhanced metadata with all capture details
            enhanced_metadata = {
                **metadata,
                "source": source,
                "capture_timestamp": datetime.now(timezone.utc).isoformat(),
                "api_version": "1.0.0"
            }
            
            # Create memory using existing system
            result = await self.puo.create_memory(
                content=content,
                title=title,
                memory_type=memory_type,
                tags=tags
            )
            
            # Store additional metadata if memory was created successfully
            if result.get('id') and not result.get('error'):
                # Update the memory with full metadata
                await self.puo.conn.execute("""
                    UPDATE memory_entities 
                    SET metadata = $1
                    WHERE id = $2
                """, json.dumps(enhanced_metadata), result['id'])
            
            logger.info(f"📝 Captured {memory_type} from {source}: {title[:50]}...")
            
            return web.json_response({
                "success": True,
                "memory_id": result.get('id'),
                "message": f"Captured {memory_type} successfully"
            })
            
        except Exception as e:
            logger.error(f"Memory capture failed: {e}")
            return web.json_response({
                "success": False,
                "error": str(e)
            }, status=500)
    
    async def handle_list_memories(self, request: Request) -> Response:
        """List recent memories"""
        try:
            limit = int(request.query.get('limit', 20))
            offset = int(request.query.get('offset', 0))
            
            result = await self.puo.list_memories(limit=limit, offset=offset)
            
            return web.json_response(result)
            
        except Exception as e:
            logger.error(f"List memories failed: {e}")
            return web.json_response({
                "error": str(e)
            }, status=500)
    
    async def handle_search_memories(self, request: Request) -> Response:
        """Search memories"""
        try:
            query = request.query.get('q', '')
            limit = int(request.query.get('limit', 10))
            
            if not query:
                return web.json_response({
                    "error": "Query parameter 'q' is required"
                }, status=400)
            
            result = await self.puo.search_memories(query=query, limit=limit)
            
            return web.json_response(result)
            
        except Exception as e:
            logger.error(f"Search failed: {e}")
            return web.json_response({
                "error": str(e)
            }, status=500)
    
    def _generate_title(self, content: str, metadata: Dict[str, Any]) -> str:
        """Generate a meaningful title from content and metadata"""
        # Try to extract from metadata first
        if metadata.get('url'):
            url = metadata['url']
            if 'chatgpt.com' in url:
                return f"ChatGPT: {content[:60]}..."
            elif 'claude.ai' in url:
                return f"Claude: {content[:60]}..."
        
        # Extract first meaningful line
        lines = content.strip().split('\n')
        for line in lines:
            line = line.strip()
            if line and not line.startswith(('Human:', 'Assistant:', 'User:')):
                return line[:100] + "..." if len(line) > 100 else line
        
        # Fallback
        return content[:100] + "..." if len(content) > 100 else content
    
    def _extract_tags(self, metadata: Dict[str, Any]) -> list:
        """Extract relevant tags from metadata"""
        tags = []
        
        # Platform tag
        platform = metadata.get('platform', '')
        if platform:
            tags.append(platform)
        
        # Source tag
        if metadata.get('url'):
            if 'chatgpt.com' in metadata['url']:
                tags.append('chatgpt')
            elif 'claude.ai' in metadata['url']:
                tags.append('claude')
        
        # Extension tag
        if metadata.get('captureMethod') == 'manual':
            tags.append('manual-capture')
        
        # Date tag (for easier filtering)
        tags.append(f"captured-{datetime.now().strftime('%Y-%m')}")
        
        return tags


async def create_app():
    """Create and initialize the application"""
    api = PuoMemoAPI()
    await api.initialize()
    return api.app


async def cleanup_app(app):
    """Cleanup on shutdown"""
    # Find our API instance (stored in app state or use global)
    # For now, we'll handle cleanup in the main function
    pass


def main():
    """Run the API server"""
    # Create event loop
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    # Create API instance
    api = PuoMemoAPI()
    
    # Initialize
    loop.run_until_complete(api.initialize())
    
    # Configure web app
    app = api.app
    
    # Add cleanup handler
    async def cleanup(app):
        await api.cleanup()
    
    app.on_cleanup.append(cleanup)
    
    # Start server
    logger.info("🚀 Starting PUO Memo API Server")
    logger.info("📡 Listening on http://localhost:8000")
    logger.info("🔗 Endpoints:")
    logger.info("   POST /memory - Capture memories from extension")
    logger.info("   GET /memories - List recent memories")
    logger.info("   GET /search?q=query - Search memories")
    
    try:
        web.run_app(app, host='0.0.0.0', port=8000)
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    finally:
        loop.run_until_complete(api.cleanup())


if __name__ == '__main__':
    main()
