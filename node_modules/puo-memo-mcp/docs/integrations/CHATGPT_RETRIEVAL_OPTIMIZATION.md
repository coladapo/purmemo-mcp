# ChatGPT Memory Retrieval Optimization Guide

**Issue:** Search results are truncated (showing "..." after partial content)  
**Date:** June 28, 2025

## 🔍 Understanding the Issue

### What's Happening:
- ChatGPT can **save** memories successfully ✅
- ChatGPT can **search** and find memories ✅
- But search results show **truncated content** with "..." ⚠️
- This is a design choice to prevent overwhelming API responses

### Current Behavior:
```json
{
  "content": "# Deep Dive: Puo Memo MCP Architecture & Implementation\n\n## System Overview\nPuo Memo is a sophisticated unified memory system designed to bridge AI tools (ChatGPT, Claude Desktop, Cursor) through the ...",
}
```

## 🛠️ Solutions

### 1. **Implement Content Chunking**
Modify the ChatGPT bridge to return full content in manageable chunks:

```python
# In simple_cached_bridge.py, modify the search endpoint:

@app.post("/recall", summary="Search memories (Redis cached)")
async def search_memories_cached(data: MemorySearch, _: str = Depends(verify_token)) -> Dict[str, Any]:
    # ... existing code ...
    
    # Add option to return full content
    for r in results.get('results', []):
        # Don't truncate content for ChatGPT
        formatted_results.append({
            "id": r['id'],
            "title": r['title'],
            "content": r['content'],  # Return full content
            "content_length": len(r['content']),  # Add length indicator
            "tags": r.get('tags', []),
            "created_at": r['created_at'],
            "similarity_score": r.get('similarity', 0)
        })
```

### 2. **Add a Dedicated Content Retrieval Endpoint**
Create a new endpoint specifically for retrieving full memory content:

```python
@app.get("/memory/{memory_id}", summary="Get full memory content")
async def get_memory_content(
    memory_id: str,
    _: str = Depends(verify_token)
) -> Dict[str, Any]:
    """Retrieve complete memory content by ID"""
    try:
        async with db.get_connection() as conn:
            memory = await conn.fetchrow("""
                SELECT * FROM memory_entities WHERE id = $1
            """, memory_id)
            
            if memory:
                return {
                    "id": str(memory['id']),
                    "title": memory['title'],
                    "content": memory['content'],  # Full content
                    "type": memory['memory_type'],
                    "tags": memory['tags'],
                    "created_at": memory['created_at'].isoformat(),
                    "updated_at": memory['updated_at'].isoformat() if memory['updated_at'] else None,
                    "metadata": json.loads(memory['metadata']) if memory['metadata'] else {}
                }
            else:
                raise HTTPException(status_code=404, detail="Memory not found")
                
    except Exception as e:
        logger.error(f"Error retrieving memory: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

### 3. **Implement Pagination for Large Content**
For very large memories, implement content pagination:

```python
class MemoryContent(BaseModel):
    memory_id: str = Field(..., description="Memory ID to retrieve")
    chunk_size: int = Field(5000, description="Characters per chunk")
    chunk_number: int = Field(1, description="Which chunk to retrieve")

@app.post("/memory/content", summary="Get memory content in chunks")
async def get_memory_content_chunked(
    data: MemoryContent,
    _: str = Depends(verify_token)
) -> Dict[str, Any]:
    """Retrieve memory content in chunks for large documents"""
    # Implementation for chunked retrieval
```

## 💡 Quick Fix for Current Bridge

To quickly fix the truncation issue in your current setup:

### Option 1: Modify Memory Search Response
Edit `/Users/wivak/puo-jects/active/puo memo mcp/src/core/memory.py`:

```python
# In the search method, change line 337:
"content": row['content'][:200] + "..." if len(row['content']) > 200 else row['content'],

# To:
"content": row['content'],  # Return full content
```

### Option 2: Add Content Length Limits in Bridge
Edit `simple_cached_bridge.py` to handle large content gracefully:

```python
# Add configurable content limit
MAX_CONTENT_LENGTH = 10000  # Characters

# In search formatting:
content = r['content']
if len(content) > MAX_CONTENT_LENGTH:
    content = content[:MAX_CONTENT_LENGTH] + f"\n\n[Content truncated - {len(r['content'])} total characters]"
```

## 🚀 Recommended Approach

### For ChatGPT Custom GPT:
1. **Search** returns list with summaries (current behavior is fine)
2. Add a **"Get Full Content"** action that retrieves complete memory by ID
3. This two-step process prevents overwhelming responses while allowing full access

### Implementation Steps:
1. Keep search results concise (titles, tags, snippets)
2. Add endpoint for full content retrieval
3. Update ChatGPT Custom GPT with new action
4. Use caching for frequently accessed memories

## 📋 ChatGPT Custom GPT Instructions Update

Add to your ChatGPT Custom GPT instructions:

```
When searching memories:
1. First use 'recall' to search and list relevant memories
2. If user wants full content, note the memory ID
3. Use 'get_memory' endpoint (if available) to retrieve complete content
4. For very long content, inform user about length and offer to show sections
```

## 🎯 Performance Considerations

With Redis caching active:
- First search: ~200ms (database query)
- Cached search: ~50ms (Redis retrieval)
- Full content retrieval: ~100ms (direct database query)
- Large content (>50KB): Consider chunking

## 💻 Testing the Fix

After implementing changes:

```bash
# Restart the bridge
pkill -f "simple_cached_bridge"
python simple_cached_bridge.py

# Test with curl
curl -X POST http://localhost:8001/recall \
  -H "Authorization: Bearer your-secure-key-here" \
  -H "Content-Type: application/json" \
  -d '{"query": "technical deep dive", "limit": 1, "search_type": "hybrid"}'
```

## 🔍 Alternative: Use Claude Desktop for Full Content

Since Claude Desktop has the full MCP integration, you can:
1. Use ChatGPT to search and identify memories
2. Use Claude Desktop's `recall` tool for full content access
3. This leverages the strengths of each platform

The truncation is a safety feature to prevent API overload, but with these modifications, you can access full content when needed!