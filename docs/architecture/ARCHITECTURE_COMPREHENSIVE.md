# PUO Memo Ultra Simple - Comprehensive Architecture

## 🏗️ System Architecture Overview

```mermaid
graph TB
    subgraph "Browser Environment"
        ME[MemoryLane Extension v2.0]
        CW[Claude.ai Web]
        CGW[ChatGPT Web]
        LS[Local Storage<br/>chrome.storage.local]
        
        ME --> |Capture| CW
        ME --> |Capture| CGW
        ME --> |Store Offline| LS
    end
    
    subgraph "Local Services (Port 8000)"
        API[API Server<br/>api_server.py<br/>:8000]
        
        LS --> |Sync Pending<br/>Every 60s| API
        ME --> |Direct POST| API
    end
    
    subgraph "Claude Desktop Environment"
        CD[Claude Desktop App]
        MCP[PUO Memo MCP<br/>Ultra Simple]
        CFG[claude_desktop_config.json]
        
        CD --> |Loads Config| CFG
        CFG --> |Spawns Process| MCP
        CD <--> |stdio/jsonrpc| MCP
    end
    
    subgraph "MCP Server Process"
        USS[server_ultra_simple.py]
        TOOL1[memory Tool]
        TOOL2[recall Tool]
        PMS[PuoMemoSimple Class]
        
        USS --> TOOL1
        USS --> TOOL2
        USS --> PMS
    end
    
    subgraph "Cloud SQL Database"
        DB[(PostgreSQL<br/>35.235.107.217)]
        MET[memory_entities table]
        PCT[project_contexts table]
        
        DB --> MET
        DB --> PCT
    end
    
    subgraph "AI Services"
        GEMINI[Google Gemini API<br/>gemini-1.5-flash]
    end
    
    %% Connections
    API --> |asyncpg| DB
    MCP --> |asyncpg| DB
    PMS --> |Optional AI| GEMINI
    API --> |Uses| PMS
    
    style ME fill:#f9f,stroke:#333,stroke-width:2px
    style MCP fill:#9ff,stroke:#333,stroke-width:2px
    style DB fill:#ff9,stroke:#333,stroke-width:2px
```

## 📊 Component Details

### 1. **MemoryLane Extension** (Browser)
- **Location**: `/Users/wivak/puo-jects/active/memorylane-extension`
- **Version**: 2.0.0
- **Function**: Captures AI conversations from Claude.ai and ChatGPT
- **Features**:
  - Manual capture via browser action
  - Offline storage with sync queue
  - Content extraction from AI chat interfaces
  - Retry mechanism for failed syncs

### 2. **API Server** (Local HTTP Bridge)
- **Location**: `/Users/wivak/puo-jects/active/puo memo mcp/api_server.py`
- **Port**: 8000
- **Endpoints**:
  - `POST /memory` - Receives captures from extension
  - `GET /memories` - List memories
  - `GET /search` - Search memories
  - `GET /` - Health check
- **CORS**: Enabled for browser extension access

### 3. **MCP Server** (Claude Desktop Integration)
- **Location**: `/Users/wivak/puo-jects/active/puo memo mcp/server_ultra_simple.py`
- **Protocol**: stdio/JSON-RPC via MCP SDK
- **Tools**: Just 2!
  - `memory` - Save/Update memories
  - `recall` - Search/List memories
- **Process**: Spawned by Claude Desktop

### 4. **Shared Backend** (PuoMemoSimple)
- **Location**: `/Users/wivak/puo-jects/active/puo memo mcp/puo_memo_simple.py`
- **Functions**:
  - Database operations (asyncpg)
  - Optional AI enhancement (Gemini)
  - Memory CRUD operations
- **Used by**: Both API Server and MCP Server

### 5. **Database** (Cloud SQL)
- **Host**: 35.235.107.217
- **Type**: PostgreSQL
- **Database**: puo_memo
- **Tables**:
  - `memory_entities` - Stores all memories
  - `project_contexts` - Project organization

## 🔄 Data Flow Scenarios

### Scenario 1: Browser Capture → Database
```
1. User clicks capture in MemoryLane extension
2. Extension extracts conversation from Claude/ChatGPT
3. Data saved to chrome.storage.local (offline first)
4. Sync process sends to API server (:8000)
5. API server uses PuoMemoSimple to save to DB
6. Memory available in both browser and Claude Desktop
```

### Scenario 2: Claude Desktop → Database
```
1. User types "memory: Learn about X" in Claude
2. Claude Desktop sends to MCP server via stdio
3. MCP server processes with memory tool
4. PuoMemoSimple saves to same database
5. Memory available in both Claude and browser
```

## 🔐 Security & Configuration

### Environment Variables (.env)
```bash
DB_HOST=35.235.107.217
DB_PORT=5432
DB_NAME=puo_memo
DB_USER=puo_app_user
DB_PASSWORD=ZBGTMG(LX1slVz5%
GEMINI_API_KEY=AIzaSyCFWTngKUhT_qXqe6xwbz7jcAdSpXMh2YA
```

### Claude Desktop Config
```json
{
  "mcpServers": {
    "puo-memo": {
      "command": "/path/to/venv/bin/python3",
      "args": ["/path/to/server_ultra_simple.py"]
    }
  }
}
```

## 🚀 Key Advantages

1. **Ultra Simple**: Just 2 tools (memory/recall)
2. **Unified Storage**: Single database for all sources
3. **Offline First**: Browser extension works offline
4. **Multi-Source**: Captures from Claude, ChatGPT, and MCP
5. **AI Enhanced**: Optional Gemini integration

## 📈 Performance Characteristics

- **API Server**: Async, handles concurrent requests
- **MCP Server**: Single process per Claude Desktop
- **Database**: Cloud SQL with connection pooling
- **Sync**: Background sync every 60 seconds
- **Memory Usage**: ~92MB for MCP server

## 🔧 Running Services

To run the complete system:

```bash
# 1. Start API Server (for browser extension)
python api_server.py

# 2. MCP Server (auto-started by Claude Desktop)
# Configured in claude_desktop_config.json

# 3. Browser Extension
# Install in Chrome/Edge from extension directory
```

## 🎯 Architecture Principles

1. **Simplicity First**: Minimal tools, clear purpose
2. **Shared Storage**: One database, multiple access points
3. **Resilient Capture**: Offline-first with retry
4. **Clean Separation**: Each component has one job
5. **Standard Protocols**: HTTP, JSON-RPC, PostgreSQL