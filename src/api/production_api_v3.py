#!/usr/bin/env python3
"""
Production PUO Memo API Server V3
Complete with Authentication, Multi-tenancy, and Semantic Search
"""

import os
import asyncio
import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any, Set, Tuple
from contextlib import asynccontextmanager
import hashlib

from fastapi import FastAPI, HTTPException, Request, Response, Depends, Header, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, validator
import uvicorn
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import Column, String, DateTime, JSON, Index, text, func, Float, ForeignKey, Boolean, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.exc import IntegrityError
import redis.asyncio as redis
from prometheus_client import Counter, Histogram, Gauge, generate_latest
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
from pgvector.asyncpg import register_vector

# Import our modules
from embeddings import EmbeddingConfig, EmbeddingService, HybridSearcher, get_embedding_service
from auth import (
    User, Tenant, get_current_user, get_current_tenant, 
    require_permission, tenant_filter
)
import auth_endpoints

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Environment configuration
class Settings:
    # Database
    DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql+asyncpg://user:pass@localhost/puomemo')
    DATABASE_POOL_SIZE = int(os.getenv('DATABASE_POOL_SIZE', '20'))
    DATABASE_MAX_OVERFLOW = int(os.getenv('DATABASE_MAX_OVERFLOW', '40'))
    
    # Redis
    REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379')
    CACHE_TTL = int(os.getenv('CACHE_TTL', '3600'))
    
    # Security
    RATE_LIMIT_REQUESTS = int(os.getenv('RATE_LIMIT_REQUESTS', '100'))
    RATE_LIMIT_WINDOW = int(os.getenv('RATE_LIMIT_WINDOW', '60'))
    ALLOWED_ORIGINS = os.getenv('ALLOWED_ORIGINS', '*').split(',')
    
    # Monitoring
    SENTRY_DSN = os.getenv('SENTRY_DSN')
    ENVIRONMENT = os.getenv('ENVIRONMENT', 'development')
    
    # Search
    MAX_SEARCH_RESULTS = int(os.getenv('MAX_SEARCH_RESULTS', '100'))
    SEARCH_TIMEOUT = int(os.getenv('SEARCH_TIMEOUT', '5'))
    DEFAULT_SEARCH_TYPE = os.getenv('DEFAULT_SEARCH_TYPE', 'hybrid')
    
    # Embeddings
    EMBEDDING_PROVIDER = os.getenv('EMBEDDING_PROVIDER', 'sentence-transformers')
    EMBEDDING_MODEL = os.getenv('EMBEDDING_MODEL', 'all-MiniLM-L6-v2')
    EMBEDDING_DIMENSION = int(os.getenv('EMBEDDING_DIMENSION', '384'))
    EMBEDDING_BATCH_SIZE = int(os.getenv('EMBEDDING_BATCH_SIZE', '32'))
    ENABLE_EMBEDDING_CACHE = os.getenv('ENABLE_EMBEDDING_CACHE', 'true').lower() == 'true'

settings = Settings()

# Initialize Sentry
if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        integrations=[
            FastApiIntegration(transaction_style="endpoint"),
            SqlalchemyIntegration(),
        ],
        environment=settings.ENVIRONMENT,
        traces_sample_rate=0.1 if settings.ENVIRONMENT == 'production' else 1.0,
    )

# Prometheus metrics
request_count = Counter('puomemo_requests_total', 'Total requests', ['method', 'endpoint', 'status'])
request_duration = Histogram('puomemo_request_duration_seconds', 'Request duration', ['method', 'endpoint'])
active_connections = Gauge('puomemo_active_connections', 'Active connections')
memory_count = Counter('puomemo_memories_created_total', 'Total memories created', ['tenant'])
search_count = Counter('puomemo_searches_total', 'Total searches performed', ['search_type', 'tenant'])
embedding_generation_time = Histogram('puomemo_embedding_generation_seconds', 'Time to generate embeddings')
cache_hits = Counter('puomemo_cache_hits_total', 'Cache hits', ['operation'])
cache_misses = Counter('puomemo_cache_misses_total', 'Cache misses', ['operation'])

# Custom vector type for pgvector
from sqlalchemy.types import UserDefinedType

class Vector(UserDefinedType):
    def get_col_spec(self, **kw):
        return f"VECTOR({settings.EMBEDDING_DIMENSION})"
    
    def bind_processor(self, dialect):
        def process(value):
            if value is None:
                return None
            return value if isinstance(value, str) else json.dumps(value)
        return process
    
    def result_processor(self, dialect, coltype):
        def process(value):
            if value is None:
                return None
            return json.loads(value) if isinstance(value, str) else value
        return process

