# Claude Desktop Integration (MCP)

**Last Updated**: 2025-09-05  
**Version**: v3.2.1

## Overview

Purmemo provides official Model Context Protocol (MCP) support for Claude Desktop, enabling Claude to directly store and retrieve memories during your conversations.

## Two Connection Methods

### Option 1: Local MCP Server (Recommended for Privacy)
Install the MCP server locally on your machine. All data stays encrypted between your machine and Purmemo's API.

### Option 2: Remote MCP Server (Zero Install)
Connect directly to `mcp.purmemo.ai` without installing anything. Perfect for trying Purmemo quickly.

## Local MCP Setup

### Step 1: Get Your API Key
1. Sign up at [purmemo.ai/register](https://www.purmemo.ai/register) (if you don't have an account)
2. Sign in to your account
3. Go to [purmemo.ai/settings](https://www.purmemo.ai/settings)
4. Click the "API Keys" tab
5. Click "Create New Key"
6. Name your key (e.g., "Claude Desktop")
7. Click "Create Key"
8. Copy the key immediately (it won't be shown again)

### Step 2: Configure Claude Desktop

Add to your Claude Desktop configuration file:

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
        "PURMEMO_API_KEY": "pk_your_api_key_here"
      }
    }
  }
}
```

### Step 3: Restart Claude Desktop
Completely quit and restart Claude Desktop for the changes to take effect.

### Step 4: Verify Connection
In Claude, type:
```
Can you test the Purmemo connection by creating a test memory?
```

Claude should respond that it successfully created a memory using the `memory` tool.

## Remote MCP Setup (Beta)

### Step 1: Get Your API Key
Same as above - get your API key from [app.purmemo.ai](https://app.purmemo.ai/settings/api-keys)

### Step 2: Add Custom Connector
1. In Claude Desktop, click the settings icon
2. Select "Add custom connector (BETA)"
3. Enter URL: `https://mcp.purmemo.ai`
4. Add authentication header:
   - Key: `Authorization`
   - Value: `Bearer pk_your_api_key_here`

### Step 3: Test Connection
Same as above - ask Claude to create a test memory.

## Available Tools

Once connected, Claude can use these 5 tools:

### `memory` - Store Information
```
"Remember that the team standup is at 10am daily"
"Save this code snippet: [paste code]"
"Store this meeting notes: [paste notes]"
```

### `recall` - Search Memories
```
"What time is the team standup?"
"Find my notes about React hooks"
"What did I save about Python decorators?"
```

### `entities` - Extract Knowledge
```
"What people have I mentioned in memories?"
"Show me all the technologies I've saved"
"List all companies from my memories"
```

### `attach` - Add Files
```
"Attach this screenshot to my last memory"
"Add this PDF to the meeting notes memory"
```

### `correction` - Update Memories
```
"Correct the standup time to 10:30am"
"Update the React notes with new information"
```

## Troubleshooting

### "No MCP tools available"
- Restart Claude Desktop completely (quit and reopen)
- Check your API key is valid
- Ensure the configuration JSON is valid (no trailing commas)

### "Authentication failed"
- Verify your API key starts with `pk_`
- Check the key hasn't expired
- Create a new key if needed

### "Cannot connect to server"
- For local: Run `npx purmemo-mcp` in terminal to test
- For remote: Check https://mcp.purmemo.ai/health
- Check [status.purmemo.ai](https://status.purmemo.ai) for outages

### "Tool failed" errors
- Check your Purmemo subscription limits
- Verify the memory ID exists (for attach/correction)
- Try simpler queries first

## Security Notes

- **API keys provide full access** to your Purmemo account
- **Store keys securely** using environment variables or secure key managers
- **Never commit keys** to Git repositories or share publicly  
- **Regenerate immediately** if a key is compromised
- **Use HTTPS only** when making API requests (enforced by default)
- **Local MCP** keeps data on your machine until sent to API
- **Remote MCP** uses SSL/TLS encryption for all connections
- **Rotate keys regularly** from the dashboard for best security

## Version History

- **v3.2.1** (2025-09-05): Cleaned up package, standardized server.js
- **v3.2.0** (2025-09-05): Added attach and correction tools, API key auth
- **v2.1.5**: OAuth authentication (deprecated)
- **v1.0.6**: Initial MCP release with 3 tools

## Getting Help

- **Documentation**: [docs.purmemo.ai](https://docs.purmemo.ai)
- **GitHub Issues**: [github.com/coladapo/purmemo-mcp/issues](https://github.com/coladapo/purmemo-mcp/issues)
- **Email Support**: support@purmemo.ai
- **Website**: [purmemo.ai](https://purmemo.ai)

## SDK vs MCP

Note: This MCP integration is different from the Purmemo SDK:
- **MCP**: For Claude Desktop integration (this guide)
- **SDK**: For building your own applications (`purmemo-sdk` npm / `purmemo` pip)

Both connect to the same API backend at `api.purmemo.ai`.