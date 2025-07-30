#!/usr/bin/env python3
"""
Production PUO Memo API Server V2 with Semantic Search
Includes vector embeddings and hybrid search capabilities
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
import hmac

from fastapi import FastAPI, HTTPException, Request, Response, Depends, Header, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
import uvicorn
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import Column, String, DateTime, JSON, Index, text, func, Float
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.exc import IntegrityError
import redis.asyncio as redis
from prometheus_client import Counter, Histogram, Gauge, generate_latest
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
from pgvector.asyncpg import register_vector
import asyncpg

# Import our embeddings module
from embeddings import (
    EmbeddingConfig, EmbeddingService, HybridSearcher,
    get_embedding_service
)

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
    DEFAULT_SEARCH_TYPE = os.getenv('DEFAULT_SEARCH_TYPE', 'hybrid')  # keyword, semantic, hybrid
    
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
memory_count = Counter('puomemo_memories_created_total', 'Total memories created')
search_count = Counter('puomemo_searches_total', 'Total searches performed', ['search_type'])
embedding_generation_time = Histogram('puomemo_embedding_generation_seconds', 'Time to generate embeddings')
cache_hits = Counter('puomemo_cache_hits_total', 'Cache hits', ['operation'])
cache_misses = Counter('puomemo_cache_misses_total', 'Cache misses', ['operation'])

# Database models
Base = declarative_base()

# Custom type for pgvector
from sqlalchemy.types import UserDefinedType

class Vector(UserDefinedType):
    """Custom type for pgvector"""
    
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

class Memory(Base):
    __tablename__ = 'memories'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(255), nullable=False, index=True)
    content = Column(String, nullable=False)
    title = Column(String(255))
    tags = Column(JSON, default=list)
    metadata = Column(JSON, default=dict)
    embedding = Column(Vector)  # pgvector column
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    __table_args__ = (
        Index('idx_user_created', 'user_id', 'created_at'),
        Index('idx_tags', 'tags', postgresql_using='gin'),
        Index('idx_content_search', 'content', postgresql_using='gin', postgresql_ops={'content': 'gin_trgm_ops'}),
        Index('idx_title_search', 'title', postgresql_using='gin', postgresql_ops={'title': 'gin_trgm_ops'}),
    )

class Entity(Base):
    __tablename__ = 'entities'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(255), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    type = Column(String(50), nullable=False)
    metadata = Column(JSON, default=dict)
    first_seen = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_seen = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    mention_count = Column(Integer, default=1)
    
    __table_args__ = (
        Index('idx_entity_user_type', 'user_id', 'type'),
        Index('idx_entity_name_type', 'name', 'type'),
    )

class MemoryEntity(Base):
    __tablename__ = 'memory_entities'
    
    memory_id = Column(UUID(as_uuid=True), ForeignKey('memories.id', ondelete='CASCADE'), primary_key=True)
    entity_id = Column(UUID(as_uuid=True), ForeignKey('entities.id', ondelete='CASCADE'), primary_key=True)
    relevance_score = Column(Float, default=1.0)

class ApiKey(Base):
    __tablename__ = 'api_keys'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(255), nullable=False, unique=True, index=True)
    key_hash = Column(String(64), nullable=False, index=True)
    name = Column(String(255))
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_used = Column(DateTime(timezone=True))
    is_active = Column(Boolean, default=True)

# Pydantic models
class MemoryCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=100000)
    title: Optional[str] = Field(None, max_length=255)
    tags: List[str] = Field(default_factory=list, max_items=50)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    force: bool = Field(False, description="Skip duplicate check")
    generate_embedding: bool = Field(True, description="Generate embedding for semantic search")

class MemoryUpdate(BaseModel):
    content: Optional[str] = Field(None, min_length=1, max_length=100000)
    title: Optional[str] = Field(None, max_length=255)
    tags: Optional[List[str]] = Field(None, max_items=50)
    metadata: Optional[Dict[str, Any]] = None
    regenerate_embedding: bool = Field(False, description="Regenerate embedding")

class MemoryResponse(BaseModel):
    id: str
    user_id: str
    content: str
    title: Optional[str]
    tags: List[str]
    metadata: Dict[str, Any]
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
    """Get database session"""
    async with async_session() as session:
        yield session

async def get_redis() -> redis.Redis:
    """Get Redis connection"""
    return redis_client

async def verify_api_key(authorization: str = Header(..., alias=settings.API_KEY_HEADER)) -> str:
    """Verify API key and return user_id"""
    if not authorization.startswith('Bearer '):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization format"
        )
    
    api_key = authorization[7:]  # Remove 'Bearer ' prefix
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()
    
    async with async_session() as db:
        # Check cache first
        cache_key = f"api_key:{key_hash}"
        cached_user = await cache_get(cache_key, redis_client)
        if cached_user:
            return cached_user
        
        # Query database
        result = await db.execute(
            text("SELECT user_id FROM api_keys WHERE key_hash = :key_hash AND is_active = true"),
            {"key_hash": key_hash}
        )
        row = result.first()
        
        if not row:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid API key"
            )
        
        user_id = row[0]
        
        # Update last_used
        await db.execute(
            text("UPDATE api_keys SET last_used = CURRENT_TIMESTAMP WHERE key_hash = :key_hash"),
            {"key_hash": key_hash}
        )
        await db.commit()
        
        # Cache result
        await cache_set(cache_key, user_id, redis_client, ttl=300)  # 5 minutes
        
        return user_id

# Embedding service
embedding_service: Optional[EmbeddingService] = None
hybrid_searcher: Optional[HybridSearcher] = None

# Initialize resources
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    # Startup
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
    
    # Create tables and extensions
    async with engine.begin() as conn:
        # Run init SQL if needed
        init_sql_path = os.path.join(os.path.dirname(__file__), '../../docker/init-db.sql')
        if os.path.exists(init_sql_path) and settings.ENVIRONMENT == 'development':
            with open(init_sql_path, 'r') as f:
                sql_script = f.read()
                # Execute statements one by one
                for statement in sql_script.split(';'):
                    if statement.strip():
                        try:
                            await conn.execute(text(statement))
                        except Exception as e:
                            logger.warning(f"SQL statement failed (may be normal): {e}")
        
        # Create tables from SQLAlchemy models
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
    
    logger.info(f"Application startup complete - Embedding provider: {settings.EMBEDDING_PROVIDER}")
    
    yield
    
    # Shutdown
    await redis_client.close()
    await engine.dispose()
    logger.info("Application shutdown complete")

# Create FastAPI app
app = FastAPI(
    title="PUO Memo API V2",
    version="2.0.0",
    description="Production API with Semantic Search",
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

# Cache helpers (same as before)
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

# Rate limiting
async def rate_limit(
    request: Request,
    user_id: str = Depends(verify_api_key),
    redis: redis.Redis = Depends(get_redis)
):
    """Rate limit requests per user"""
    key = f"rate_limit:{user_id}:{request.url.path}"
    
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
        # Don't block requests if Redis is down
        logger.error("Redis error during rate limiting")

# Background task to generate embeddings
async def generate_embedding_task(
    memory_id: str,
    user_id: str,
    memory_data: dict
):
    """Generate embedding for a memory in the background"""
    try:
        with embedding_generation_time.time():
            embedding = await embedding_service.embed_memory(memory_data)
        
        # Update memory with embedding
        async with async_session() as db:
            await db.execute(
                text("""
                    UPDATE memories 
                    SET embedding = :embedding::vector,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = :id AND user_id = :user_id
                """),
                {
                    "embedding": json.dumps(embedding),
                    "id": memory_id,
                    "user_id": user_id
                }
            )
            await db.commit()
        
        # Invalidate cache
        await invalidate_cache_pattern(f"memories:{user_id}:*", redis_client)
        
        logger.info(f"Generated embedding for memory {memory_id}")
    except Exception as e:
        logger.error(f"Failed to generate embedding for memory {memory_id}: {e}")

# API Endpoints
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Check database
        async with async_session() as db:
            await db.execute(text("SELECT 1"))
        
        # Check Redis
        await redis_client.ping()
        
        # Check embedding service
        test_embedding = await embedding_service.embed_query("test")
        
        return {
            "status": "healthy",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "version": "2.0.0",
            "embedding_provider": settings.EMBEDDING_PROVIDER,
            "embedding_dimension": settings.EMBEDDING_DIMENSION
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
    user_id: str = Depends(verify_api_key),
    db: AsyncSession = Depends(get_db),
    redis: redis.Redis = Depends(get_redis),
    _: None = Depends(rate_limit)
):
    """Create a new memory with optional embedding generation"""
    memory_count.inc()
    
    # Check for duplicates
    if not memory.force:
        # Simple duplicate check based on content similarity
        result = await db.execute(
            text("""
                SELECT id FROM memories 
                WHERE user_id = :user_id 
                AND similarity(content, :content) > 0.9
                AND created_at > CURRENT_TIMESTAMP - INTERVAL '5 minutes'
                LIMIT 1
            """),
            {"user_id": user_id, "content": memory.content}
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
        "user_id": user_id,
        "content": memory.content,
        "title": memory.title,
        "tags": memory.tags,
        "metadata": memory.metadata,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }
    
    # Insert into database
    await db.execute(
        text("""
            INSERT INTO memories (id, user_id, content, title, tags, metadata, created_at, updated_at)
            VALUES (:id, :user_id, :content, :title, :tags::jsonb, :metadata::jsonb, :created_at, :updated_at)
        """),
        memory_data
    )
    await db.commit()
    
    # Generate embedding in background if requested
    if memory.generate_embedding:
        background_tasks.add_task(
            generate_embedding_task,
            memory_id,
            user_id,
            memory_data
        )
    
    # Invalidate cache
    await invalidate_cache_pattern(f"memories:{user_id}:*", redis)
    
    return MemoryResponse(
        **memory_data,
        has_embedding=False  # Will be updated async
    )

@app.get("/api/memories/search", response_model=Dict[str, Any])
async def search_memories(
    search: SearchQuery = Depends(),
    user_id: str = Depends(verify_api_key),
    db: AsyncSession = Depends(get_db),
    redis: redis.Redis = Depends(get_redis),
    _: None = Depends(rate_limit)
):
    """Search memories using keyword, semantic, or hybrid search"""
    search_count.labels(search_type=search.search_type).inc()
    
    # Check cache
    cache_key = f"memories:{user_id}:search:{hashlib.md5(json.dumps(search.dict(), sort_keys=True).encode()).hexdigest()}"
    cached = await cache_get(cache_key, redis)
    if cached:
        return cached
    
    results = []
    total_count = 0
    
    if search.search_type == "keyword":
        # Pure keyword search using PostgreSQL full-text search
        query_text = """
            WITH ranked_results AS (
                SELECT 
                    id, content, title, tags, created_at,
                    GREATEST(
                        similarity(content, :query),
                        similarity(COALESCE(title, ''), :query)
                    ) AS score
                FROM memories
                WHERE user_id = :user_id
                AND (
                    content % :query
                    OR COALESCE(title, '') % :query
                )
        """
        
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
            SELECT *, (SELECT COUNT(*) FROM memories WHERE user_id = :user_id) as total
            FROM ranked_results
        """
        
        params = {
            "user_id": user_id,
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
            total_count = rows[0][-1]  # Last column is total count
            results = [
                {
                    "id": str(row[0]),
                    "content": row[1],
                    "title": row[2],
                    "tags": row[3],
                    "created_at": row[4].isoformat(),
                    "score": float(row[5])
                }
                for row in rows
            ]
    
    elif search.search_type == "semantic":
        # Pure semantic search using pgvector
        # Generate query embedding
        query_embedding = await embedding_service.embed_query(search.query)
        
        query_text = """
            WITH semantic_results AS (
                SELECT 
                    id, content, title, tags, created_at,
                    1 - (embedding <=> :query_embedding::vector) AS score
                FROM memories
                WHERE user_id = :user_id
                AND embedding IS NOT NULL
        """
        
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
            SELECT *, (SELECT COUNT(*) FROM memories WHERE user_id = :user_id AND embedding IS NOT NULL) as total
            FROM semantic_results
        """
        
        params = {
            "user_id": user_id,
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
                    "score": float(row[5])
                }
                for row in rows
            ]
    
    else:  # hybrid search
        # Use the hybrid_search PostgreSQL function
        query_embedding = await embedding_service.embed_query(search.query)
        
        query_text = """
            SELECT * FROM hybrid_search(
                :user_id,
                :query,
                :query_embedding::vector,
                :limit,
                :keyword_weight,
                :semantic_weight
            )
        """
        
        if search.tags or search.date_from or search.date_to:
            # Add filtering
            query_text = f"""
                WITH hybrid_results AS ({query_text})
                SELECT * FROM hybrid_results hr
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
            "user_id": user_id,
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
            text("SELECT COUNT(*) FROM memories WHERE user_id = :user_id"),
            {"user_id": user_id}
        )
        total_count = count_result.scalar()
        
        results = [
            {
                "id": str(row[0]),
                "content": row[1],
                "title": row[2],
                "tags": row[3],
                "created_at": row[4].isoformat(),
                "keyword_score": float(row[5]),
                "semantic_score": float(row[6]),
                "combined_score": float(row[7])
            }
            for row in rows
        ]
    
    # Get entities if requested
    if search.include_entities and results:
        memory_ids = [r["id"] for r in results]
        entity_query = """
            SELECT me.memory_id, e.name, e.type, me.relevance_score
            FROM memory_entities me
            JOIN entities e ON me.entity_id = e.id
            WHERE me.memory_id = ANY(:memory_ids)
            ORDER BY me.relevance_score DESC
        """
        
        entity_result = await db.execute(
            text(entity_query),
            {"memory_ids": memory_ids}
        )
        
        # Group entities by memory
        entities_by_memory = {}
        for row in entity_result:
            memory_id = str(row[0])
            if memory_id not in entities_by_memory:
                entities_by_memory[memory_id] = []
            entities_by_memory[memory_id].append({
                "name": row[1],
                "type": row[2],
                "relevance": float(row[3])
            })
        
        # Add entities to results
        for result in results:
            result["entities"] = entities_by_memory.get(result["id"], [])
    
    response = {
        "results": results,
        "total": total_count,
        "search_type": search.search_type,
        "query": search.query,
        "limit": search.limit,
        "offset": search.offset
    }
    
    # Cache results
    await cache_set(cache_key, response, redis, ttl=300)  # 5 minutes
    
    return response

@app.post("/api/embeddings/generate", response_model=Dict[str, Any])
async def generate_embeddings(
    memory_ids: List[str],
    background_tasks: BackgroundTasks,
    regenerate: bool = False,
    user_id: str = Depends(verify_api_key),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit)
):
    """Generate embeddings for multiple memories"""
    # Validate memory ownership
    result = await db.execute(
        text("""
            SELECT id, content, title, tags, embedding IS NOT NULL as has_embedding
            FROM memories
            WHERE user_id = :user_id AND id = ANY(:ids)
        """),
        {"user_id": user_id, "ids": memory_ids}
    )
    
    memories = []
    for row in result:
        if not regenerate and row[4]:  # Skip if already has embedding
            continue
        memories.append({
            "id": str(row[0]),
            "content": row[1],
            "title": row[2],
            "tags": row[3]
        })
    
    if not memories:
        return {
            "message": "No memories need embedding generation",
            "generated": 0
        }
    
    # Generate embeddings in batches
    with embedding_generation_time.time():
        embeddings = await embedding_service.embed_batch(memories)
    
    # Update memories with embeddings
    for memory, embedding in zip(memories, embeddings):
        await db.execute(
            text("""
                UPDATE memories 
                SET embedding = :embedding::vector,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = :id
            """),
            {
                "embedding": json.dumps(embedding),
                "id": memory["id"]
            }
        )
    
    await db.commit()
    
    # Invalidate cache
    await invalidate_cache_pattern(f"memories:{user_id}:*", redis_client)
    
    return {
        "message": f"Generated embeddings for {len(memories)} memories",
        "generated": len(memories),
        "memory_ids": [m["id"] for m in memories]
    }

@app.get("/api/embeddings/status", response_model=Dict[str, Any])
async def embedding_status(
    user_id: str = Depends(verify_api_key),
    db: AsyncSession = Depends(get_db)
):
    """Get embedding generation status for user's memories"""
    result = await db.execute(
        text("""
            SELECT 
                COUNT(*) as total,
                COUNT(embedding) as with_embeddings,
                COUNT(*) - COUNT(embedding) as without_embeddings
            FROM memories
            WHERE user_id = :user_id
        """),
        {"user_id": user_id}
    )
    
    row = result.first()
    
    return {
        "total_memories": row[0],
        "with_embeddings": row[1],
        "without_embeddings": row[2],
        "coverage_percentage": (row[1] / row[0] * 100) if row[0] > 0 else 0,
        "embedding_provider": settings.EMBEDDING_PROVIDER,
        "embedding_model": settings.EMBEDDING_MODEL,
        "embedding_dimension": settings.EMBEDDING_DIMENSION
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
        "production_api_v2:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.ENVIRONMENT == 'development',
        log_level="info" if settings.ENVIRONMENT == 'production' else "debug"
    )