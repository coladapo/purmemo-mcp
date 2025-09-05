# OAuth Implementation Guide

## Quick Start

The unified OAuth implementation is now ready. Here's how to deploy and test it:

### 1. Deploy OAuth Server

```bash
# On your production server
./deploy-oauth-server.sh

# Set up database
psql $DATABASE_URL < setup-oauth-tables.sql

# Start server
pm2 start ecosystem.config.js
```

### 2. Fix Frontend Callback

```bash
# Apply frontend fix
./fix-frontend-callback.sh

# Deploy frontend
cd ../puo-memo-platform-private/frontend
npm run build
vercel --prod
```

### 3. Test OAuth Flows

```bash
# Run test suite
./test-unified-oauth.sh

# Test specific client
npx purmemo-mcp auth --client claude-mcp
```

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│            OAuth 2.1 Server                  │
│         (oauth.purmemo.ai)                   │
├─────────────────────────────────────────────┤
│                                              │
│  Clients:                                    │
│  • claude-mcp     (Claude Desktop)          │
│  • chatgpt-purmemo (ChatGPT Plugin)         │
│  • npm-cli        (NPM Package)             │
│  • web-app        (Web Frontend)            │
│  • mobile-app     (Mobile Apps)             │
│                                              │
│  Features:                                   │
│  • Mandatory PKCE (OAuth 2.1)               │
│  • Refresh token rotation                   │
│  • Exact URI matching                       │
│  • Rate limiting                            │
│  • CORS protection                          │
└─────────────────────────────────────────────┘
```

## OAuth Flows

### Claude MCP Flow

1. User runs: `npx purmemo-mcp`
2. MCP shows OAuth URL (manual-first approach)
3. User opens URL in browser
4. Frontend stores session and redirects to auth
5. After login, frontend detects MCP flow
6. Frontend redirects back to `localhost:3456/callback`
7. MCP receives code and exchanges for token
8. Token stored in `~/.purmemo/auth.json`

### ChatGPT Flow

1. User installs ChatGPT plugin
2. ChatGPT initiates OAuth with `chatgpt-purmemo` client
3. User logs in at `app.purmemo.ai`
4. Redirect to `chat.openai.com/aip/plugin-purmemo/oauth/callback`
5. ChatGPT exchanges code for token
6. Plugin authenticated

### NPM Package Flow

```javascript
const purmemo = require('purmemo-mcp');

// Automatic authentication
await purmemo.authenticate();
// Checks: existing token → refresh → env var → OAuth flow

// Manual authentication
await purmemo.login();
```

## Key Files

### OAuth Server
- `src/auth/unified-oauth-server.js` - Main OAuth 2.1 server
- `deploy-oauth-server.sh` - Deployment script
- `setup-oauth-tables.sql` - Database schema

### Frontend Fixes
- `src/services/oauth-callback-handler.js` - Fixed callback handler
- `src/services/oauth-initiator.js` - OAuth flow initiator
- `src/oauth-callback-route.jsx` - Callback route component

### Testing
- `test-unified-oauth.sh` - Comprehensive test suite
- `test-purmemo-now.sh` - Quick end-to-end test

## Configuration

### Environment Variables

```bash
# OAuth Server (.env)
JWT_SECRET=your-jwt-secret-here
DATABASE_URL=postgresql://...
SUPABASE_URL=https://...
SUPABASE_ANON_KEY=...
CHATGPT_CLIENT_SECRET=...

# MCP Package
PUO_MEMO_API_KEY=...  # For API key auth
PURMEMO_CLIENT_ID=claude-mcp  # For OAuth
```

### Client Configuration

| Client | Client ID | Type | Redirect URI |
|--------|-----------|------|--------------|
| Claude MCP | claude-mcp | public | http://localhost:3456/callback |
| ChatGPT | chatgpt-purmemo | confidential | https://chat.openai.com/aip/plugin-purmemo/oauth/callback |
| NPM CLI | npm-cli | public | http://localhost:8080/callback |
| Web App | web-app | public | https://app.purmemo.ai/oauth/callback |

## Security Features

1. **PKCE Mandatory** - All clients must use PKCE (OAuth 2.1)
2. **Exact URI Matching** - No wildcards in redirect URIs
3. **Token Rotation** - Refresh tokens rotate on each use
4. **Rate Limiting** - 10 requests per 15 minutes per IP
5. **CORS Protection** - Strict origin checking
6. **HTTPS Only** - No HTTP in production

## Troubleshooting

### Browser not opening
- macOS security blocks npm from opening browsers
- Solution: Manual-first approach, show URL immediately

### OAuth black screen
- Wrong endpoint or client_id
- Check: `/api/oauth/authorize` endpoint exists
- Verify: client_id is registered

### Redirect not completing
- Frontend callback handler not detecting MCP flow
- Apply: `fix-frontend-callback.sh`
- Check: localStorage has `oauth_session`

### Token validation failing
- API key vs access token confusion
- Use: `test-purmemo-now.sh` for quick setup
- Check: Bearer token format

## Migration from Old System

1. **Deploy new OAuth server** alongside existing
2. **Update frontend** with callback fixes
3. **Test with each client** type
4. **Migrate users** gradually
5. **Deprecate old endpoints** after 30 days
6. **Remove legacy code**

## Next Steps

1. ✅ OAuth 2.1 server implemented
2. ✅ PKCE support for all clients
3. ✅ Frontend callback fix created
4. ⏳ Deploy to production
5. ⏳ Test end-to-end flows
6. ⏳ Add social providers (Google/GitHub)
7. ⏳ Implement token rotation
8. ⏳ Add audit logging

## Support

For issues or questions:
- Check logs: `pm2 logs purmemo-oauth`
- Test suite: `./test-unified-oauth.sh`
- Quick test: `npx purmemo-mcp test-auth`