# Archived Experimental Server Files

These files were experimental iterations during development of the Purmemo MCP client.

## Why Archived
- Multiple experimental approaches were tried during rapid prototyping
- No clear naming convention led to confusion about which was production
- Package.json was pointing to outdated server-oauth.js while working code was in server-final.js

## Production Status
- **Current Production**: `server-final.js` (v3.2.0) - has all 5 tools
- **Remote MCP**: Python FastAPI at mcp.purmemo.ai (not these JS files)
- **NPM Package**: Points to server-final.js

## Files Archived
- server-oauth.js - OAuth attempt (v2.1.0) - was incorrectly referenced
- server-oauth-original.js - Backup of OAuth attempt
- server-minimal.js - Minimal approach experiment
- server-working.js - "Working" version (v3.0.0)
- server-production.js - "Production" version (v2.1.7) but outdated
- server-ai-enhanced.js - AI feature experiment
- server-graph-enhanced.js - Graph approach experiment
- server-complete.js - "Complete" version (v4.0.0) but not used
- server.js - Original basic version

## Lesson Learned
Use git branches for experiments, not multiple files in main branch.

Archived: 2025-09-05
