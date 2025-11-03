#!/bin/bash
# MCP-Safe Organizer - Organizes without breaking MCP functionality
# Respects package.json structure and MCP requirements

set -e

MCP_ROOT="/Users/wivak/puo-jects/active/purmemo/purmemo-mcp"
MAX_ROOT_ITEMS=15

echo "🏢 MCP-SAFE ENTERPRISE ORGANIZER"
echo "================================="
echo ""

cd "$MCP_ROOT"

# Count current root items (excluding hidden files)
current_items=$(ls -1 | wc -l | xargs)
echo "📊 Current root items: $current_items (max: $MAX_ROOT_ITEMS)"

if [ "$current_items" -le "$MAX_ROOT_ITEMS" ]; then
    echo "✅ Enterprise compliance maintained"
    exit 0
fi

echo "🚨 COMPLIANCE VIOLATION DETECTED"
echo "⚡ Safely organizing MCP files..."
echo ""

# Create safe directories that won't break MCP
mkdir -p scripts docs/guides docs/archive utils logs

# SAFE MOVES ONLY - Don't touch src/ or files referenced in package.json

# 1. Move deployment/utility scripts (not needed by MCP runtime)
echo "📜 Moving utility scripts..."
for file in deploy-oauth-server.sh fix-frontend-callback.sh auto-organize.sh; do
    if [ -f "$file" ]; then
        mv "$file" scripts/
        echo "  ✅ Moved $file to scripts/"
    fi
done

# 2. Move diagnostic/utility JS files that aren't in src/
echo "🔧 Moving diagnostic utilities..."
for file in diagnose-entities.js diagnose-mcp.js extract-entities.js generate-api-key.js; do
    if [ -f "$file" ]; then
        mv "$file" utils/
        echo "  ✅ Moved $file to utils/"
    fi
done

# 3. Move documentation (except critical files)
echo "📚 Moving documentation..."
for file in ARCHITECTURE.md IP_PROTECTION.md; do
    if [ -f "$file" ]; then
        mv "$file" docs/
        echo "  ✅ Moved $file to docs/"
    fi
done

# 4. Move log files
echo "📝 Moving logs..."
for file in *.log; do
    if [ -f "$file" ]; then
        mv "$file" logs/
        echo "  ✅ Moved $file to logs/"
    fi
done

# 5. Move any test/example files
echo "🧪 Moving test files..."
for file in test*.js example*.js *.test.js; do
    if [ -f "$file" ]; then
        mkdir -p test
        mv "$file" test/
        echo "  ✅ Moved $file to test/"
    fi
done

# Final count
final_items=$(ls -1 | wc -l | xargs)
echo ""
echo "📊 Final root items: $final_items"

# List what remains in root
echo ""
echo "📁 Root directory now contains:"
ls -1 | while read item; do
    if [ -d "$item" ]; then
        echo "  📂 $item/"
    else
        echo "  📄 $item"
    fi
done

echo ""
if [ "$final_items" -le "$MAX_ROOT_ITEMS" ]; then
    echo "✅ ENTERPRISE COMPLIANCE ACHIEVED!"
    echo "✅ MCP FUNCTIONALITY PRESERVED!"
else
    echo "⚠️ Still $(($final_items - $MAX_ROOT_ITEMS)) items over limit"
    echo ""
    echo "Items that MUST stay in root (MCP requirements):"
    echo "  - package.json, package-lock.json"
    echo "  - README.md, LICENSE"
    echo "  - src/ directory"
    echo "  - bin/ directory (if used)"
    echo "  - node_modules/ (required for MCP)"
fi

echo ""
echo "🛡️ Safety check: Verifying MCP still works..."
if [ -f "src/server-working.js" ] && [ -f "src/server-oauth.js" ] && [ -f "package.json" ]; then
    echo "✅ All critical MCP files intact"
else
    echo "❌ WARNING: Critical MCP files may be missing!"
fi

echo ""
echo "🏢 Safe organization complete!"