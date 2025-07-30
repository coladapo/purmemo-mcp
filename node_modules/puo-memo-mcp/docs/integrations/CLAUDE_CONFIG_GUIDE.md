# Claude Desktop MCP Configuration Guide

## Overview
Configure Claude Desktop to use PUO Memo MCP for unified memory management with all latest features.

## Configuration Location
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

## Complete Configuration

```json
{
  "mcpServers": {
    "puo-memo": {
      "command": "python",
      "args": [
        "/Users/wivak/puo-jects/active/puo memo mcp/src/mcp/server.py"
      ],
      "env": {
        "PYTHONPATH": "/Users/wivak/puo-jects/active/puo memo mcp",
        "DB_HOST": "35.235.107.217",
        "DB_PORT": "5432",
        "DB_NAME": "puo_memo",
        "DB_USER": "puo_app_user",
        "DB_PASSWORD": "your_password_here",
        "GEMINI_API_KEY": "your_gemini_api_key_here",
        "GCS_BUCKET_NAME": "puo-memo-attachments",
        "GCS_PROJECT_ID": "puo-studio",
        "DEFAULT_CONTEXT": "claude",
        "DEDUP_TIME_WINDOW_CLAUDE": "600",
        "REDIS_URL": "redis://localhost:6379",
        "ENABLE_BACKGROUND_TASKS": "true",
        "ENABLE_NLP_SEARCH": "true"
      }
    }
  }
}
```

## Available Tools

### 1. 💾 memory - Enhanced Memory Creation
```
Save anything to memory with:
- Automatic deduplication (10-minute window for Claude)
- Smart merging strategies
- Background embedding generation
- Entity extraction
- URL attachment support
- Memory versioning
```

Example:
```
Use the memory tool to save: "Implemented retry logic with exponential backoff and circuit breakers for all external API calls"
```

### 2. 🔍 recall - Advanced Search
```
Search memories with multiple methods:
- keyword: Traditional text search
- semantic: AI-powered similarity search
- hybrid: Combines keyword and semantic
- entity: Search by people, projects, topics
- nlp: Natural language queries like "memories from last week"
```

Example:
```
Use recall with search_type="nlp" and query="Python code from yesterday about retry logic"
```

### 3. 🧠 entities - Knowledge Graph Explorer
```
Explore extracted entities and their relationships:
- List all entities by type
- Get entity relationship graphs
- Track mentions across memories
```

Example:
```
Use entities tool to show all people mentioned in my memories
```

### 4. 📎 attach - File Attachment Management
```
Attach files and URLs to memories:
- Local file uploads
- URL content downloading
- Automatic text extraction
- Vision analysis for images
- PDF processing with OCR
```

Example:
```
Use attach tool to add https://example.com/api-docs to memory_id abc-123
```

### 5. 📥 import_chat - Conversation Importer
```
Import conversations from various sources:
- Claude conversation exports
- ChatGPT chat history
- Generic AI chat formats
- Automatic entity extraction
- Action item detection
```

Example:
```
Use import_chat to import the file at /Users/me/Downloads/claude-export.json
```

### 6. 🔗 find_references - Reference Discovery
```
Find external references and action items:
- GitHub repository mentions
- URL references
- Slack user mentions
- TODO/action items
- Cross-conversation links
```

Example:
```
Use find_references with reference_type="action_item" and status="pending"
```

### 7. 🔄 link_conversations - Conversation Linking
```
Create relationships between conversations:
- continuation: Direct follow-up
- reference: Mentions another conversation
- related: Similar topic
- followup: Action item completion
```

Example:
```
Use link_conversations to link conversation-123 to conversation-456 as a "continuation"
```

## Features Enabled

### 🚀 Performance Enhancements
- **Redis Caching**: Embedding and search result caching
- **Connection Pooling**: Reused connections for all services
- **Background Tasks**: Non-blocking operations
- **Pagination**: Efficient large result handling

### 🛡️ Reliability Features
- **Retry Logic**: Exponential backoff with circuit breakers
- **Error Handling**: Graceful degradation
- **Deduplication**: Configurable time windows
- **Memory Versioning**: Full edit history

### 🔍 Search Capabilities
- **NLP Search**: "memories from last week about Python"
- **Temporal Filtering**: Date-based queries
- **Entity Search**: Find by people, projects, topics
- **Hybrid Search**: Best of keyword + semantic

### 📎 Attachment Support
- **URL Downloads**: Save web content directly
- **Vision Analysis**: Extract text from images
- **PDF Processing**: Smart page analysis
- **GCS Storage**: Scalable file storage

## Quick Test Commands

Test each feature after setup:

```
1. Save a memory:
   "Use memory tool to save: Testing Claude Desktop integration with all features enabled"

2. Test NLP search:
   "Use recall with search_type='nlp' to find memories from today"

3. Check entities:
   "Use entities tool to list all entities"

4. Test versioning:
   "Update the memory we just created with new content"

5. Test attachments:
   "Attach this URL to the test memory: https://example.com"
```

## Troubleshooting

### If MCP doesn't appear in Claude:
1. Restart Claude Desktop
2. Check configuration file syntax
3. Verify Python path: `which python`
4. Test server manually: `python src/mcp/server.py`

### Common Issues:
- **"Server failed to start"**: Check Python dependencies
- **"Database connection failed"**: Verify credentials
- **"Redis connection failed"**: Start Redis: `redis-server`

## Environment Variables

Create `.env` file if missing:
```bash
DB_HOST=35.235.107.217
DB_PORT=5432
DB_NAME=puo_memo
DB_USER=puo_app_user
DB_PASSWORD=your_password
GEMINI_API_KEY=your_key
GCS_BUCKET_NAME=puo-memo-attachments
GCS_PROJECT_ID=puo-studio
REDIS_URL=redis://localhost:6379
```

## Next Steps

1. **Test all tools** to ensure they're working
2. **Import existing conversations** using import_chat
3. **Set up regular exports** from Claude
4. **Configure ChatGPT bridge** for cross-platform sync