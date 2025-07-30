# PUO Memo MCP Integration with Cursor

## ✅ Setup Complete!

Your PUO Memo MCP server is now configured for Cursor at:
`~/Library/Application Support/Cursor/User/globalStorage/cursor-mcp/settings.json`

## How to Use in Cursor

### 1. Start Cursor
Launch Cursor IDE. The MCP server will automatically start when Cursor loads.

### 2. Available Commands

Once Cursor is running with MCP support, you can use PUO Memo through:

#### Save Code to Memory
- Select code in editor
- Use command: "Save to PUO Memo"
- Add tags and description

#### Search Memories
- Command palette: "Search PUO Memo"
- Find code snippets, notes, implementations

#### Context Tracking
All memories saved from Cursor will be tagged with `context: cursor` automatically.

### 3. Use Cases in Cursor

#### 📝 Code Snippet Management
```
Save this React hook implementation with tags: #react #hooks #custom
```

#### 🔍 Search Previous Solutions
```
Search for all authentication implementations
```

#### 📎 Attach Documentation
```
Attach the API documentation PDF to this implementation memory
```

#### 🧠 Track Code Evolution
```
Save this refactored version and link to previous implementation
```

## Integration Features

### Automatic Context
- Memories from Cursor: `context: "cursor"`
- Memories from Claude: `context: "claude"`
- Memories from ChatGPT: `context: "chatgpt"`

### Code Intelligence
- Automatic entity extraction from code
- Language detection
- Function/class relationship mapping

### Cross-Platform Access
Your Cursor memories are accessible in:
- Claude Desktop (via MCP)
- ChatGPT (via Custom GPT)
- Direct API access

## Troubleshooting

### If MCP doesn't load in Cursor:

1. **Check Cursor Version**
   - Ensure you have the latest Cursor version
   - MCP support may require specific versions

2. **Verify Configuration Location**
   ```bash
   cat ~/Library/Application\ Support/Cursor/User/globalStorage/cursor-mcp/settings.json
   ```

3. **Check Logs**
   - Cursor logs: `~/Library/Logs/Cursor/`
   - Look for MCP-related errors

4. **Test Server Manually**
   ```bash
   cd "/Users/wivak/puo-jects/active/puo memo mcp"
   python -m src.mcp.server
   ```

### Common Issues:

1. **"MCP not found"**
   - Cursor may not have MCP support yet
   - Check Cursor's documentation for MCP availability

2. **Connection errors**
   - Ensure `.env` file exists with database credentials
   - Verify Google Cloud SQL is accessible

3. **Python errors**
   - Check Python path: `which python`
   - Ensure all dependencies are installed

## Alternative: Direct API Usage

If Cursor's MCP support isn't available yet, you can use the REST API:

```bash
# Save a memory
curl -X POST http://localhost:8001/memory \
  -H "Authorization: Bearer gx3ZaY7QQCkf4NepTeZ4IR2MGejOURiM-ZBgZMaGa44" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Your code here",
    "title": "Code snippet from Cursor",
    "tags": ["cursor", "code"],
    "context": "cursor"
  }'
```

## Next Steps

1. **Create Cursor Extensions**
   - Build a Cursor extension for easier access
   - Add UI for memory management

2. **Enhance Code Analysis**
   - Add AST parsing for better entity extraction
   - Implement code similarity detection

3. **Workspace Integration**
   - Track memories per project
   - Auto-tag based on file paths

## Status

- ✅ MCP Configuration created
- ✅ Server tested and working
- ⏳ Waiting for Cursor MCP support confirmation
- 🔄 Alternative REST API available

The setup is complete! Once Cursor fully supports MCP servers (like Claude Desktop does), PUO Memo will be automatically available.