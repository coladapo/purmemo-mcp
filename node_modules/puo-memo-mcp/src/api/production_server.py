#!/usr/bin/env python3
"""
Production API Server for Railway Deployment
Handles missing optional dependencies gracefully
"""
import os
import sys
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional

# Setup logging first
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger(__name__)

# Import core dependencies (these must exist)
try:
    from aiohttp import web
    from aiohttp.web import Request, Response, middleware
    import aiohttp_cors
    AIOHTTP_AVAILABLE = True
except ImportError:
    logger.warning("aiohttp not available, using FastAPI fallback")
    AIOHTTP_AVAILABLE = False
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    import uvicorn

# Import optional dependencies
try:
    import jwt
    JWT_AVAILABLE = True
except ImportError:
    logger.warning("JWT not available - authentication disabled")
    JWT_AVAILABLE = False

try:
    import asyncpg
    ASYNCPG_AVAILABLE = True
except ImportError:
    logger.warning("asyncpg not available - database features disabled")
    ASYNCPG_AVAILABLE = False

# Import our modules with fallbacks
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

try:
    from src.utils.config import get_settings
    SETTINGS_AVAILABLE = True
except ImportError:
    logger.warning("Settings module not available - using environment variables")
    SETTINGS_AVAILABLE = False
    
    class Settings:
        def __init__(self):
            self.api_host = os.getenv('API_HOST', '0.0.0.0')
            self.api_port = int(os.getenv('PORT', '8000'))  # Railway uses PORT
            self.db_host = os.getenv('DB_HOST', '')
            self.db_name = os.getenv('DB_NAME', '')
            self.db_user = os.getenv('DB_USER', '')
            self.db_password = os.getenv('DB_PASSWORD', '')
            self.jwt_secret_key = os.getenv('JWT_SECRET_KEY', '')
            self.allowed_origins = os.getenv('ALLOWED_ORIGINS', '*')
            self.rate_limit_per_minute = int(os.getenv('RATE_LIMIT_PER_MINUTE', '100'))
    
    def get_settings():
        return Settings()


