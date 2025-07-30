#!/usr/bin/env python3
"""
ChatGPT Bridge for PUO Memo MCP
Exposes MCP functionality as REST API for ChatGPT Custom GPTs
"""
import asyncio
import json
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime
from fastapi import FastAPI, HTTPException, Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn
import os
import sys

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.core.database import DatabaseConnection
from src.core.memory import MemoryStore
from src.core.ai import AIAssistant
from src.core.knowledge_graph import KnowledgeGraphStore
from src.core.entity_extractor import EntityExtractor
from src.core.attachments import AttachmentProcessor
from src.core.unified_bridge import UnifiedMemoryBridge

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FastAPI app
app = FastAPI(
    title="PUO Memo API for ChatGPT",
    description="Bridge to connect PUO Memo MCP to ChatGPT",
    version="1.0.0"
)

# CORS for ChatGPT
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://chat.openai.com", "https://chatgpt.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security
security = HTTPBearer()
API_KEY = os.getenv("CHATGPT_BRIDGE_API_KEY", "your-secure-key-here")

def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    """Verify API key for ChatGPT requests"""
    logger.info(f"Auth attempt with key: {credentials.credentials[:10]}...")
    if credentials.credentials != API_KEY:
        logger.warning(f"Invalid API key attempted: {credentials.credentials}")
        raise HTTPException(status_code=403, detail="Invalid API key")
    return credentials.credentials

# Pydantic models for ChatGPT
class MemoryCreate(BaseModel):
    content: str = Field(..., description="Content to remember")
    title: Optional[str] = Field(None, description="Optional title")
    tags: Optional[List[str]] = Field(default_factory=list, description="Tags for categorization")
    attachments: Optional[List[str]] = Field(default_factory=list, description="File paths or URLs")
    force: bool = Field(False, description="Skip duplicate check")
    dedup_window: int = Field(300, description="Seconds to check for duplicates")
    merge_strategy: str = Field("smart", description="How to merge: smart, append, replace")

class MemorySearch(BaseModel):
    query: Optional[str] = Field(None, description="Search query (None for recent)")
    limit: int = Field(10, description="Number of results")
    search_type: str = Field("hybrid", description="keyword, semantic, hybrid, or entity")
    include_full_content: bool = Field(True, description="Include full content in results")
    model: Optional[str] = Field(None, description="AI model for adaptive content delivery")

class EntityQuery(BaseModel):
    entity_name: Optional[str] = Field(None, description="Entity to explore")
    entity_type: Optional[str] = Field(None, description="Filter by type")
    depth: int = Field(2, description="Graph traversal depth")

class AttachFiles(BaseModel):
    memory_id: str = Field(..., description="Memory ID to attach to")
    file_paths: List[str] = Field(..., description="Files to attach")
    descriptions: Optional[List[str]] = Field(default_factory=list, description="File descriptions")

# Global instances
db = None
memory_store = None
kg_store = None

@app.on_event("startup")
async def startup():
    """Initialize PUO Memo components"""
    global db, memory_store, kg_store
    
    logger.info("Initializing PUO Memo bridge...")
    
    # Initialize database
    db = DatabaseConnection()
    if not await db.initialize():
        raise Exception("Failed to initialize database")
    
    # Initialize AI
    ai = AIAssistant()
    
    # Initialize components
    kg_store = KnowledgeGraphStore(db, ai) if ai.enabled else None
    extractor = EntityExtractor(ai) if ai.enabled else None
    processor = AttachmentProcessor(db, ai, storage_backend='local')
    
    # Initialize memory store with unified context
    memory_store = MemoryStore(db, ai, kg_store, extractor, processor)
    # Use unified context for cross-platform memory sharing
    memory_store.set_context(UnifiedMemoryBridge.UNIFIED_CONTEXT)
    
    logger.info("✅ PUO Memo bridge ready!")

@app.on_event("shutdown")
async def shutdown():
    """Cleanup on shutdown"""
    if db:
        await db.cleanup()

# API Endpoints for ChatGPT

@app.post("/memory", summary="Create or update memory")
async def create_memory(
    data: MemoryCreate,
    _: str = Depends(verify_token)
) -> Dict[str, Any]:
    """Save content to memory with deduplication"""
    # Input validation
    if not data.content or not data.content.strip():
        raise HTTPException(status_code=422, detail="Content cannot be empty")
    
    try:
        result = await memory_store.create_with_dedup(
            content=data.content,
            title=data.title,
            tags=data.tags,
            attachments=data.attachments,
            force=data.force,
            dedup_window=data.dedup_window,
            merge_strategy=data.merge_strategy
        )
        
        # Format response for ChatGPT
        if result['status'] == 'duplicate_found':
            return {
                "status": "duplicate_found",
                "message": f"Found {result['similarity']}% similar memory",
                "existing_memory": {
                    "id": result['existing_memory']['id'],
                    "title": result['existing_memory']['title'],
                    "created_at": result['existing_memory']['created_at']
                },
                "options": {
                    "force_save": "Set force=true to save anyway",
                    "update": f"Use memory_id={result['existing_memory']['id']} to update"
                }
            }
        
        return {
            "status": result['status'],
            "memory_id": result.get('memory', {}).get('id'),
            "message": "Memory saved successfully"
        }
        
    except Exception as e:
        logger.error(f"Error creating memory: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/recall", summary="Search memories")
