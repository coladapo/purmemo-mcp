# Purmemo MCP Server

[![npm version](https://badge.fury.io/js/purmemo-mcp.svg)](https://www.npmjs.com/package/purmemo-mcp)
[![npm downloads](https://img.shields.io/npm/dm/purmemo-mcp.svg)](https://www.npmjs.com/package/purmemo-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**MCP server for Purmemo** — AI conversation memory for Claude Desktop, Cursor, and other MCP-compatible platforms.

> **Using ChatGPT, Claude.ai, or Gemini in browser?** Get the [Chrome Extension](https://purmemo.ai/extension) instead.

## 🚀 Quick Start

### 1. Get Your API Key

1. Sign up for free at [app.purmemo.ai](https://app.purmemo.ai)
2. Go to Settings → API Keys
3. Create a new API key

### 2. Add to Your Platform

<details open>
<summary><b>Claude Desktop</b></summary>

Edit your config file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "purmemo": {
      "command": "npx",
      "args": ["-y", "purmemo-mcp"],
      "env": {
        "PURMEMO_API_KEY": "your-api-key-here"
      }
    }
  }
}
```
</details>

<details>
<summary><b>Cursor IDE</b></summary>

Edit `~/.cursor/mcp.json` (macOS) or `%USERPROFILE%\.cursor\mcp.json` (Windows):

```json
{
  "mcpServers": {
    "purmemo": {
      "command": "npx",
      "args": ["-y", "purmemo-mcp"],
      "env": {
        "PURMEMO_API_KEY": "your-api-key-here"
      }
    }
  }
}
```
</details>

<details>
<summary><b>Windsurf IDE</b></summary>

Edit `~/.windsurf/mcp.json` (macOS) or `%USERPROFILE%\.windsurf\mcp.json` (Windows):

```json
{
  "mcpServers": {
    "purmemo": {
      "command": "npx",
      "args": ["-y", "purmemo-mcp"],
      "env": {
        "PURMEMO_API_KEY": "your-api-key-here"
      }
    }
  }
}
```
</details>

<details>
<summary><b>Zed Editor</b></summary>

Edit `~/.config/zed/mcp.json`:

```json
{
  "mcpServers": {
    "purmemo": {
      "command": "npx",
      "args": ["-y", "purmemo-mcp"],
      "env": {
        "PURMEMO_API_KEY": "your-api-key-here"
      }
    }
  }
}
```
</details>

### 3. Start Using

```
You: "Save this conversation"
Claude: ✅ Saved! Title: "React Hooks Discussion"

You: "What did we discuss about authentication last week?"
Claude: "Based on your memories: You decided to use JWT tokens with..."
```

## 🛠️ Tools

| Tool | Description |
|------|-------------|
| `save_conversation` | Save conversations with smart titles and context extraction |
| `recall_memories` | Search memories with natural language |
| `get_memory_details` | Get full details of a specific memory |
| `discover_related_conversations` | Find related discussions across platforms |

## ✨ Features

- **Smart Titles** — Auto-generates meaningful titles (no timestamps)
- **Living Documents** — Update existing memories instead of duplicating
- **100K+ Characters** — Auto-chunks long conversations
- **Cross-Platform Sync** — All memories sync to [app.purmemo.ai](https://app.purmemo.ai)

## 📝 Living Document Pattern

Save and update the same conversation over time:

```
You: "Save as conversation project-planning"
Claude: ✅ Saved with ID: project-planning

[... continue working ...]

You: "Update conversation project-planning"
Claude: ✅ Updated! (not duplicated)
```

## 💰 Pricing

| Plan | Price | Recalls | Saves |
|------|-------|---------|-------|
| Free | $0 | 100/month | Unlimited |
| Pro | $9/month | 1,000/month | Unlimited |

## 🔗 Links

- [Dashboard](https://app.purmemo.ai) — View and manage memories
- [Chrome Extension](https://purmemo.ai/extension) — For ChatGPT, Claude.ai, Gemini
- [Support](mailto:support@purmemo.ai)

## 📄 License

MIT
