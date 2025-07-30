# Claude Desktop MCP Integration Test

## Quick Setup

1. **Install PUO Memo MCP globally:**
   ```bash
   npm install -g puo-memo-mcp@latest
   ```

2. **Configure Claude Desktop:**
   
   Edit your Claude Desktop config file:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   
   Add this configuration:
   ```json
   {
     "mcpServers": {
       "puo-memo": {
         "command": "puo-memo-mcp",
         "env": {
           "PUO_MEMO_API_URL": "http://localhost:8000",
           "PUO_MEMO_API_KEY": "test-api-key"
         }
       }
     }
   }
   ```

3. **Start local API (for testing):**
   ```bash
   cd puo-memo-mcp
   docker-compose up -d
   ```

4. **Restart Claude Desktop**

## Test Commands

In Claude Desktop, try these commands:

### 1. Check if MCP is connected
```
What MCP tools do you have available?
```

Expected: Claude should list the puo-memo tools (memory, recall, entities)

### 2. Store a memory
```
Use the puo-memo tool to store this memory: "Testing Claude Desktop integration on [current date]"
```

### 3. Search memories
```
Use the puo-memo tool to search for: "testing"
```

### 4. List entities
```
Use the puo-memo tool to list all entities
```

## Troubleshooting

### If Claude doesn't see the MCP server:

1. Check Claude Desktop logs
2. Verify the config file is valid JSON:
   ```bash
   cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | jq .
   ```

3. Test the MCP server directly:
   ```bash
   node test/validate-mcp.js
   ```

### If API connection fails:

1. Ensure Docker is running:
   ```bash
   docker-compose ps
   ```

2. Check API health:
   ```bash
   curl http://localhost:8000/health
   ```

3. View logs:
   ```bash
   docker-compose logs api
   ```

## Success Criteria

✅ Claude recognizes the puo-memo MCP server
✅ Memory storage operations work
✅ Search operations return results
✅ Entity listing works
✅ Error handling shows friendly messages

## Next Steps

Once validated:
1. Deploy production API
2. Update API credentials in Claude config
3. Create user documentation
4. Add more advanced features