# Database models
Base = declarative_base()

class Memory(Base):
    __tablename__ = 'memories'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='SET NULL'), index=True)
    content = Column(String, nullable=False)
    title = Column(String(255))
    tags = Column(JSON, default=list)
    metadata = Column(JSON, default=dict)
    embedding = Column(Vector)
    visibility = Column(String(20), default='private')  # private, team, public
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    __table_args__ = (
        Index('idx_memories_tenant_created', 'tenant_id', 'created_at'),
        Index('idx_memories_tenant_visibility', 'tenant_id', 'visibility'),
        Index('idx_memories_tags', 'tags', postgresql_using='gin'),
        Index('idx_memories_content_search', 'content', postgresql_using='gin', postgresql_ops={'content': 'gin_trgm_ops'}),
        Index('idx_memories_title_search', 'title', postgresql_using='gin', postgresql_ops={'title': 'gin_trgm_ops'}),
    )

# Pydantic models
class MemoryCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=100000)
    title: Optional[str] = Field(None, max_length=255)
    tags: List[str] = Field(default_factory=list, max_items=50)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    visibility: str = Field('private', regex="^(private|team|public)$")
    force: bool = Field(False, description="Skip duplicate check")
    generate_embedding: bool = Field(True, description="Generate embedding for semantic search")

class MemoryUpdate(BaseModel):
    content: Optional[str] = Field(None, min_length=1, max_length=100000)
    title: Optional[str] = Field(None, max_length=255)
    tags: Optional[List[str]] = Field(None, max_items=50)
    metadata: Optional[Dict[str, Any]] = None
    visibility: Optional[str] = Field(None, regex="^(private|team|public)$")
    regenerate_embedding: bool = Field(False, description="Regenerate embedding")

class MemoryResponse(BaseModel):
    id: str
    tenant_id: str
    created_by: Optional[str]
    content: str
    title: Optional[str]
    tags: List[str]
    metadata: Dict[str, Any]
    visibility: str
    has_embedding: bool
    created_at: datetime
    updated_at: datetime

class SearchQuery(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    search_type: str = Field(settings.DEFAULT_SEARCH_TYPE, regex="^(keyword|semantic|hybrid)$")
    limit: int = Field(10, ge=1, le=settings.MAX_SEARCH_RESULTS)
    offset: int = Field(0, ge=0)
    tags: Optional[List[str]] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    visibility: Optional[List[str]] = Field(None, description="Filter by visibility")
    include_entities: bool = Field(False)
    similarity_threshold: float = Field(0.7, ge=0.0, le=1.0)
    keyword_weight: float = Field(0.5, ge=0.0, le=1.0)
    semantic_weight: float = Field(0.5, ge=0.0, le=1.0)
    
    @validator('semantic_weight')
    def validate_weights(cls, v, values):
        if 'keyword_weight' in values:
            if abs(values['keyword_weight'] + v - 1.0) > 0.01:
                raise ValueError('keyword_weight + semantic_weight must equal 1.0')
        return v

# Dependencies
async def get_db() -> AsyncSession:
    async with async_session() as session:
        yield session

async def get_redis() -> redis.Redis:
    return redis_client

# Cache helpers
async def cache_get(key: str, redis: redis.Redis) -> Optional[Any]:
    try:
        value = await redis.get(key)
        if value:
            cache_hits.labels(operation='get').inc()
            return json.loads(value)
        cache_misses.labels(operation='get').inc()
        return None
    except (redis.RedisError, json.JSONDecodeError) as e:
        logger.error(f"Cache get error: {e}")
        return None

async def cache_set(key: str, value: Any, redis: redis.Redis, ttl: int = None):
    try:
        await redis.set(
            key,
            json.dumps(value, default=str),
            ex=ttl or settings.CACHE_TTL
        )
    except (redis.RedisError, json.JSONEncodeError) as e:
        logger.error(f"Cache set error: {e}")

async def invalidate_cache_pattern(pattern: str, redis: redis.Redis):
    try:
        async for key in redis.scan_iter(match=pattern):
            await redis.delete(key)
    except redis.RedisError as e:
        logger.error(f"Cache invalidation error: {e}")

# Rate limiting with tenant awareness
async def rate_limit(
    request: Request,
    current_user: User = Depends(get_current_user),
    redis: redis.Redis = Depends(get_redis)
):
    key = f"rate_limit:{current_user.tenant_id}:{current_user.id}:{request.url.path}"
    
    try:
        pipe = redis.pipeline()
        pipe.incr(key)
        pipe.expire(key, settings.RATE_LIMIT_WINDOW)
        current, _ = await pipe.execute()
        
        if current > settings.RATE_LIMIT_REQUESTS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Max {settings.RATE_LIMIT_REQUESTS} requests per {settings.RATE_LIMIT_WINDOW} seconds"
            )
    except redis.RedisError:
        logger.error("Redis error during rate limiting")

