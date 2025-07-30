#!/usr/bin/env python3
"""
Secure PUO Memo API Server with Authentication
"""
import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from functools import wraps

from aiohttp import web
from aiohttp.web import Request, Response, middleware
import aiohttp_cors
import jwt
from aiohttp_limiter import default_keyfunc, Limiter

# Import core components
from src.core.database import DatabaseConnection
from src.core.optimized_memory import OptimizedMemoryStore
from src.core.ai import AIAssistant
from src.core.auth import auth_manager
from src.core.performance_monitor import performance_monitor
from src.utils.config import get_settings
from src.utils.error_tracking import error_tracker, with_error_tracking

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class SecurePuoMemoAPI:
    """Secure HTTP API server with authentication and rate limiting"""
    
    def __init__(self):
        self.app = web.Application(middlewares=[
            performance_monitor.create_middleware(),
            self.auth_middleware,
            self.error_middleware
        ])
        self.db = DatabaseConnection()
        self.memory = None
        self.ai = AIAssistant()
        self.settings = get_settings()
        self.limiter = None
        self.setup_routes()
        self.setup_cors()
        self.setup_rate_limiting()
        
    def setup_routes(self):
        """Setup HTTP routes with authentication requirements"""
        # Public routes (no auth required)
        self.app.router.add_get('/', self.handle_health)
        self.app.router.add_get('/health', self.handle_detailed_health)
        self.app.router.add_get('/metrics', self.handle_metrics)
        self.app.router.add_post('/auth/login', self.handle_login)
        
        # Protected routes (auth required)
        self.app.router.add_post('/memory', self.handle_memory_capture)
        self.app.router.add_get('/memories', self.handle_list_memories)
        self.app.router.add_get('/search', self.handle_search_memories)
        self.app.router.add_put('/memory/{memory_id}', self.handle_update_memory)
        self.app.router.add_delete('/memory/{memory_id}', self.handle_delete_memory)
        
    def setup_cors(self):
        """Setup CORS with secure configuration"""
        # Parse allowed origins from settings
        allowed_origins = self.settings.allowed_origins.split(',') if self.settings.allowed_origins else ['http://localhost:3000']
        
        cors_defaults = {}
        for origin in allowed_origins:
            cors_defaults[origin.strip()] = aiohttp_cors.ResourceOptions(
                allow_credentials=True,
                expose_headers=["Authorization", "X-Request-ID"],
                allow_headers=["Content-Type", "Authorization", "X-API-Key"],
                allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"]
            )
        
        cors = aiohttp_cors.setup(self.app, defaults=cors_defaults)
        
        # Configure CORS on all routes
        for route in list(self.app.router.routes()):
            cors.add(route)
    
    def setup_rate_limiting(self):
        """Setup rate limiting"""
        self.limiter = Limiter(
            keyfunc=default_keyfunc,
            default_limits=[f"{self.settings.rate_limit_per_minute} per minute"]
        )
    
    @middleware
    async def auth_middleware(self, request: Request, handler):
        """Authentication middleware"""
        # Skip auth for public routes
        public_routes = ['/', '/auth/login']
        if request.path in public_routes or request.method == 'OPTIONS':
            return await handler(request)
        
        # Check for API key or JWT token
        auth_header = request.headers.get('Authorization', '')
        api_key = request.headers.get('X-API-Key', '')
        
        authenticated = False
        user_info = None
        
        # Try JWT authentication
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]
            try:
                user_info = auth_manager.verify_jwt_token(token)
                authenticated = True
                request['user'] = user_info
            except Exception as e:
                logger.debug(f"JWT verification failed: {e}")
        
        # Try API key authentication
        if not authenticated and api_key:
            if auth_manager.verify_api_key(api_key):
                authenticated = True
                request['api_key'] = True
        
        if not authenticated:
            return web.json_response({
                'error': 'Authentication required',
                'message': 'Please provide a valid JWT token or API key'
            }, status=401)
        
        # Add security headers
        response = await handler(request)
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        
        return response
    
    @middleware
    async def error_middleware(self, request: Request, handler):
        """Error handling middleware with Sentry tracking"""
        try:
            # Add request context for error tracking
            error_tracker.set_context("request", {
                "method": request.method,
                "path": request.path,
                "query": dict(request.query),
                "headers": {k: v for k, v in request.headers.items() 
                           if k.lower() not in ['authorization', 'x-api-key', 'cookie']}
            })
            
            return await handler(request)
        except web.HTTPException:
            raise
        except Exception as e:
            # Track error with Sentry
            error_tracker.capture_exception(e, extra={
                "request_path": request.path,
                "request_method": request.method,
                "user": request.get('user', {})
            })
            
            logger.error(f"Unhandled error: {e}", exc_info=True)
            return web.json_response({
                'error': 'Internal server error',
                'message': 'An unexpected error occurred'
            }, status=500)
    
    @with_error_tracking("api_initialization")
    async def initialize(self):
        """Initialize API server components"""
        # Validate security configuration
        if not self.settings.jwt_secret_key and not self.settings.api_key:
            logger.warning("⚠️  No authentication configured - server is vulnerable!")
            error_tracker.capture_message(
                "API server started without authentication",
                level="warning",
                extra={"environment": self.settings.environment}
            )
        
        # Initialize database
        if not await self.db.initialize():
            raise Exception("Failed to initialize database connection")
        
        # Create optimized memory store with AI assistant
        config = get_settings()
        self.memory = OptimizedMemoryStore(
            db=self.db,
            config=config,
            context="api_context"
        )
        
        # Warm up cache for better performance
        await self.memory.initialize_cache()
        
        logger.info("✅ Secure PUO Memo API Server initialized")
        
    async def cleanup(self):
        """Cleanup resources"""
        await self.db.cleanup()
    
    # Public endpoints
    async def handle_health(self, request: Request) -> Response:
        """Health check endpoint"""
        return web.json_response({
            "status": "healthy",
            "service": "secure-puo-memo-api",
            "version": "2.1.0",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "database": "connected" if self.db.pool else "disconnected",
            "ai_enabled": self.ai.enabled,
            "auth_enabled": bool(self.settings.jwt_secret_key or self.settings.api_key),
            "cache_enabled": self.settings.cache_enabled
        })
    
    async def handle_login(self, request: Request) -> Response:
        """Login endpoint for JWT token generation"""
        try:
            data = await request.json()
            
            # For demo purposes, we'll use a simple API key check
            # In production, you'd verify username/password against a user database
            api_key = data.get('api_key', '')
            
            if not auth_manager.verify_api_key(api_key):
                return web.json_response({
                    'error': 'Invalid credentials'
                }, status=401)
            
            # Generate JWT token
            token = auth_manager.generate_jwt_token(
                user_id='api_user',
                metadata={'source': 'api_login'}
            )
            
            return web.json_response({
                'access_token': token,
                'token_type': 'bearer',
                'expires_in': self.settings.jwt_expiration_hours * 3600
            })
            
        except Exception as e:
            logger.error(f"Login error: {e}")
            return web.json_response({
                'error': 'Login failed'
            }, status=400)
    
    # Protected endpoints (with rate limiting)
    @with_error_tracking("memory_capture")
    async def handle_memory_capture(self, request: Request) -> Response:
        """Handle memory capture from browser extension"""
        # Apply rate limiting
        await self.limiter.check(request)
        
        try:
            data = await request.json()
            
            # Input validation
            content = data.get('content', '').strip()
            if not content:
                return web.json_response({
                    'error': 'Content is required'
                }, status=400)
            
            if len(content) > 50000:  # 50KB limit
                return web.json_response({
                    'error': 'Content too large (max 50KB)'
                }, status=400)
            
            source = data.get('source', 'unknown')
            metadata = data.get('metadata', {})
            
            # Determine memory type based on source
            memory_type = {
                'browser': 'browser_capture',
                'manual': 'general',
                'api': 'api_capture'
            }.get(source, 'general')
            
            # Create memory with metadata
            result = await self.memory.create(
                content=content,
                memory_type=memory_type,
                title=metadata.get('title'),
                source_url=metadata.get('url'),
                tags=metadata.get('tags', []),
                context=metadata.get('context', 'browser')
            )
            
            # Log request (without sensitive content)
            logger.info(f"Memory created via API: {result.get('id')} from {source}")
            
            return web.json_response({
                'success': True,
                'memory_id': result.get('id'),
                'message': 'Memory captured successfully'
            })
            
        except Exception as e:
            logger.error(f"Memory capture error: {e}")
            return web.json_response({
                'error': 'Failed to capture memory',
                'message': str(e)
            }, status=500)
    
    async def handle_list_memories(self, request: Request) -> Response:
        """List recent memories"""
        await self.limiter.check(request)
        
        try:
            limit = int(request.query.get('limit', 20))
            offset = int(request.query.get('offset', 0))
            
            # Validate pagination
            limit = min(max(1, limit), 100)  # Between 1 and 100
            offset = max(0, offset)
            
            memories = await self.memory.list(limit=limit, offset=offset)
            
            return web.json_response({
                'success': True,
                'memories': memories,
                'pagination': {
                    'limit': limit,
                    'offset': offset,
                    'total': len(memories)
                }
            })
            
        except Exception as e:
            logger.error(f"List memories error: {e}")
            return web.json_response({
                'error': 'Failed to list memories'
            }, status=500)
    
    async def handle_search_memories(self, request: Request) -> Response:
        """Search memories"""
        await self.limiter.check(request)
        
        try:
            query = request.query.get('q', '').strip()
            if not query:
                return web.json_response({
                    'error': 'Search query is required'
                }, status=400)
            
            limit = min(int(request.query.get('limit', 10)), 50)
            search_type = request.query.get('type', 'hybrid')
            
            # Validate search type
            if search_type not in ['keyword', 'semantic', 'hybrid']:
                search_type = 'hybrid'
            
            if search_type == 'semantic':
                results = await self.memory.semantic_search(query, limit=limit)
            elif search_type == 'keyword':
                results = await self.memory.search(query, limit=limit)
            else:
                results = await self.memory.hybrid_search(query, limit=limit)
            
            return web.json_response({
                'success': True,
                'query': query,
                'results': results.get('results', []),
                'search_type': search_type,
                'count': results.get('count', 0)
            })
            
        except Exception as e:
            logger.error(f"Search error: {e}")
            return web.json_response({
                'error': 'Search failed'
            }, status=500)
    
    async def handle_update_memory(self, request: Request) -> Response:
        """Update a memory"""
        await self.limiter.check(request)
        
        memory_id = request.match_info['memory_id']
        
        try:
            data = await request.json()
            
            # Only allow updating certain fields
            allowed_fields = ['content', 'title', 'tags']
            updates = {k: v for k, v in data.items() if k in allowed_fields}
            
            if not updates:
                return web.json_response({
                    'error': 'No valid fields to update'
                }, status=400)
            
            # Validate content length if updating
            if 'content' in updates and len(updates['content']) > 50000:
                return web.json_response({
                    'error': 'Content too large (max 50KB)'
                }, status=400)
            
            result = await self.memory.update(memory_id, **updates)
            
            return web.json_response({
                'success': True,
                'message': 'Memory updated successfully'
            })
            
        except Exception as e:
            logger.error(f"Update error: {e}")
            return web.json_response({
                'error': 'Failed to update memory'
            }, status=500)
    
    async def handle_delete_memory(self, request: Request) -> Response:
        """Delete a memory"""
        await self.limiter.check(request)
        
        memory_id = request.match_info['memory_id']
        
        try:
            await self.memory.delete(memory_id)
            
            return web.json_response({
                'success': True,
                'message': 'Memory deleted successfully'
            })
            
        except Exception as e:
            logger.error(f"Delete error: {e}")
            return web.json_response({
                'error': 'Failed to delete memory'
            }, status=500)


