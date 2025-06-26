# PUO Memo MCP - Multi-IDE Setup Guide

## 🎯 Overview

PUO Memo MCP is now configured to work seamlessly across multiple environments:
- **Claude Desktop** - Native app integration
- **Claude Code** - Claude's VS Code fork
- **Cursor IDE** - AI-powered code editor

All environments share the same ultra-simple memory system with just 2 tools:
- `memory` - Save anything to memory
- `recall` - Search or list memories

## 🚀 Current Configuration Status

### ✅ Claude Desktop
- **Config Location**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Status**: Configured and running
- **Process**: Auto-starts with Claude Desktop

### ✅ Cursor IDE
- **Config Location**: `~/.cursor/mcp.json`
- **Status**: Configured
- **Activation**: Settings > MCP > Enable MCP servers

### ✅ Claude Code
- **Config Location**: `~/.claude-code/mcp/global.json`
- **Status**: Configured
- **Scope**: Global (available in all projects)

### ✅ API Server (Browser Extension)
- **Port**: 8000
- **Status**: Running
- **Purpose**: Receives captures from MemoryLane extension

## 📁 Configuration Files

### 1. Cursor IDE Global Config (`~/.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "puo-memo": {
      "command": "/Users/wivak/puo-jects/active/puo memo mcp/venv/bin/python3",
      "args": [
        "/Users/wivak/puo-jects/active/puo memo mcp/server_ultra_simple.py"
      ],
      "env": {
        "PATH": "/Users/wivak/puo-jects/active/puo memo mcp/venv/bin:/usr/bin:/bin",
        "PYTHONPATH": "/Users/wivak/puo-jects/active/puo memo mcp"
      },
      "description": "PUO Memo Ultra Simple - Just 2 tools: memory and recall"
    }
  }
}
```

### 2. Claude Code Global Config (`~/.claude-code/mcp/global.json`)
```json
{
  "mcpServers": {
    "puo-memo": {
      "command": "/Users/wivak/puo-jects/active/puo memo mcp/venv/bin/python3",
      "args": [
        "/Users/wivak/puo-jects/active/puo memo mcp/server_ultra_simple.py"
      ],
      "env": {
        "PATH": "/Users/wivak/puo-jects/active/puo memo mcp/venv/bin:/usr/bin:/bin",
        "PYTHONPATH": "/Users/wivak/puo-jects/active/puo memo mcp"
      },
      "description": "PUO Memo Ultra Simple - Just 2 tools: memory and recall"
    }
  }
}
```

## 🔧 How to Use

### In Cursor IDE
1. Open Cursor Settings (⌘+,)
2. Search for "MCP"
3. Enable "MCP servers"
4. The `memory` and `recall` tools will be available to the AI assistant
5. Use natural language: "memory: Just learned about React hooks"

### In Claude Code
1. Open any project
2. The MCP tools are automatically available globally
3. Use commands like:
   - `claude mcp list` - See available servers
   - Use in chat: "recall: React hooks"

### In Claude Desktop
1. Tools are automatically available
2. Just type naturally:
   - "memory: Important meeting notes..."
   - "recall: meeting notes"

## 🔄 Project vs Global Configuration

### Understanding Scopes

**Global Configuration** (What we're using):
- Available in ALL projects automatically
- No need to configure per project
- Ideal for personal tools like memory systems
- Location: `~/.cursor/mcp.json` or `~/.claude-code/mcp/global.json`

**Project Configuration** (Optional):
- Only available in specific project
- Overrides global settings
- Good for project-specific tools
- Location: `.cursor/mcp.json` or `.mcp.json` in project root

### Why Global?
Your memory system should be available everywhere you code, not tied to specific projects. This setup ensures your memories are always accessible.

## 🛠️ Troubleshooting

### MCP Not Showing in Cursor
1. Go to Settings > MCP
2. Click refresh button
3. Restart Cursor if needed

### MCP Not Working in Claude Code
1. Check if server is listed: `claude mcp list`
2. Check logs: `tail -f ~/.claude-code/logs/mcp*.log`
3. Restart Claude Code

### API Server Issues
```bash
# Check if running
curl http://localhost:8000/

# View logs
tail -f ~/puo-jects/active/puo\ memo\ mcp/api_server.log

# Restart if needed
cd "/Users/wivak/puo-jects/active/puo memo mcp"
source venv/bin/activate
python api_server.py
```

## 🏗️ Architecture Recap

```
┌─────────────────────────────────────────────────┐
│              Development Environments            │
├─────────────┬──────────────┬────────────────────┤
│ Claude Desktop │ Claude Code │    Cursor IDE    │
└──────┬─────────┴──────┬──────┴──────┬───────────┘
       │                │              │
       │          MCP Protocol         │
       │         (stdio/JSON-RPC)      │
       └────────────┬──────────────────┘
                    │
          ┌─────────┴──────────┐
          │ server_ultra_simple │
          │   - memory tool     │
          │   - recall tool     │
          └─────────┬──────────┘
                    │
          ┌─────────┴──────────┐
          │   PuoMemoSimple    │
          │  (Shared Backend)  │
          └─────────┬──────────┘
                    │
          ┌─────────┴──────────┐
          │   Cloud SQL DB     │
          │   (PostgreSQL)     │
          └────────────────────┘
```

## 🚀 Quick Commands

### Start/Stop Services
```bash
# Check all systems
cd "/Users/wivak/puo-jects/active/puo memo mcp"
source venv/bin/activate
python check_system_status.py

# Start API server (if not running)
nohup python api_server.py > api_server.log 2>&1 &

# MCP servers start automatically with each IDE
```

### Test Memory System
```bash
# In any IDE with MCP enabled:
memory: Testing multi-IDE setup
recall: multi-IDE
```

## 📝 Best Practices

1. **Use Descriptive Memories**: "memory: Learned that MCP works across IDEs"
2. **Tag Important Items**: Include keywords for better recall
3. **Regular Recalls**: Use "recall:" to list recent memories
4. **Cross-IDE Workflow**: Save in Cursor, recall in Claude Desktop

## 🎉 Benefits of This Setup

1. **Unified Memory**: Same memories accessible everywhere
2. **No Context Switching**: Your knowledge follows you
3. **Simple Interface**: Just 2 tools to remember
4. **Always Available**: Global config = works in any project
5. **Multi-Source**: Captures from browser, saves from IDEs

Your memory system is now truly omnipresent across your entire development workflow!