# Background task to generate embeddings
async def generate_embedding_task(
    memory_id: str,
    tenant_id: str,
    memory_data: dict
):
    try:
        with embedding_generation_time.time():
            embedding = await embedding_service.embed_memory(memory_data)
        
        async with async_session() as db:
            # Set tenant context for RLS
            await db.execute(
                text("SELECT set_tenant_context(:tenant_id, :user_id)"),
                {"tenant_id": tenant_id, "user_id": memory_data.get('created_by')}
            )
            
            await db.execute(
                text("""
                    UPDATE memories 
                    SET embedding = :embedding::vector,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = :id AND tenant_id = :tenant_id
                """),
                {
                    "embedding": json.dumps(embedding),
                    "id": memory_id,
                    "tenant_id": tenant_id
                }
            )
            await db.commit()
        
        await invalidate_cache_pattern(f"memories:{tenant_id}:*", redis_client)
        
        logger.info(f"Generated embedding for memory {memory_id}")
    except Exception as e:
        logger.error(f"Failed to generate embedding for memory {memory_id}: {e}")

# Initialize resources
@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine, async_session, redis_client, embedding_service, hybrid_searcher
    
    # Initialize database with pgvector
    engine = create_async_engine(
        settings.DATABASE_URL,
        pool_size=settings.DATABASE_POOL_SIZE,
        max_overflow=settings.DATABASE_MAX_OVERFLOW,
        pool_pre_ping=True,
        echo=settings.ENVIRONMENT == 'development',
        connect_args={
            "server_settings": {"jit": "off"},
            "command_timeout": 60
        }
    )
    
    # Register pgvector extension
    async with engine.connect() as conn:
        await register_vector(conn.connection)
    
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    # Run initialization scripts
    async with engine.begin() as conn:
        # Run init scripts
        for script in ['init-db.sql', 'auth-schema.sql']:
            script_path = os.path.join(os.path.dirname(__file__), '../../docker', script)
            if os.path.exists(script_path):
                with open(script_path, 'r') as f:
                    sql_script = f.read()
                    for statement in sql_script.split(';'):
                        if statement.strip():
                            try:
                                await conn.execute(text(statement))
                            except Exception as e:
                                logger.warning(f"SQL statement failed (may be normal): {e}")
        
        await conn.run_sync(Base.metadata.create_all)
    
    # Initialize Redis
    redis_client = await redis.from_url(
        settings.REDIS_URL,
        encoding="utf-8",
        decode_responses=True
    )
    
    # Initialize embedding service
    embedding_config = EmbeddingConfig(
        provider=settings.EMBEDDING_PROVIDER,
        model=settings.EMBEDDING_MODEL,
        dimension=settings.EMBEDDING_DIMENSION,
        batch_size=settings.EMBEDDING_BATCH_SIZE,
        cache_embeddings=settings.ENABLE_EMBEDDING_CACHE
    )
    embedding_service = get_embedding_service(embedding_config)
    hybrid_searcher = HybridSearcher(embedding_service)
    
    # Make auth dependencies available
    auth_endpoints.get_db = get_db
    auth_endpoints.get_redis = get_redis
    
    logger.info(f"Application startup complete - Environment: {settings.ENVIRONMENT}")
    
    yield
    
    await redis_client.close()
    await engine.dispose()
    logger.info("Application shutdown complete")

# Create FastAPI app
app = FastAPI(
    title="PUO Memo API V3",
    version="3.0.0",
    description="Production API with Auth, Multi-tenancy, and Semantic Search",
    docs_url="/docs" if settings.ENVIRONMENT != 'production' else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != 'production' else None,
    lifespan=lifespan
)

# Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if settings.ENVIRONMENT == 'production':
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["*.puomemo.com", "puomemo.com"]
    )

# Include auth endpoints
app.include_router(auth_endpoints.router)

# Static files for UI (if needed)
if os.path.exists("static"):
    app.mount("/static", StaticFiles(directory="static"), name="static")

