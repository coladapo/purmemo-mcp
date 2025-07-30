# Configuration Guide

This guide covers all configuration options for PUO Memo MCP.

## Basic Configuration

The minimal configuration requires:

- `PUO_MEMO_API_URL`: The API endpoint (default: https://api.puo-memo.com)
- `PUO_MEMO_API_KEY`: Your personal API key

## Configuration Methods

### 1. Environment Variables

Set environment variables in your shell:

```bash
export PUO_MEMO_API_URL="https://api.puo-memo.com"
export PUO_MEMO_API_KEY="your-api-key"
```

Or create a `.env` file:

```env
PUO_MEMO_API_URL=https://api.puo-memo.com
PUO_MEMO_API_KEY=your-api-key
```

### 2. MCP Configuration

In your MCP client configuration:

```json
{
  "mcpServers": {
    "puo-memo": {
      "command": "npx",
      "args": ["puo-memo-mcp"],
      "env": {
        "PUO_MEMO_API_URL": "https://api.puo-memo.com",
        "PUO_MEMO_API_KEY": "your-api-key",
        "PUO_MEMO_DEBUG": "false"
      }
    }
  }
}
```

## Advanced Configuration Options

### Debug Mode

Enable detailed logging for troubleshooting:

```json
{
  "env": {
    "PUO_MEMO_DEBUG": "true"
  }
}
```

### Custom API Endpoint

For self-hosted or development environments:

```json
{
  "env": {
    "PUO_MEMO_API_URL": "http://localhost:8000"
  }
}
```

### Timeout Settings

Configure request timeouts (in milliseconds):

```json
{
  "env": {
    "PUO_MEMO_TIMEOUT": "30000"
  }
}
```

### Retry Configuration

Configure automatic retry behavior:

```json
{
  "env": {
    "PUO_MEMO_MAX_RETRIES": "3",
    "PUO_MEMO_RETRY_DELAY": "1000"
  }
}
```

## Feature Flags

Enable or disable specific features:

### Entity Extraction

```json
{
  "env": {
    "PUO_MEMO_ENABLE_ENTITIES": "true"
  }
}
```

### Smart Deduplication

```json
{
  "env": {
    "PUO_MEMO_ENABLE_DEDUP": "true",
    "PUO_MEMO_DEDUP_WINDOW": "300"
  }
}
```

### File Attachments

```json
{
  "env": {
    "PUO_MEMO_ENABLE_ATTACHMENTS": "true",
    "PUO_MEMO_MAX_ATTACHMENT_SIZE": "10485760"
  }
}
```

## Performance Tuning

### Memory Cache

Configure in-memory caching:

```json
{
  "env": {
    "PUO_MEMO_CACHE_SIZE": "100",
    "PUO_MEMO_CACHE_TTL": "3600"
  }
}
```

### Batch Operations

Configure batch processing:

```json
{
  "env": {
    "PUO_MEMO_BATCH_SIZE": "50",
    "PUO_MEMO_BATCH_DELAY": "100"
  }
}
```

## Security Configuration

### API Key Security

Never commit API keys to version control. Use environment variables or secure key management systems.

### SSL/TLS Settings

For custom certificates:

```json
{
  "env": {
    "NODE_TLS_REJECT_UNAUTHORIZED": "1",
    "PUO_MEMO_CA_CERT": "/path/to/ca.pem"
  }
}
```

## Logging Configuration

### Log Levels

```json
{
  "env": {
    "PUO_MEMO_LOG_LEVEL": "info"
  }
}
```

Available levels: `error`, `warn`, `info`, `debug`, `trace`

### Log Output

```json
{
  "env": {
    "PUO_MEMO_LOG_FILE": "/var/log/puo-memo.log",
    "PUO_MEMO_LOG_FORMAT": "json"
  }
}
```

## Platform-Specific Configuration

### Claude Desktop

Location: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)

```json
{
  "mcpServers": {
    "puo-memo": {
      "command": "npx",
      "args": ["puo-memo-mcp"],
      "env": {
        "PUO_MEMO_API_URL": "https://api.puo-memo.com",
        "PUO_MEMO_API_KEY": "your-api-key"
      }
    }
  }
}
```

### VS Code

In `.vscode/settings.json`:

```json
{
  "mcp.servers": {
    "puo-memo": {
      "command": "npx",
      "args": ["puo-memo-mcp"],
      "env": {
        "PUO_MEMO_API_URL": "https://api.puo-memo.com",
        "PUO_MEMO_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Configuration Validation

To test your configuration:

```bash
# Set environment variables
export PUO_MEMO_API_KEY="your-api-key"

# Test the connection
npx puo-memo-mcp test
```

## Troubleshooting Configuration

### Invalid API Key

If you see "Authentication failed":
1. Verify your API key is correct
2. Check it's properly set in the environment
3. Ensure no extra spaces or quotes

### Connection Issues

If you see "Connection refused":
1. Check the API URL is correct
2. Verify network connectivity
3. Check firewall settings

### Debug Output

Enable debug mode to see detailed logs:

```bash
export PUO_MEMO_DEBUG=true
npx puo-memo-mcp
```

## Next Steps

- [Learn the API](./api-reference.md)
- [View Examples](./examples.md)
- [Troubleshooting Guide](./troubleshooting.md)