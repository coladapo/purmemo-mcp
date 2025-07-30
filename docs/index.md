# PUO Memo MCP Documentation

[![npm version](https://badge.fury.io/js/puo-memo-mcp.svg)](https://www.npmjs.com/package/puo-memo-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Welcome to the official documentation for PUO Memo MCP - a powerful Model Context Protocol server for memory management with AI capabilities.

## Quick Links

- [Installation Guide](./installation.md)
- [Configuration Guide](./configuration.md)
- [API Reference](./api-reference.md)
- [Examples](./examples.md)
- [Troubleshooting](./troubleshooting.md)
- [GitHub Setup Guide](./GITHUB_SETUP_GUIDE.md) - NEW! Full CI/CD setup

## What is PUO Memo MCP?

PUO Memo MCP is a Model Context Protocol (MCP) server that enables AI assistants like Claude and ChatGPT to store, retrieve, and manage memories with advanced features like:

- 🧠 Smart memory storage with AI-powered organization
- 🔍 Hybrid search combining keyword and semantic understanding
- 📎 File attachment support
- 🏷️ Automatic tagging and categorization
- 🔗 Knowledge graph with entity extraction
- 📥 Import conversations from various AI assistants

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- Python >= 3.9
- A PUO Memo account (sign up at [https://api.puo-memo.com](https://api.puo-memo.com))

### Quick Installation

```bash
npm install -g puo-memo-mcp
```

### Basic Configuration

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

## Features Overview

### Memory Management
Store and organize information with intelligent categorization and tagging.

### Smart Search
Find memories using natural language queries with our hybrid search system.

### Knowledge Graph
Automatically extract entities and relationships from your memories.

### File Attachments
Attach files, images, and URLs to your memories for richer context.

### Chat Import
Import conversations from Claude, ChatGPT, and other AI assistants.

## Support

- 📧 Email: support@puo-memo.com
- 🐛 Issues: [GitHub Issues](https://github.com/coladapo/puo-memo-mcp/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/coladapo/puo-memo-mcp/discussions)