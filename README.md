# Purmemo MCP Server

[![npm version](https://badge.fury.io/js/purmemo-mcp.svg)](https://www.npmjs.com/package/purmemo-mcp)
[![npm downloads](https://img.shields.io/npm/dm/purmemo-mcp.svg)](https://www.npmjs.com/package/purmemo-mcp)
[![GitHub stars](https://img.shields.io/github/stars/coladapo/purmemo-mcp.svg)](https://github.com/coladapo/purmemo-mcp/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP Compatible](https://img.shields.io/badge/MCP-Official-green.svg)](https://modelcontextprotocol.io)

**Official Model Context Protocol (MCP) server for Purmemo** - Your AI-powered second brain with 94% memory retrieval accuracy.

🚀 **Never lose a thought again - Purmemo remembers everything so you can focus on what matters.**  

## ✨ Features

- 🧠 **Smart Memory Storage** - AI understands context, not just keywords
- 🔍 **Natural Language Search** - "What did I learn about React hooks last month?"
- 📎 **Rich Attachments** - Files, images, links with automatic metadata
- 🏷️ **Automatic Entity Extraction** - People, places, topics, dates without manual tagging
- ⚡ **Lightning Fast** - <50ms average retrieval time
- 🔐 **Enterprise Security** - OAuth 2.1 + PKCE, end-to-end encryption

## 🚀 Quick Start

### 1. Create Your Purmemo Account

1. Sign up at [purmemo.ai/register](https://www.purmemo.ai/register)
2. Verify your email
3. Sign in to your account

**For Option B (Local) only**: Get an API key from [purmemo.ai/settings](https://www.purmemo.ai/settings) → API Keys tab

### 2. Choose Your Connection Method

| Method | Remote Connection (Beta) | Local Connection |
|--------|--------------------------|------------------|
| **Setup** | Add Custom Connector | Edit Config File |
| **Auth** | OAuth flow in browser | API Key in config |
| **Install** | Nothing to install | Auto-downloads via npx |
| **Platforms** | Works across all Claude platforms | Claude Desktop only |
| **Tools** | v8.0.0 tools (being deployed) | v8.0.0 tools (save_conversation, etc.) |
| **Updates** | Automatic | Manual (via npm) |
| **Best For** | Quick setup without API key | Advanced features & local control |

### 3. Configure Your AI Platform

Purmemo MCP server works across **all platforms** that support Model Context Protocol. Choose your platform below:

<details>
<summary><b>📘 Claude Desktop</b></summary>

#### Option A: Remote Connection via Custom Connector (Beta)
1. In Claude Desktop, scroll to bottom of connectors list
2. Click "Add custom connector (BETA)"
3. Enter:
   - **Name**: Purmemo
   - **Remote MCP server URL**: `https://mcp.purmemo.ai`
4. Click "Connect"
5. You'll be redirected to Purmemo login in your browser
6. Sign in with your Purmemo account
7. Authorize Claude to access your memories
8. Return to Claude Desktop - connection established

#### Option B: Local Connection via Config File

**Config Location**:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "purmemo": {
      "command": "npx",
      "args": ["-y", "purmemo-mcp"],
      "env": {
        "PURMEMO_API_KEY": "your-api-key-here",
        "MCP_PLATFORM": "claude"
      }
    }
  }
}
```

</details>

<details>
<summary><b>💻 Cursor IDE</b></summary>

#### Local Connection via Config File

**Config Location**:
- **macOS**: `~/.cursor/mcp.json`
- **Windows**: `%USERPROFILE%\.cursor\mcp.json`

```json
{
  "mcpServers": {
    "purmemo": {
      "command": "npx",
      "args": ["-y", "purmemo-mcp"],
      "env": {
        "PURMEMO_API_KEY": "your-api-key-here",
        "MCP_PLATFORM": "cursor"
      }
    }
  }
}
```

**Or via Cursor UI**:
1. Press `Cmd/Ctrl + Shift + P`
2. Search for "Cursor Settings"
3. Click "Tools & Integrations" → "Add Custom MCP"
4. Paste the configuration above

</details>

<details>
<summary><b>💬 ChatGPT (Web)</b></summary>

#### Remote Connection via Developer Mode (Beta)

**Prerequisites**:
- ChatGPT Plus, Pro, Business, Enterprise, or Education account
- Requires remote MCP server deployment (coming soon)

**Setup**:
1. Go to ChatGPT Settings → Connectors → Advanced → Developer Mode
2. Enable Developer Mode
3. Add MCP connector URL: `https://mcp.purmemo.ai` (when available)
4. Authenticate with your Purmemo account via OAuth

**Note**: ChatGPT requires remote MCP servers (SSE/HTTP). Local stdio connections are not supported.

</details>

<details>
<summary><b>🌊 Windsurf IDE</b></summary>

#### Local Connection via Config File

**Config Location**:
- **macOS**: `~/.windsurf/mcp.json`
- **Windows**: `%USERPROFILE%\.windsurf\mcp.json`

```json
{
  "mcpServers": {
    "purmemo": {
      "command": "npx",
      "args": ["-y", "purmemo-mcp"],
      "env": {
        "PURMEMO_API_KEY": "your-api-key-here",
        "MCP_PLATFORM": "windsurf"
      }
    }
  }
}
```

</details>

<details>
<summary><b>⚡ Zed Editor</b></summary>

#### Local Connection via Config File

**Config Location**:
- **macOS**: `~/.config/zed/mcp.json`
- **Linux**: `~/.config/zed/mcp.json`

```json
{
  "mcpServers": {
    "purmemo": {
      "command": "npx",
      "args": ["-y", "purmemo-mcp"],
      "env": {
        "PURMEMO_API_KEY": "your-api-key-here",
        "MCP_PLATFORM": "zed"
      }
    }
  }
}
```

</details>

### 4. Start Using in Claude

```
You: "Remember that the meeting with Sarah is at 3pm tomorrow about the API redesign"
Claude: "I've stored that memory with entities: Sarah (person), 3pm tomorrow (time), API redesign (topic)"

You: "What meetings do I have with Sarah?"
Claude: "Based on your memories: Tomorrow at 3pm - API redesign discussion"
```

## 🛠️ Available MCP Tools

### v8.0.0 Tools (Local Connection)

#### `save_conversation`
Save complete conversations with full context (handles 100K+ characters)
```typescript
save_conversation(content: string): MemoryResponse
```

#### `save_with_artifacts`
Save content with code artifacts and attachments preserved
```typescript
save_with_artifacts(content: string, artifacts: object[]): MemoryResponse
```

#### `recall_memories`
Search and retrieve memories using natural language
```typescript
recall_memories(query: string, limit?: number): Memory[]
```

#### `get_memory_details`
Get detailed information about a specific memory
```typescript
get_memory_details(memory_id: string): Memory
```

### Tools Available in Both Connections

Once the remote server update is complete, both connection methods will provide the same v8.0.0 tools with complete conversation capture, auto-chunking for 100K+ characters, and artifact preservation.

## 🎯 Real-World Use Cases

### For Developers
```
"Remember the Redis cache config: max-memory 2gb, eviction policy LRU, persistence AOF"
"What were those PostgreSQL optimization tips from last week's debugging session?"
"Show me all the API endpoints I've documented this month"
```

### For Researchers
```
"Store this paper: [arxiv link] - key insight about transformer attention mechanisms"
"What connections exist between my notes on neural networks and optimization?"
"Find all memories related to machine learning from Q3 2024"
```

### For Project Managers
```
"Remember stakeholder feedback: John wants faster load times, prioritize performance"
"What were the action items from yesterday's standup?"
"Show me all decisions made about the Q4 roadmap"
```

## 🔒 Security & Privacy

- **API Key Authentication**: Secure token-based access control
- **HTTPS/TLS Encryption**: All data encrypted in transit
- **Data Privacy**: Your memories belong to you
- **Account Control**: Delete your data anytime from settings

## 💰 Pricing

### Free Tier
- 50 memories/month
- Basic search
- Full MCP integration
- Community support

### Pro ($9/month)
- Unlimited memories
- Advanced AI features
- Priority support
- API access

### Teams ($29/month)
- Unlimited memories for 5 users
- Shared knowledge base
- Team collaboration features
- Admin dashboard
- Priority support

## 🔧 Development

### Local Development

```bash
# Clone the repository
git clone https://github.com/coladapo/purmemo-mcp.git
cd purmemo-mcp

# Install dependencies
npm install

# Run tests
npm test

# Start local server
PURMEMO_API_KEY=your-key npm start
```

### Contributing

We welcome contributions to the MCP protocol implementation! Please note:
- This repository contains only the open-source MCP wrapper
- Core memory algorithms remain proprietary
- See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines

## 📚 Documentation

- [API Documentation](https://api.purmemo.ai/docs)
- [MCP Integration Guide](https://docs.purmemo.ai/mcp)
- [Security Whitepaper](https://purmemo.ai/security)
- [Terms of Service](https://purmemo.ai/terms)

## 🎖️ Recognition

Purmemo MCP is pursuing official recognition in the [Model Context Protocol servers repository](https://github.com/modelcontextprotocol/servers).

## 📄 License

**MIT License** - See [LICENSE](LICENSE) file

## 🆘 Support

- 📧 Email: support@purmemo.ai
- 🐛 Issues: [GitHub Issues](https://github.com/coladapo/purmemo-mcp/issues)
- 🌐 Website: [purmemo.ai](https://purmemo.ai)

---

<div align="center">

**Built with ❤️ for the AI community**

*"Open the door, protect the house"* - Hybrid open-core model for sustainable innovation

[Website](https://purmemo.ai) · [Dashboard](https://app.purmemo.ai) · [API Docs](https://api.purmemo.ai/docs) · [NPM](https://www.npmjs.com/package/purmemo-mcp)

</div>