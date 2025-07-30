# PUO Memo MCP User Guide

Welcome to PUO Memo MCP - Your unified memory system for the Model Context Protocol ecosystem.

## Table of Contents
1. [Getting Started](#getting-started)
2. [Core Features](#core-features)
3. [Using PUO Memo](#using-puo-memo)
4. [Integrations](#integrations)
5. [Advanced Features](#advanced-features)
6. [Troubleshooting](#troubleshooting)
7. [API Reference](#api-reference)

---

## Getting Started

### What is PUO Memo?
PUO Memo MCP is a sophisticated memory management system that provides:
- Persistent storage for your AI conversations and knowledge
- Intelligent search and retrieval
- Cross-platform integration (Claude Desktop, ChatGPT, Cursor)
- Advanced features like entity extraction and knowledge graphs

### Quick Start

#### 1. Installation
```bash
# Clone the repository
git clone https://github.com/yourusername/puo-memo-mcp.git
cd puo-memo-mcp

# Install dependencies
pip install -r requirements.txt

# Set up environment
cp .env.example .env
# Edit .env with your configuration
```

#### 2. Start the Services
```bash
# Start all services with Docker
docker-compose up -d

# Or start individually
python src/api/secure_server.py  # REST API
python src/mcp/secure_server.py  # MCP Server
```

#### 3. First Memory
```bash
# Using the REST API
curl -X POST http://localhost:8000/memory \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "This is my first memory in PUO Memo!",
    "tags": ["getting-started", "test"]
  }'
```

---

## Core Features

### Memory Storage
Store any type of information with rich metadata:

```python
# Python example
import requests

# Store a memory
response = requests.post(
    "http://localhost:8000/memory",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={
        "content": "Important meeting notes from project kickoff",
        "title": "Project X Kickoff",
        "tags": ["project-x", "meetings", "2025"],
        "metadata": {
            "attendees": ["Alice", "Bob", "Charlie"],
            "date": "2025-01-27",
            "action_items": 5
        }
    }
)
memory_id = response.json()["id"]
```

### Intelligent Search
Search using natural language, keywords, or semantic similarity:

```python
# Keyword search
results = requests.get(
    "http://localhost:8000/recall",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    params={"query": "project kickoff"}
).json()

# Semantic search
results = requests.get(
    "http://localhost:8000/recall",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    params={
        "query": "What were the main decisions from our initial planning?",
        "search_type": "semantic"
    }
).json()
```

### Attachments
Attach files, images, and documents to memories:

```python
# Upload attachment
with open("diagram.png", "rb") as f:
    response = requests.post(
        f"http://localhost:8000/memory/{memory_id}/attach",
        headers={"Authorization": "Bearer YOUR_API_KEY"},
        files={"file": ("diagram.png", f, "image/png")}
    )
```

---

## Using PUO Memo

### With Claude Desktop

1. **Configure Claude Desktop**
   ```json
   // Add to Claude Desktop config
   {
     "mcpServers": {
       "puo-memo": {
         "command": "python",
         "args": ["path/to/puo-memo/src/mcp/secure_server.py"],
         "env": {
           "PUO_MEMO_API_KEY": "your-api-key"
         }
       }
     }
   }
   ```

2. **Available Commands in Claude**
   - `memory`: Store new information
   - `recall`: Search memories
   - `entities`: View extracted entities
   - `attach`: Add attachments

### With ChatGPT

1. **Set up Custom GPT**
   - Import the OpenAPI schema from `config/chatgpt_openapi.json`
   - Configure authentication with your API key
   - Set the base URL to your PUO Memo instance

2. **Use Natural Language**
   ```
   "Remember that the project deadline is March 15th"
   "What did we discuss about the budget?"
   "Show me all memories related to Python development"
   ```

### With Cursor IDE

1. **Install MCP Extension**
   ```bash
   # Run the Cursor configuration script
   python scripts/data/update_cursor_config.py
   ```

2. **Use in Code Comments**
   ```python
   # @puo-memo: Remember this function handles user authentication
   def authenticate_user(username, password):
       # Implementation
   ```

---

## Integrations

### Browser Extension
Save web content directly to PUO Memo:

1. Install the bookmarklet:
   ```javascript
   javascript:(function(){
     // Copy from scripts/bookmarklet.js
   })();
   ```

2. Click while browsing to save current page

### API Integrations

#### Slack Bot
```python
# Example Slack integration
@app.message("remember")
def handle_remember(message, say):
    # Store message in PUO Memo
    response = puo_memo.store(
        content=message["text"],
        tags=["slack", f"channel-{message['channel']}"],
        metadata={"user": message["user"]}
    )
    say(f"Remembered! ID: {response['id']}")
```

#### GitHub Actions
```yaml
# .github/workflows/document.yml
- name: Store PR Summary
  uses: http-request-action@v1
  with:
    url: ${{ secrets.PUO_MEMO_URL }}/memory
    method: POST
    headers: |
      Authorization: Bearer ${{ secrets.PUO_MEMO_KEY }}
    data: |
      {
        "title": "PR #${{ github.event.pull_request.number }}",
        "content": "${{ github.event.pull_request.body }}",
        "tags": ["github", "pr", "${{ github.repository }}"]
      }
```

---

## Advanced Features

### Entity Extraction
Automatically extract people, organizations, locations, and concepts:

```python
# Entities are extracted automatically
memory = puo_memo.store(
    content="Meeting with John from Acme Corp about the New York expansion"
)
# Automatically extracts:
# - Person: John
# - Organization: Acme Corp
# - Location: New York
# - Concept: expansion
```

### Knowledge Graph
Explore relationships between memories:

```python
# Get entity relationships
graph = requests.get(
    "http://localhost:8000/entities/graph",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    params={"entity_name": "Acme Corp", "depth": 2}
).json()

# Returns connected entities and memories
```

### Smart Recommendations
Get suggested related content:

```python
# Get recommendations based on current context
recommendations = requests.post(
    "http://localhost:8000/recommendations",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={"context": "Working on Python API development"}
).json()
```

### Chat Import
Import conversations from other platforms:

```bash
# Import ChatGPT conversation
python scripts/data/import_chat_data.py \
  --platform chatgpt \
  --file exports/chatgpt_conversations.json

# Import Claude conversation
python scripts/data/import_chat_data.py \
  --platform claude \
  --file exports/claude_export.json
```

### Data Export
Export your data for backup or migration:

```bash
# Export all memories
python scripts/data_export_import.py export \
  --output backups/puo_memo_backup.json

# Export specific date range
python scripts/data_export_import.py export \
  --start-date 2025-01-01 \
  --end-date 2025-01-31 \
  --output january_memories.json
```

---

## Troubleshooting

### Common Issues

#### "Authentication failed"
- Check your API key in `.env`
- Ensure the token hasn't expired
- Verify the Authorization header format: `Bearer YOUR_KEY`

#### "Cannot connect to server"
```bash
# Check services are running
docker-compose ps

# Check logs
docker-compose logs api mcp

# Test connectivity
curl http://localhost:8000/health
```

#### "Search returns no results"
- Verify memories exist: `GET /memory/stats`
- Check search syntax
- Try different search types (keyword vs semantic)
- Ensure embeddings are generated (for semantic search)

#### "Attachment upload fails"
- Check file size (default limit: 50MB)
- Verify file permissions
- Ensure storage backend is configured
- Check available disk space

### Performance Optimization

#### Slow Searches
```python
# Enable caching
export CACHE_ENABLED=true
export REDIS_URL=redis://localhost:6379

# Warm cache for frequently accessed data
python scripts/analysis/performance_benchmark.py --warm-cache
```

#### High Memory Usage
```bash
# Adjust connection pool size
export MAX_CONNECTIONS=20

# Enable connection pooling optimization
python scripts/fix_performance_issues.py
```

---

## API Reference

### Authentication
All API requests require authentication:
```
Authorization: Bearer YOUR_API_KEY
```

### Endpoints

#### Memory Operations
- `POST /memory` - Create memory
- `GET /memory/{id}` - Get memory
- `PUT /memory/{id}` - Update memory
- `DELETE /memory/{id}` - Delete memory
- `GET /recall` - Search memories

#### Attachment Operations
- `POST /memory/{id}/attach` - Upload attachment
- `GET /memory/{id}/attachments` - List attachments
- `DELETE /attachment/{id}` - Delete attachment

#### Entity Operations
- `GET /entities` - List all entities
- `GET /entities/graph` - Get entity graph
- `GET /entities/{type}` - Get entities by type

#### Utility Operations
- `GET /health` - Health check
- `GET /stats` - System statistics
- `POST /recommendations` - Get recommendations

### MCP Tools

Available tools when using with Claude or other MCP clients:

1. **memory** - Store information
   ```
   Parameters:
   - content (required): Text to remember
   - tags (optional): Array of tags
   - title (optional): Memory title
   ```

2. **recall** - Search memories
   ```
   Parameters:
   - query (required): Search query
   - search_type (optional): keyword|semantic|hybrid
   - limit (optional): Max results
   ```

3. **entities** - Explore entities
   ```
   Parameters:
   - entity_name (optional): Specific entity
   - entity_type (optional): Filter by type
   ```

### Rate Limits
- Default: 100 requests per minute
- Burst: 200 requests
- Per-user limits configurable

### Error Codes
| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Invalid API key |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |

---

## Best Practices

### Memory Organization
1. **Use descriptive titles** for easy scanning
2. **Tag consistently** with a taxonomy
3. **Add metadata** for filtering and search
4. **Link related memories** using references

### Search Strategies
1. **Start broad** then refine
2. **Use semantic search** for concepts
3. **Use keyword search** for exact matches
4. **Combine search types** for best results

### Security
1. **Rotate API keys** regularly
2. **Use environment variables** for secrets
3. **Enable audit logging** for compliance
4. **Backup data** regularly

### Performance
1. **Enable caching** for read-heavy workloads
2. **Use batch operations** when possible
3. **Monitor metrics** to identify bottlenecks
4. **Scale horizontally** for high load

---

## Support

### Getting Help
- GitHub Issues: [github.com/yourusername/puo-memo-mcp/issues](https://github.com/yourusername/puo-memo-mcp/issues)
- Documentation: [docs.puo-memo.com](https://docs.puo-memo.com)
- Community Forum: [forum.puo-memo.com](https://forum.puo-memo.com)

### Contributing
We welcome contributions! See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

### License
PUO Memo MCP is licensed under the MIT License. See [LICENSE](../LICENSE) for details.