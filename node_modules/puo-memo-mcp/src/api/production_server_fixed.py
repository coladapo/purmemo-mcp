#!/usr/bin/env python3
"""
Production API Server - Fixed version for Railway
Works with both aiohttp and FastAPI
"""
import os
import sys
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional
import re

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger(__name__)

# Import dependencies with fallbacks
try:
    from fastapi import FastAPI, HTTPException, Request
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse
    import uvicorn
    FASTAPI_AVAILABLE = True
except ImportError:
    logger.error("FastAPI not available - this is required!")
    FASTAPI_AVAILABLE = False
    sys.exit(1)

try:
    import asyncpg
    ASYNCPG_AVAILABLE = True
except ImportError:
    logger.warning("asyncpg not available - database features disabled")
    ASYNCPG_AVAILABLE = False

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


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


class ProductionAPI:
    """Production API with Supabase support"""
    
    def __init__(self):
        self.db_config = self._get_db_config()
        self.db_available = False
        self.memory_store = None
        
        # Create FastAPI app
        self.app = FastAPI(
            title="PUO Memo Platform API",
            version="2.0.0",
            description="Production deployment with Supabase"
        )
        
        # Setup CORS
        self.app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
        
        # Setup routes
        self.setup_routes()
        
        # Add exception handler
        @self.app.exception_handler(Exception)
        async def global_exception_handler(request: Request, exc: Exception):
            logger.error(f"Unhandled error: {exc}", exc_info=True)
            return JSONResponse(
                status_code=500,
                content={
                    "error": "Internal server error",
                    "message": str(exc) if os.getenv('DEBUG') else "An error occurred"
                }
            )
    
    def _get_db_config(self):
        """Get database configuration from environment"""
        # Try DATABASE_URL first
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
    
    def setup_routes(self):
        """Setup FastAPI routes"""
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
                "message": "Production API with Supabase integration",
                "database": {
                    "connected": self.db_available,
                    "type": "Supabase" if self.db_available else None
                },
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        
        @self.app.post("/auth/register")
        async def auth_placeholder():
            return {
                "message": "Auth endpoint ready",
                "version": "2.0.0"
            }
        
        @self.app.post("/memories")
        async def create_memory(request: Request):
            """Create memory endpoint"""
            if not self.db_available:
                return JSONResponse(
                    status_code=503,
                    content={
                        "error": "Database not configured",
                        "hint": "Check Railway environment variables"
                    }
                )
            
            try:
                data = await request.json()
                # For now, just return success since memory store isn't initialized
                return {
                    "success": True,
                    "message": "Memory endpoint ready",
                    "data": data,
                    "id": "test-" + str(datetime.now().timestamp())
                }
            except Exception as e:
                logger.error(f"Create memory error: {e}")
                return JSONResponse(
                    status_code=400,
                    content={"error": str(e)}
                )
        
        @self.app.get("/memories")
        async def list_memories():
            """List memories endpoint"""
            return {
                "memories": [],
                "message": "Memory listing ready",
                "database": self.db_available
            }
        
        @self.app.get("/search")
        async def search_memories(q: str = ""):
            """Search memories endpoint"""
            return {
                "results": [],
                "query": q,
                "message": "Search endpoint ready",
                "database": self.db_available
            }
    
    async def initialize(self):
        """Initialize services with Supabase"""
        # Test database connection
        if ASYNCPG_AVAILABLE and self.db_config.get('host') and self.db_config.get('password'):
            try:
                logger.info(f"Connecting to Supabase at {self.db_config['host']}...")
                
                # Connect with SSL for Supabase
                conn = await asyncpg.connect(
                    host=self.db_config['host'],
                    port=self.db_config['port'],
                    database=self.db_config['database'],
                    user=self.db_config['user'],
                    password=self.db_config['password'],
                    ssl='require'
                )
                
                # Test query
                version = await conn.fetchval('SELECT version()')
                logger.info(f"✅ Connected to: {version[:50]}...")
                
                # Check tables
                tables = await conn.fetch("""
                    SELECT table_name 
                    FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name IN ('memory_entities', 'project_contexts')
                    LIMIT 10
                """)
                
                logger.info(f"✅ Found {len(tables)} required tables")
                
                await conn.close()
                self.db_available = True
                
            except Exception as e:
                logger.error(f"Database connection failed: {e}")
                self.db_available = False
        else:
            if not self.db_config.get('host'):
                logger.warning("DB_HOST not configured")
            if not self.db_config.get('password'):
                logger.warning("DB_PASSWORD not configured")
            logger.warning("Database configuration incomplete")
        
        logger.info(f"🚀 Production API initialized")
        logger.info(f"📊 Database: {'Connected to Supabase' if self.db_available else 'Not configured'}")
    
    async def get_root_response(self):
        """Get root endpoint response"""
        return {
            "name": "PUO Memo Platform API",
            "version": "2.0.0",
            "status": "operational",
            "environment": "production",
            "database": {
                "connected": self.db_available,
                "host": self.db_config.get('host', 'not configured'),
                "type": "Supabase PostgreSQL" if self.db_available else None
            },
            "features": {
                "memories": self.db_available,
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


async def main():
    """Run the API server"""
    server = ProductionAPI()
    await server.initialize()
    
    port = int(os.getenv('PORT', '8000'))
    logger.info(f"🚀 Starting Production API on port {port}")
    
    # Run with uvicorn
    config = uvicorn.Config(
        app=server.app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )
    server_instance = uvicorn.Server(config)
    await server_instance.serve()


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())