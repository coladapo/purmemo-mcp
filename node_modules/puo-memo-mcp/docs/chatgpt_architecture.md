# PUO Memo + ChatGPT Architecture

## Current State (Claude Desktop)
```
┌─────────────────┐
│ Claude Desktop  │
│   MCP Client    │
└────────┬────────┘
         │ stdio (JSON-RPC)
         ↓
┌─────────────────┐
│  PUO Memo MCP   │
│     Server      │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  PostgreSQL +   │
│    pgvector     │
└─────────────────┘
```

## ChatGPT Integration Architecture
```
┌─────────────────┐     ┌─────────────────┐
│     ChatGPT     │     │ Claude Desktop  │
│  Custom GPT     │     │   MCP Client    │
└────────┬────────┘     └────────┬────────┘
         │ HTTPS                 │ stdio
         ↓                       ↓
┌─────────────────┐     ┌─────────────────┐
│  REST Bridge    │     │  PUO Memo MCP   │
│  (FastAPI)      │────→│     Server      │
└─────────────────┘     └────────┬────────┘
    Port 8001                    │
                                ↓
                      ┌─────────────────┐
                      │  PostgreSQL +   │
                      │    pgvector     │
                      └─────────────────┘
```

## Data Flow Example

### Saving a Memory from ChatGPT:
1. User: "Save this conversation about Python optimization"
2. ChatGPT → REST Bridge: POST /memory
   ```json
   {
     "content": "Conversation about Python optimization...",
     "tags": ["python", "optimization"],
     "dedup_window": 300
   }
   ```
3. REST Bridge → MCP Server: Calls memory_store.create_with_dedup()
4. MCP Server → PostgreSQL: 
   - Check for duplicates using pgvector
   - Extract entities
   - Save memory
5. Response flows back to ChatGPT

### Searching from ChatGPT:
1. User: "What do I know about Sarah Chen?"
2. ChatGPT → REST Bridge: POST /recall
   ```json
   {
     "query": "Sarah Chen",
     "search_type": "entity"
   }
   ```
3. REST Bridge → MCP Server: Calls memory_store.search_by_entity()
4. MCP Server → PostgreSQL: 
   - Find entity "Sarah Chen"
   - Get associated memories
   - Return with relevance scores
5. ChatGPT displays formatted results

## Key Components

### 1. REST Bridge (FastAPI)
- **Purpose**: Translate HTTP/REST to MCP calls
- **Auth**: Bearer token authentication
- **Format**: JSON request/response
- **OpenAPI**: Auto-generated schema for ChatGPT

### 2. MCP Server
- **Protocol**: JSON-RPC over stdio
- **Tools**: memory, recall, entities, attach
- **Features**: Deduplication, embeddings, entity extraction

### 3. Shared Core
- **Database**: Same PostgreSQL instance
- **Memory Store**: Shared business logic
- **AI**: Gemini for embeddings/extraction

## Deployment Options

### Local Development:
```bash
# Terminal 1: MCP Server (for Claude)
cd /path/to/puo-memo
python -m src.mcp.server

# Terminal 2: REST Bridge (for ChatGPT)  
./start_chatgpt_bridge.sh

# Terminal 3: Expose to internet
ngrok http 8001
```

### Production:
```
┌─────────────────┐
│   Render.com    │
│  REST Bridge    │
│   (Public URL)  │
└────────┬────────┘
         │ Internal network
         ↓
┌─────────────────┐
│ Google Cloud    │
│   Cloud SQL     │
│  PostgreSQL     │
└─────────────────┘
```

## Benefits of This Architecture

1. **Unified Data**: Both Claude and ChatGPT access same knowledge base
2. **Feature Parity**: All PUO Memo features available to both
3. **Flexibility**: Can add more clients (Slack, Discord, etc.)
4. **Maintainability**: Core logic in one place
5. **Security**: API key auth, HTTPS, rate limiting

## Future Enhancements

1. **WebSocket Support**: Real-time updates
2. **Batch API**: Process multiple operations
3. **Webhook Events**: Notify ChatGPT of new memories
4. **Direct MCP in ChatGPT**: If OpenAI adds MCP support