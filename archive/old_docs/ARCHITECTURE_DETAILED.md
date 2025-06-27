# PUO Unified Memory Architecture - Complete Overview

## 🏗️ Current Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          WEB BROWSERS                                    │
├─────────────────────────┬───────────────────────────────────────────────┤
│    ChatGPT Web UI       │           Claude Web UI                       │
│         ↓               │                ↓                               │
│  MemoryLane Extension   │       MemoryLane Extension                    │
│         ↓               │                ↓                               │
│    HTTP POST            │           HTTP POST                           │
└─────────┬───────────────┴────────────────┬──────────────────────────────┘
          │                                 │
          ↓                                 ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                      API SERVER (Port 8000)                             │
│                        api_server.py                                     │
│                             ↓                                            │
│                    PuoMemoSimple.create_memory()                        │
└─────────────────────────────┬────────────────────────────────────────────┘
                              │
                              ↓ INSERT INTO memory_entities
┌─────────────────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database (Cloud SQL)                       │
│                                                                          │
│  Table: memory_entities                                                  │
│  ┌────┬─────────┬────────────┬──────────────┬─────────────┐           │
│  │ id │ content │ memory_type│ metadata     │ created_at  │           │
│  ├────┼─────────┼────────────┼──────────────┼─────────────┤           │
│  │ .. │ Chat... │ chatgpt_.. │ {url, id...} │ 2024-...    │           │
│  │ .. │ Conv... │ claude_... │ {url, id...} │ 2024-...    │           │
│  │ .. │ Note... │ general    │ {source:mcp} │ 2024-...    │           │
│  └────┴─────────┴────────────┴──────────────┴─────────────┘           │
└─────────────────────────────┬────────────────────────────────────────────┘
                              │
                              ↓ SELECT/UPDATE/DELETE
┌─────────────────────────────────────────────────────────────────────────┐
│                        CLAUDE DESKTOP APP                                │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │                    MCP Server Process                        │       │
│  │                  server_ultra_simple.py                     │       │
│  │                           ↓                                  │       │
│  │                  PuoMemoSimple (same class!)               │       │
│  │  ┌─────────────────────────────────────────────────────┐   │       │
│  │  │ Tools exposed to Claude:                            │   │       │
│  │  │                                                     │   │       │
│  │  │ 💾 memory: Save anything to memory                 │   │       │
│  │  │ 🔍 recall: Search your memories                    │   │       │
│  │  └─────────────────────────────────────────────────────┘   │       │
│  └─────────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
```

## 🔄 Data Flow Examples

### Example 1: Capture from ChatGPT Web
```
1. User has conversation in ChatGPT
2. Clicks MemoryLane capture button
3. Extension extracts conversation
4. POSTs to http://localhost:8000/memory
5. API server saves to PostgreSQL with memory_type='chatgpt_conversation'
6. Memory now available everywhere
```

### Example 2: Save from Claude Desktop
```
1. User in Claude Desktop: "memory: Remember this idea about X"
2. MCP tool 'memory' is called
3. PuoMemoSimple.create_memory() executes
4. Saves directly to PostgreSQL with memory_type='general'
5. Memory now available everywhere
```

### Example 3: Search from Claude Desktop
```
1. User in Claude Desktop: "recall: unified memory architecture"
2. MCP tool 'recall' is called
3. PuoMemoSimple.search_memories() executes
4. Queries PostgreSQL: SELECT * FROM memory_entities WHERE content ILIKE '%unified memory%'
5. Returns ALL matching memories - from web captures AND desktop saves
```

## 🎯 Key Points

### 1. **Single Database**
Both systems read/write the SAME PostgreSQL database:
- Web captures → API Server → PostgreSQL
- MCP tools → PostgreSQL (direct)

### 2. **Same Core Class**
Both use `PuoMemoSimple` class:
```python
# In api_server.py
self.puo = PuoMemoSimple()
result = await self.puo.create_memory(...)

# In server_ultra_simple.py (MCP)
self.puo = PuoMemoSimple()
result = await self.puo.create_memory(...)
```

### 3. **Unified Schema**
All memories share the same structure:
```sql
CREATE TABLE memory_entities (
    id UUID PRIMARY KEY,
    content TEXT,                    -- The actual memory
    memory_type VARCHAR(100),        -- 'chatgpt_conversation', 'claude_conversation', 'general'
    metadata JSONB,                  -- Source info, URLs, IDs
    created_at TIMESTAMP,
    -- ... other fields
)
```

### 4. **Source Tracking**
Metadata tracks where memories came from:
```json
// From web extension
{
  "source": "chatgpt-extension-v2",
  "url": "https://chat.openai.com/c/abc-123",
  "conversation_id": "abc-123",
  "platform": "chatgpt"
}

// From MCP
{
  "source": "claude-desktop-mcp",
  "created_via": "puo_memo_simple"
}
```

## 🔍 How MCP Reads Unified Memory

When you use the recall tool in Claude Desktop:

```python
# This is what happens inside server_ultra_simple.py
async def handle_tool_call(self, name: str, arguments: dict):
    if name == "recall":
        query = arguments.get("query", "")
        
        # This searches ALL memories in the database
        result = await self.puo.search_memories(
            query=query,
            limit=limit
        )
        
        # Returns memories from:
        # - ChatGPT web captures
        # - Claude web captures  
        # - Claude Desktop saves
        # - Any other source that writes to the database
```

## 🚀 The Power of Unification

Because everything is in one database:

1. **Complete Context**: Start in ChatGPT, continue in Claude, implement in Cursor - full history available

2. **Cross-Platform Search**: 
   ```
   User: "recall: API design discussion"
   Returns: Memories from ChatGPT AND Claude conversations
   ```

3. **AI Enhancement Ready**:
   - Add vector embeddings to memory_entities
   - Build knowledge graphs
   - Semantic search across ALL memories
   - Deduplication at database level

4. **Future Orchestration**:
   - Symphony Chen can query one database
   - 59 agents share the same memory pool
   - No sync issues or missing context

## 📊 Test It Yourself

In Claude Desktop, try:
```
recall: unified memory
```

You should see memories from:
- This conversation (if captured via extension)
- Any MCP saves about unified memory
- All stored in the same PostgreSQL database!

The beauty is that MCP tools don't need to know about web captures - they just query the database and get everything. True unification! 🎉