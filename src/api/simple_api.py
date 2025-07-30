"""
Simplified API with robust database handling for production
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
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

class AdminRequest(BaseModel):
    admin_secret: str

# Database helper to parse Supabase URLs correctly
def parse_database_url(url: str) -> dict:
    """Parse database URL and return connection parameters"""
    # Handle postgres:// -> postgresql://
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    
    # Parse the URL
    from urllib.parse import urlparse, parse_qs
    
    parsed = urlparse(url)
    
    # Extract query parameters
    query_params = parse_qs(parsed.query)
    
    # Build connection dict
    conn_params = {
        'host': parsed.hostname,
        'port': parsed.port or 5432,
        'user': parsed.username,
        'password': parsed.password,
        'database': parsed.path.lstrip('/').split('?')[0]
    }
    
    # Handle SSL for Supabase
    if 'supabase' in parsed.hostname or 'pooler.supabase' in parsed.hostname:
        conn_params['ssl'] = 'require'
    
    return conn_params

# Database initialization
async def init_db():
    """Initialize database connection pool"""
    global db_pool
    database_url = os.getenv('DATABASE_URL')
    
    if not database_url:
        raise ValueError("DATABASE_URL environment variable is required")
    
    print(f"Initializing database connection...")
    
    try:
        # Parse connection parameters
        conn_params = parse_database_url(database_url)
        
        # For pgbouncer compatibility
        conn_params['statement_cache_size'] = 0
        conn_params['server_settings'] = {
            'application_name': 'puo_memo_api'
        }
        
        # Create pool with parsed parameters
        db_pool = await asyncpg.create_pool(
            **conn_params,
            min_size=1,
            max_size=10,
            command_timeout=60
        )
        
        # Test the connection
        async with db_pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        
        print("✅ Database connection successful")
        
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        print(f"Error type: {type(e).__name__}")
        # Don't re-raise in production - let health check handle it
        
async def get_db():
    """Get database connection from pool"""
    if not db_pool:
        await init_db()
    
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    
    return db_pool

# Authentication
async def verify_api_key(x_api_key: Optional[str] = Header(None)):
    """Verify API key from header"""
    if not x_api_key:
        raise HTTPException(status_code=401, detail="API key required")
    
    # Hash the provided key
    key_hash = hashlib.sha256(x_api_key.encode()).hexdigest()
    
    # Check in database
    try:
        db = await get_db()
        async with db.acquire() as conn:
            result = await conn.fetchrow("""
                SELECT id, user_id, scopes 
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
                'scopes': result['scopes'] or []
            }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Auth error: {e}")
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")

# Endpoints
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    db_status = "unknown"
    
    try:
        if db_pool:
            async with db_pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
                db_status = "healthy"
        else:
            db_status = "not initialized"
    except Exception as e:
        db_status = f"error: {type(e).__name__}"
    
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
@app.post("/api/v1/admin/create-api-key")
async def create_api_key(request: AdminRequest):
    """Create an API key (requires admin secret)"""
    if request.admin_secret != os.getenv('ADMIN_SECRET', 'change-me-in-production'):
        raise HTTPException(status_code=403, detail="Invalid admin secret")
    
    # Generate API key
    api_key = f"puo_{secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()
    
    try:
        db = await get_db()
        async with db.acquire() as conn:
            # First, check if we have any users
            user_id = await conn.fetchval("SELECT id FROM users LIMIT 1")
            
            if not user_id:
                # Create a default user with required fields
                user_id = await conn.fetchval("""
                    INSERT INTO users (email, password_hash, full_name, is_active, is_verified)
                    VALUES ('admin@puo-memo.com', 'not-used', 'Admin User', true, true)
                    RETURNING id
                """)
            
            # Extract prefix and suffix from API key
            key_prefix = api_key[:7]  # "puo_xxx"
            key_suffix = api_key[-4:]  # last 4 chars
            
            # Create API key with correct schema
            await conn.execute("""
                INSERT INTO api_keys (
                    key_hash, key_prefix, key_suffix, name, 
                    scopes, user_id, created_at, is_active
                )
                VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, true)
            """, key_hash, key_prefix, key_suffix, 'API Key', 
                ['memory:create', 'memory:read', 'memory:delete'], user_id)
            
            return {
                "api_key": api_key,
                "user_id": str(user_id),
                "message": "Save this API key - it won't be shown again!"
            }
    except Exception as e:
        print(f"Error creating API key: {e}")
        raise HTTPException(status_code=500, detail=f"Error creating API key: {str(e)}")

# Root endpoint
@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "PUO Memo API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }

# Startup event - don't fail the entire app if DB is down
@app.on_event("startup")
async def startup_event():
    """Initialize on startup"""
    try:
        await init_db()
    except Exception as e:
        print(f"Warning: Database initialization failed on startup: {e}")
        print("API will attempt to connect on first request")

# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    """Clean up on shutdown"""
    if db_pool:
        await db_pool.close()
        print("Database pool closed")

# For local testing
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)