# PUO Memo MCP

[![npm version](https://badge.fury.io/js/puo-memo-mcp.svg)](https://www.npmjs.com/package/puo-memo-mcp)
[![npm downloads](https://img.shields.io/npm/dm/puo-memo-mcp.svg)](https://www.npmjs.com/package/puo-memo-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub issues](https://img.shields.io/github/issues/coladapo/puo-memo-mcp)](https://github.com/coladapo/puo-memo-mcp/issues)
[![GitHub stars](https://img.shields.io/github/stars/coladapo/puo-memo-mcp)](https://github.com/coladapo/puo-memo-mcp/stargazers)

Official Model Context Protocol (MCP) server for PUO Memo - a powerful memory management system with AI capabilities.

## Features

- 🧠 **Smart Memory Storage** - Save and organize information with AI assistance
- 🔍 **Intelligent Search** - Hybrid search combining keywords and semantic understanding
- 📎 **File Attachments** - Attach files and URLs to memories
- 🏷️ **Smart Tagging** - Automatic and manual categorization
- 🔗 **Knowledge Graph** - Automatic entity extraction and relationship mapping
- 📥 **Chat Import** - Import conversations from Claude, ChatGPT, and other AI assistants

## Installation

```bash
npm install puo-memo-mcp
```

## Quick Start

### 1. Configure Claude Desktop

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "puo-memo": {
      "command": "npx",
      "args": ["puo-memo-mcp"],
      "env": {
        "PUO_MEMO_API_URL": "https://api.puo-memo.com",
        "PUO_MEMO_API_KEY": "your-api-key"
      }
    }
  }
}
```

### 2. Get Your API Key

Sign up at [https://api.puo-memo.com](https://api.puo-memo.com) to get your API key.

### 3. Start Using

Once configured, you can use these commands in Claude:

- **Save a memory**: "Remember that the meeting is at 3pm tomorrow"
- **Search memories**: "What did we discuss about the project timeline?"
- **List entities**: "Show me all the people I've mentioned"

## Available Tools

- `memory` - Create or update memories
- `recall` - Search and retrieve memories
- `entities` - Explore knowledge graph
- `attach` - Attach files to memories
- `import_chat` - Import AI conversations
- `correction` - Add corrections to memories

## Documentation

- [API Reference](docs/api-reference.md)
- [Configuration Guide](docs/configuration.md)
- [Examples](examples/)

## Support

- 📧 Email: support@puo-memo.com
- 🐛 Issues: [GitHub Issues](https://github.com/coladapo/puo-memo-mcp/issues)
- 📚 Docs: [https://api.puo-memo.com/docs](https://api.puo-memo.com/docs)

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Note**: This MCP server requires a PUO Memo account. Sign up at [https://api.puo-memo.com](https://api.puo-memo.com).
EOF < /dev/null