async def search_memories(
    data: MemorySearch,
    _: str = Depends(verify_token)
) -> Dict[str, Any]:
    """Search and retrieve memories"""
    # Input validation
    if data.query == "":
        raise HTTPException(status_code=422, detail="Query cannot be empty string")
    
    # Default to None for recent memories
    if data.query is None:
        data.query = ""
    
    try:
        # Route to appropriate search method with model support
        if data.search_type == "semantic":
            results = await memory_store.semantic_search(data.query, data.limit, include_full_content=data.include_full_content)
        elif data.search_type == "keyword":
            results = await memory_store.search(data.query, data.limit, include_full_content=data.include_full_content, model=data.model)
        elif data.search_type == "entity":
            results = await memory_store.search_by_entity(data.query, data.limit, include_full_content=data.include_full_content)
        else:  # hybrid
            results = await memory_store.hybrid_search(data.query, data.limit, include_full_content=data.include_full_content)
        
        # Format for ChatGPT
        formatted_results = []
        for r in results.get('results', []):
            formatted_results.append({
                "id": r['id'],
                "title": r['title'],
                "content": r['content'],
                "tags": r.get('tags', []),
                "created_at": r['created_at'],
                "similarity_score": r.get('similarity', 0)
            })
        
        return {
            "query": data.query,
            "count": len(formatted_results),
            "results": formatted_results
        }
        
    except Exception as e:
        logger.error(f"Error searching memories: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/entities", summary="Explore knowledge graph")
async def explore_entities(
    data: EntityQuery,
    _: str = Depends(verify_token)
) -> Dict[str, Any]:
    """List entities or explore entity relationships"""
    try:
        if not kg_store:
            return {"error": "Knowledge graph not available"}
        
        if data.entity_name:
            # Get entity graph
            result = await kg_store.get_entity_graph(data.entity_name, data.depth)
            return result
        else:
            # List entities
            entities = await kg_store.search_entities("", data.entity_type, limit=50)
            return {
                "entities": entities,
                "count": len(entities),
                "filter": {"type": data.entity_type} if data.entity_type else None
            }
            
    except Exception as e:
        logger.error(f"Error exploring entities: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/attach", summary="Attach files to memory")
async def attach_files(
    data: AttachFiles,
    _: str = Depends(verify_token)
) -> Dict[str, Any]:
    """Attach files to an existing memory"""
    # Input validation
    if not data.memory_id or not data.memory_id.strip():
        raise HTTPException(status_code=422, detail="Memory ID cannot be empty")
    
    # Validate memory ID format
    try:
        import uuid
        uuid.UUID(data.memory_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid memory ID format")
    
    try:
        processor = memory_store.attachment_processor
        if not processor:
            return {"error": "Attachment processor not available"}
        
        attached = []
        failed = []
        
        for i, file_path in enumerate(data.file_paths):
            description = data.descriptions[i] if i < len(data.descriptions) else None
            
            try:
                result = await processor.attach_file(
                    memory_id=data.memory_id,
                    file_path=file_path,
                    user_description=description
                )
                if "error" in result:
                    failed.append({"file": file_path, "error": result["error"]})
                else:
                    attached.append(result)
            except Exception as e:
                failed.append({"file": file_path, "error": str(e)})
        
        # If all attachments failed, return error
        if failed and not attached:
            raise HTTPException(status_code=400, detail=f"All attachments failed: {failed[0]['error']}")
        
        return {
            "memory_id": data.memory_id,
            "attached": len(attached),
            "failed": len(failed),
            "results": {
                "successful": attached,
                "failed": failed
            }
        }
        
    except Exception as e:
        logger.error(f"Error attaching files: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/memory/{memory_id}", summary="Get full memory by ID")
async def get_memory(
    memory_id: str,
    _: str = Depends(verify_token)
) -> Dict[str, Any]:
    """Retrieve a single memory with full content"""
    # Validate memory ID format
    try:
        import uuid
        uuid.UUID(memory_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid memory ID format")
    
    try:
        result = await memory_store.get(memory_id)
        
        if "error" in result:
            if result["error"] == "Memory not found":
                raise HTTPException(status_code=404, detail="Memory not found")
            else:
                raise HTTPException(status_code=500, detail=result["error"])
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving memory: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health", summary="Health check")
async def health_check():
    """Check if the bridge is running"""
    return {
        "status": "healthy",
        "service": "PUO Memo ChatGPT Bridge",
        "timestamp": datetime.utcnow().isoformat()
    }

# OpenAPI schema for ChatGPT
@app.get("/openapi.json", include_in_schema=False)
async def get_openapi():
    """Get OpenAPI schema for ChatGPT Custom GPT"""
    return app.openapi()

if __name__ == "__main__":
    # Run the bridge server
    uvicorn.run(
        "chatgpt_bridge:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
        log_level="info"
    )