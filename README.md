# pūrmemo MCP Server

[![npm version](https://badge.fury.io/js/purmemo-mcp.svg)](https://www.npmjs.com/package/purmemo-mcp)
[![npm downloads](https://img.shields.io/npm/dm/purmemo-mcp.svg)](https://www.npmjs.com/package/purmemo-mcp)
[![Tests](https://github.com/coladapo/purmemo-mcp/actions/workflows/test.yml/badge.svg)](https://github.com/coladapo/purmemo-mcp/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue.svg)](https://modelcontextprotocol.io)

**MCP server for pūrmemo** — AI conversation memory that works everywhere. Save and recall conversations across Claude Code, Claude Desktop, Cursor, Windsurf, and other MCP-compatible platforms.

> **Using ChatGPT, Claude.ai, or Gemini in browser?** Get the [Chrome Extension](https://purmemo.ai/extension) instead.

## 🚀 Quick Start

### 1. Get Your API Key

1. Sign up for free at [app.purmemo.ai](https://app.purmemo.ai)
2. Go to Settings → API Keys
3. Create a new API key

### 2. Add to Your Platform

<details open>
<summary><b>Claude Code (Terminal)</b></summary>

The fastest setup — one command:

```bash
claude mcp add purmemo -e PURMEMO_API_KEY=your-api-key-here -- npx -y purmemo-mcp
```

Verify it connected:

```bash
claude mcp list
# purmemo: npx -y purmemo-mcp - ✓ Connected
```

**Optional: Add slash commands** for `/save`, `/recall`, and `/context`:

```bash
mkdir -p ~/.claude/commands
curl -s https://raw.githubusercontent.com/coladapo/purmemo-mcp/main/.claude/commands/save.md -o ~/.claude/commands/save.md
curl -s https://raw.githubusercontent.com/coladapo/purmemo-mcp/main/.claude/commands/recall.md -o ~/.claude/commands/recall.md
curl -s https://raw.githubusercontent.com/coladapo/purmemo-mcp/main/.claude/commands/context.md -o ~/.claude/commands/context.md
```

Then restart Claude Code and use `/save`, `/recall [topic]`, and `/context` in any session.

</details>

<details>
<summary><b>Claude Desktop (Remote MCP — Recommended)</b></summary>

The easiest way! Use pūrmemo's hosted MCP server:

1. Open Claude Desktop → Settings → Developer → Edit Config
2. Add this configuration:

```json
{
  "mcpServers": {
    "purmemo": {
      "url": "https://mcp.purmemo.ai/mcp/messages",
      "transport": "streamable-http"
    }
  }
}
```

3. Restart Claude Desktop
4. You'll be prompted to authenticate via OAuth

</details>

<details>
<summary><b>Claude Desktop (Local NPX)</b></summary>

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

Restart Claude Desktop after saving.

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
| `get_user_context` | Load your identity profile and current session context |

## ⚡ Slash Commands (Claude Code)

After installing the slash commands (see Claude Code setup above), you get:

| Command | What it does |
|---------|-------------|
| `/save` | Save the current conversation as a living document memory |
| `/recall [topic]` | Search past memories by topic |
| `/context` | Session startup — loads your identity + recent work |

The `/context` command is especially useful at the start of a session: it calls `get_user_context` and surfaces recent memories so Claude already knows who you are and what you've been working on — without you having to explain it.

## ✨ Features

- **Smart Titles** — Auto-generates meaningful titles (no timestamps)
- **Living Documents** — Update existing memories instead of duplicating
- **100K+ Characters** — Auto-chunks long conversations
- **Cross-Platform Sync** — All memories sync to [app.purmemo.ai](https://app.purmemo.ai)
- **Identity Layer** — Set your role, expertise, and current project once; Claude knows who you are on every session

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
- [Documentation](https://github.com/coladapo/purmemo-mcp/tree/main/docs)
- [Support](https://github.com/coladapo/purmemo-mcp/issues)

## 🔐 Privacy

pūrmemo stores your conversation memories securely. Your data is:
- Encrypted in transit (HTTPS) and at rest
- Never shared with third parties
- Accessible only to you via your API key

See our [Privacy Policy](https://purmemo.ai/privacy) for details.

## 📄 License

MIT
