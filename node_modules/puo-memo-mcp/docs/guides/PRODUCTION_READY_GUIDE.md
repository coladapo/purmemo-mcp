# 🚀 PUO Memo MCP - Production Ready Guide

Your PUO Memo system is **FULLY OPERATIONAL** and ready to capture all your Claude conversations, research, and artifacts!

## ✅ System Status

All critical features are working:
- **Database**: Connected with pgvector support
- **AI**: Gemini integration active (768-dim embeddings)
- **Vision**: Enabled for image/PDF understanding
- **Search**: Vector similarity working (<0.5s)
- **Entities**: Extraction and deduplication active
- **Storage**: Google Cloud Storage configured

## 🎯 Quick Start: Capture Claude Chats

### 1. Basic Claude Chat Capture

```python
# From your Python environment or API
from src.core.memory import MemoryStore

# Initialize (already set up)
memory = MemoryStore(...)
memory.set_context("claude_chats")

# Capture a Claude conversation
await memory.create(
    content="""User: How do I implement a binary search tree?
    
Claude: Here's a complete implementation...
[code artifact]
[explanation]""",
    title="Claude Chat: Binary Search Tree",
    tags=["claude", "python", "data-structures"],
    memory_type="chat_artifact"
)
```

### 2. Capture with Code Artifacts

```python
# The system automatically:
# - Extracts code blocks
# - Identifies programming languages
# - Creates embeddings for semantic search
# - Extracts entities (e.g., "Binary Search Tree", "Python")

chat_with_code = """
User: Show me how to implement rate limiting

Claude: Here's a token bucket implementation:

```python
class RateLimiter:
    def __init__(self, rate: float, capacity: int):
        self.rate = rate
        self.capacity = capacity
        # ... implementation
```

This provides rate limiting with...
"""

memory_id = await memory.create(
    content=chat_with_code,
    title="Rate Limiting Implementation",
    tags=["claude", "artifact", "python", "rate-limiting"]
)
```

### 3. Research Session with Attachments

```python
# Capture complete research with PDFs, images, links
research_memory = await memory.create(
    content="""Research Session: Transformer Optimizations
    
    Papers reviewed:
    - Flash Attention (Dao et al., 2022)
    - Sparse Transformers
    
    Key findings: [details]""",
    title="ML Research - Transformers",
    tags=["research", "ml", "transformers"],
    attachments=[
        "/path/to/flash_attention.pdf",
        "/path/to/architecture_diagram.png",
        "/path/to/implementation.py"
    ]
)

# The system will:
# - Extract text from PDFs (including tables/diagrams with vision)
# - Analyze images for technical content
# - Process code files
# - Generate searchable embeddings for everything
```

## 📸 Advanced Features

### Screenshot Analysis
```python
# Capture and understand screenshots
await memory.create(
    content="Error encountered during deployment",
    attachments=["screenshot.png"]  # System extracts error messages, UI state
)
```

### Rich Text Support
```python
# Markdown formatting is preserved and processed
markdown_content = """
# Project Architecture

## Components
- **Frontend**: React + TypeScript
- **Backend**: Node.js + GraphQL

```javascript
const server = new ApolloServer({ typeDefs, resolvers });
```

| Service | Status | Performance |
|---------|--------|-------------|
| API | ✅ | 50ms |
| DB | ✅ | 10ms |
"""

await memory.create(content=markdown_content, title="Architecture Doc")
```

### Entity Management
```python
# Automatic deduplication happens in background
# "Dr. Sarah Chen", "S. Chen", "Sarah Chen (Dr.)" → merged automatically

# Check entity timeline
timeline = await entity_manager.get_entity_timeline(entity_id)
```

### Intelligent Search
```python
# Semantic search across all content
results = await memory.search("transformer optimization techniques")

# Search includes:
# - Memory content
# - Extracted text from PDFs
# - Image descriptions
# - Code comments
# - Entity relationships
```

### Recommendations
```python
# Get related memories
recommendations = await recommender.get_recommendations(
    memory_id,
    strategy='hybrid'  # Uses entities, content similarity, temporal proximity
)
```

## 🔧 MCP Server Usage

The MCP server is running at `http://localhost:8000` with these endpoints:

### Create Memory
```bash
curl -X POST http://localhost:8000/memory \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Your Claude chat here",
    "title": "Chat Title",
    "tags": ["claude", "chat"],
    "attachments": ["path/to/file.pdf"]
  }'
```

### Search
```bash
curl "http://localhost:8000/search?q=transformer&limit=10"
```

## 💡 Best Practices

### 1. Organizing Claude Chats
```python
# Use consistent contexts
memory.set_context("claude_chats")  # For all Claude conversations
memory.set_context("research")       # For research sessions
memory.set_context("projects")       # For project documentation
```

### 2. Tagging Strategy
```python
# Recommended tags for Claude chats
tags = [
    "claude",
    "artifact",           # If contains code
    "python",            # Language used
    "data-structures",   # Topic
    "implementation",    # Type of content
    "2024-11"           # Time period
]
```

### 3. Batch Processing
```python
# Process multiple chats efficiently
async def process_claude_export(chats: List[dict]):
    tasks = []
    for chat in chats:
        task = memory.create(
            content=chat['content'],
            title=f"Claude: {chat['topic']}",
            tags=["claude", "batch-import"] + chat.get('tags', [])
        )
        tasks.append(task)
    
    results = await asyncio.gather(*tasks)
    return results
```

## 🚨 Troubleshooting

### If search seems slow:
```python
# Check if embeddings are being generated
result = await memory.create(content="test")
print(f"Has embedding: {'embedding' in result}")

# Verify vector index
async with db.get_connection() as conn:
    indexes = await conn.fetch("""
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'memory_entities'
    """)
```

### If entities aren't extracted:
```python
# Check AI status
ai = AIAssistant()
print(f"AI enabled: {ai.enabled}")
print(f"API key present: {bool(ai.gemini_api_key)}")
```

### If attachments fail:
```python
# Check storage backend
processor = AttachmentProcessor(db, ai)
print(f"Storage: {processor.storage_backend}")
print(f"GCS configured: {processor.gcs_bucket is not None}")
```

## 🎉 You're Ready!

Your PUO Memo system is production-ready. Start capturing:

1. **Every Claude chat** - Never lose an implementation or explanation
2. **Research sessions** - Papers, notes, and findings in one place
3. **Project documentation** - Code, diagrams, and discussions linked
4. **Meeting notes** - With automatic entity extraction
5. **Screenshots** - With AI understanding of content
6. **Code snippets** - Searchable across all languages

The system handles everything automatically:
- Generates embeddings for semantic search
- Extracts entities and relationships
- Processes attachments in the background
- Deduplicates entities
- Provides intelligent recommendations

Start capturing your knowledge now! 🚀