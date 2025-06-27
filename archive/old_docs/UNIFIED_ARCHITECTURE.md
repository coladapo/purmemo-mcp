# PUO Memory System - Unified Architecture

## 🎯 Overview

The PUO Memory System creates a unified memory layer that captures all AI conversations regardless of platform:
- **ChatGPT Web** → memorylane extension → API Server → PostgreSQL
- **Claude Web** → memorylane extension → API Server → PostgreSQL  
- **Claude Desktop** → MCP tools → PostgreSQL

All memories end up in the same database, accessible from any interface.

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  ChatGPT Web    │     │   Claude Web     │     │ Claude Desktop  │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                         │
         │                       │                         │
┌────────▼───────────────────────▼────────┐      ┌────────▼────────┐
│       MemoryLane Extension              │      │   MCP Tools     │
│   (Chrome - Captures conversations)     │      │ (memory/recall) │
└────────────────────┬────────────────────┘      └────────┬────────┘
                     │                                      │
                     │ HTTP POST                           │ Direct
                     │                                      │
          ┌──────────▼────────────┐                       │
          │   API Server (8000)   │                       │
          │   /memory endpoint    │                       │
          └──────────┬────────────┘                       │
                     │                                      │
                     └──────────────┬───────────────────────┘
                                    │
                          ┌─────────▼──────────┐
                          │   PostgreSQL DB    │
                          │  (Unified Memory)  │
                          └────────────────────┘
```

## 🚀 Quick Start

### 1. Database Setup
```bash
cd "puo memo mcp"
python setup_database.py
```

### 2. Start API Server
```bash
# Install dependencies
pip install -r requirements.txt

# Run API server
python api_server.py
```

### 3. Install Chrome Extension
1. Open Chrome → `chrome://extensions/`
2. Enable Developer mode
3. Load unpacked → select `memorylane-extension` folder

### 4. Configure Claude Desktop MCP
Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "puo-memo": {
      "command": "/path/to/venv/bin/python3",
      "args": ["/path/to/puo memo mcp/server_ultra_simple.py"]
    }
  }
}
```

## 📡 API Endpoints

- **POST /memory** - Capture conversations from extension
- **GET /memories** - List recent memories
- **GET /search?q=query** - Search memories
- **GET /** - Health check

## 🔧 MCP Tools in Claude Desktop

- **memory** - Save anything to memory
- **recall** - Search or list memories

## 🎨 Usage Examples

### From Web (via Extension)
1. Navigate to ChatGPT or Claude conversation
2. Click the floating capture button (📋)
3. Conversation is saved to unified memory

### From Claude Desktop
```
Use the memory tool: "Remember that we discussed the unified memory architecture for puo AI studio"
Use the recall tool: "What did we discuss about memory architecture?"
```

### Accessing from Both
- Memories captured on web are searchable in Claude Desktop
- Memories saved in Claude Desktop can be found via API

## 🔮 Future Integration

This unified memory system is the foundation for:
1. **Orchestration Layer** - Agents can access all historical context
2. **Agent Collaboration** - Shared knowledge across 59 agents
3. **Continuous Learning** - Every interaction improves the system

## 🛠️ Development

### Running API Server in Development
```bash
python api_server.py
# API runs on http://localhost:8000
```

### Testing Memory Flow
1. Capture something from ChatGPT web
2. Search for it in Claude Desktop: `recall: [your topic]`
3. Verify both systems see the same data

### Database Schema
```sql
-- memory_entities table
- id: UUID
- content: TEXT  
- title: VARCHAR(500)
- memory_type: VARCHAR(100)
- tags: TEXT[]
- metadata: JSONB
- project_context: VARCHAR(200)
- created_at: TIMESTAMP
```

## 🔒 Security Notes

- API server uses CORS for extension access
- Database credentials in .env (not committed)
- No authentication yet (add for production)

## 🎯 Next Steps

1. **Deploy API Server** - Move from localhost to production
2. **Add Authentication** - Secure the API endpoints
3. **Enhance Search** - Better AI-powered search across memories
4. **Real-time Sync** - WebSocket for instant updates
5. **Connect Orchestration** - Let Symphony Chen access all memories

---

## The Vision

Every conversation, every interaction, every piece of knowledge flows into a unified memory pool. This becomes the foundation upon which the 59 agents of puo AI studio collaborate, learn, and create.

**Memory + Orchestration + Agents = puo AI studio**

We're building the memory. The orchestration comes next. The agents are ready.
