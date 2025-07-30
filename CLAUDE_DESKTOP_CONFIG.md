# Claude Desktop Configuration

## Quick Setup

1. **Install the MCP server globally:**
   ```bash
   npm install -g puo-memo-mcp@latest
   ```

2. **Find your Claude Desktop config location:**
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`

3. **Edit the configuration file:**

   ```json
   {
     "mcpServers": {
       "puo-memo": {
         "command": "puo-memo-mcp",
         "env": {
           "PUO_MEMO_API_URL": "http://localhost:8000",
           "PUO_MEMO_API_KEY": "your-api-key"
         }
       }
     }
   }
   ```

4. **Restart Claude Desktop**

## Configuration Options

### Basic Configuration (NPM Install)
```json
{
  "mcpServers": {
    "puo-memo": {
      "command": "puo-memo-mcp"
    }
  }
}
```

### Development Configuration (Local)
```json
{
  "mcpServers": {
    "puo-memo": {
      "command": "node",
      "args": ["/Users/your-name/puo-memo-mcp/bin/puo-memo-mcp"],
      "env": {
        "PUO_MEMO_API_URL": "http://localhost:8000",
        "PUO_MEMO_API_KEY": "test-api-key"
      }
    }
  }
}
```

### Production Configuration
```json
{
  "mcpServers": {
    "puo-memo": {
      "command": "puo-memo-mcp",
      "env": {
        "PUO_MEMO_API_URL": "https://api.puo-memo.com",
        "PUO_MEMO_API_KEY": "your-production-api-key"
      }
    }
  }
}
```

## Testing the Integration

After configuration, test in Claude Desktop:

1. Open a new conversation
2. Ask Claude: "Can you list the available MCP tools?"
3. You should see puo-memo tools listed
4. Test storing a memory: "Use puo-memo to store: 'Testing Claude Desktop integration'"
5. Test searching: "Use puo-memo to search for: 'testing'"

## Troubleshooting

### MCP Server Not Found

If Claude doesn't recognize the puo-memo server:

1. Check the NPM installation:
   ```bash
   which puo-memo-mcp
   # Should show: /usr/local/bin/puo-memo-mcp or similar
   ```

2. Verify the configuration file is valid JSON:
   ```bash
   # macOS
   cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | jq .
   ```

3. Check Claude Desktop logs for errors

### Python Issues

If you see Python-related errors:

1. Ensure Python 3.8+ is installed:
   ```bash
   python3 --version
   ```

2. The NPM package should auto-install dependencies, but you can manually install:
   ```bash
   pip install aiohttp pydantic python-dotenv
   ```

### API Connection Issues

For local testing without a production API:

1. Start the Docker environment:
   ```bash
   cd puo-memo-mcp
   docker-compose up -d
   ```

2. Update your Claude config to use local API:
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

## Advanced Configuration

### Multiple Environments

You can configure multiple instances for different environments:

```json
{
  "mcpServers": {
    "puo-memo-dev": {
      "command": "puo-memo-mcp",
      "env": {
        "PUO_MEMO_API_URL": "http://localhost:8000",
        "PUO_MEMO_API_KEY": "dev-key"
      }
    },
    "puo-memo-prod": {
      "command": "puo-memo-mcp",
      "env": {
        "PUO_MEMO_API_URL": "https://api.puo-memo.com",
        "PUO_MEMO_API_KEY": "prod-key"
      }
    }
  }
}
```

### Debug Mode

Enable debug logging:

```json
{
  "mcpServers": {
    "puo-memo": {
      "command": "puo-memo-mcp",
      "env": {
        "PUO_MEMO_API_URL": "http://localhost:8000",
        "PUO_MEMO_API_KEY": "test-api-key",
        "DEBUG": "true"
      }
    }
  }
}
```