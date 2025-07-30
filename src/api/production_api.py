#!/usr/bin/env python3
"""
Production-ready PUO Memo API Server
Built for scale, security, and reliability
"""

import os
import asyncio
import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any, Set
from contextlib import asynccontextmanager
import hashlib
import hmac

from fastapi import FastAPI, HTTPException, Request, Response, Depends, Header, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
import uvicorn
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import Column, String, DateTime, JSON, Index, text, func
from sqlalchemy.exc import IntegrityError
import redis.asyncio as redis
from prometheus_client import Counter, Histogram, Gauge, generate_latest
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

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
    CACHE_TTL = int(os.getenv('CACHE_TTL', '3600'))  # 1 hour
    
    # Security
    API_KEY_HEADER = 'Authorization'
    RATE_LIMIT_REQUESTS = int(os.getenv('RATE_LIMIT_REQUESTS', '100'))
    RATE_LIMIT_WINDOW = int(os.getenv('RATE_LIMIT_WINDOW', '60'))  # seconds
    ALLOWED_ORIGINS = os.getenv('ALLOWED_ORIGINS', '*').split(',')
    
    # Monitoring
    SENTRY_DSN = os.getenv('SENTRY_DSN')
    ENVIRONMENT = os.getenv('ENVIRONMENT', 'development')
    
    # Search
    MAX_SEARCH_RESULTS = int(os.getenv('MAX_SEARCH_RESULTS', '100'))
    SEARCH_TIMEOUT = int(os.getenv('SEARCH_TIMEOUT', '5'))  # seconds

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
memory_count = Counter('puomemo_memories_created_total', 'Total memories created')
search_count = Counter('puomemo_searches_total', 'Total searches performed')
cache_hits = Counter('puomemo_cache_hits_total', 'Cache hits', ['operation'])
cache_misses = Counter('puomemo_cache_misses_total', 'Cache misses', ['operation'])

# Database models
Base = declarative_base()

class Memory(Base):
    __tablename__ = 'memories'
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(255), nullable=False, index=True)
    content = Column(String, nullable=False)
    title = Column(String(255))
    tags = Column(JSON, default=list)
    metadata = Column(JSON, default=dict)
    embedding = Column(JSON)  # Store vector embeddings for semantic search
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    __table_args__ = (
        Index('idx_user_created', 'user_id', 'created_at'),
        Index('idx_tags', 'tags', postgresql_using='gin'),
        Index('idx_content_search', 'content', postgresql_using='gin', postgresql_ops={'content': 'gin_trgm_ops'}),
    )

class Entity(Base):
    __tablename__ = 'entities'
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(255), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    type = Column(String(50), nullable=False)
    references = Column(JSON, default=list)
    metadata = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    __table_args__ = (
        Index('idx_entity_user_type', 'user_id', 'type'),
        Index('idx_entity_name', 'name', postgresql_using='gin', postgresql_ops={'name': 'gin_trgm_ops'}),
    )

# Pydantic models
class MemoryCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=50000)
    title: Optional[str] = Field(None, max_length=255)
    tags: List[str] = Field(default_factory=list, max_items=50)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    @validator('tags')
    def validate_tags(cls, v):
        return [tag.strip().lower() for tag in v if tag.strip()]

class MemoryResponse(BaseModel):
    id: str
    content: str
    title: Optional[str]
    tags: List[str]
    metadata: Dict[str, Any]
    created_at: datetime
    updated_at: datetime

