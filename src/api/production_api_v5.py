"""
Production-ready PUO Memo API server v5 with Unified Memory Search
Includes all v4 features plus unified search across memories and memory_entities tables
"""

import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import asyncpg
import redis.asyncio as redis
from prometheus_client import generate_latest
from prometheus_client.core import CollectorRegistry
import uvicorn

# Import all v4 components
from .production_api_v4 import (
    DATABASE_URL, REDIS_URL, ALLOWED_ORIGINS,
    get_db_pool, get_redis_client, close_db_pool, close_redis_client,
    ws_manager, ws_connections, ws_messages_sent, ws_messages_received
)

# Import routers
from .auth import router as auth_router
from .auth_endpoints import router as auth_endpoints_router
from .production_api_v3 import router as v3_router
from .websocket_server import router as ws_router
from .unified_memory_api import router as unified_router

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    logger.info("Starting PUO Memo API v5 with Unified Memory Search...")
    
    # Initialize database pool
    app.state.db_pool = await get_db_pool(DATABASE_URL)
    
    # Initialize Redis client
    app.state.redis_client = await get_redis_client(REDIS_URL)
    
    # Initialize WebSocket manager
    await ws_manager.initialize(REDIS_URL)
    
    logger.info("PUO Memo API v5 started successfully")
    
    yield
    
    # Shutdown
    logger.info("Shutting down PUO Memo API v5...")
    
    # Cleanup WebSocket manager
    await ws_manager.cleanup()
    
    # Close database pool
    await close_db_pool(app.state.db_pool)
    
    # Close Redis client
    await close_redis_client(app.state.redis_client)
    
    logger.info("PUO Memo API v5 shutdown complete")


# Create FastAPI app
app = FastAPI(
    title="PUO Memo API v5",
    description="Production-ready memory management API with unified memory search",
    version="5.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Health check
@app.get("/health")
async def health_check(request: Request):
    """Health check endpoint with unified memory status"""
    try:
        # Check database
        async with request.app.state.db_pool.acquire() as conn:
            # Test both tables
            await conn.fetchval("SELECT 1 FROM memories LIMIT 1")
            await conn.fetchval("SELECT 1 FROM memory_entities LIMIT 1")
        
        # Check Redis
        await request.app.state.redis_client.ping()
        
        return {
            "status": "healthy",
            "version": "5.0.0",
            "features": {
                "authentication": True,
                "multi_tenancy": True,
                "semantic_search": True,
                "websocket": True,
                "real_time_sync": True,
                "unified_memory_search": True
            },
            "websocket": {
                "active_connections": len(ws_manager.active_connections),
                "active_users": len(ws_manager.user_connections),
                "active_tenants": len(ws_manager.tenant_connections)
            },
            "unified_search": {
                "enabled": True,
                "tables": ["memories", "memory_entities"],
                "note": "June 2024 memories are accessible via unified search"
            }
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "error": str(e)}
        )


# Root endpoint
@app.get("/")
async def root():
    return {
        "name": "PUO Memo API",
        "version": "5.0.0",
        "status": "healthy",
        "features": [
            "authentication",
            "multi-tenancy",
            "semantic-search",
            "vector-embeddings",
            "websocket-sync",
            "unified-memory-search"
        ],
        "endpoints": {
            "v3": "/api/v3",
            "v4": "/api/v4",
            "v5": "/api/v5 (unified search)",
            "auth": "/api/auth",
            "websocket": "/ws",
            "health": "/health",
            "metrics": "/metrics"
        }
    }


# Metrics endpoint
@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint"""
    # Update WebSocket connection gauge
    ws_connections.set(len(ws_manager.active_connections))
    
    registry = CollectorRegistry()
    return generate_latest(registry)


# Include all routers
app.include_router(auth_router, prefix="/api", tags=["Authentication"])
app.include_router(auth_endpoints_router, prefix="/api/auth", tags=["Auth Management"])
app.include_router(v3_router, prefix="/api/v3", tags=["Memories v3"])
app.include_router(v3_router, prefix="/api/v4", tags=["Memories v4"])
app.include_router(unified_router, tags=["Unified Memory v5"])
app.include_router(ws_router, tags=["WebSocket"])


# Backward compatibility - also expose unified search under v4
@app.get("/api/v4/memories/unified/search")
async def v4_unified_search_redirect(request: Request):
    """Redirect v4 unified search to v5"""
    # Get query params
    query_params = str(request.url.query)
    redirect_url = f"/api/v5/memories/search"
    if query_params:
        redirect_url += f"?{query_params}"
    
    return JSONResponse(
        status_code=307,
        headers={"Location": redirect_url},
        content={"message": "Please use /api/v5/memories/search for unified search"}
    )


if __name__ == "__main__":
    uvicorn.run(
        "production_api_v5:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )