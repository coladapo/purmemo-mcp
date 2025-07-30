# Unified Tool Behavior Guide for PUO Memo

## Overview
This guide ensures consistent tool behavior across Claude, ChatGPT, and Cursor when using PUO Memo.

## Key Differences Between Platforms

### 1. Protocol Differences
- **Claude/Cursor**: Native MCP protocol (direct tool calls)
- **ChatGPT**: REST API bridge (HTTP endpoints)

### 2. Tool Invocation

#### Claude MCP Format:
```json
{
  "tool": "recall",
  "arguments": {
    "query": "orchestration pattern",
    "search_type": "semantic"
  }
}
```

#### ChatGPT REST Format:
```json
POST /recall
{
  "query": "orchestration pattern",
  "search_type": "semantic"
}
```

## Achieved Consistency

### 1. Context Unification ✅
- All platforms now use "default" context
- 110 memories accessible from any platform
- No more context isolation

### 2. Semantic Search Threshold ✅
- Configurable threshold (default: 0.5)
- Set via `SEMANTIC_SEARCH_THRESHOLD` in .env
- Prevents unnecessary fallback to keyword search

### 3. Search Behavior ✅
All platforms now support identical search types:
- `semantic`: AI-powered similarity search
- `keyword`: Traditional text matching
- `hybrid`: Combines semantic + keyword
- `entity`: Search by extracted entities
- `nlp`: Natural language with date parsing

## Configuration for Consistent Behavior

### Environment Variables (.env)
```bash
# Unified context for all platforms
DEFAULT_CONTEXT=default

# Semantic search threshold (0.0-1.0)
SEMANTIC_SEARCH_THRESHOLD=0.5

# Platform-specific deduplication windows
DEDUP_TIME_WINDOW_CLAUDE=600    # 10 minutes
DEDUP_TIME_WINDOW_CHATGPT=300   # 5 minutes
DEDUP_TIME_WINDOW_CURSOR=900    # 15 minutes
```

### ChatGPT Custom GPT Instructions
```
When searching memories:
1. Use search_type="semantic" for conceptual queries
2. Use search_type="keyword" for exact matches
3. Use search_type="hybrid" when unsure
4. Always include limit parameter (default: 10)
```

### Claude MCP Configuration
```json
{
  "mcpServers": {
    "puo-memo": {
      "command": "python",
      "args": ["-u", "/path/to/puo-memo/src/mcp/server.py"],
      "env": {
        "DEFAULT_CONTEXT": "default",
        "SEMANTIC_SEARCH_THRESHOLD": "0.5"
      }
    }
  }
}
```

## Common Queries - Expected Behavior

### Query: "recall orchestration pattern"
**All Platforms Return:**
1. Memory Orchestra MCP - Complete Technical Architecture
2. Orchestration Pattern: Research-Synthesis-Review  
3. Memory Orchestra + puo-memo Integration Guide

### Query: "find memory 66089bc7"
**All Platforms Return:**
- Direct lookup of memory ID 66089bc7-39fd-415c-b998-55fed662db33

### Query: "what did I save about Python yesterday"
**All Platforms:**
- Use NLP search with temporal parsing
- Return Python-related memories from previous day

## Troubleshooting Inconsistencies

### 1. Different Results Between Platforms
- Check `DEFAULT_CONTEXT` is set to "default" on all platforms
- Verify `SEMANTIC_SEARCH_THRESHOLD` is consistent
- Clear Redis cache: `redis-cli FLUSHDB`

### 2. Semantic Search Not Working
- Verify AI is enabled (GEMINI_API_KEY set)
- Check embedding generation in logs
- Lower threshold if needed (try 0.3)

### 3. Platform-Specific Issues
- **ChatGPT**: Ensure ngrok URL is current in Custom GPT
- **Claude**: Restart Claude Desktop after config changes
- **Cursor**: Update MCP config when available

## Best Practices

1. **Use Consistent Queries**: Frame questions the same way across platforms
2. **Specify Search Type**: Be explicit when precision matters
3. **Include Limits**: Always specify how many results you want
4. **Tag Consistently**: Use the same tags across all platforms

## Testing Consistency

Run this test on each platform:
1. Save: "Test unified behavior [timestamp]"
2. Search: "test unified behavior"
3. Verify all platforms find the same memory

## Future Enhancements

1. **Cross-Platform Sync**: Real-time synchronization
2. **Unified Tool Registry**: Single source of tool definitions
3. **Query Translation Layer**: Normalize queries before execution
4. **Consistent Error Messages**: Unified error handling

---

Last Updated: June 28, 2025
Status: ✅ All platforms unified and consistent