async def main():
    """Run the secure API server"""
    server = SecurePuoMemoAPI()
    await server.initialize()
    
    runner = web.AppRunner(server.app)
    await runner.setup()
    
    settings = get_settings()
    site = web.TCPSite(runner, settings.api_host, settings.api_port)
    
    logger.info(f"🔒 Secure API Server starting on http://{settings.api_host}:{settings.api_port}")
    logger.info(f"🔐 Authentication: {'Enabled' if (settings.jwt_secret_key or settings.api_key) else 'DISABLED (WARNING!)'}")
    logger.info(f"🌐 CORS Origins: {settings.allowed_origins}")
    logger.info(f"⏱️  Rate Limit: {settings.rate_limit_per_minute} requests/minute")
    
    await site.start()
    
    try:
        await asyncio.Event().wait()
    except KeyboardInterrupt:
        pass
    finally:
        await server.cleanup()
        await runner.cleanup()


    async def handle_detailed_health(self, request: Request) -> Response:
        """Detailed health check with performance metrics"""
        health_data = await performance_monitor.get_health_status()
        
        # Determine HTTP status based on health
        status_code = {
            'healthy': 200,
            'warning': 200,
            'degraded': 503
        }.get(health_data['status'], 503)
        
        return web.json_response(health_data, status=status_code)
    
    async def handle_metrics(self, request: Request) -> Response:
        """Get performance metrics"""
        metrics = await performance_monitor.get_metrics()
        
        # Add memory store stats if available
        if self.memory:
            memory_stats = await self.memory.get_performance_stats()
            metrics['memory_store'] = memory_stats
        
        return web.json_response(metrics)


if __name__ == '__main__':
    asyncio.run(main())