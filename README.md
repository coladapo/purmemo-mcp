# PUO Memo MCP - Ultra Simple Memory System

The ultimate simplified MCP (Model Context Protocol) server with just 2 tools. Pure memory management without complexity.

## Features

- **Just 2 Tools** - `memory` and `recall` - that's it!
- **Cloud SQL Ready** - Pre-configured for your database
- **AI-Enhanced Search** - Optional Gemini integration
- **No Redundancy** - Save = Update, Search = List
- **Ultra Simple** - Maximum simplicity, maximum reliability

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Setup Database

```bash
python setup_database.py
```

This will create the necessary tables in your Cloud SQL database.

### 3. Run the Server

```bash
python server_ultra_simple.py
```

### 4. Add to Claude Desktop

Add this to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "puo-memo": {
      "command": "/path/to/venv/bin/python3",
      "args": ["/path/to/puo memo mcp/server_ultra_simple.py"]
    }
  }
}
```

Restart Claude Desktop and you're ready to go!

## Available Tools

### 1. `memory`
Save anything to memory. Creates new memories or updates existing ones.
```
Examples: 
- "memory: Just learned about Python decorators"
- "memory: [with id] Updated understanding of decorators"
```

### 2. `recall`
Search your memories or list recent ones.
```
Examples:
- "recall: Python decorators" (search)
- "recall:" (list recent memories)
```

That's it! Just 2 tools for all your memory needs.

## Configuration

The `.env` file contains:
- **Database credentials** - Pre-configured for your Cloud SQL
- **Gemini API key** - Optional, enables AI-enhanced search

## Architecture

```
server.py          # MCP server with 8 tools
puo_memo_simple.py # Core memory operations
setup_database.py  # Database initialization
.env              # Configuration (included for convenience)
```

## Key Differences from Original

- **No file watching** - No macOS permission dialogs
- **No background services** - Simple and predictable
- **Only 2 search modes** - Basic and AI-enhanced
- **No context injection** - No timeout issues
- **Clean codebase** - Easy to understand and modify

## Testing

Run the test script to verify everything works:

```bash
python test_connection.py
```

## Troubleshooting

### "Connection refused" error
- Check your Cloud SQL instance is running
- Verify IP whitelist includes your current IP

### "Table does not exist" error
- Run `python setup_database.py` to create tables

### Tools not showing in Claude Desktop
- Restart Claude Desktop after updating config
- Check logs: `tail -f ~/Library/Logs/Claude/mcp*.log`

## License

MIT License - Use freely!

## Credits

Simplified version of PUO Memo MCP, focusing on reliability and ease of use.