# Installation Guide

This guide will help you install and set up PUO Memo MCP.

## Prerequisites

Before installing PUO Memo MCP, ensure you have:

- **Node.js** version 18.0.0 or higher
- **Python** version 3.9 or higher
- **npm** (comes with Node.js)
- A **PUO Memo account** (sign up at [https://api.puo-memo.com](https://api.puo-memo.com))

## Installation Methods

### Method 1: Global Installation (Recommended)

```bash
npm install -g puo-memo-mcp
```

This installs PUO Memo MCP globally, making it available from anywhere on your system.

### Method 2: Local Installation

```bash
npm install puo-memo-mcp
```

This installs PUO Memo MCP in your current project directory.

### Method 3: Using npx (No Installation)

```bash
npx puo-memo-mcp
```

This runs PUO Memo MCP directly without installing it permanently.

## Verify Installation

To verify the installation was successful:

```bash
puo-memo-mcp --version
```

## Setting Up Your API Key

1. Sign up or log in at [https://api.puo-memo.com](https://api.puo-memo.com)
2. Navigate to your account settings
3. Generate or copy your API key
4. Keep this key secure - you'll need it for configuration

## Configure Your AI Assistant

### For Claude Desktop

1. Open Claude Desktop settings
2. Navigate to MCP Servers configuration
3. Add the following configuration:

```json
{
  "mcpServers": {
    "puo-memo": {
      "command": "npx",
      "args": ["puo-memo-mcp"],
      "env": {
        "PUO_MEMO_API_URL": "https://api.puo-memo.com",
        "PUO_MEMO_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

4. Replace `your-api-key-here` with your actual API key
5. Restart Claude Desktop

### For Other MCP-Compatible Tools

The configuration format may vary. Refer to your tool's documentation for MCP server setup.

## Environment Variables

You can also set environment variables instead of including them in the configuration:

```bash
export PUO_MEMO_API_URL="https://api.puo-memo.com"
export PUO_MEMO_API_KEY="your-api-key-here"
```

## Troubleshooting Installation

### Node.js Version Issues

If you encounter version compatibility issues:

```bash
# Check your Node.js version
node --version

# Install Node Version Manager (nvm) if needed
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Install and use Node.js 20
nvm install 20
nvm use 20
```

### Python Dependencies

If Python dependencies fail to install:

```bash
# Ensure pip is up to date
python -m pip install --upgrade pip

# Install required Python packages
pip install aiohttp asyncio
```

### Permission Errors

If you encounter permission errors during global installation:

```bash
# On macOS/Linux
sudo npm install -g puo-memo-mcp

# Or use a Node version manager to avoid permission issues
```

## Next Steps

- [Configure PUO Memo MCP](./configuration.md)
- [Learn the API](./api-reference.md)
- [View Examples](./examples.md)