#!/usr/bin/env python3
"""
Production API Server v2 - Enhanced for Supabase/Railway
"""
import os
import sys
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional
import re

# Setup logging first
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger(__name__)

# Import core dependencies
try:
    from aiohttp import web
    from aiohttp.web import Request, Response, middleware
    import aiohttp_cors
    AIOHTTP_AVAILABLE = True
except ImportError:
    logger.warning("aiohttp not available, using FastAPI")
    AIOHTTP_AVAILABLE = False
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    import uvicorn

try:
    import asyncpg
    ASYNCPG_AVAILABLE = True
except ImportError:
    logger.warning("asyncpg not available")
    ASYNCPG_AVAILABLE = False

# Path setup
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

# Import our modules
try:
    from src.core.database import DatabaseConnection
    from src.core.memory import MemoryStore
    DB_MODULES_AVAILABLE = True
except ImportError:
    logger.warning("Database modules not available")
    DB_MODULES_AVAILABLE = False


def parse_database_url(url: str) -> dict:
    """Parse DATABASE_URL into components"""
    pattern = r'postgresql://(?P<user>[^:]+):(?P<password>[^@]+)@(?P<host>[^:]+):(?P<port>\d+)/(?P<database>.+)'
    match = re.match(pattern, url)
    if match:
        return {
            'host': match.group('host'),
            'port': int(match.group('port')),
            'user': match.group('user'),
            'password': match.group('password'),
            'database': match.group('database')
        }
    return {}