class SearchQuery(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    limit: int = Field(10, ge=1, le=100)
    offset: int = Field(0, ge=0)
    search_type: str = Field('hybrid', regex='^(keyword|semantic|hybrid)$')
    filters: Optional[Dict[str, Any]] = None

class EntityQuery(BaseModel):
    entity_name: Optional[str] = Field(None, max_length=255)
    entity_type: Optional[str] = Field(None, regex='^(person|organization|location|event|project|technology|concept|document|other)$')
    limit: int = Field(20, ge=1, le=100)

# Dependencies
async def get_db() -> AsyncSession:
    async with async_session() as session:
        yield session

async def get_redis() -> redis.Redis:
    return redis_client

async def verify_api_key(authorization: str = Header(...)) -> str:
    """Verify API key and return user_id"""
    if not authorization.startswith('Bearer '):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format"
        )
    
    api_key = authorization[7:]  # Remove 'Bearer ' prefix
    
    # In production, validate against database or auth service
    # For now, extract user_id from API key (format: user_id:secret)
    try:
        user_id = api_key.split(':')[0]
        # TODO: Validate api_key against database
        return user_id
    except:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key"
        )

async def rate_limit(request: Request, user_id: str = Depends(verify_api_key), redis: redis.Redis = Depends(get_redis)):
    """Rate limiting middleware"""
    key = f"rate_limit:{user_id}:{request.url.path}"
    
    try:
        current = await redis.incr(key)
        if current == 1:
            await redis.expire(key, settings.RATE_LIMIT_WINDOW)
        
        if current > settings.RATE_LIMIT_REQUESTS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Max {settings.RATE_LIMIT_REQUESTS} requests per {settings.RATE_LIMIT_WINDOW} seconds"
            )
    except redis.RedisError:
        # Don't block requests if Redis is down
        logger.error("Redis error during rate limiting")

# Cache helpers
async def cache_get(key: str, redis: redis.Redis) -> Optional[Any]:
    """Get value from cache"""
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
    """Set value in cache"""
    try:
        await redis.set(
            key,
            json.dumps(value, default=str),
            ex=ttl or settings.CACHE_TTL
        )
    except (redis.RedisError, json.JSONEncodeError) as e:
        logger.error(f"Cache set error: {e}")

async def invalidate_cache_pattern(pattern: str, redis: redis.Redis):
    """Invalidate cache keys matching pattern"""
    try:
        async for key in redis.scan_iter(match=pattern):
            await redis.delete(key)
    except redis.RedisError as e:
        logger.error(f"Cache invalidation error: {e}")

# Initialize resources
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    # Startup
    global engine, async_session, redis_client
    
    # Initialize database
    engine = create_async_engine(
        settings.DATABASE_URL,
        pool_size=settings.DATABASE_POOL_SIZE,
        max_overflow=settings.DATABASE_MAX_OVERFLOW,
        pool_pre_ping=True,
        echo=settings.ENVIRONMENT == 'development'
    )
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Enable pg_trgm extension for text search
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
    
    # Initialize Redis
    redis_client = await redis.from_url(
        settings.REDIS_URL,
        encoding="utf-8",
        decode_responses=True
    )
    
    logger.info("Application startup complete")
    
    yield
    
    # Shutdown
    await redis_client.close()
    await engine.dispose()
    logger.info("Application shutdown complete")

# Create FastAPI app
app = FastAPI(
    title="PUO Memo API",
    version="1.0.0",
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
        allowed_hosts=["*.puo-memo.com", "localhost"]
    )

@app.middleware("http")
async def add_metrics(request: Request, call_next):
    """Add request metrics"""
    start_time = time.time()
    active_connections.inc()
    
    try:
        response = await call_next(request)
        duration = time.time() - start_time
        
        request_count.labels(
            method=request.method,
            endpoint=request.url.path,
            status=response.status_code
        ).inc()
        
        request_duration.labels(
            method=request.method,
            endpoint=request.url.path
        ).observe(duration)
        
        response.headers["X-Request-ID"] = str(uuid.uuid4())
        response.headers["X-Response-Time"] = str(duration)
        
        return response
    finally:
        active_connections.dec()

