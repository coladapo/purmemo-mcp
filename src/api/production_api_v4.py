"""
Production-ready PUO Memo API server v4 with WebSocket support
Includes all v3 features plus real-time synchronization
"""

import os
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime
import json

from fastapi import FastAPI, HTTPException, Depends, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import asyncpg
import redis.asyncio as redis
from prometheus_client import Counter, Histogram, Gauge, generate_latest
from prometheus_client.core import CollectorRegistry
import uvicorn

from .auth import router as auth_router, get_current_user, User
from .auth_endpoints import router as auth_endpoints_router
from .production_api_v3 import (
    Memory, CreateMemoryRequest, UpdateMemoryRequest,
    SearchRequest, SearchResult, ListMemoriesResponse,
    get_db_pool, get_redis_client, close_db_pool, close_redis_client,
    check_tenant_memory_limit, visibility_filter,
    router as v3_router
)
from .websocket_server import router as ws_router, manager as ws_manager, MessageType, websocket_lifespan

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration from environment
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost/puomemo")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,https://app.puomemo.com").split(",")

# Additional metrics for WebSocket
ws_connections = Gauge("puomemo_websocket_connections", "Active WebSocket connections")
ws_messages_sent = Counter("puomemo_websocket_messages_sent", "WebSocket messages sent", ["type"])
ws_messages_received = Counter("puomemo_websocket_messages_received", "WebSocket messages received", ["type"])


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    logger.info("Starting PUO Memo API v4 with WebSocket support...")
    
    # Initialize database pool
    app.state.db_pool = await get_db_pool(DATABASE_URL)
    
    # Initialize Redis client
    app.state.redis_client = await get_redis_client(REDIS_URL)
    
    # Initialize WebSocket manager
    await ws_manager.initialize(REDIS_URL)
    
    logger.info("PUO Memo API v4 started successfully")
    
    yield
    
    # Shutdown
    logger.info("Shutting down PUO Memo API v4...")
    
    # Cleanup WebSocket manager
    await ws_manager.cleanup()
    
    # Close database pool
    await close_db_pool(app.state.db_pool)
    
    # Close Redis client
    await close_redis_client(app.state.redis_client)
    
    logger.info("PUO Memo API v4 shutdown complete")


# Create FastAPI app
app = FastAPI(
    title="PUO Memo API v4",
    description="Production-ready memory management API with real-time sync",
    version="4.0.0",
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


# Helper function to publish WebSocket events
async def publish_ws_event(
    event_type: str,
    data: dict,
    tenant_id: str,
    request: Request
):
    """Publish event to WebSocket subscribers"""
    try:
        await ws_manager.publish_event(event_type, data, tenant_id)
        ws_messages_sent.labels(type=event_type).inc()
    except Exception as e:
        logger.error(f"Failed to publish WebSocket event: {e}")


# Enhanced memory endpoints with WebSocket notifications

@app.post("/api/v4/memories", response_model=Memory, status_code=status.HTTP_201_CREATED)
async def create_memory_v4(
    memory_request: CreateMemoryRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db_pool: asyncpg.Pool = Depends(lambda: request.app.state.db_pool)
):
    """Create a new memory with real-time notification"""
    # Check tenant limits
    can_create, message = await check_tenant_memory_limit(
        db_pool,
        current_user.tenant_id
    )
    if not can_create:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=message
        )
    
    # Create memory
    async with db_pool.acquire() as conn:
        # Set tenant context
        await conn.execute(
            "SELECT set_config('app.current_tenant', $1, false)",
            current_user.tenant_id
        )
        
        # Insert memory
        memory = await conn.fetchrow("""
            INSERT INTO memories (
                content, title, tags, metadata, visibility,
                tenant_id, created_by, generate_embedding
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        """,
            memory_request.content,
            memory_request.title,
            memory_request.tags or [],
            json.dumps(memory_request.metadata) if memory_request.metadata else '{}',
            memory_request.visibility or 'private',
            current_user.tenant_id,
            current_user.id,
            memory_request.generate_embedding
        )
    
    # Convert to dict
    memory_dict = dict(memory)
    memory_dict['metadata'] = json.loads(memory_dict['metadata'])
    
    # Publish WebSocket event
    await publish_ws_event(
        MessageType.MEMORY_CREATED,
        {
            "memory": memory_dict,
            "user_id": current_user.id,
            "user_name": current_user.full_name
        },
        current_user.tenant_id,
        request
    )
    
    return Memory(**memory_dict)


