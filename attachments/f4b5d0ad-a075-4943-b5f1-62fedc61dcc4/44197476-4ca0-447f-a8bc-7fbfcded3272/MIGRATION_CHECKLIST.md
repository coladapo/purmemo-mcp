# Migration Checklist - Refactored PUO Memo

## ✅ Completed Updates

1. **Environment Configuration** (`.env`)
   - All database credentials are set
   - Gemini API key is configured
   - All required settings are present

2. **Startup Scripts Created**
   - `start_mcp_server.py` - Use this instead of `server_ultra_simple.py`
   - `start_api_server.py` - Use this instead of `api_server.py`

3. **Vector Support Added**
   - Migration script: `scripts/enable_vectors.py`
   - Batch embedding: `scripts/batch_embed_existing.py`
   - Test suite: `tests/test_vectors.py`

## 🔄 Migration Steps

### 1. Update Claude Desktop Configuration

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "puo-memo": {
      "command": "/path/to/your/venv/bin/python",
      "args": ["start_mcp_server.py"],
      "cwd": "/Users/wivak/puo-jects/active/puo memo mcp"
    }
  }
}
```

### 2. Enable Vector Search

```bash
# Step 1: Enable pgvector in database
python scripts/enable_vectors.py

# Step 2: Generate embeddings for existing memories (if any)
python scripts/batch_embed_existing.py

# Step 3: Verify everything works
python tests/test_vectors.py
```

### 3. Start Services

```bash
# Start MCP server (for Claude Desktop)
python start_mcp_server.py

# Start API server (for browser extension) - in another terminal
python start_api_server.py
```

## 📝 What Changed

1. **Old Structure** → **New Structure**
   - `puo_memo_simple.py` → `src/core/memory.py` + `src/core/database.py`
   - `server_ultra_simple.py` → `src/mcp/server.py` (via `start_mcp_server.py`)
   - `api_server.py` → `src/api/server.py` (via `start_api_server.py`)

2. **New Features**
   - Vector embeddings with Gemini
   - Semantic search
   - Hybrid search (semantic + keyword)
   - Better configuration management

3. **Deprecated Files** (now in `archive/`)
   - Old server implementations
   - Old documentation
   - Legacy code

## 🧪 Verification Commands

```bash
# Check configuration
python scripts/verify_config.py

# Check AI setup
python scripts/verify_ai_setup.py

# Check system status
python scripts/check_system_status.py

# Run memory tests
python tests/test_memory.py

# Run vector tests
python tests/test_vectors.py
```

## ⚠️ Important Notes

1. **Always use the startup scripts** (`start_mcp_server.py`, `start_api_server.py`)
2. **Old files are archived** but not deleted - find them in `archive/`
3. **Vector search is optional** - system works without it
4. **Backward compatible** - all existing features still work

## 🎯 Next Steps

1. Restart Claude Desktop after updating config
2. Run the vector migration
3. Test semantic search with queries like:
   - "Python web framework" (finds Django/Flask)
   - "meeting with Sarah" (finds Sarah meetings)
   - "React hooks" (finds useState/useEffect)