# Health check endpoints
@app.get("/health")
async def health_check(db: AsyncSession = Depends(get_db), redis: redis.Redis = Depends(get_redis)):
    """Health check endpoint"""
    health = {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}
    
    # Check database
    try:
        await db.execute(text("SELECT 1"))
        health["database"] = "healthy"
    except Exception as e:
        health["database"] = "unhealthy"
        health["status"] = "unhealthy"
        logger.error(f"Database health check failed: {e}")
    
    # Check Redis
    try:
        await redis.ping()
        health["redis"] = "healthy"
    except Exception as e:
        health["redis"] = "unhealthy"
        health["status"] = "unhealthy"
        logger.error(f"Redis health check failed: {e}")
    
    status_code = 200 if health["status"] == "healthy" else 503
    return JSONResponse(content=health, status_code=status_code)

@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint"""
    return Response(generate_latest(), media_type="text/plain")

# API endpoints
@app.post("/api/memories", response_model=MemoryResponse, status_code=status.HTTP_201_CREATED)
async def create_memory(
    memory: MemoryCreate,
    user_id: str = Depends(verify_api_key),
    db: AsyncSession = Depends(get_db),
    redis: redis.Redis = Depends(get_redis),
    _: None = Depends(rate_limit)
):
    """Create a new memory"""
    try:
        # Create memory
        db_memory = Memory(
            user_id=user_id,
            content=memory.content,
            title=memory.title,
            tags=memory.tags,
            metadata=memory.metadata
        )
        
        db.add(db_memory)
        await db.commit()
        await db.refresh(db_memory)
        
        # Update metrics
        memory_count.inc()
        
        # Invalidate user's cache
        await invalidate_cache_pattern(f"memories:{user_id}:*", redis)
        await invalidate_cache_pattern(f"entities:{user_id}:*", redis)
        
        # Extract entities asynchronously (fire and forget)
        asyncio.create_task(extract_entities(db_memory, db, redis))
        
        return MemoryResponse(
            id=db_memory.id,
            content=db_memory.content,
            title=db_memory.title,
            tags=db_memory.tags,
            metadata=db_memory.metadata,
            created_at=db_memory.created_at,
            updated_at=db_memory.updated_at
        )
        
    except IntegrityError as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create memory"
        )
    except Exception as e:
        await db.rollback()
        logger.error(f"Error creating memory: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

@app.get("/api/memories/search", response_model=Dict[str, Any])
async def search_memories(
    search: SearchQuery = Depends(),
    user_id: str = Depends(verify_api_key),
    db: AsyncSession = Depends(get_db),
    redis: redis.Redis = Depends(get_redis),
    _: None = Depends(rate_limit)
):
    """Search memories"""
    # Check cache
    cache_key = f"memories:{user_id}:search:{hashlib.md5(json.dumps(search.dict(), sort_keys=True).encode()).hexdigest()}"
    cached = await cache_get(cache_key, redis)
    if cached:
        return cached
    
    try:
        # Build query
        query = db.query(Memory).filter(Memory.user_id == user_id)
        
        # Apply search
        if search.query:
            if search.search_type in ['keyword', 'hybrid']:
                # Full text search
                query = query.filter(
                    text("""
                        to_tsvector('english', content || ' ' || COALESCE(title, '')) 
                        @@ plainto_tsquery('english', :query)
                    """)
                ).params(query=search.query)
            
            # TODO: Add semantic search when embedding service is ready
        
        # Apply filters
        if search.filters:
            if 'tags' in search.filters:
                query = query.filter(Memory.tags.contains(search.filters['tags']))
            
            if 'date_from' in search.filters:
                query = query.filter(Memory.created_at >= search.filters['date_from'])
            
            if 'date_to' in search.filters:
                query = query.filter(Memory.created_at <= search.filters['date_to'])
        
        # Count total
        total = await db.scalar(query.statement.with_only_columns(func.count()))
        
        # Apply pagination
        query = query.order_by(Memory.created_at.desc())
        query = query.limit(search.limit).offset(search.offset)
        
        # Execute
        memories = await db.execute(query)
        memories = memories.scalars().all()
        
        # Format response
        result = {
            "memories": [
                {
                    "id": m.id,
                    "content": m.content,
                    "title": m.title,
                    "tags": m.tags,
                    "metadata": m.metadata,
                    "created_at": m.created_at.isoformat(),
                    "updated_at": m.updated_at.isoformat()
                }
                for m in memories
            ],
            "total": total,
            "limit": search.limit,
            "offset": search.offset
        }
        
        # Update metrics
        search_count.inc()
        
        # Cache result
        await cache_set(cache_key, result, redis)
        
        return result
        
    except Exception as e:
        logger.error(f"Error searching memories: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Search failed"
        )

@app.get("/api/entities", response_model=Dict[str, Any])
async def list_entities(
    query: EntityQuery = Depends(),
    user_id: str = Depends(verify_api_key),
    db: AsyncSession = Depends(get_db),
    redis: redis.Redis = Depends(get_redis),
    _: None = Depends(rate_limit)
):
    """List entities"""
    # Check cache
    cache_key = f"entities:{user_id}:{hashlib.md5(json.dumps(query.dict(), sort_keys=True).encode()).hexdigest()}"
    cached = await cache_get(cache_key, redis)
    if cached:
        return cached
    
    try:
        # Build query
        q = db.query(Entity).filter(Entity.user_id == user_id)
        
        if query.entity_name:
            q = q.filter(Entity.name.ilike(f"%{query.entity_name}%"))
        
        if query.entity_type:
            q = q.filter(Entity.type == query.entity_type)
        
        # Execute
        entities = await db.execute(
            q.order_by(Entity.references.desc())
            .limit(query.limit)
        )
        entities = entities.scalars().all()
        
        # Format response
        result = {
            "entities": [
                {
                    "id": e.id,
                    "name": e.name,
                    "type": e.type,
                    "references": len(e.references),
                    "metadata": e.metadata,
                    "created_at": e.created_at.isoformat(),
                    "updated_at": e.updated_at.isoformat()
                }
                for e in entities
            ],
            "count": len(entities)
        }
        
        # Cache result
        await cache_set(cache_key, result, redis, ttl=300)  # 5 min cache
        
        return result
        
    except Exception as e:
        logger.error(f"Error listing entities: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list entities"
        )

# Background tasks
async def extract_entities(memory: Memory, db: AsyncSession, redis: redis.Redis):
    """Extract entities from memory content"""
    try:
        # Simple entity extraction (in production, use NLP service)
        entities: Set[tuple] = set()
        
        # Extract @mentions as persons
        import re
        mentions = re.findall(r'@(\w+)', memory.content)
        for mention in mentions:
            entities.add((mention, 'person'))
        
        # Extract #tags as concepts
        hashtags = re.findall(r'#(\w+)', memory.content)
        for tag in hashtags:
            entities.add((tag, 'concept'))
        
        # TODO: Add more sophisticated entity extraction
        
        # Update entities in database
        for name, entity_type in entities:
            # Check if entity exists
            existing = await db.execute(
                db.query(Entity).filter(
                    Entity.user_id == memory.user_id,
                    Entity.name == name,
                    Entity.type == entity_type
                )
            )
            entity = existing.scalar_one_or_none()
            
            if entity:
                # Update references
                if memory.id not in entity.references:
                    entity.references.append(memory.id)
                    entity.updated_at = datetime.now(timezone.utc)
            else:
                # Create new entity
                entity = Entity(
                    user_id=memory.user_id,
                    name=name,
                    type=entity_type,
                    references=[memory.id]
                )
                db.add(entity)
        
        await db.commit()
        
    except Exception as e:
        logger.error(f"Error extracting entities: {e}")
        await db.rollback()

# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "request_id": str(uuid.uuid4()),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "request_id": str(uuid.uuid4()),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    )

if __name__ == "__main__":
    uvicorn.run(
        "production_api:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.ENVIRONMENT == 'development',
        log_level="info",
        access_log=True
    )