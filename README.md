# PUO Memo MCP - Clean Architecture

A memory system with Model Context Protocol (MCP) integration, featuring a clean, modular architecture.

## 📁 Project Structure

```
puo-memo-mcp/
├── src/
│   ├── core/             # Core business logic
│   │   ├── memory.py     # Memory CRUD operations
│   │   ├── database.py   # Database connection management
│   │   └── ai.py         # Optional AI features (Gemini)
│   ├── mcp/              # MCP server implementation
│   │   └── server.py     # MCP server with 2 tools
│   ├── api/              # REST API for browser extension
│   │   └── server.py     # HTTP API server
│   └── utils/            # Utilities
│       └── config.py     # Configuration management
├── scripts/              # Utility scripts
│   ├── setup_database.py
│   ├── check_system_status.py
│   └── check_db_contents.py
├── tests/                # Test suite
│   └── test_memory.py
├── archive/              # Old/legacy code
├── .env                  # Environment configuration
└── requirements.txt      # Python dependencies
```

## 🚀 Quick Start

### 1. Setup Environment

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment file (if needed)
cp .env.example .env
# Edit .env with your database credentials
```

### 2. Setup Database

```bash
python scripts/setup_database.py
```

### 3. Run Components

**MCP Server** (for Claude Desktop):
```bash
python -m src.mcp.server
```

**API Server** (for browser extension):
```bash
python -m src.api.server
```

## 🛠 Architecture

### Core Components

1. **MemoryStore** (`src/core/memory.py`)
   - Handles all memory CRUD operations
   - Clean, async interface
   - Type-safe with proper hints

2. **DatabaseConnection** (`src/core/database.py`)
   - PostgreSQL connection pooling
   - Async context managers
   - Automatic cleanup

3. **AIAssistant** (`src/core/ai.py`)
   - Optional Gemini integration
   - Smart title generation
   - Tag suggestions

### MCP Server

- Just 2 tools: `memory` and `recall`
- Clean implementation in `src/mcp/server.py`
- Auto-starts with Claude Desktop

### API Server

- RESTful endpoints for browser extension
- CORS enabled for browser access
- Clean implementation in `src/api/server.py`

## 📝 Configuration

All configuration is managed through environment variables or `pydantic` settings:

```python
# src/utils/config.py
- Database settings
- AI API keys
- Server ports
- Connection pool settings
```

## 🧪 Testing

Run the test suite:

```bash
python tests/test_memory.py
```

## 🔧 MCP Configuration

Add to Claude Desktop's config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "puo-memo": {
      "command": "/path/to/venv/bin/python",
      "args": ["-m", "src.mcp.server"],
      "cwd": "/path/to/puo-memo-mcp",
      "env": {
        "PYTHONPATH": "."
      }
    }
  }
}
```

## 📚 Key Benefits of Refactoring

1. **Clean Architecture** - Separated concerns, easy to maintain
2. **Type Safety** - Full type hints throughout
3. **Modular Design** - Easy to extend with new features
4. **Proper Testing** - Automated test suite
5. **Configuration Management** - Centralized settings
6. **No Code Duplication** - Single source of truth

## 🎯 Available Tools

### 1. `memory`
Save anything to memory. Creates new memories or updates existing ones.
```
Examples: 
- "memory: Just learned about Python decorators"
- "memory: [with id] Updated understanding of decorators"
```

### 2. `recall`
Search your memories or list recent ones.
```
Examples:
- "recall: Python decorators" (search)
- "recall:" (list recent memories)
```

## 🔍 System Status

Check system status:
```bash
python scripts/check_system_status.py
```

Check database contents:
```bash
python scripts/check_db_contents.py
```

## 📋 Next Steps

- Add graph-based memory features
- Implement vector search
- Add more AI capabilities
- Create web UI dashboard

## License

MIT License - Use freely!