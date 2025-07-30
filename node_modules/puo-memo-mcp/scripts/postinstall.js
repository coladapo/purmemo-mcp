#!/usr/bin/env node

console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎉 PUO Memo MCP Server installed successfully!

📋 Quick Setup:

1. Get your API key from https://puo-memo.com
   
2. Configure Claude Desktop:
   Add to ~/Library/Application Support/Claude/claude_desktop_config.json:
   
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

3. Restart Claude Desktop

📚 Documentation: https://github.com/coladapo/puo-memo-mcp
🐛 Issues: https://github.com/coladapo/puo-memo-mcp/issues

Note: Python dependencies will be checked when you run the server.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);