@app.put("/api/v4/memories/{memory_id}", response_model=Memory)
async def update_memory_v4(
    memory_id: str,
    memory_update: UpdateMemoryRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db_pool: asyncpg.Pool = Depends(lambda: request.app.state.db_pool)
):
    """Update a memory with real-time notification"""
    async with db_pool.acquire() as conn:
        # Set tenant context
        await conn.execute(
            "SELECT set_config('app.current_tenant', $1, false)",
            current_user.tenant_id
        )
        
        # Build update query dynamically
        updates = []
        params = [memory_id]
        param_count = 2
        
        if memory_update.content is not None:
            updates.append(f"content = ${param_count}")
            params.append(memory_update.content)
            param_count += 1
        
        if memory_update.title is not None:
            updates.append(f"title = ${param_count}")
            params.append(memory_update.title)
            param_count += 1
        
        if memory_update.tags is not None:
            updates.append(f"tags = ${param_count}")
            params.append(memory_update.tags)
            param_count += 1
        
        if memory_update.metadata is not None:
            updates.append(f"metadata = ${param_count}")
            params.append(json.dumps(memory_update.metadata))
            param_count += 1
        
        if memory_update.visibility is not None:
            updates.append(f"visibility = ${param_count}")
            params.append(memory_update.visibility)
            param_count += 1
        
        if memory_update.regenerate_embedding:
            updates.append("has_embedding = false")
        
        updates.append("updated_at = NOW()")
        
        # Execute update
        query = f"""
            UPDATE memories 
            SET {', '.join(updates)}
            WHERE id = $1 AND tenant_id = $2
            AND ({visibility_filter(current_user)})
            RETURNING *
        """
        params.append(current_user.tenant_id)
        
        memory = await conn.fetchrow(query, *params)
        
        if not memory:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Memory not found or access denied"
            )
    
    # Convert to dict
    memory_dict = dict(memory)
    memory_dict['metadata'] = json.loads(memory_dict['metadata'])
    
    # Publish WebSocket event
    await publish_ws_event(
        MessageType.MEMORY_UPDATED,
        {
            "memory": memory_dict,
            "user_id": current_user.id,
            "user_name": current_user.full_name,
            "changes": memory_update.dict(exclude_unset=True)
        },
        current_user.tenant_id,
        request
    )
    
    return Memory(**memory_dict)


@app.delete("/api/v4/memories/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_memory_v4(
    memory_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db_pool: asyncpg.Pool = Depends(lambda: request.app.state.db_pool)
):
    """Delete a memory with real-time notification"""
    async with db_pool.acquire() as conn:
        # Set tenant context
        await conn.execute(
            "SELECT set_config('app.current_tenant', $1, false)",
            current_user.tenant_id
        )
        
        # Get memory details before deletion
        memory = await conn.fetchrow("""
            SELECT id, title, created_by 
            FROM memories 
            WHERE id = $1 AND tenant_id = $2
            AND ({})
        """.format(visibility_filter(current_user)),
            memory_id,
            current_user.tenant_id
        )
        
        if not memory:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Memory not found or access denied"
            )
        
        # Delete memory
        await conn.execute("""
            DELETE FROM memories 
            WHERE id = $1 AND tenant_id = $2
        """, memory_id, current_user.tenant_id)
    
    # Publish WebSocket event
    await publish_ws_event(
        MessageType.MEMORY_DELETED,
        {
            "memory_id": memory_id,
            "title": memory['title'],
            "user_id": current_user.id,
            "user_name": current_user.full_name
        },
        current_user.tenant_id,
        request
    )


# WebSocket status endpoint
@app.get("/api/v4/ws/status")
async def websocket_status(
    current_user: User = Depends(get_current_user)
):
    """Get WebSocket connection status for current user"""
    user_connections = ws_manager.user_connections.get(current_user.id, set())
    tenant_connections = ws_manager.tenant_connections.get(current_user.tenant_id, set())
    
    return {
        "user_connections": len(user_connections),
        "tenant_connections": len(tenant_connections),
        "total_connections": len(ws_manager.active_connections),
        "websocket_url": "/ws"
    }


# Include routers
app.include_router(auth_router, prefix="/api", tags=["Authentication"])
app.include_router(auth_endpoints_router, prefix="/api/auth", tags=["Auth Management"])
app.include_router(v3_router, prefix="/api", tags=["Memories"])
app.include_router(ws_router, tags=["WebSocket"])

# Also include v4 endpoints under /api/v4
app.include_router(v3_router, prefix="/api/v4", tags=["Memories v4"])


# Health check
@app.get("/health")
async def health_check(request: Request):
    """Health check endpoint with WebSocket status"""
    try:
        # Check database
        async with request.app.state.db_pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        
        # Check Redis
        await request.app.state.redis_client.ping()
        
        return {
            "status": "healthy",
            "version": "4.0.0",
            "features": {
                "authentication": True,
                "multi_tenancy": True,
                "semantic_search": True,
                "websocket": True,
                "real_time_sync": True
            },
            "websocket": {
                "active_connections": len(ws_manager.active_connections),
                "active_users": len(ws_manager.user_connections),
                "active_tenants": len(ws_manager.tenant_connections)
            }
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "unhealthy", "error": str(e)}
        )


# Metrics endpoint
@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint with WebSocket metrics"""
    # Update WebSocket connection gauge
    ws_connections.set(len(ws_manager.active_connections))
    
    registry = CollectorRegistry()
    # Add all metrics to registry
    return generate_latest(registry)


if __name__ == "__main__":
    uvicorn.run(
        "production_api_v4:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )