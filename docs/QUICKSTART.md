# 🚀 Quick Start Guide - Purmemo MCP

## ⚠️ Current Status
OAuth authentication is temporarily unavailable. Use API key method below.

## 🔑 Method 1: Environment Variable (Fastest)

1. **Get your API key** from https://app.purmemo.ai/settings
2. **Set environment variable**:
   ```bash
   export PUO_MEMO_API_KEY="your-api-key-here"
   ```
3. **Update your Claude Desktop config**:
   ```json
   {
     "mcpServers": {
       "purmemo": {
         "command": "npx",
         "args": ["-y", "purmemo-mcp@^2.1.4"],
         "env": {
           "PUO_MEMO_API_KEY": "your-api-key-here",
           "PURMEMO_API_URL": "https://api.purmemo.ai"
         }
       }
     }
   }
   ```
4. **Restart Claude Desktop**

## 🛠️ Method 2: Setup Command

1. **Run setup**:
   ```bash
   npx purmemo-mcp@latest setup
   ```
2. **Follow the prompts** to enter your API key
3. **Restart Claude Desktop**

## ✅ Verify Setup

In Claude Desktop, try:
- "Save this to memory: Today I learned about MCP tools"
- "Recall memories about MCP"

## 🚨 Troubleshooting

If tools still require authentication:
1. Check your API key is valid at https://app.purmemo.ai/settings
2. Restart Claude Desktop completely (Cmd+Q then reopen)
3. Run diagnostic: `npx purmemo-mcp diagnose`

## 📞 Support

- Issues: https://github.com/coladapo/purmemo-mcp/issues
- Email: support@purmemo.ai