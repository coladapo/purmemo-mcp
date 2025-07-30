# PUO Memo MCP Quick Reference

## 🚀 Quick Start
```bash
# Start services
docker-compose up -d

# Check health
curl http://localhost:8000/health

# Your first memory
curl -X POST http://localhost:8000/memory \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello PUO Memo!"}'
```

## 🔑 Authentication
```bash
# All requests need auth header
Authorization: Bearer YOUR_API_KEY

# Get your key from .env file
cat .env | grep API_KEY
```

## 📝 Memory Operations

### Store Memory
```bash
POST /memory
{
  "content": "Memory content",
  "title": "Optional title",
  "tags": ["tag1", "tag2"],
  "metadata": {"key": "value"}
}
```

### Search Memories
```bash
# Keyword search
GET /recall?query=keyword

# Semantic search
GET /recall?query=concept&search_type=semantic

# With filters
GET /recall?query=project&tags=important&limit=10
```

### Update Memory
```bash
PUT /memory/{id}
{
  "content": "Updated content",
  "tags": ["new-tag"]
}
```

### Delete Memory
```bash
DELETE /memory/{id}
```

## 📎 Attachments

### Upload File
```bash
POST /memory/{id}/attach
Content-Type: multipart/form-data
file: <binary>
```

### List Attachments
```bash
GET /memory/{id}/attachments
```

## 🔍 Advanced Search

### Search Types
- `keyword` - Exact match search
- `semantic` - AI-powered similarity search  
- `hybrid` - Best of both (default)
- `entity` - Search by extracted entities
- `nlp` - Natural language search

### Search Parameters
```bash
GET /recall?
  query=text&              # Search query (required)
  search_type=hybrid&      # Search algorithm
  limit=10&                # Max results
  offset=0&                # Pagination
  tags=tag1,tag2&         # Filter by tags
  start_date=2025-01-01&  # Date range
  end_date=2025-01-31
```

## 🤖 MCP Tools (Claude/Cursor)

### Store Memory
```
Tool: memory
Parameters:
- content: "Text to remember"
- tags: ["optional", "tags"]
- title: "Optional title"
```

### Search Memories
```
Tool: recall
Parameters:
- query: "search terms"
- search_type: "semantic"
- limit: 10
```

### Entity Explorer
```
Tool: entities
Parameters:
- entity_name: "John Doe"
- entity_type: "person"
- depth: 2
```

## 🔗 Integrations

### Claude Desktop
```json
{
  "mcpServers": {
    "puo-memo": {
      "command": "python",
      "args": ["path/to/src/mcp/secure_server.py"]
    }
  }
}
```

### ChatGPT Custom GPT
1. Import OpenAPI: `config/chatgpt_openapi.json`
2. Set base URL: `https://your-domain.com`
3. Add API key in GPT settings

### Cursor IDE
```bash
python scripts/data/update_cursor_config.py
```

## 📊 Entity Types
- `person` - People mentioned
- `organization` - Companies, groups
- `location` - Places, addresses
- `event` - Meetings, occurrences
- `project` - Project names
- `technology` - Tech, tools, languages
- `concept` - Ideas, topics
- `document` - Files, reports

## 🛠️ Utilities

### Health Check
```bash
GET /health
GET /health/ready
GET /health/live
```

### Statistics
```bash
GET /stats
GET /memory/stats
```

### Export Data
```bash
python scripts/data_export_import.py export \
  --output backup.json
```

### Import Data
```bash
python scripts/data_export_import.py import \
  --input backup.json
```

## 🚨 Common Issues

### Auth Error
```bash
# Check API key
echo $PUO_MEMO_API_KEY

# Test auth
curl -H "Authorization: Bearer YOUR_KEY" \
  http://localhost:8000/health
```

### No Results
```bash
# Check if memories exist
curl -H "Authorization: Bearer YOUR_KEY" \
  http://localhost:8000/stats

# Try broader search
GET /recall?query=*&limit=10
```

### Slow Search
```bash
# Enable cache
export CACHE_ENABLED=true

# Check performance
GET /metrics
```

## 🔧 Admin Commands

### Database Migration
```bash
alembic upgrade head
```

### Clear Cache
```bash
redis-cli FLUSHDB
```

### Backup Database
```bash
./scripts/backup/backup.sh
```

### View Logs
```bash
# API logs
tail -f archive/logs/api_server.log

# MCP logs  
tail -f archive/logs/mcp_server.log
```

## 📈 Performance Tips
1. Enable Redis cache for faster searches
2. Use pagination for large result sets
3. Index frequently searched fields
4. Batch operations when possible
5. Monitor `/metrics` endpoint

## 🔐 Security Notes
- Rotate API keys monthly
- Use HTTPS in production
- Enable rate limiting
- Audit log access
- Backup data regularly

## 📞 Support
- Docs: `/docs`
- Health: `/health`
- Metrics: `/metrics`
- Version: `/version`