# MCP Tools Sync Script

**Purpose**: Keep JavaScript (Local/NPM) and Python (Remote) MCP servers in sync automatically.

## The Problem We Solve

Purmemo has **3 MCP servers**:
1. **Local MCP** (JavaScript) - Runs on user's machine via Claude Desktop
2. **NPM MCP** (JavaScript) - Published package for public users
3. **Remote MCP** (Python) - Deployed on Render for OAuth integration

Before this script, changing a tool meant:
- ❌ Manually editing `server.js` (JavaScript)
- ❌ Manually copying changes to `main.py` (Python)
- ❌ High risk of drift (already happened - had 3 tools vs 5 tools!)

## The Solution

This script **auto-generates** Python code from JavaScript:
- ✅ Edit `server.js` once (JavaScript)
- ✅ Run script to sync `main.py` (Python)
- ✅ Zero manual copying
- ✅ Impossible to drift

### ⚠️ Important: Schema Sync Only

**What this script syncs:**
- ✅ Tool names
- ✅ Tool descriptions
- ✅ Input schemas (parameters, types, required fields)
- ✅ JSON schema definitions

**What this script does NOT sync:**
- ❌ Tool implementations (actual code)
- ❌ Business logic
- ❌ Database queries
- ❌ API integrations

**Why this matters:**
- Remote MCP (`main.py`) is a **thin proxy** - it forwards all requests to the backend API
- The actual tool implementation lives in `/v1-mvp/backend/app/routers/mcp_v10.py`
- Changing a tool description in `server.js` → syncs to `main.py` automatically ✅
- Adding a new tool feature → requires updating backend API manually ❌

**Example:**
```javascript
// In server.js - synced automatically
{
  name: 'discover_related_conversations',
  description: 'Find related conversations',  // ← This syncs
  inputSchema: { ... }  // ← This syncs
}
```

```python
# In v1-mvp/backend/app/routers/mcp_v10.py - manual update required
elif tool_name == "discover_related_conversations":
    # This implementation code is NOT auto-synced
    # You must manually implement the feature here
    query = args.get("query", "")
    # ... actual semantic clustering logic ...
```

## Usage

### Manual Sync (After Editing server.js)

```bash
# From project root:
node scripts/sync-mcp-tools.js
```

**Output:**
```
🔄 MCP Tools Sync Script
========================

📖 Reading JavaScript tools from: purmemo-mcp/src/server.js
✓ Found TOOLS array in server.js
✓ Parsed 5 tools from JavaScript

  1. save_conversation
  2. save_with_artifacts
  3. recall_memories
  4. get_memory_details
  5. discover_related_conversations

🐍 Converting to Python format...
✓ Python code generated
📝 Updating main.py...
✓ Updated main.py

✅ SYNC COMPLETE!
```

**Then commit and deploy:**
```bash
# Review changes
git diff

# Commit
git add .
git commit -m "Sync MCP tools from server.js"

# Deploy remote MCP
git push origin main
```

### Automatic Sync (Git Pre-Commit Hook)

**Setup once:**
```bash
npm run setup-sync-hook
```

**Then it runs automatically:**
```bash
# Edit server.js
vim purmemo-mcp/src/server.js

# Commit (script runs automatically before commit)
git add .
git commit -m "Add new MCP tool"

# Output shows:
# [pre-commit hook] Running MCP tools sync...
# ✓ Tools synced automatically
# [main abc1234] Add new MCP tool
```

## How It Works

1. **Parse JavaScript** - Reads `server.js`, extracts TOOLS array
2. **Convert to Python** - Transforms JavaScript objects → Python dicts
3. **Update main.py** - Replaces TOOLS section with generated code
4. **Validation** - Verifies Python syntax is valid

### Example Conversion

**JavaScript (server.js):**
```javascript
{
  name: 'save_conversation',
  description: `Multi-line
    description here`,
  inputSchema: {
    type: 'object',
    properties: {
      conversationContent: {
        type: 'string',
        minLength: 100
      }
    },
    required: ['conversationContent']
  }
}
```

**Python (main.py - auto-generated):**
```python
{
    "name": "save_conversation",
    "description": """Multi-line
    description here""",
    "inputSchema": {
        "type": "object",
        "properties": {
            "conversationContent": {
                "type": "string",
                "minLength": 100
            }
        },
        "required": ["conversationContent"]
    }
}
```

## Workflow

### When Adding a New Tool

1. **Edit** `purmemo-mcp/src/server.js` - Add your new tool
2. **Sync** `node scripts/sync-mcp-tools.js` - Auto-update main.py
3. **Test** Local MCP still works
4. **Publish NPM** `cd purmemo-mcp && npm publish`
5. **Deploy Remote** `git push origin main`

### When Updating a Tool Description

1. **Edit** description in `server.js`
2. **Sync** `node scripts/sync-mcp-tools.js`
3. **Commit** and push (triggers Remote MCP deployment)

## File Locations

- **Script**: `/scripts/sync-mcp-tools.js`
- **Source**: `/purmemo-mcp/src/server.js` (JavaScript)
- **Target**: `/purmemo-core/platform/external/integrations/universal/remote-mcp/main.py` (Python)

## Troubleshooting

### "Could not find TOOLS array in server.js"
- Check that `server.js` has `const TOOLS = [...]` format
- Don't rename or move the TOOLS constant

### "Could not find TOOLS array in main.py"
- Check that `main.py` has the comment: `# Tool definitions...`
- Pattern: `# Tool definitions...\nTOOLS = [...]`

### "Error parsing tools"
- JavaScript syntax error in server.js
- Run: `node -c purmemo-mcp/src/server.js` to check syntax

### Generated Python has syntax errors
- Run: `python3 -m py_compile main.py` to verify
- Report issue (script should handle all cases)

## Benefits

### Before (Manual Sync)
- ⏱️ Time: 10-15 minutes per tool change
- 🐛 Errors: High (manual copy-paste)
- 🔄 Consistency: Hard to maintain
- 📊 Scalability: 43% (from analysis)

### After (Auto-Generate)
- ⏱️ Time: 30 seconds per tool change
- 🐛 Errors: Near zero (automated)
- 🔄 Consistency: Guaranteed
- 📊 Scalability: 73% (from analysis)

## Future: All JavaScript Migration

This script is the **short-term solution** (73% scalability).

**Long-term best option** (78% scalability):
- Migrate Remote MCP to JavaScript
- Use `server.js` directly on Render
- Zero sync needed - single source of truth

Timeline: Q1 2026 when bandwidth allows.

## Questions?

- **Script issues**: Check this README
- **Architecture questions**: See `/docs/SCALABILITY_ANALYSIS.md`
- **MCP questions**: See `/platform/core-services/documentation/guides/`
