# PUO Memo MCP

[![npm version](https://badge.fury.io/js/puo-memo-mcp.svg)](https://www.npmjs.com/package/puo-memo-mcp)
[![npm downloads](https://img.shields.io/npm/dm/puo-memo-mcp.svg)](https://www.npmjs.com/package/puo-memo-mcp)
[![GitHub stars](https://img.shields.io/github/stars/coladapo/puo-memo-mcp.svg)](https://github.com/coladapo/puo-memo-mcp/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-green.svg)](https://modelcontextprotocol.io)

Official Model Context Protocol (MCP) server for PUO Memo - Your unified memory layer for AI assistants.

🚀 **Use the same memory across Claude, ChatGPT, Cursor, and more!**

## Features

- 🧠 **Smart Memory Storage** - Save and organize information across all your AI tools
- 🔍 **Intelligent Search** - Find memories using natural language
- 📎 **File Attachments** - Attach files and URLs to memories
- 🏷️ **Smart Tagging** - Automatic categorization
- 🔐 **Secure** - All processing happens on PUO Memo servers

## Installation

```bash
npm install -g puo-memo-mcp
```

## Why PUO Memo?

Stop losing context between AI conversations! PUO Memo creates a unified memory layer that works across all your AI tools:

- 💬 **Claude Desktop** - Native MCP integration
- 🤖 **ChatGPT** - Via custom GPT or API
- 💻 **Cursor/VS Code** - Full IDE integration
- 🔗 **Any MCP-compatible tool** - Future-proof design

## Quick Start

### 1. Get Your API Key

Sign up at [https://api.puo-memo.com](https://api.puo-memo.com) to get your API key.

### 2. Configure Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "puo-memo": {
      "command": "npx",
      "args": ["puo-memo-mcp"],
      "env": {
        "PUO_MEMO_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### 3. Start Using

- **Save a memory**: "Remember that the meeting is at 3pm tomorrow"
- **Search memories**: "What did we discuss about the project?"
- **List entities**: "Show me all the people I've mentioned"

## Real-World Use Cases

### 🎯 Project Management
```
You: "Remember the new API endpoint needs rate limiting at 100 requests per minute"
Claude: "I've saved that to your memory."

// Later in Cursor...
You: "What were the rate limiting requirements?"
Cursor: "Based on your memories: 100 requests per minute for the new API endpoint"
```

### 📚 Learning & Research
```
You: "Remember this article about transformer architecture [link]"
ChatGPT: "Saved! I've also extracted key concepts: attention mechanism, positional encoding..."

// Next day in Claude...
You: "Show me what I've learned about transformers"
Claude: "Here are your memories about transformer architecture..."
```

### 💼 Client Work
```
You: "Remember client X prefers PostgreSQL over MySQL for all projects"
You: "Client Y's API key format is: XY-[8 chars]-[timestamp]"

// When starting new project...
You: "What do I need to remember about client X?"
```

## Available Tools

- `memory` - Save information to your memory vault
- `recall` - Search and retrieve memories
- `entities` - Explore your knowledge graph
- `attach` - Attach files to memories
- `correction` - Add corrections to existing memories

## Security

This is a thin client that forwards all requests to the PUO Memo API. No data is processed locally, ensuring your information remains secure on PUO Memo servers.

## Support

- 📧 Email: support@puo-memo.com
- 🐛 Issues: [GitHub Issues](https://github.com/coladapo/puo-memo-mcp/issues)
- 📚 Docs: [https://api.puo-memo.com/docs](https://api.puo-memo.com/docs)

## Contributing

We welcome contributions! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development

```bash
# Clone the repository
git clone https://github.com/coladapo/puo-memo-mcp.git
cd puo-memo-mcp

# Install dependencies
npm install

# Test locally
PUO_MEMO_API_KEY=your-key node src/index.js
```

## Roadmap

- [ ] Batch memory operations
- [ ] Memory export/import
- [ ] Advanced search filters
- [ ] Memory sharing between users
- [ ] Voice memory capture

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

<div align="center">

**Built with ❤️ for the AI community**

[Website](https://puo-memo.com) · [API Docs](https://api.puo-memo.com/docs) · [NPM](https://www.npmjs.com/package/puo-memo-mcp) · [Issues](https://github.com/coladapo/puo-memo-mcp/issues)

</div>