# API Endpoints
@app.get("/")
async def root():
    return {
        "name": "PUO Memo API",
        "version": "3.0.0",
        "status": "healthy",
        "features": [
            "authentication",
            "multi-tenancy", 
            "semantic-search",
            "vector-embeddings"
        ]
    }

@app.get("/health")
async def health_check():
    try:
        async with async_session() as db:
            await db.execute(text("SELECT 1"))
        
        await redis_client.ping()
        
        test_embedding = await embedding_service.embed_query("test")
        
        return {
            "status": "healthy",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "version": "3.0.0",
            "services": {
                "database": "healthy",
                "redis": "healthy",
                "embeddings": "healthy"
            }
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "error": str(e)}
        )

@app.post("/api/memories", response_model=MemoryResponse, status_code=status.HTTP_201_CREATED)
async def create_memory(
    memory: MemoryCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    redis: redis.Redis = Depends(get_redis),
    _: None = Depends(rate_limit)
):
    """Create a new memory with tenant isolation"""
    memory_count.labels(tenant=current_tenant.slug).inc()
    
    # Check tenant limits
    if 'max_memories' in current_tenant.settings:
        count_result = await db.execute(
            text("SELECT COUNT(*) FROM memories WHERE tenant_id = :tenant_id"),
            {"tenant_id": current_tenant.id}
        )
        count = count_result.scalar()
        
        if count >= current_tenant.settings['max_memories']:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=f"Memory limit reached. Upgrade your plan to create more memories."
            )
    
    # Set tenant context for RLS
    await db.execute(
        text("SELECT set_tenant_context(:tenant_id, :user_id)"),
        {"tenant_id": current_tenant.id, "user_id": current_user.id}
    )
    
    # Check for duplicates
    if not memory.force:
        result = await db.execute(
            text("""
                SELECT id FROM memories 
                WHERE tenant_id = :tenant_id 
                AND created_by = :user_id
                AND similarity(content, :content) > 0.9
                AND created_at > CURRENT_TIMESTAMP - INTERVAL '5 minutes'
                LIMIT 1
            """),
            {
                "tenant_id": current_tenant.id,
                "user_id": current_user.id,
                "content": memory.content
            }
        )
        if result.first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Similar memory created recently"
            )
    
    # Create memory
    memory_id = str(uuid.uuid4())
    memory_data = {
        "id": memory_id,
        "tenant_id": str(current_tenant.id),
        "created_by": str(current_user.id),
        "content": memory.content,
        "title": memory.title,
        "tags": memory.tags,
        "metadata": memory.metadata,
        "visibility": memory.visibility,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }
    
    await db.execute(
        text("""
            INSERT INTO memories (
                id, tenant_id, created_by, content, title, 
                tags, metadata, visibility, created_at, updated_at
            )
            VALUES (
                :id, :tenant_id, :created_by, :content, :title,
                :tags::jsonb, :metadata::jsonb, :visibility, :created_at, :updated_at
            )
        """),
        memory_data
    )
    await db.commit()
    
    # Generate embedding in background
    if memory.generate_embedding:
        background_tasks.add_task(
            generate_embedding_task,
            memory_id,
            str(current_tenant.id),
            memory_data
        )
    
    # Invalidate cache
    await invalidate_cache_pattern(f"memories:{current_tenant.id}:*", redis)
    
    return MemoryResponse(**memory_data, has_embedding=False)

