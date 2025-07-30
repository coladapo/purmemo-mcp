"""
Minimal production API for Render deployment
Focuses on getting live quickly with core features
"""

import os
import json
import hashlib
import secrets
from datetime import datetime
from typing import Optional, List, Dict, Any
import asyncio
import asyncpg
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

# Initialize FastAPI app
app = FastAPI(
    title="PUO Memo API",
    description="Memory management API",
    version="1.0.0",
    docs_url="/docs"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv('CORS_ORIGINS', '*').split(','),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global database pool
db_pool: Optional[asyncpg.Pool] = None

# Models
class MemoryCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=50000)
    title: Optional[str] = Field(None, max_length=200)
    tags: List[str] = Field(default_factory=list)
    type: Optional[str] = Field("note", max_length=50)
    context: Optional[str] = Field(None, max_length=255)

class MemoryResponse(BaseModel):
    id: str
    content: str
    title: Optional[str]
    tags: List[str]
    type: Optional[str]
    context: Optional[str]
    created_at: datetime
    updated_at: datetime

class HealthResponse(BaseModel):
    status: str
    database: str
    version: str
    timestamp: datetime

# Database initialization
async def init_db():
    """Initialize database connection pool"""
    global db_pool
    database_url = os.getenv('DATABASE_URL')
    
    if not database_url:
        raise ValueError("DATABASE_URL environment variable is required")
    
    # Add SSL requirement for Supabase
    if "supabase" in database_url:
        database_url = database_url.replace("postgresql://", "postgresql://")
        if "sslmode" not in database_url:
            database_url += "?sslmode=require"
    
    # Create connection pool with pgbouncer compatibility
    db_pool = await asyncpg.create_pool(
        database_url,
        min_size=1,
        max_size=10,
        command_timeout=60,
        statement_cache_size=0,  # Required for pgbouncer
        ssl='require' if "supabase" in database_url else None
    )

async def get_db():
    """Get database connection from pool"""
    if not db_pool:
        await init_db()
    return db_pool

# Authentication
async def verify_api_key(x_api_key: Optional[str] = Header(None)):
    """Verify API key from header"""
    if not x_api_key:
        raise HTTPException(status_code=401, detail="API key required")
    
    # Hash the provided key
    key_hash = hashlib.sha256(x_api_key.encode()).hexdigest()
    
    # Check in database
    db = await get_db()
    async with db.acquire() as conn:
        result = await conn.fetchrow("""
            SELECT id, user_id, permissions 
            FROM api_keys 
            WHERE key_hash = $1 AND is_active = true
        """, key_hash)
        
        if not result:
            raise HTTPException(status_code=401, detail="Invalid API key")
        
        # Update last used
        await conn.execute("""
            UPDATE api_keys 
            SET last_used_at = CURRENT_TIMESTAMP 
            WHERE id = $1
        """, result['id'])
        
        return {
            'api_key_id': result['id'],
            'user_id': result['user_id'],
            'permissions': result['permissions']
        }

# Endpoints
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    db_status = "unknown"
    
    try:
        db = await get_db()
        async with db.acquire() as conn:
            await conn.fetchval("SELECT 1")
            db_status = "healthy"
    except Exception as e:
        db_status = f"error: {str(e)}"
    
    return HealthResponse(
        status="healthy" if db_status == "healthy" else "degraded",
        database=db_status,
        version="1.0.0",
        timestamp=datetime.utcnow()
    )

@app.post("/api/v1/memories", response_model=MemoryResponse)
async def create_memory(
    memory: MemoryCreate,
    auth: dict = Depends(verify_api_key)
):
    """Create a new memory"""
    db = await get_db()
    
    async with db.acquire() as conn:
        # Insert memory
        result = await conn.fetchrow("""
            INSERT INTO memories (
                content, title, tags, type, context,
                user_id, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING id, created_at, updated_at
        """, memory.content, memory.title, memory.tags, 
            memory.type, memory.context, auth['user_id'])
        
        return MemoryResponse(
            id=str(result['id']),
            content=memory.content,
            title=memory.title,
            tags=memory.tags,
            type=memory.type,
            context=memory.context,
            created_at=result['created_at'],
            updated_at=result['updated_at']
        )

