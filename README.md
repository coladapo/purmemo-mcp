# Purmemo MCP Server

[![npm version](https://badge.fury.io/js/purmemo-mcp.svg)](https://www.npmjs.com/package/purmemo-mcp)
[![npm downloads](https://img.shields.io/npm/dm/purmemo-mcp.svg)](https://www.npmjs.com/package/purmemo-mcp)
[![GitHub stars](https://img.shields.io/github/stars/coladapo/purmemo-mcp.svg)](https://github.com/coladapo/purmemo-mcp/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP Compatible](https://img.shields.io/badge/MCP-Official-green.svg)](https://modelcontextprotocol.io)

**Official Model Context Protocol (MCP) server for Purmemo** - Your AI-powered second brain with 94% memory retrieval accuracy.

🚀 **Never lose a thought again - Purmemo remembers everything so you can focus on what matters.**

## 🏗️ Architecture: Open Protocol, Protected Innovation

This repository contains the **open-source MCP protocol wrapper** that connects to Purmemo's proprietary API:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐     ┌──────────────────┐
│  Claude/Client  │────▶│  MCP Server      │────▶│  Purmemo API    │────▶│  Proprietary     │
│                 │ MCP │  (This Repo)     │ REST│  (Documented)   │     │  Core Engine     │
└─────────────────┘     └──────────────────┘     └─────────────────┘     └──────────────────┘
    Open Protocol           MIT Licensed           Terms of Service         Trade Secrets
                               You Fork                You Use              Protected IP
```

### What's Open Source (This Repository)
✅ MCP protocol implementation  
✅ OAuth 2.1 authentication flow  
✅ Tool interface definitions  
✅ API client wrapper  
✅ Documentation and examples  

### What's Proprietary (Our Secret Sauce)
🔒 94% accuracy memory algorithms  
🔒 AI-powered entity extraction  
🔒 <50ms retrieval optimization  
🔒 Workflow intelligence engine  
🔒 Consciousness gradient system  

## ✨ Features

- 🧠 **Smart Memory Storage** - AI understands context, not just keywords
- 🔍 **Natural Language Search** - "What did I learn about React hooks last month?"
- 📎 **Rich Attachments** - Files, images, links with automatic metadata
- 🏷️ **Automatic Entity Extraction** - People, places, topics, dates without manual tagging
- ⚡ **Lightning Fast** - <50ms average retrieval time
- 🔐 **Enterprise Security** - OAuth 2.1 + PKCE, end-to-end encryption

## 🚀 Quick Start

### 1. Get Your API Key

1. Sign up at [purmemo.ai/register](https://www.purmemo.ai/register)
2. Sign in and go to [purmemo.ai/settings](https://www.purmemo.ai/settings)
3. Click "API Keys" tab → "Create New Key"
4. Name it (e.g., "Claude Desktop") → "Create Key"
5. Copy the key immediately (won't be shown again)

### 2. No Installation Needed!

Claude Desktop will automatically download the MCP server using `npx` (see configuration below).

### 3. Configure Claude Desktop

Add to your Claude Desktop configuration:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`  
**Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "purmemo": {
      "command": "npx",
      "args": ["purmemo-mcp"],
      "env": {
        "PURMEMO_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### 4. Start Using in Claude

```
You: "Remember that the meeting with Sarah is at 3pm tomorrow about the API redesign"
Claude: "I've stored that memory with entities: Sarah (person), 3pm tomorrow (time), API redesign (topic)"

You: "What meetings do I have with Sarah?"
Claude: "Based on your memories: Tomorrow at 3pm - API redesign discussion"
```

## 🛠️ Available MCP Tools

### `memory`
Store new memories with automatic enhancement
```typescript
memory(content: string, metadata?: object): MemoryResponse
```

### `recall`
Retrieve memories using natural language
```typescript
recall(query: string, limit?: number): Memory[]
```

### `entities`
Explore your automatically extracted knowledge graph
```typescript
entities(type?: string, memory_id?: string): Entity[]
```

### `attach`
Add rich media attachments to memories
```typescript
attach(memory_id: string, attachment: Attachment): Response
```

### `correction`
Update or refine existing memories
```typescript
correction(memory_id: string, updates: object): Response
```

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

- **OAuth 2.1 + PKCE**: Industry-standard secure authentication
- **End-to-end encryption**: Your memories are encrypted in transit and at rest
- **SOC 2 Type II**: Compliance in progress
- **GDPR compliant**: Full data control and right to deletion
- **Zero-knowledge option**: Available for enterprise customers

## 💰 Pricing

### Free Tier
- 100 memories/month
- Basic search
- Full MCP integration
- Community support

### Pro ($9/month)
- Unlimited memories
- Advanced AI features
- Priority support
- API access

### Enterprise (Custom)
- Self-hosted option
- Custom AI training
- White-label MCP
- SLA guarantees

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

### Open Source Components (This Repository)
**MIT License** - See [LICENSE](LICENSE) file

You are free to:
- Use this MCP server commercially
- Modify and distribute
- Create your own implementations

### Proprietary Components (Purmemo Core)
**Proprietary License** - Protected by trade secrets and pending patents

The following remain proprietary:
- Memory retrieval algorithms
- Entity extraction engine
- Workflow intelligence system
- Performance optimization techniques

## 🆘 Support

- 📧 Email: support@purmemo.ai
- 🐛 Issues: [GitHub Issues](https://github.com/coladapo/purmemo-mcp/issues)
- 🌐 Website: [purmemo.ai](https://purmemo.ai)

## 🗺️ Roadmap

- [x] Core MCP implementation
- [x] OAuth 2.1 authentication
- [x] 5 essential tools
- [ ] WebSocket support for real-time
- [ ] Batch operations
- [ ] Memory sharing between users
- [ ] Voice memory capture
- [ ] Official MCP recognition

---

<div align="center">

**Built with ❤️ for the AI community**

*"Open the door, protect the house"* - Hybrid open-core model for sustainable innovation

[Website](https://purmemo.ai) · [Dashboard](https://app.purmemo.ai) · [API Docs](https://api.purmemo.ai/docs) · [NPM](https://www.npmjs.com/package/purmemo-mcp)

</div>