@app.get("/api/memories/{memory_id}", response_model=MemoryResponse)
async def get_memory(
    memory_id: str,
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific memory with permission checks"""
    # Set tenant context
    await db.execute(
        text("SELECT set_tenant_context(:tenant_id, :user_id)"),
        {"tenant_id": current_tenant.id, "user_id": current_user.id}
    )
    
    result = await db.execute(
        text("""
            SELECT 
                id, tenant_id, created_by, content, title, 
                tags, metadata, visibility, embedding IS NOT NULL as has_embedding,
                created_at, updated_at
            FROM memories
            WHERE id = :memory_id
            AND tenant_id = :tenant_id
            AND (
                visibility = 'public' OR
                (visibility = 'team') OR
                (visibility = 'private' AND created_by = :user_id)
            )
        """),
        {
            "memory_id": memory_id,
            "tenant_id": current_tenant.id,
            "user_id": current_user.id
        }
    )
    
    row = result.first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Memory not found"
        )
    
    return MemoryResponse(
        id=str(row[0]),
        tenant_id=str(row[1]),
        created_by=str(row[2]) if row[2] else None,
        content=row[3],
        title=row[4],
        tags=row[5] or [],
        metadata=row[6] or {},
        visibility=row[7],
        has_embedding=row[8],
        created_at=row[9],
        updated_at=row[10]
    )

@app.put("/api/memories/{memory_id}", response_model=MemoryResponse)
async def update_memory(
    memory_id: str,
    update: MemoryUpdate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    redis: redis.Redis = Depends(get_redis)
):
    """Update a memory"""
    # Set tenant context
    await db.execute(
        text("SELECT set_tenant_context(:tenant_id, :user_id)"),
        {"tenant_id": current_tenant.id, "user_id": current_user.id}
    )
    
    # Check ownership
    result = await db.execute(
        text("""
            SELECT created_by FROM memories
            WHERE id = :memory_id AND tenant_id = :tenant_id
        """),
        {"memory_id": memory_id, "tenant_id": current_tenant.id}
    )
    
    row = result.first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Memory not found"
        )
    
    if str(row[0]) != current_user.id and 'memories.manage' not in current_user.permissions:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own memories"
        )
    
    # Build update query
    updates = []
    params = {"memory_id": memory_id, "tenant_id": current_tenant.id}
    
    if update.content is not None:
        updates.append("content = :content")
        params["content"] = update.content
    
    if update.title is not None:
        updates.append("title = :title")
        params["title"] = update.title
    
    if update.tags is not None:
        updates.append("tags = :tags::jsonb")
        params["tags"] = json.dumps(update.tags)
    
    if update.metadata is not None:
        updates.append("metadata = :metadata::jsonb")
        params["metadata"] = json.dumps(update.metadata)
    
    if update.visibility is not None:
        updates.append("visibility = :visibility")
        params["visibility"] = update.visibility
    
    updates.append("updated_at = CURRENT_TIMESTAMP")
    
    await db.execute(
        text(f"""
            UPDATE memories 
            SET {', '.join(updates)}
            WHERE id = :memory_id AND tenant_id = :tenant_id
        """),
        params
    )
    await db.commit()
    
    # Regenerate embedding if requested
    if update.regenerate_embedding:
        memory_data = await get_memory(memory_id, current_user, current_tenant, db)
        background_tasks.add_task(
            generate_embedding_task,
            memory_id,
            str(current_tenant.id),
            memory_data.dict()
        )
    
    # Invalidate cache
    await invalidate_cache_pattern(f"memories:{current_tenant.id}:*", redis)
    
    return await get_memory(memory_id, current_user, current_tenant, db)

@app.delete("/api/memories/{memory_id}")
async def delete_memory(
    memory_id: str,
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    redis: redis.Redis = Depends(get_redis)
):
    """Delete a memory"""
    # Set tenant context
    await db.execute(
        text("SELECT set_tenant_context(:tenant_id, :user_id)"),
        {"tenant_id": current_tenant.id, "user_id": current_user.id}
    )
    
    # Check ownership
    result = await db.execute(
        text("""
            SELECT created_by FROM memories
            WHERE id = :memory_id AND tenant_id = :tenant_id
        """),
        {"memory_id": memory_id, "tenant_id": current_tenant.id}
    )
    
    row = result.first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Memory not found"
        )
    
    if str(row[0]) != current_user.id and 'memories.manage' not in current_user.permissions:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own memories"
        )
    
    await db.execute(
        text("DELETE FROM memories WHERE id = :memory_id AND tenant_id = :tenant_id"),
        {"memory_id": memory_id, "tenant_id": current_tenant.id}
    )
    await db.commit()
    
    # Invalidate cache
    await invalidate_cache_pattern(f"memories:{current_tenant.id}:*", redis)
    
    return {"message": "Memory deleted successfully"}

@app.get("/api/memories/search", response_model=Dict[str, Any])
async def search_memories(
    search: SearchQuery = Depends(),
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    redis: redis.Redis = Depends(get_redis),
    _: None = Depends(rate_limit)
):
    """Search memories with tenant isolation and visibility controls"""
    search_count.labels(search_type=search.search_type, tenant=current_tenant.slug).inc()
    
    # Set tenant context
    await db.execute(
        text("SELECT set_tenant_context(:tenant_id, :user_id)"),
        {"tenant_id": current_tenant.id, "user_id": current_user.id}
    )
    
    # Check cache
    cache_key = f"memories:{current_tenant.id}:{current_user.id}:search:{hashlib.md5(json.dumps(search.dict(), sort_keys=True).encode()).hexdigest()}"
    cached = await cache_get(cache_key, redis)
    if cached:
        return cached
    
    # Build visibility filter
    visibility_conditions = ["visibility = 'public'", "visibility = 'team'"]
    if not search.visibility or 'private' in search.visibility:
        visibility_conditions.append(f"(visibility = 'private' AND created_by = '{current_user.id}')")
    
    visibility_filter = f"({' OR '.join(visibility_conditions)})"
    
    results = []
    total_count = 0
    
    if search.search_type == "keyword":
        # Keyword search query
        query_text = f"""
            WITH ranked_results AS (
                SELECT 
                    id, content, title, tags, created_at, created_by, visibility,
                    GREATEST(
                        similarity(content, :query),
                        similarity(COALESCE(title, ''), :query)
                    ) AS score
                FROM memories
                WHERE tenant_id = :tenant_id
                AND {visibility_filter}
                AND (
                    content % :query
                    OR COALESCE(title, '') % :query
                )
        """
        
        # Add filters
        if search.tags:
            query_text += " AND tags ?| ARRAY[:tags]"
        if search.date_from:
            query_text += " AND created_at >= :date_from"
        if search.date_to:
            query_text += " AND created_at <= :date_to"
        
        query_text += """
                ORDER BY score DESC
                LIMIT :limit OFFSET :offset
            )
            SELECT *, (
                SELECT COUNT(*) FROM memories 
                WHERE tenant_id = :tenant_id 
                AND """ + visibility_filter + """
            ) as total
            FROM ranked_results
        """
        
        params = {
            "tenant_id": str(current_tenant.id),
            "query": search.query,
            "limit": search.limit,
            "offset": search.offset
        }
        
        if search.tags:
            params["tags"] = search.tags
        if search.date_from:
            params["date_from"] = search.date_from
        if search.date_to:
            params["date_to"] = search.date_to
        
        result = await db.execute(text(query_text), params)
        rows = result.all()
        
        if rows:
            total_count = rows[0][-1]
            results = [
                {
                    "id": str(row[0]),
                    "content": row[1],
                    "title": row[2],
                    "tags": row[3],
                    "created_at": row[4].isoformat(),
                    "created_by": str(row[5]) if row[5] else None,
                    "visibility": row[6],
                    "score": float(row[7])
                }
                for row in rows
            ]
    
    elif search.search_type == "semantic":
        # Semantic search
        query_embedding = await embedding_service.embed_query(search.query)
        
        query_text = f"""
            WITH semantic_results AS (
                SELECT 
                    id, content, title, tags, created_at, created_by, visibility,
                    1 - (embedding <=> :query_embedding::vector) AS score
                FROM memories
                WHERE tenant_id = :tenant_id
                AND {visibility_filter}
                AND embedding IS NOT NULL
        """
        
        # Add filters
        if search.tags:
            query_text += " AND tags ?| ARRAY[:tags]"
        if search.date_from:
            query_text += " AND created_at >= :date_from"
        if search.date_to:
            query_text += " AND created_at <= :date_to"
        
        query_text += f"""
                AND 1 - (embedding <=> :query_embedding::vector) >= :threshold
                ORDER BY embedding <=> :query_embedding::vector
                LIMIT :limit OFFSET :offset
            )
            SELECT *, (
                SELECT COUNT(*) FROM memories 
                WHERE tenant_id = :tenant_id 
                AND {visibility_filter}
                AND embedding IS NOT NULL
            ) as total
            FROM semantic_results
        """
        
        params = {
            "tenant_id": str(current_tenant.id),
            "query_embedding": json.dumps(query_embedding),
            "threshold": search.similarity_threshold,
            "limit": search.limit,
            "offset": search.offset
        }
        
        if search.tags:
            params["tags"] = search.tags
        if search.date_from:
            params["date_from"] = search.date_from
        if search.date_to:
            params["date_to"] = search.date_to
        
        result = await db.execute(text(query_text), params)
        rows = result.all()
        
        if rows:
            total_count = rows[0][-1]
            results = [
                {
                    "id": str(row[0]),
                    "content": row[1],
                    "title": row[2],
                    "tags": row[3],
                    "created_at": row[4].isoformat(),
                    "created_by": str(row[5]) if row[5] else None,
                    "visibility": row[6],
                    "score": float(row[7])
                }
                for row in rows
            ]
    
    else:  # hybrid search
        # Generate query embedding
        query_embedding = await embedding_service.embed_query(search.query)
        
        # Use enhanced hybrid search with visibility
        query_text = f"""
            SELECT * FROM hybrid_search(
                :tenant_id,
                :query,
                :query_embedding::vector,
                :limit,
                :keyword_weight,
                :semantic_weight
            )
            WHERE id IN (
                SELECT id FROM memories 
                WHERE tenant_id = :tenant_id 
                AND {visibility_filter}
            )
        """
        
        # Add additional filters
        if search.tags or search.date_from or search.date_to:
            query_text = f"""
                WITH hybrid_results AS ({query_text})
                SELECT hr.*, m.created_by, m.visibility 
                FROM hybrid_results hr
                JOIN memories m ON hr.id = m.id
                WHERE 1=1
            """
            
            if search.tags:
                query_text += " AND m.tags ?| ARRAY[:tags]"
            if search.date_from:
                query_text += " AND m.created_at >= :date_from"
            if search.date_to:
                query_text += " AND m.created_at <= :date_to"
            
            query_text += " ORDER BY hr.combined_score DESC"
        
        params = {
            "tenant_id": str(current_tenant.id),
            "query": search.query,
            "query_embedding": json.dumps(query_embedding),
            "limit": search.limit,
            "keyword_weight": search.keyword_weight,
            "semantic_weight": search.semantic_weight
        }
        
        if search.tags:
            params["tags"] = search.tags
        if search.date_from:
            params["date_from"] = search.date_from
        if search.date_to:
            params["date_to"] = search.date_to
        
        result = await db.execute(text(query_text), params)
        rows = result.all()
        
        # Get total count
        count_result = await db.execute(
            text(f"""
                SELECT COUNT(*) FROM memories 
                WHERE tenant_id = :tenant_id 
                AND {visibility_filter}
            """),
            {"tenant_id": str(current_tenant.id)}
        )
        total_count = count_result.scalar()
        
        # Process results based on whether we have additional fields
        if search.tags or search.date_from or search.date_to:
            results = [
                {
                    "id": str(row[0]),
                    "content": row[1],
                    "title": row[2],
                    "tags": row[3],
                    "created_at": row[4].isoformat(),
                    "keyword_score": float(row[5]),
                    "semantic_score": float(row[6]),
                    "combined_score": float(row[7]),
                    "created_by": str(row[8]) if row[8] else None,
                    "visibility": row[9]
                }
                for row in rows
            ]
        else:
            # Need to fetch created_by and visibility
            memory_ids = [str(row[0]) for row in rows]
            if memory_ids:
                user_result = await db.execute(
                    text("""
                        SELECT id, created_by, visibility 
                        FROM memories 
                        WHERE id = ANY(:ids)
                    """),
                    {"ids": memory_ids}
                )
                user_map = {str(r[0]): (str(r[1]) if r[1] else None, r[2]) for r in user_result}
                
                results = [
                    {
                        "id": str(row[0]),
                        "content": row[1],
                        "title": row[2],
                        "tags": row[3],
                        "created_at": row[4].isoformat(),
                        "keyword_score": float(row[5]),
                        "semantic_score": float(row[6]),
                        "combined_score": float(row[7]),
                        "created_by": user_map.get(str(row[0]), (None, None))[0],
                        "visibility": user_map.get(str(row[0]), (None, None))[1]
                    }
                    for row in rows
                ]
    
    response = {
        "results": results,
        "total": total_count,
        "search_type": search.search_type,
        "query": search.query,
        "limit": search.limit,
        "offset": search.offset,
        "tenant": current_tenant.slug
    }
    
    # Cache results
    await cache_set(cache_key, response, redis, ttl=300)
    
    return response

@app.get("/api/memories", response_model=Dict[str, Any])
async def list_memories(
    limit: int = 10,
    offset: int = 0,
    tags: Optional[List[str]] = None,
    visibility: Optional[List[str]] = None,
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
):
    """List memories for current user/tenant"""
    # Set tenant context
    await db.execute(
        text("SELECT set_tenant_context(:tenant_id, :user_id)"),
        {"tenant_id": current_tenant.id, "user_id": current_user.id}
    )
    
    # Build query
    query_text = """
        SELECT 
            id, content, title, tags, created_at, created_by, visibility,
            embedding IS NOT NULL as has_embedding
        FROM memories
        WHERE tenant_id = :tenant_id
    """
    
    params = {
        "tenant_id": str(current_tenant.id),
        "limit": limit,
        "offset": offset
    }
    
    # Add visibility filter
    if visibility:
        query_text += " AND visibility = ANY(:visibility)"
        params["visibility"] = visibility
    else:
        visibility_conditions = [
            "visibility = 'public'",
            "visibility = 'team'",
            f"(visibility = 'private' AND created_by = '{current_user.id}')"
        ]
        query_text += f" AND ({' OR '.join(visibility_conditions)})"
    
    # Add tag filter
    if tags:
        query_text += " AND tags ?| ARRAY[:tags]"
        params["tags"] = tags
    
    query_text += " ORDER BY created_at DESC LIMIT :limit OFFSET :offset"
    
    result = await db.execute(text(query_text), params)
    
    memories = []
    for row in result:
        memories.append({
            "id": str(row[0]),
            "content": row[1],
            "title": row[2],
            "tags": row[3],
            "created_at": row[4].isoformat(),
            "created_by": str(row[5]) if row[5] else None,
            "visibility": row[6],
            "has_embedding": row[7]
        })
    
    # Get total count
    count_query = """
        SELECT COUNT(*) FROM memories
        WHERE tenant_id = :tenant_id
    """
    
    if visibility:
        count_query += " AND visibility = ANY(:visibility)"
    else:
        visibility_conditions = [
            "visibility = 'public'",
            "visibility = 'team'",
            f"(visibility = 'private' AND created_by = '{current_user.id}')"
        ]
        count_query += f" AND ({' OR '.join(visibility_conditions)})"
    
    if tags:
        count_query += " AND tags ?| ARRAY[:tags]"
    
    count_params = {k: v for k, v in params.items() if k not in ['limit', 'offset']}
    count_result = await db.execute(text(count_query), count_params)
    total = count_result.scalar()
    
    return {
        "memories": memories,
        "total": total,
        "limit": limit,
        "offset": offset
    }

@app.get("/api/stats")
async def get_user_stats(
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
):
    """Get statistics for current user"""
    stats_query = """
        SELECT 
            COUNT(*) as total_memories,
            COUNT(CASE WHEN visibility = 'private' THEN 1 END) as private_memories,
            COUNT(CASE WHEN visibility = 'team' THEN 1 END) as team_memories,
            COUNT(CASE WHEN visibility = 'public' THEN 1 END) as public_memories,
            COUNT(embedding) as memories_with_embeddings,
            COUNT(DISTINCT DATE(created_at)) as active_days,
            MIN(created_at) as first_memory,
            MAX(created_at) as last_memory
        FROM memories
        WHERE tenant_id = :tenant_id AND created_by = :user_id
    """
    
    result = await db.execute(
        text(stats_query),
        {"tenant_id": current_tenant.id, "user_id": current_user.id}
    )
    
    row = result.first()
    
    return {
        "total_memories": row[0],
        "private_memories": row[1],
        "team_memories": row[2],
        "public_memories": row[3],
        "memories_with_embeddings": row[4],
        "embedding_coverage": (row[4] / row[0] * 100) if row[0] > 0 else 0,
        "active_days": row[5],
        "first_memory": row[6].isoformat() if row[6] else None,
        "last_memory": row[7].isoformat() if row[7] else None,
        "tenant": {
            "name": current_tenant.name,
            "plan": current_tenant.plan,
            "limits": current_tenant.settings
        }
    }

@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint"""
    return Response(content=generate_latest(), media_type="text/plain")

# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    request_count.labels(
        method=request.method,
        endpoint=request.url.path,
        status=exc.status_code
    ).inc()
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    request_count.labels(
        method=request.method,
        endpoint=request.url.path,
        status=500
    ).inc()
    
    if settings.ENVIRONMENT == 'production':
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"}
        )
    else:
        return JSONResponse(
            status_code=500,
            content={"detail": str(exc)}
        )

# Middleware for metrics
@app.middleware("http")
async def track_metrics(request: Request, call_next):
    start_time = time.time()
    active_connections.inc()
    
    try:
        response = await call_next(request)
        duration = time.time() - start_time
        
        request_duration.labels(
            method=request.method,
            endpoint=request.url.path
        ).observe(duration)
        
        request_count.labels(
            method=request.method,
            endpoint=request.url.path,
            status=response.status_code
        ).inc()
        
        return response
    finally:
        active_connections.dec()

if __name__ == "__main__":
    uvicorn.run(
        "production_api_v3:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.ENVIRONMENT == 'development',
        log_level="info" if settings.ENVIRONMENT == 'production' else "debug"
    )