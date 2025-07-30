#!/usr/bin/env python3
"""
Mock Production API for Testing
Simulates the production API without requiring full infrastructure
"""

from fastapi import FastAPI, HTTPException, Request, Header, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any
import uvicorn
import uuid
from datetime import datetime
import asyncio

app = FastAPI(title="Mock PUO Memo API")

# In-memory storage
memories_db = {}
request_counts = {}

# Models
class MemoryCreate(BaseModel):
    content: str = Field(..., min_length=1)
    title: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)

class SearchQuery(BaseModel):
    query: str = Field(..., min_length=1)
    limit: int = Field(10, ge=1, le=100)
    offset: int = Field(0, ge=0)
    search_type: str = Field('hybrid', regex='^(keyword|semantic|hybrid)$')

# Auth dependency
async def verify_api_key(authorization: str = Header(...)) -> str:
    if not authorization.startswith('Bearer '):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    
    api_key = authorization[7:]
    if api_key == "test-user:test-secret":
        return "test-user"
    
    raise HTTPException(status_code=401, detail="Invalid API key")

# Rate limiting
async def rate_limit(request: Request, user_id: str):
    key = f"{user_id}:{request.url.path}"
    request_counts[key] = request_counts.get(key, 0) + 1
    
    if request_counts[key] > 100:  # Simple rate limit
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

# Endpoints
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "database": "healthy",
        "redis": "healthy"
    }

@app.post("/api/memories", status_code=201)
async def create_memory(
    memory: MemoryCreate,
    user_id: str = Depends(verify_api_key),
    request: Request = None
):
    # Simple rate limit check
    await rate_limit(request, user_id)
    
    memory_id = str(uuid.uuid4())
    memories_db[memory_id] = {
        "id": memory_id,
        "user_id": user_id,
        "content": memory.content,
        "title": memory.title,
        "tags": memory.tags,
        "metadata": memory.metadata,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat()
    }
    
    return memories_db[memory_id]

@app.get("/api/memories/search")
async def search_memories(
    query: str,
    limit: int = 10,
    offset: int = 0,
    search_type: str = "hybrid",
    user_id: str = Depends(verify_api_key),
    request: Request = None
):
    await rate_limit(request, user_id)
    
    # Simple search simulation
    user_memories = [m for m in memories_db.values() if m["user_id"] == user_id]
    
    if query:
        user_memories = [
            m for m in user_memories 
            if query.lower() in m["content"].lower() or 
               (m["title"] and query.lower() in m["title"].lower())
        ]
    
    # Pagination
    total = len(user_memories)
    memories = user_memories[offset:offset + limit]
    
    return {
        "memories": memories,
        "total": total,
        "limit": limit,
        "offset": offset
    }

@app.get("/api/entities")
async def list_entities(
    entity_name: Optional[str] = None,
    entity_type: Optional[str] = None,
    limit: int = 20,
    user_id: str = Depends(verify_api_key),
    request: Request = None
):
    await rate_limit(request, user_id)
    
    # Mock entity response
    entities = [
        {"id": str(uuid.uuid4()), "name": "john", "type": "person", "references": 2},
        {"id": str(uuid.uuid4()), "name": "project-alpha", "type": "concept", "references": 1}
    ]
    
    if entity_name:
        entities = [e for e in entities if entity_name.lower() in e["name"]]
    if entity_type:
        entities = [e for e in entities if e["type"] == entity_type]
    
    return {
        "entities": entities[:limit],
        "count": len(entities[:limit])
    }

@app.get("/metrics")
async def metrics():
    # Mock Prometheus metrics
    return "# Mock metrics\npuomemo_requests_total 100\n"

# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "request_id": str(uuid.uuid4()),
            "timestamp": datetime.utcnow().isoformat()
        }
    )

if __name__ == "__main__":
    print("🚀 Starting Mock Production API on http://localhost:8000")
    print("📚 Docs available at http://localhost:8000/docs")
    uvicorn.run(app, host="0.0.0.0", port=8000)