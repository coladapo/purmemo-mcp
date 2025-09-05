# Purmemo MCP Troubleshooting Guide

## 🚨 Current Known Issues (Aug 19, 2025)

### Backend Authentication Issue
**Status**: Under Investigation  
**Symptoms**: All API endpoints return `401 Unauthorized` with "Could not validate credentials"  
**Affected**: All users with API keys generated from app.purmemo.ai

### Root Cause Analysis
Based on comprehensive testing, the issue is **NOT** with the MCP server implementation. The Purmemo backend API authentication system is currently not validating API keys properly.

**Evidence**:
- API key format is correct (JWT token, 252 characters)
- All endpoints (`/api/v5/`, `/api/v4/`, `/api/`) return same 401 error
- Same error occurs with different authentication headers
- MCP server JSON protocol working correctly

## ⚡ Quick Fixes

### 1. Update to Production Server
Use the latest production server which handles authentication failures gracefully:

```json
{
  "mcpServers": {
    "purmemo": {
      "command": "node",
      "args": ["/Users/wivak/puo-jects/active/purmemo/purmemo-mcp/src/server-production.js"],
      "env": {
        "PURMEMO_API_URL": "https://api.purmemo.ai",
        "PUO_MEMO_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### 2. Test Your Setup
Run the diagnosis tool to verify your configuration:

```bash
cd /Users/wivak/puo-jects/active/purmemo/purmemo-mcp
PURMEMO_API_URL="https://api.purmemo.ai" PUO_MEMO_API_KEY="your-key" node src/diagnose-production.js
cat diagnosis.log
```

## 🔧 Common Issues & Solutions

### "Server disconnected" Error
**Cause**: Console output breaking JSON-RPC protocol  
**Solution**: Use `server-production.js` which has zero console output

### "Unexpected token" JSON Parsing Error  
**Cause**: Special characters (like ® symbol) in server output  
**Solution**: All console.log statements removed in production server

### "Could not validate credentials"
**Cause**: Backend API authentication system issue  
**Status**: Under investigation by Purmemo team  
**Workaround**: Production server shows helpful error messages instead of crashing

### MCP Tools Not Appearing in Claude Desktop
1. Check Claude Desktop logs: `~/Library/Logs/Claude/mcp.log`
2. Verify JSON config syntax is valid
3. Restart Claude Desktop after config changes
4. Ensure server path is absolute (not relative)

## 📊 Diagnostic Commands

### Test MCP Server Directly
```bash
# Test server startup (should be completely silent)
echo '{"jsonrpc": "2.0", "method": "initialize", "params": {}, "id": 1}' | node src/server-production.js

# Test tool listing
echo '{"jsonrpc": "2.0", "method": "tools/list", "params": {}, "id": 2}' | node src/server-production.js
```

### Check Claude Desktop Logs
```bash
# View MCP logs
tail -f ~/Library/Logs/Claude/mcp.log

# View all Claude logs
ls ~/Library/Logs/Claude/
```

### Test API Connectivity
```bash
# Test direct API call
curl -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     https://api.purmemo.ai/api/v5/memories/
```

## 🚀 Production Server Features

The new `server-production.js` includes:

- **Zero Console Output**: Maintains pure JSON stream for MCP protocol
- **Robust Error Handling**: Graceful handling of API failures
- **Multiple Endpoint Support**: Tries v5, v4, and base API paths
- **Clear Error Messages**: User-friendly authentication guidance
- **Timeout Protection**: Prevents hanging on slow API responses
- **JWT Token Validation**: Proper Bearer token formatting

## 🐛 Reporting Issues

If you continue to experience issues:

1. Run the diagnosis tool: `node src/diagnose-production.js`
2. Check the `diagnosis.log` file
3. Include relevant Claude Desktop logs
4. Report to: support@purmemo.ai

## 📋 Version History

- **v2.1.7**: Production server with comprehensive error handling
- **v2.1.6**: Minimal server addressing JSON parsing issues  
- **v2.1.5**: OAuth fallback implementation
- **v2.1.4**: Non-blocking authentication
- **v2.1.3**: Console output cleanup

## 🔮 Expected Resolution

The backend authentication issue is being addressed by the Purmemo team. Once resolved, the production MCP server will automatically work without any configuration changes.

**Update Aug 19, 2025**: Backend team notified of authentication validation issue.