class ProductionAPI:
    """Production API that works with minimal dependencies"""
    
    def __init__(self):
        self.settings = get_settings()
        self.db_available = False
        self.auth_available = JWT_AVAILABLE and bool(self.settings.jwt_secret_key)
        
        if AIOHTTP_AVAILABLE:
            self.app = web.Application(middlewares=[self.error_middleware])
            self.setup_aiohttp_routes()
            self.setup_cors()
        else:
            self.app = FastAPI(
                title="PUO Memo Platform API",
                version="2.0.0",
                description="Production deployment"
            )
            self.setup_fastapi_routes()
    
    @middleware
    async def error_middleware(self, request, handler):
        """Global error handling"""
        try:
            return await handler(request)
        except Exception as e:
            logger.error(f"Unhandled error: {e}")
            return web.json_response({
                'error': 'Internal server error',
                'message': str(e) if os.getenv('DEBUG') else 'An error occurred'
            }, status=500)
    
    def setup_aiohttp_routes(self):
        """Setup routes for aiohttp"""
        self.app.router.add_get('/', self.handle_root)
        self.app.router.add_get('/health', self.handle_health)
        self.app.router.add_get('/deployment-test', self.handle_deployment_test)
        self.app.router.add_post('/auth/register', self.handle_auth_placeholder)
        
        # Memory endpoints
        self.app.router.add_post('/memories', self.handle_create_memory)
        self.app.router.add_get('/memories', self.handle_list_memories)
        self.app.router.add_get('/search', self.handle_search_memories)
    
    def setup_fastapi_routes(self):
        """Setup routes for FastAPI fallback"""
        @self.app.get("/")
        async def root():
            return await self.get_root_response()
        
        @self.app.get("/health")
        async def health():
            return await self.get_health_response()
        
        @self.app.get("/deployment-test")
        async def deployment_test():
            return {
                "status": "NEW DEPLOYMENT ACTIVE!",
                "version": "2.0.0",
                "message": "Production API running successfully"
            }
    
    def setup_cors(self):
        """Setup CORS for browser access"""
        if AIOHTTP_AVAILABLE:
            cors = aiohttp_cors.setup(self.app, defaults={
                "*": aiohttp_cors.ResourceOptions(
                    allow_credentials=True,
                    expose_headers="*",
                    allow_headers="*",
                    allow_methods="*"
                )
            })
            for route in list(self.app.router.routes()):
                cors.add(route)
        else:
            # FastAPI CORS is set up in __init__
            self.app.add_middleware(
                CORSMiddleware,
                allow_origins=["*"],
                allow_credentials=True,
                allow_methods=["*"],
                allow_headers=["*"],
            )
    
    async def initialize(self):
        """Initialize services"""
        # Test database connection if available
        if ASYNCPG_AVAILABLE and self.settings.db_host:
            try:
                conn = await asyncpg.connect(
                    host=self.settings.db_host,
                    database=self.settings.db_name,
                    user=self.settings.db_user,
                    password=self.settings.db_password
                )
                await conn.fetchval('SELECT 1')
                await conn.close()
                self.db_available = True
                logger.info("✅ Database connection successful")
            except Exception as e:
                logger.warning(f"Database connection failed: {e}")
                self.db_available = False
        
        logger.info(f"🚀 Production API initialized")
        logger.info(f"📊 Database: {'Connected' if self.db_available else 'Not available'}")
        logger.info(f"🔐 Authentication: {'Enabled' if self.auth_available else 'Disabled'}")
    
    async def get_root_response(self):
        """Get root endpoint response"""
        return {
            "name": "PUO Memo Platform API",
            "version": "2.0.0",
            "status": "operational",
            "environment": "production",
            "features": {
                "database": self.db_available,
                "authentication": self.auth_available,
                "ai": False,  # Not implemented yet
                "cache": False  # Not implemented yet
            },
            "endpoints": {
                "health": "/health",
                "deployment_test": "/deployment-test",
                "memories": "/memories",
                "search": "/search"
            }
        }
    
    async def get_health_response(self):
        """Get health check response"""
        return {
            "status": "healthy",
            "version": "2.0.0",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "database": "connected" if self.db_available else "not configured",
            "environment": os.getenv("RAILWAY_ENVIRONMENT", "production")
        }
    
    # aiohttp handlers
    async def handle_root(self, request: Request) -> Response:
        return web.json_response(await self.get_root_response())
    
    async def handle_health(self, request: Request) -> Response:
        return web.json_response(await self.get_health_response())
    
    async def handle_deployment_test(self, request: Request) -> Response:
        return web.json_response({
            "status": "NEW DEPLOYMENT ACTIVE!",
            "version": "2.0.0",
            "message": "Production API with full features running successfully",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
    
    async def handle_auth_placeholder(self, request: Request) -> Response:
        return web.json_response({
            "message": "Auth endpoint active - v2.0.0 production API",
            "status": "registration_endpoint_ready",
            "auth_enabled": self.auth_available
        })
    
    async def handle_create_memory(self, request: Request) -> Response:
        """Create memory endpoint - placeholder"""
        if not self.db_available:
            return web.json_response({
                "error": "Database not configured"
            }, status=503)
        
        try:
            data = await request.json()
            return web.json_response({
                "success": True,
                "message": "Memory creation endpoint ready",
                "data": data
            })
        except Exception as e:
            return web.json_response({
                "error": str(e)
            }, status=400)
    
    async def handle_list_memories(self, request: Request) -> Response:
        """List memories endpoint - placeholder"""
        return web.json_response({
            "memories": [],
            "message": "Memory listing endpoint ready",
            "database": self.db_available
        })
    
    async def handle_search_memories(self, request: Request) -> Response:
        """Search memories endpoint - placeholder"""
        query = request.query.get('q', '')
        return web.json_response({
            "results": [],
            "query": query,
            "message": "Search endpoint ready",
            "database": self.db_available
        })


async def run_aiohttp():
    """Run with aiohttp"""
    server = ProductionAPI()
    await server.initialize()
    
    runner = web.AppRunner(server.app)
    await runner.setup()
    
    port = int(os.getenv('PORT', '8000'))  # Railway provides PORT
    site = web.TCPSite(runner, '0.0.0.0', port)
    
    logger.info(f"🚀 Production API Server running on http://0.0.0.0:{port}")
    await site.start()
    
    # Keep running
    import asyncio
    await asyncio.Event().wait()


def run_fastapi():
    """Run with FastAPI fallback"""
    server = ProductionAPI()
    port = int(os.getenv('PORT', '8000'))
    
    # Run initialization
    import asyncio
    asyncio.run(server.initialize())
    
    logger.info(f"🚀 Production API Server (FastAPI) running on http://0.0.0.0:{port}")
    uvicorn.run(server.app, host="0.0.0.0", port=port)


if __name__ == "__main__":
    if AIOHTTP_AVAILABLE:
        import asyncio
        asyncio.run(run_aiohttp())
    else:
        run_fastapi()