@app.get("/api/v1/memories", response_model=List[MemoryResponse])
async def list_memories(
    limit: int = 50,
    offset: int = 0,
    auth: dict = Depends(verify_api_key)
):
    """List memories"""
    db = await get_db()
    
    async with db.acquire() as conn:
        # Fetch memories for user
        rows = await conn.fetch("""
            SELECT id, content, title, tags, type, context,
                   created_at, updated_at
            FROM memories
            WHERE user_id = $1 AND deleted_at IS NULL
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        """, auth['user_id'], limit, offset)
        
        return [
            MemoryResponse(
                id=str(row['id']),
                content=row['content'],
                title=row['title'],
                tags=row['tags'] or [],
                type=row['type'],
                context=row['context'],
                created_at=row['created_at'],
                updated_at=row['updated_at']
            )
            for row in rows
        ]

@app.get("/api/v1/memories/{memory_id}", response_model=MemoryResponse)
async def get_memory(
    memory_id: str,
    auth: dict = Depends(verify_api_key)
):
    """Get a specific memory"""
    db = await get_db()
    
    async with db.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT id, content, title, tags, type, context,
                   created_at, updated_at
            FROM memories
            WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
        """, memory_id, auth['user_id'])
        
        if not row:
            raise HTTPException(status_code=404, detail="Memory not found")
        
        return MemoryResponse(
            id=str(row['id']),
            content=row['content'],
            title=row['title'],
            tags=row['tags'] or [],
            type=row['type'],
            context=row['context'],
            created_at=row['created_at'],
            updated_at=row['updated_at']
        )

@app.delete("/api/v1/memories/{memory_id}")
async def delete_memory(
    memory_id: str,
    auth: dict = Depends(verify_api_key)
):
    """Delete a memory"""
    db = await get_db()
    
    async with db.acquire() as conn:
        # Soft delete
        result = await conn.execute("""
            UPDATE memories
            SET deleted_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
        """, memory_id, auth['user_id'])
        
        if result == "UPDATE 0":
            raise HTTPException(status_code=404, detail="Memory not found")
        
        return {"message": "Memory deleted successfully"}

# Admin endpoint to create first API key
class AdminRequest(BaseModel):
    admin_secret: str

@app.post("/api/v1/admin/create-api-key")
async def create_api_key(request: AdminRequest):
    """Create an API key (requires admin secret)"""
    if request.admin_secret != os.getenv('ADMIN_SECRET', 'change-me-in-production'):
        raise HTTPException(status_code=403, detail="Invalid admin secret")
    
    # Generate API key
    api_key = f"puo_{secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()
    
    db = await get_db()
    async with db.acquire() as conn:
        # First, check if we have any users
        user_id = await conn.fetchval("SELECT id FROM users LIMIT 1")
        
        if not user_id:
            # Create a default user
            user_id = await conn.fetchval("""
                INSERT INTO users (email, name, created_at)
                VALUES ('admin@puo-memo.com', 'Admin User', CURRENT_TIMESTAMP)
                RETURNING id
            """)
        
        # Create API key
        await conn.execute("""
            INSERT INTO api_keys (key_hash, name, permissions, user_id, created_at)
            VALUES ($1, 'First API Key', '["memory:create", "memory:read", "memory:delete"]', $2, CURRENT_TIMESTAMP)
        """, key_hash, user_id)
        
        return {
            "api_key": api_key,
            "user_id": str(user_id),
            "message": "Save this API key - it won't be shown again!"
        }

# Startup and shutdown events
@app.on_event("startup")
async def startup_event():
    """Initialize database on startup"""
    await init_db()
    print("Database pool initialized")

@app.on_event("shutdown")
async def shutdown_event():
    """Clean up on shutdown"""
    if db_pool:
        await db_pool.close()
        print("Database pool closed")

# For local testing
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)