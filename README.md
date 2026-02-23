# pūrmemo MCP Server

[![npm version](https://badge.fury.io/js/purmemo-mcp.svg)](https://www.npmjs.com/package/purmemo-mcp)
[![npm downloads](https://img.shields.io/npm/dm/purmemo-mcp.svg)](https://www.npmjs.com/package/purmemo-mcp)
[![Tests](https://github.com/coladapo/purmemo-mcp/actions/workflows/test.yml/badge.svg)](https://github.com/coladapo/purmemo-mcp/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue.svg)](https://modelcontextprotocol.io)

**Claude knows who you are before you say a word.**

pūrmemo gives your AI a persistent memory and identity layer — your role, expertise, active projects, and conversation history — available instantly in every session, across every platform.

> **Using ChatGPT, Claude.ai, or Gemini in browser?** Get the [Chrome Extension](https://purmemo.ai/extension) instead.

---

## What It Does

- **Remembers everything** — save conversations, decisions, and context; search them later with natural language
- **Knows who you are** — your role, expertise, tools, and active projects load automatically at session start
- **Works everywhere** — Claude Code, Claude Desktop, Cursor, Windsurf, Zed, and any MCP-compatible platform

---

## Quick Start

### 1. Get Your API Key

1. Sign up for free at [app.purmemo.ai](https://app.purmemo.ai)
2. Go to Settings → API Keys
3. Create a new API key

### 2. Add to Your Platform

<details open>
<summary><b>Claude Code (Terminal)</b></summary>

One command:

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

Use pūrmemo's hosted MCP server — no API key setup required, authenticates via OAuth:

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
4. You'll be prompted to sign in via OAuth

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

Edit `~/.codeium/windsurf/mcp_config.json`:

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

Add to `~/.config/zed/settings.json` under the `context_servers` key:

```json
{
  "context_servers": {
    "purmemo": {
      "command": {
        "path": "npx",
        "args": ["-y", "purmemo-mcp"],
        "env": {
          "PURMEMO_API_KEY": "your-api-key-here"
        }
      }
    }
  }
}
```
</details>

### 3. Start Using

```
You: "What's the project status?"
Claude: Based on your identity and recent memories:
  You're a founder working on a B2B SaaS product.
  Recent work: pūrmemo (15 sessions), auth refactor (3 sessions)
  Last session: "Fixed JWT refresh token rotation"
```

---

## What You Get

### Resources (attach to any conversation via the `+` button)

| Resource | What it contains |
|----------|-----------------|
| `memory://me` | Your identity: role, expertise, tools, active projects, what you're working on |
| `memory://context` | Your 5 most recent conversation summaries |
| `memory://projects` | All projects you've saved memories about, grouped and sorted by recency |
| `memory://{id}` | Full content of any specific memory by ID |

**Example — attach `memory://me` at session start:**

```
You are working with:
**Chris** — Founder, B2B SaaS
Expertise: product, fullstack, ai
Tools: cursor, claude, supabase
Style: systems thinker

Recent work:
- pūrmemo (15 recent sessions)
- auth-refactor (4 recent sessions)

Working on: MCP Resources + Prompts feature
```

No re-explaining who you are. No repeating your stack. Just continue.

### Prompts (conversation starters in the `+` menu)

| Prompt | What it does |
|--------|-------------|
| `load-context` | Load your full identity and recent memories to start a session |
| `save-this-conversation` | Save the current conversation as a living document |
| `catch-me-up` | Get a summary of recent work across all projects |
| `weekly-review` | Review the week's progress and plan what's next |

---

## Tools

| Tool | Description |
|------|-------------|
| `save_conversation` | Save conversations with smart titles and context extraction |
| `recall_memories` | Search memories with natural language |
| `get_memory_details` | Get full details of a specific memory |
| `discover_related_conversations` | Find related discussions across platforms |
| `get_user_context` | Load your identity profile and recent work context |

**`get_user_context` in action:**

```
You: "What have I been working on?"
Claude: [calls get_user_context]

Your profile: Founder · B2B SaaS · fullstack/ai/product
Active projects:
  • pūrmemo — "MCP server resources and prompts" (15 sessions)
  • auth-refactor — "JWT refresh token fix" (4 sessions)
Working on: MCP Resources + Prompts feature
```

---

## Identity Layer

pūrmemo maintains a **cognitive fingerprint** — a persistent profile of who you are that loads automatically into every session.

Set it once at [app.purmemo.ai](https://app.purmemo.ai) → Settings → Identity:

- **Role** — founder, engineer, designer, researcher, ...
- **Domain** — your primary field (B2B SaaS, ML research, design systems, ...)
- **Expertise** — your key skills (product, fullstack, ai, ...)
- **Tools** — what you work with (cursor, claude, supabase, ...)
- **Work style** — how you think (systems thinker, iterative builder, ...)
- **Working on** — your current focus, updated per session

Once set, every new session inherits this context. Claude already knows your background, your stack, and what you were doing last time — without you having to explain it.

---

## Slash Commands (Claude Code)

After installing the slash commands (see Claude Code setup above):

| Command | What it does |
|---------|-------------|
| `/save` | Save the current conversation as a living document memory |
| `/recall [topic]` | Search past memories by topic |
| `/context` | Session startup — loads your identity + recent work |

The `/context` command is especially useful at the start of a session: it calls `get_user_context` and surfaces your identity and recent work so Claude already knows where you left off.

---

## Living Document Pattern

Same title = update, not duplicate. Build on memory over time:

```
You: "Save this as auth-refactor"
Claude: ✅ Saved — "auth-refactor" (new)

[... continue working across multiple sessions ...]

You: "Save as auth-refactor"
Claude: ✅ Updated — "auth-refactor" (3 updates, not 3 copies)
```

Long conversations? Auto-chunked at 100K+ characters and reassembled on recall.

---

## Pricing

| Plan | Price | Recalls | Saves |
|------|-------|---------|-------|
| Free | $0 | 50/month | Unlimited |
| Pro | $19/month | Unlimited | Unlimited |

---

## Links

- [Dashboard](https://app.purmemo.ai) — View and manage memories
- [Chrome Extension](https://purmemo.ai/extension) — For ChatGPT, Claude.ai, Gemini
- [Documentation](https://github.com/coladapo/purmemo-mcp/tree/main/docs)
- [Support](https://github.com/coladapo/purmemo-mcp/issues)

---

## Privacy

Your data is encrypted in transit (HTTPS) and at rest. It is never shared with third parties and is accessible only to you via your API key.

See our [Privacy Policy](https://purmemo.ai/privacy) for details.

---

## License

MIT
