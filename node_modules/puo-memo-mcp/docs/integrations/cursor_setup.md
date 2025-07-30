# PUO Memo MCP Setup for Cursor

## Prerequisites
- Cursor IDE installed
- PUO Memo MCP already working with Claude Desktop
- Python environment set up

## Setup Instructions

### 1. Create Cursor MCP Configuration

Cursor looks for MCP servers in a similar way to Claude Desktop. Create or update the MCP settings file:

**Location**: `~/Library/Application Support/Cursor/User/globalStorage/cursor-mcp/settings.json`

If the directory doesn't exist:
```bash
mkdir -p ~/Library/Application\ Support/Cursor/User/globalStorage/cursor-mcp/
```

### 2. Add PUO Memo to Cursor Configuration

Create/edit the settings.json file:

```json
{
  "mcpServers": {
    "puo-memo": {
      "command": "python",
      "args": [
        "/Users/wivak/puo-jects/active/puo memo mcp/server.py"
      ],
      "env": {
        "PYTHONPATH": "/Users/wivak/puo-jects/active/puo memo mcp",
        "DB_HOST": "35.235.107.217",
        "DB_PORT": "5432", 
        "DB_NAME": "puo_memo",
        "DB_USER": "puo_app_user",
        "DB_PASSWORD": "ZBGTMG(LX1slVz5%",
        "GEMINI_API_KEY": "AIzaSyAD_1-jBTeYGeXAAUQkqp3GZTFNj-S7irw",
        "GCS_BUCKET_NAME": "puo-memo-attachments",
        "GCS_PROJECT_ID": "puo-studio",
        "DEFAULT_CONTEXT": "cursor"
      }
    }
  }
}
```

### 3. Alternative: Use the Same Claude Desktop Config

If you want to share the exact same configuration as Claude Desktop, you can symlink:

```bash
# Check if Cursor MCP directory exists
mkdir -p ~/Library/Application\ Support/Cursor/User/globalStorage/cursor-mcp/

# Symlink Claude's MCP config to Cursor
ln -s ~/Library/Application\ Support/Claude/claude_desktop_config.json \
      ~/Library/Application\ Support/Cursor/User/globalStorage/cursor-mcp/settings.json
```

### 4. Verify MCP Server is Accessible

Test that the server starts correctly:
```bash
cd "/Users/wivak/puo-jects/active/puo memo mcp"
python server.py
```

You should see:
```
MCP Server for PUO Memo running on stdio...
```

### 5. Restart Cursor

1. Completely quit Cursor (Cmd+Q)
2. Restart Cursor
3. Open the command palette (Cmd+Shift+P)
4. Look for MCP-related commands

### 6. Test the Integration

In Cursor, try using PUO Memo commands:
- Save a code snippet to memory
- Search for previous memories
- Attach files to memories

## Available Tools in Cursor

Once connected, you'll have access to:

1. **memory_save** - Save code snippets with context
2. **memory_search** - Search your knowledge base
3. **memory_list** - List recent memories
4. **entity_explore** - Explore code entities and relationships
5. **memory_attach** - Attach files to memories

## Usage Examples in Cursor

### Save Current File to Memory
```
Save the current implementation of the authentication module 
with tags: #auth #security #cursor
```

### Search for Code Patterns
```
Search for all memories about React hooks implementation
```

### Track Code Evolution
```
Save this refactored version and link it to the previous implementation
```

## Troubleshooting

### If MCP doesn't appear in Cursor:

1. Check Cursor's logs:
   ```
   ~/Library/Logs/Cursor/
   ```

2. Verify Python path:
   ```bash
   which python
   # Should show your Python installation
   ```

3. Test server manually:
   ```bash
   cd "/Users/wivak/puo-jects/active/puo memo mcp"
   python -m src.mcp.server
   ```

### Common Issues:

1. **Import errors**: Ensure PYTHONPATH is set correctly
2. **Database connection**: Verify .env file is loaded
3. **Permissions**: Check file permissions on server.py

## Context Tracking

PUO Memo will automatically track that memories are created from Cursor using:
```
DEFAULT_CONTEXT=cursor
```

This helps you distinguish between memories created in:
- Claude Desktop (context: "claude")
- ChatGPT (context: "chatgpt")  
- Cursor (context: "cursor")

## Next Steps

1. Create Cursor-specific memory templates
2. Set up code snippet extraction
3. Create workspace-specific memory contexts
4. Integrate with Cursor's AI features