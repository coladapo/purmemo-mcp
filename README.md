# PUO Memo MCP

[![npm version](https://badge.fury.io/js/puo-memo-mcp.svg)](https://www.npmjs.com/package/puo-memo-mcp)
[![npm downloads](https://img.shields.io/npm/dm/puo-memo-mcp.svg)](https://www.npmjs.com/package/puo-memo-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Official Model Context Protocol (MCP) server for PUO Memo - Your unified memory layer for AI assistants.

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

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Note**: This MCP server requires a PUO Memo account. Sign up at [https://api.puo-memo.com](https://api.puo-memo.com).