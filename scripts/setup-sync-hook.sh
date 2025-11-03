#!/bin/bash

# Setup Git Pre-Commit Hook for MCP Tools Sync
# This makes the sync happen automatically whenever server.js changes

echo "🔧 Setting up MCP Tools Sync Git Hook"
echo "======================================"
echo ""

# Check if we're in a git repo
if [ ! -d ".git" ]; then
  echo "❌ Error: Not in a git repository"
  echo "   Run this from the project root"
  exit 1
fi

# Create .git/hooks directory if it doesn't exist
mkdir -p .git/hooks

# Create the pre-commit hook
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash

# Pre-commit hook: Auto-sync MCP tools when server.js changes

# Check if server.js is being committed
if git diff --cached --name-only | grep -q "purmemo-mcp/src/server.js"; then
  echo ""
  echo "🔄 MCP Tools Sync (pre-commit hook)"
  echo "===================================="
  echo "   Detected changes to server.js"
  echo "   Auto-syncing to main.py..."
  echo ""

  # Run the sync script
  node scripts/sync-mcp-tools.js

  # Check if sync was successful
  if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Sync successful! Adding main.py to commit..."

    # Add the updated main.py to the commit
    git add purmemo-core/platform/external/integrations/universal/remote-mcp/main.py

    echo "✓ main.py added to commit"
    echo ""
  else
    echo ""
    echo "❌ Sync failed! Please fix errors before committing."
    echo "   Run manually: node scripts/sync-mcp-tools.js"
    echo ""
    exit 1
  fi
fi

# Continue with the commit
exit 0
EOF

# Make the hook executable
chmod +x .git/hooks/pre-commit

echo "✅ Git hook installed!"
echo ""
echo "📋 What this does:"
echo "   - Watches for changes to purmemo-mcp/src/server.js"
echo "   - Automatically runs: node scripts/sync-mcp-tools.js"
echo "   - Adds updated main.py to your commit"
echo ""
echo "🧪 Test it:"
echo "   1. Edit purmemo-mcp/src/server.js"
echo "   2. git add ."
echo "   3. git commit -m 'Test hook'"
echo "   4. You should see sync messages before commit completes"
echo ""
echo "🔓 To skip the hook (not recommended):"
echo "   git commit --no-verify"
echo ""
echo "✨ All set! Your MCP tools will now auto-sync on every commit."
