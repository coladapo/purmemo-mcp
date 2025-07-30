# MCP Server Validation Guide

## Prerequisites

1. Claude Desktop installed
2. Node.js 18+ installed
3. Python 3.8+ installed

## Installation Methods

### Method 1: NPM Global Install (Recommended)

```bash
npm install -g puo-memo-mcp
```

### Method 2: Local Development

```bash
# Clone the repository
git clone https://github.com/coladapo/puo-memo-mcp.git
cd puo-memo-mcp

# Install dependencies
npm install
pip install -r requirements.txt

# Test locally
node bin/puo-memo-mcp
```

## Configure Claude Desktop

1. Open Claude Desktop settings
2. Navigate to MCP servers configuration
3. Add the following configuration:

### For NPM Installation:

```json
{
  "mcpServers": {
    "puo-memo": {
      "command": "puo-memo-mcp"
    }
  }
}
```

### For Local Development:

```json
{
  "mcpServers": {
    "puo-memo": {
      "command": "node",
      "args": ["/path/to/puo-memo-mcp/bin/puo-memo-mcp"]
    }
  }
}
```

## API Configuration

The MCP server needs API credentials. Set these environment variables:

```bash
export PUO_MEMO_API_URL=https://your-api-url.com
export PUO_MEMO_API_KEY=your-api-key
```

Or create a `.env` file in your home directory:

```
PUO_MEMO_API_URL=https://your-api-url.com
PUO_MEMO_API_KEY=your-api-key
```

## Validation Steps

### 1. Test Installation

```bash
# Should output version and Python info
puo-memo-mcp --version
```

### 2. Test MCP Protocol

Run the validation script:

```bash
node test/validate-mcp.js
```

### 3. Test in Claude Desktop

1. Restart Claude Desktop after configuration
2. Open a new conversation
3. Try these commands:

```
# Store a memory
Use the puo-memo tool to store: "Test memory from Claude Desktop validation"

# Search memories
Use the puo-memo tool to search for: "test"

# List entities
Use the puo-memo tool to list entities
```

## Local Testing with Docker

For testing without a production API:

```bash
# Start local services
docker-compose up -d

# Set local environment
export PUO_MEMO_API_URL=http://localhost:8000
export PUO_MEMO_API_KEY=test-api-key

# Run MCP server
puo-memo-mcp
```

## Troubleshooting

### Python Not Found

If you see "Python interpreter not found":

1. Ensure Python 3.8+ is installed:
   ```bash
   python3 --version
   ```

2. On Windows, install from python.org
3. On Mac: `brew install python3`
4. On Linux: `sudo apt install python3`

### Dependencies Missing

If you see module import errors:

```bash
# NPM installation should handle this automatically
# For manual fix:
pip install aiohttp pydantic python-dotenv
```

### MCP Not Showing in Claude

1. Check Claude Desktop logs
2. Ensure configuration file is valid JSON
3. Restart Claude Desktop
4. Check environment variables are set

### Connection Issues

1. Verify API URL is accessible:
   ```bash
   curl https://your-api-url.com/health
   ```

2. Check API key is valid
3. Try with local Docker setup first

## Validation Checklist

- [ ] NPM package installs successfully
- [ ] `puo-memo-mcp --version` works
- [ ] Python dependencies auto-install
- [ ] MCP protocol test passes
- [ ] Claude Desktop recognizes the server
- [ ] Memory operations work in Claude
- [ ] Error handling works properly
- [ ] Cross-platform compatibility verified

## Next Steps

Once validated:

1. Deploy production API
2. Set up monitoring
3. Create user documentation
4. Implement rate limiting
5. Add comprehensive tests