class ProductionAPIv2:
    """Production API with full Supabase integration"""
    
    def __init__(self):
        self.db_config = self._get_db_config()
        self.db_available = False
        self.db_connection = None
        self.memory_store = None
        
        if AIOHTTP_AVAILABLE:
            self.app = web.Application(middlewares=[self.error_middleware])
            self.setup_aiohttp_routes()
            self.setup_cors()
        else:
            self.app = FastAPI(
                title="PUO Memo Platform API",
                version="2.0.0",
                description="Production deployment with Supabase"
            )
            self.setup_fastapi_routes()
    
    def _get_db_config(self):
        """Get database configuration from environment"""
        # Try DATABASE_URL first (Railway standard)
        database_url = os.getenv('DATABASE_URL')
        if database_url:
            config = parse_database_url(database_url)
            if config:
                logger.info("Using DATABASE_URL for configuration")
                return config
        
        # Fall back to individual variables
        return {
            'host': os.getenv('DB_HOST', ''),
            'port': int(os.getenv('DB_PORT', '5432')),
            'database': os.getenv('DB_NAME', 'postgres'),
            'user': os.getenv('DB_USER', 'postgres'),
            'password': os.getenv('DB_PASSWORD', '')
        }
    
    @middleware
    async def error_middleware(self, request, handler):
        """Global error handling"""
        try:
            return await handler(request)
        except Exception as e:
            logger.error(f"Unhandled error: {e}", exc_info=True)
            return web.json_response({
                'error': 'Internal server error',
                'message': str(e) if os.getenv('DEBUG') else 'An error occurred'
            }, status=500)
    
    def setup_aiohttp_routes(self):
        """Setup routes for aiohttp"""
        self.app.router.add_get('/', self.handle_root)
        self.app.router.add_get('/health', self.handle_health)
        self.app.router.add_get('/deployment-test', self.handle_deployment_test)
        
        # Memory endpoints
        self.app.router.add_post('/memories', self.handle_create_memory)
        self.app.router.add_get('/memories', self.handle_list_memories)
        self.app.router.add_get('/search', self.handle_search_memories)
        self.app.router.add_get('/memory/{memory_id}', self.handle_get_memory)
        
        # Auth placeholder
        self.app.router.add_post('/auth/register', self.handle_auth_placeholder)
    
    def setup_fastapi_routes(self):
        """Setup routes for FastAPI"""
        @self.app.get("/")
        async def root():
            return await self.get_root_response()
        
        @self.app.get("/health")
        async def health():
            return await self.get_health_response()
    
    def setup_cors(self):
        """Setup CORS"""
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
    
    async def initialize(self):
        """Initialize services with Supabase"""
        # Test database connection
        if ASYNCPG_AVAILABLE and self.db_config.get('host') and self.db_config.get('password'):
            try:
                # Test connection
                logger.info(f"Connecting to Supabase at {self.db_config['host']}...")
                
                conn = await asyncpg.connect(
                    host=self.db_config['host'],
                    port=self.db_config['port'],
                    database=self.db_config['database'],
                    user=self.db_config['user'],
                    password=self.db_config['password'],
                    ssl='require'  # Supabase requires SSL
                )
                
                # Test query
                version = await conn.fetchval('SELECT version()')
                logger.info(f"✅ Connected to: {version}")
                
                # Check tables
                tables = await conn.fetch("""
                    SELECT table_name 
                    FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name IN ('memory_entities', 'project_contexts')
                """)
                
                logger.info(f"✅ Found {len(tables)} required tables")
                
                await conn.close()
                self.db_available = True
                
                # Initialize database connection if modules available
                if DB_MODULES_AVAILABLE:
                    try:
                        # Create proper database connection
                        os.environ['DB_HOST'] = self.db_config['host']
                        os.environ['DB_PORT'] = str(self.db_config['port'])
                        os.environ['DB_NAME'] = self.db_config['database']
                        os.environ['DB_USER'] = self.db_config['user']
                        os.environ['DB_PASSWORD'] = self.db_config['password']
                        
                        self.db_connection = DatabaseConnection()
                        await self.db_connection.initialize()
                        
                        # Create memory store
                        self.memory_store = MemoryStore(self.db_connection)
                        logger.info("✅ Memory store initialized")
                    except Exception as e:
                        logger.warning(f"Could not initialize memory store: {e}")
                
            except Exception as e:
                logger.error(f"Database connection failed: {e}")
                self.db_available = False
        else:
            logger.warning("Database configuration missing")
        
        logger.info(f"🚀 Production API v2 initialized")
        logger.info(f"📊 Database: {'Connected to Supabase' if self.db_available else 'Not configured'}")
        logger.info(f"🧠 Memory Store: {'Ready' if self.memory_store else 'Not available'}")
    
    async def get_root_response(self):
        """Get root endpoint response"""
        return {
            "name": "PUO Memo Platform API",
            "version": "2.0.0",
            "status": "operational",
            "environment": "production",
            "database": {
                "connected": self.db_available,
                "host": self.db_config['host'] if self.db_available else None,
                "type": "Supabase PostgreSQL" if self.db_available else None
            },
            "features": {
                "memories": self.memory_store is not None,
                "authentication": bool(os.getenv('JWT_SECRET_KEY')),
                "ai": bool(os.getenv('GEMINI_API_KEY')),
                "cache": bool(os.getenv('REDIS_URL'))
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
            "supabase": self.db_available,
            "environment": os.getenv("RAILWAY_ENVIRONMENT", "production")
        }
    
    # Handlers
    async def handle_root(self, request: Request) -> Response:
        return web.json_response(await self.get_root_response())
    
    async def handle_health(self, request: Request) -> Response:
        return web.json_response(await self.get_health_response())
    
    async def handle_deployment_test(self, request: Request) -> Response:
        return web.json_response({
            "status": "NEW DEPLOYMENT ACTIVE!",
            "version": "2.0.0",
            "message": "Production API with Supabase integration",
            "database": {
                "connected": self.db_available,
                "type": "Supabase" if self.db_available else None
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
    
    async def handle_auth_placeholder(self, request: Request) -> Response:
        return web.json_response({
            "message": "Auth endpoint ready",
            "version": "2.0.0"
        })
    
    async def handle_create_memory(self, request: Request) -> Response:
        """Create memory with Supabase"""
        if not self.memory_store:
            return web.json_response({
                "error": "Memory store not initialized",
                "hint": "Check database configuration"
            }, status=503)
        
        try:
            data = await request.json()
            result = await self.memory_store.create(
                content=data.get('content', ''),
                title=data.get('title'),
                tags=data.get('tags', [])
            )
            return web.json_response(result)
        except Exception as e:
            logger.error(f"Create memory error: {e}")
            return web.json_response({
                "error": str(e)
            }, status=400)
    
    async def handle_list_memories(self, request: Request) -> Response:
        """List memories from Supabase"""
        if not self.memory_store:
            return web.json_response({
                "memories": [],
                "message": "Memory store not initialized"
            })
        
        try:
            limit = int(request.query.get('limit', 10))
            offset = int(request.query.get('offset', 0))
            
            result = await self.memory_store.list(limit=limit, offset=offset)
            return web.json_response(result)
        except Exception as e:
            logger.error(f"List memories error: {e}")
            return web.json_response({
                "error": str(e),
                "memories": []
            }, status=500)
    
    async def handle_search_memories(self, request: Request) -> Response:
        """Search memories in Supabase"""
        if not self.memory_store:
            return web.json_response({
                "results": [],
                "message": "Memory store not initialized"
            })
        
        try:
            query = request.query.get('q', '')
            limit = int(request.query.get('limit', 10))
            
            result = await self.memory_store.search(query=query, limit=limit)
            return web.json_response(result)
        except Exception as e:
            logger.error(f"Search error: {e}")
            return web.json_response({
                "error": str(e),
                "results": []
            }, status=500)
    
    async def handle_get_memory(self, request: Request) -> Response:
        """Get single memory"""
        if not self.memory_store:
            return web.json_response({
                "error": "Memory store not initialized"
            }, status=503)
        
        memory_id = request.match_info['memory_id']
        
        try:
            result = await self.memory_store.get(memory_id)
            if result:
                return web.json_response(result)
            else:
                return web.json_response({
                    "error": "Memory not found"
                }, status=404)
        except Exception as e:
            logger.error(f"Get memory error: {e}")
            return web.json_response({
                "error": str(e)
            }, status=500)


async def run_aiohttp():
    """Run with aiohttp"""
    server = ProductionAPIv2()
    await server.initialize()
    
    runner = web.AppRunner(server.app)
    await runner.setup()
    
    port = int(os.getenv('PORT', '8000'))
    site = web.TCPSite(runner, '0.0.0.0', port)
    
    logger.info(f"🚀 Production API v2 running on http://0.0.0.0:{port}")
    await site.start()
    
    import asyncio
    await asyncio.Event().wait()


def run_fastapi():
    """Run with FastAPI"""
    server = ProductionAPIv2()
    port = int(os.getenv('PORT', '8000'))
    
    import asyncio
    asyncio.run(server.initialize())
    
    logger.info(f"🚀 Production API v2 (FastAPI) running on http://0.0.0.0:{port}")
    uvicorn.run(server.app, host="0.0.0.0", port=port)


if __name__ == "__main__":
    if AIOHTTP_AVAILABLE:
        import asyncio
        asyncio.run(run_aiohttp())
    else:
        run_fastapi()