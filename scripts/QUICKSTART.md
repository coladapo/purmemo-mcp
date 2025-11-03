# MCP Tools Sync - Quick Start

**For non-engineers**: This script keeps your 3 MCP servers in sync automatically.

## What You Need to Know

You have **3 MCP servers** that need to match:
1. **Local** - Your Claude Desktop (JavaScript)
2. **NPM** - Public package users install (JavaScript)
3. **Remote** - Cloud server at mcp.purmemo.ai (Python)

Before this script: Had to manually update 2 files every time ❌
After this script: Edit 1 file, script updates the other ✅

## How to Use

### Every Time You Change MCP Tools

```bash
# 1. Edit the JavaScript file
#    Location: purmemo-mcp/src/server.js
#    (This is your main source of truth)

# 2. Run the sync script
node scripts/sync-mcp-tools.js

# 3. Commit and deploy
git add .
git commit -m "Updated MCP tools"
git push origin main
```

That's it! The script handles the hard part (converting JavaScript → Python).

### One-Time Setup (Optional Automation)

Run this once to make syncing automatic:

```bash
bash scripts/setup-sync-hook.sh
```

After this, the sync happens **automatically** whenever you commit changes to `server.js`. You don't have to remember to run the script!

## What the Script Does

1. ✅ Reads your JavaScript tool definitions
2. ✅ Converts them to Python format
3. ✅ Updates the remote MCP server file
4. ✅ Verifies the Python is valid

## Files You Care About

**Edit this (Source of Truth):**
- `purmemo-mcp/src/server.js` - All your MCP tools live here

**Script auto-updates this:**
- `purmemo-core/.../remote-mcp/main.py` - Remote server (don't edit manually!)

**Helper scripts:**
- `scripts/sync-mcp-tools.js` - The sync script
- `scripts/setup-sync-hook.sh` - Optional automation setup

## Troubleshooting

**"I edited main.py directly - will my changes be lost?"**
- YES! main.py is auto-generated
- Always edit server.js instead
- The script will overwrite manual changes to main.py

**"The script failed - what do I do?"**
- Check that server.js has no syntax errors
- Read the error message (usually tells you what's wrong)
- See full README.md for detailed troubleshooting

**"Can I skip the sync?"**
- Not recommended! Your servers will drift out of sync
- If you must: `git commit --no-verify` (skips the hook)

## Benefits

**Time saved**: 10-15 minutes → 30 seconds per tool change
**Error rate**: Manual copy-paste bugs → Near zero
**Maintenance**: Hard to keep in sync → Automatically synced

## Questions?

See full documentation: `scripts/README.md`
