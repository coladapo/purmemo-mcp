# ChatGPT Usage Guide - Full Memory Content

## Quick Reference

### 1. Search Memories (Full Content by Default)
```json
POST /recall
{
    "query": "your search term",
    "limit": 10,
    "search_type": "hybrid",
    "include_full_content": true  // Now default, returns complete content
}
```

### 2. Get Specific Memory by ID
```json
GET /memory/{memory_id}

// Returns complete memory with all details:
{
    "id": "uuid",
    "title": "Memory Title",
    "content": "Full content, no truncation...",  // Complete content
    "type": "general",
    "tags": ["tag1", "tag2"],
    "metadata": {...},
    "attachments": [...],
    "entities": [...],
    "created_at": "2025-01-01T00:00:00",
    "updated_at": null
}
```

### 3. Create Memory (Unchanged)
```json
POST /memory
{
    "content": "Content to remember",
    "title": "Optional title",
    "tags": ["tag1", "tag2"],
    "force": false,
    "dedup_window": 300
}
```

## Best Practices for ChatGPT

### When Searching:
1. **Default behavior** now returns full content - no action needed
2. **For performance** with many results, you can set `include_full_content: false`
3. **Check for truncation** using `content_truncated` field in results

### When User Asks for Details:
1. **If you have the memory ID**, use `GET /memory/{id}` for complete details
2. **If searching**, results already include full content by default
3. **For attachments/entities**, the GET endpoint provides more detail

### Example Conversation Flow:

**User**: "What do you remember about the project architecture?"

**ChatGPT Search**:
```json
POST /recall
{
    "query": "project architecture",
    "limit": 5,
    "search_type": "semantic"
}
```

**Response** (now with full content):
```json
{
    "count": 3,
    "results": [
        {
            "id": "abc-123",
            "title": "Project Architecture Overview",
            "content": "The project uses a microservices architecture with... [FULL 2000+ character content]",
            "similarity_score": 0.92
        }
    ]
}
```

**User**: "Tell me more about that first memory"

**ChatGPT Get Details**:
```json
GET /memory/abc-123
```

**Response** (complete memory with all metadata):
```json
{
    "id": "abc-123",
    "title": "Project Architecture Overview",
    "content": "[Full content]",
    "tags": ["architecture", "design", "microservices"],
    "metadata": {
        "source": "design_doc.md",
        "version": "2.0"
    },
    "attachments": [
        {
            "filename": "architecture_diagram.png",
            "size": 125000,
            "content_type": "image/png"
        }
    ],
    "entities": [
        {"name": "Redis", "type": "technology"},
        {"name": "PostgreSQL", "type": "technology"}
    ],
    "created_at": "2025-01-15T10:30:00Z"
}
```

## Backward Compatibility

If you need truncated results (e.g., for overview displays):
```json
POST /recall
{
    "query": "search term",
    "limit": 20,
    "include_full_content": false  // Returns 200 char preview + "..."
}
```

Truncated results include:
- `content_truncated: true` - indicates content was cut
- `content_length: 1234` - original full length