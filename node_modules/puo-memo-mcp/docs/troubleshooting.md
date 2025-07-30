# Troubleshooting Guide

This guide helps you resolve common issues with PUO Memo MCP.

## Common Issues

### Installation Issues

#### Node.js Version Error

**Problem:** `Error: Node.js version 18.0.0 or higher required`

**Solution:**
```bash
# Check your Node.js version
node --version

# Update Node.js using nvm
nvm install 20
nvm use 20

# Or download from nodejs.org
```

#### Permission Denied During Installation

**Problem:** `npm ERR! code EACCES`

**Solution:**
```bash
# Option 1: Use npx instead of global install
npx puo-memo-mcp

# Option 2: Change npm's default directory
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Option 3: Use a Node version manager (recommended)
```

### Configuration Issues

#### API Key Not Working

**Problem:** `Authentication failed: Invalid API key`

**Checklist:**
1. Verify API key is correct (no extra spaces)
2. Check environment variable is set:
   ```bash
   echo $PUO_MEMO_API_KEY
   ```
3. Ensure API key is active in your account
4. Try regenerating the API key

#### MCP Server Not Found

**Problem:** Claude Desktop shows "MCP server not found"

**Solution:**
1. Verify installation:
   ```bash
   which puo-memo-mcp
   # or
   npm list -g puo-memo-mcp
   ```

2. Check configuration path:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`

3. Correct configuration format:
   ```json
   {
     "mcpServers": {
       "puo-memo": {
         "command": "npx",
         "args": ["puo-memo-mcp"],
         "env": {
           "PUO_MEMO_API_URL": "https://api.puo-memo.com",
           "PUO_MEMO_API_KEY": "your-key-here"
         }
       }
     }
   }
   ```

### Connection Issues

#### Timeout Errors

**Problem:** `Error: Request timeout after 30000ms`

**Solutions:**
1. Check internet connection
2. Increase timeout:
   ```json
   {
     "env": {
       "PUO_MEMO_TIMEOUT": "60000"
     }
   }
   ```
3. Check if API is accessible:
   ```bash
   curl https://api.puo-memo.com/health
   ```

#### SSL Certificate Errors

**Problem:** `Error: unable to verify the first certificate`

**Solutions:**
1. Update Node.js to latest version
2. For development only:
   ```json
   {
     "env": {
       "NODE_TLS_REJECT_UNAUTHORIZED": "0"
     }
   }
   ```
   ⚠️ **Warning:** Only use in development!

### Runtime Issues

#### Memory Not Saving

**Problem:** Memories appear to save but aren't found later

**Debugging steps:**
1. Enable debug mode:
   ```json
   {
     "env": {
       "PUO_MEMO_DEBUG": "true"
     }
   }
   ```

2. Check response:
   - Look for `memory_id` in response
   - Verify `status: "success"`

3. Common causes:
   - Deduplication merging similar memories
   - Rate limiting
   - Network interruption

#### Search Not Finding Results

**Problem:** Search returns no results despite having memories

**Solutions:**
1. Try different search types:
   ```python
   # Instead of keyword search
   recall(query="meeting", search_type="keyword")
   
   # Try semantic search
   recall(query="meeting", search_type="semantic")
   
   # Or hybrid
   recall(query="meeting", search_type="hybrid")
   ```

2. Check if memories exist:
   ```python
   # List recent memories without search
   recall(limit=10)
   ```

3. Verify entity extraction is working:
   ```python
   entities()
   ```

### Performance Issues

#### Slow Response Times

**Problem:** Operations take longer than expected

**Solutions:**
1. Enable caching:
   ```json
   {
     "env": {
       "PUO_MEMO_CACHE_SIZE": "200",
       "PUO_MEMO_CACHE_TTL": "7200"
     }
   }
   ```

2. Reduce search limit:
   ```python
   recall(query="test", limit=5)
   ```

3. Use pagination for large results:
   ```python
   recall(query="test", limit=10, offset=0)
   recall(query="test", limit=10, offset=10)
   ```

#### High Memory Usage

**Problem:** Process uses excessive memory

**Solutions:**
1. Limit cache size:
   ```json
   {
     "env": {
       "PUO_MEMO_CACHE_SIZE": "50"
     }
   }
   ```

2. Reduce batch sizes:
   ```json
   {
     "env": {
       "PUO_MEMO_BATCH_SIZE": "25"
     }
   }
   ```

## Error Messages

### Common Error Codes

| Error | Meaning | Solution |
|-------|---------|----------|
| AUTH_FAILED | Invalid API key | Check API key configuration |
| RATE_LIMIT | Too many requests | Wait and retry, or upgrade plan |
| INVALID_PARAMETER | Bad request format | Check parameter types and required fields |
| NOT_FOUND | Memory/entity doesn't exist | Verify ID is correct |
| SERVER_ERROR | API server issue | Retry later or contact support |

### Python Errors

#### Module Not Found

**Problem:** `ModuleNotFoundError: No module named 'asyncio'`

**Solution:**
```bash
# Ensure Python 3.9+ is installed
python3 --version

# Install required modules
pip install asyncio aiohttp
```

#### Syntax Errors

**Problem:** `SyntaxError: invalid syntax`

**Solution:**
- Verify Python 3.9+ is being used
- Check for Python 2 vs 3 compatibility

## Debugging Tips

### Enable Verbose Logging

```json
{
  "env": {
    "PUO_MEMO_DEBUG": "true",
    "PUO_MEMO_LOG_LEVEL": "trace"
  }
}
```

### Test Connection

Create a test script:
```bash
#!/bin/bash
export PUO_MEMO_API_KEY="your-key"
export PUO_MEMO_DEBUG="true"

# Test basic connectivity
curl -H "Authorization: Bearer $PUO_MEMO_API_KEY" \
     https://api.puo-memo.com/api/health

# Test MCP server
npx puo-memo-mcp test
```

### Check Logs

Look for logs in:
- Console output (with debug enabled)
- System logs: `/var/log/puo-memo.log`
- Claude Desktop logs (if applicable)

## Getting Help

If you're still experiencing issues:

1. **Check Documentation**
   - [Installation Guide](./installation.md)
   - [Configuration Guide](./configuration.md)
   - [API Reference](./api-reference.md)

2. **Search Issues**
   - [GitHub Issues](https://github.com/coladapo/puo-memo-mcp/issues)
   - Look for similar problems

3. **Create an Issue**
   - Use the issue template
   - Include error messages
   - Provide configuration (without API key)
   - List steps to reproduce

4. **Contact Support**
   - Email: support@puo-memo.com
   - Include debug logs
   - Mention your account email

## FAQ

**Q: Can I use PUO Memo MCP offline?**
A: No, it requires internet connection to the API.

**Q: How do I backup my memories?**
A: Use the export feature in your account dashboard.

**Q: Is my data encrypted?**
A: Yes, data is encrypted in transit and at rest.

**Q: Can I self-host PUO Memo?**
A: Enterprise self-hosting options are available. Contact sales@puo-memo.com.

**Q: How do I delete memories?**
A: Use the web dashboard or contact support for bulk deletion.