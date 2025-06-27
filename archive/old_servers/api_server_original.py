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
            
            # Extract tags from metadata and content
            tags = self._extract_tags(metadata, content)
            
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
        """Generate a meaningful title from content and metadata with smart project detection"""
        
        # Try to extract from metadata first
        if metadata.get('title'):
            return metadata['title']
        
        # Smart project detection
        project_title = self._detect_project_context(content)
        if project_title:
            platform = 'ChatGPT' if 'chatgpt' in metadata.get('url', '').lower() else 'Claude'
            timestamp = datetime.now().strftime('%Y-%m-%d')
            return f"{project_title} - {platform} Session ({timestamp})"
        
        # Extract first meaningful question or statement
        meaningful_content = self._extract_meaningful_content(content)
        if meaningful_content:
            # Add platform context if available
            if metadata.get('url'):
                if 'chatgpt.com' in metadata['url']:
                    return f"ChatGPT: {meaningful_content}"
                elif 'claude.ai' in metadata['url']:
                    return f"Claude: {meaningful_content}"
            return meaningful_content
        
        # Fallback with better context
        platform = metadata.get('platform', 'AI Chat')
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M')
        return f"{platform} Conversation - {timestamp}"
    
    def _detect_project_context(self, content: str) -> Optional[str]:
        """Detect project mentions and return appropriate title"""
        content_lower = content.lower()
        
        # Project-specific patterns
        project_patterns = {
            'futureshift': ['futureshift.ai', 'futureshift', 'future shift'],
            'memorylane': ['memorylane', 'memory lane', 'memorylane extension'],
            'project continuum': ['project continuum', 'continuum'],
            'memory layer': ['memory layer', 'puo memo', 'unified memory'],
            'puo ai studio': ['puo ai studio', 'puo studio', 'puo ai'],
            'claude code': ['claude code', 'claude-code'],
            'mcp': ['mcp server', 'model context protocol', 'mcp implementation']
        }
        
        # Check for project mentions
        for project, patterns in project_patterns.items():
            for pattern in patterns:
                if pattern in content_lower:
                    return project.title()
        
        # Check for technical topics that could be project names
        tech_patterns = {
            'Extension Development': ['browser extension', 'chrome extension', 'manifest.json'],
            'Database Migration': ['database', 'postgresql', 'migration', 'schema'],
            'API Development': ['api server', 'rest api', 'endpoint', 'http server'],
            'AI Integration': ['openai', 'anthropic', 'gemini', 'llm integration'],
            'Testing & QA': ['test', 'testing', 'qa', 'integration test'],
            'DevOps Setup': ['docker', 'deployment', 'ci/cd', 'server setup']
        }
        
        for topic, patterns in tech_patterns.items():
            if any(pattern in content_lower for pattern in patterns):
                return topic
        
        return None
    
    def _extract_meaningful_content(self, content: str) -> Optional[str]:
        """Extract the most meaningful part of the content for title"""
        lines = content.strip().split('\n')
        
        # Skip role indicators and find first substantial content
        for line in lines:
            line = line.strip()
            
            # Skip empty lines and role indicators
            if not line or line.startswith(('Human:', 'Assistant:', 'User:', 'H:', 'A:')):
                continue
            
            # Skip common conversation starters
            if line.lower() in ['hi', 'hello', 'hey', 'thanks', 'thank you']:
                continue
            
            # Skip code block indicators
            if line.startswith('```') or line in ['```javascript', '```python', '```bash']:
                continue
            
            # Look for questions (good for titles)
            if line.endswith('?'):
                return line[:100] + "..." if len(line) > 100 else line
            
            # Look for imperative statements (requests)
            imperative_starts = ['help', 'can you', 'could you', 'please', 'i need', 'how do', 'how to', 'show me', 'explain']
            if any(line.lower().startswith(start) for start in imperative_starts):
                return line[:100] + "..." if len(line) > 100 else line
            
            # If it's substantial content (not just a word), use it
            if len(line.split()) >= 3:
                return line[:100] + "..." if len(line) > 100 else line
        
        return None
    
    def _extract_tags(self, metadata: Dict[str, Any], content: str = '') -> list:
        """Extract enhanced tags from metadata and content"""
        tags = []
        
        # Platform tags
        platform = metadata.get('platform', '')
        if platform:
            tags.append(platform.lower())
        
        # Source-specific tags
        if metadata.get('url'):
            url = metadata['url'].lower()
            if 'chatgpt.com' in url:
                tags.extend(['chatgpt', 'openai'])
            elif 'claude.ai' in url:
                tags.extend(['claude', 'anthropic'])
        
        # Content-based project detection
        content_lower = content.lower() if content else ''
        
        # Project tags
        project_keywords = {
            'futureshift': ['futureshift.ai', 'futureshift', 'future shift'],
            'memorylane': ['memorylane', 'memory lane'],
            'project-continuum': ['project continuum', 'continuum'],
            'memory-layer': ['memory layer', 'puo memo', 'unified memory'],
            'puo-ai-studio': ['puo ai studio', 'puo studio'],
            'mcp': ['mcp server', 'model context protocol']
        }
        
        for tag, keywords in project_keywords.items():
            if any(keyword in content_lower for keyword in keywords):
                tags.append(tag)
        
        # Technology tags
        tech_keywords = {
            'javascript': ['javascript', 'js', 'node.js', 'npm'],
            'python': ['python', 'pip', 'async', 'asyncio'],
            'browser-extension': ['manifest.json', 'chrome extension', 'browser extension'],
            'database': ['postgresql', 'database', 'sql', 'db'],
            'api': ['api', 'rest', 'endpoint', 'server'],
            'ai': ['openai', 'anthropic', 'gemini', 'llm'],
            'testing': ['test', 'testing', 'qa', 'debug'],
            'devops': ['docker', 'deployment', 'ci/cd']
        }
        
        for tag, keywords in tech_keywords.items():
            if any(keyword in content_lower for keyword in keywords):
                tags.append(tag)
        
        # Capture method tags
        if metadata.get('captureMethod') == 'manual':
            tags.append('manual-capture')
        
        # Rich content tags
        if metadata.get('richContent'):
            rich = metadata['richContent']
            if isinstance(rich, dict):
                if rich.get('images'):
                    tags.append('has-images')
                if rich.get('codeBlocks'):
                    tags.append('has-code')
                    # Extract programming languages
                    for block in rich.get('codeBlocks', []):
                        if isinstance(block, dict) and block.get('language'):
                            lang = block['language'].lower()
                            if lang not in ['text', 'unknown']:
                                tags.append(f'lang-{lang}')
                if rich.get('artifacts'):
                    tags.append('has-artifacts')
        
        # Message count tags (for conversation sizing)
        message_count = metadata.get('messageCount', 0)
        if message_count > 0:
            if message_count < 5:
                tags.append('short-conversation')
            elif message_count < 20:
                tags.append('medium-conversation')
            else:
                tags.append('long-conversation')
        
        # Date tags (for temporal filtering)
        now = datetime.now()
        tags.extend([
            f"captured-{now.strftime('%Y-%m')}",
            f"captured-{now.strftime('%Y')}"
        ])
        
        # Remove duplicates and return
        return list(set(tags))


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
