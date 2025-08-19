# 🧠 pūrmemo MCP v2.0 - OAuth Edition

> **Zero-configuration memory management for Claude Desktop**

## ✨ What's New in v2.0

- **🔐 Seamless OAuth Authentication** - No more API keys!
- **🚀 One-time Setup** - Authenticate once, use forever
- **📊 Tier Awareness** - Respects free (100) vs pro (unlimited) limits
- **🔄 Auto Token Refresh** - Never worry about expired tokens
- **⚡ Instant Setup** - Under 30 seconds from install to first use
- **🔒 Secure Storage** - Tokens encrypted and stored safely
- **♻️ Backwards Compatible** - Still supports API keys

## 🏃 Quick Start (New Users)

### 1. Install the MCP

```bash
npm install -g purmemo-mcp
```

### 2. Connect Your Account

```bash
npx purmemo-mcp setup
```

This will:
1. Open your browser for sign-in
2. Let you choose: Google, GitHub, or Email
3. Securely store your credentials
4. Confirm all tools are ready

### 3. Configure Claude Desktop

Edit your Claude Desktop config:

**Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "purmemo": {
      "command": "npx",
      "args": ["purmemo-mcp"]
    }
  }
}
```

### 4. Start Using Tools!

That's it! All tools now work automatically:
- 💾 **memory** - Save anything
- 🔍 **recall** - Search memories  
- 🏷️ **entities** - Extract people, places, concepts
- 📎 **attach** - Add files to memories
- ✏️ **correction** - Fix mistakes

## 🔄 Existing Users (Upgrading from v1.x)

### Option 1: Keep Using API Key (Works Fine)

Your existing setup with `PUO_MEMO_API_KEY` still works! No changes needed.

### Option 2: Switch to OAuth (Recommended)

1. Remove `PUO_MEMO_API_KEY` from your environment
2. Run `npx purmemo-mcp setup`
3. Sign in with your account
4. Enjoy the seamless experience!

## 📱 OAuth Flow Details

### How It Works

1. **First Tool Use**: If not authenticated, prompts for sign-in
2. **Browser Opens**: Secure OAuth flow with Google/GitHub
3. **Token Storage**: Encrypted and stored in `~/.purmemo/auth.json`
4. **Auto Refresh**: Tokens refresh automatically when needed
5. **All Tools Work**: Every tool uses the authenticated session

### Security Features

- **PKCE Protection**: OAuth 2.1 with Proof Key for Code Exchange
- **Encrypted Storage**: Tokens encrypted with machine-specific key
- **Secure Permissions**: Config files use restrictive permissions
- **No Plain Text**: Never stores credentials in plain text
- **Auto Logout**: `npx purmemo-mcp logout` to sign out

## 🛠️ Management Commands

### Check Connection Status
```bash
npx purmemo-mcp status
```
Shows:
- Authentication status
- Account tier (free/pro)
- Memory count and limits
- Token expiry info

### Sign Out
```bash
npx purmemo-mcp logout
```

### Reconnect Account
```bash
npx purmemo-mcp setup
```

### Upgrade to Pro
```bash
npx purmemo-mcp upgrade
```

## 🎯 Free vs Pro Tiers

### Free Tier (Default)
- ✅ 100 memories limit
- ✅ All 5 tools available
- ✅ Basic AI models
- ⚠️ Helpful warnings as you approach limit

### Pro Tier
- ✅ Unlimited memories
- ✅ Advanced AI models
- ✅ Priority support
- ✅ API access
- ✅ No limits or warnings

The MCP automatically enforces tier limits and provides helpful messages when approaching limits.

## 🔧 Troubleshooting

### "Authentication required" Error

Run setup:
```bash
npx purmemo-mcp setup
```

### Browser Doesn't Open

1. Look for the URL in terminal output
2. Copy and paste into browser manually
3. Complete sign-in process

### Token Expired

Don't worry! The MCP automatically refreshes tokens. If it fails:
```bash
npx purmemo-mcp setup
```

### Connection Issues

Check status:
```bash
npx purmemo-mcp status
```

### Port 3456 In Use

The OAuth callback uses port 3456. If it's in use:
1. Close the application using that port
2. Try setup again

## 🔒 Privacy & Security

- **Local Storage Only**: Tokens never leave your machine
- **Encrypted at Rest**: Using AES-256 encryption
- **Machine-Specific**: Tokens tied to your device
- **No Tracking**: We don't track tool usage
- **Open Source**: Audit the code yourself

## 📝 Example Usage After OAuth

Once authenticated, using tools is seamless:

```
User: Remember that the team meeting is moved to 3pm tomorrow