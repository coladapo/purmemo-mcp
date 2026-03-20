#!/bin/bash
# UI Integrity Audit Script
# Verifies that production UI matches experiment (the source of truth)

EXPERIMENT_DIR="/Users/wivak/puo-jects/____active/purmemo/chrome-extension-experiment"
PRODUCTION_DIR="/Users/wivak/puo-jects/____active/purmemo/chrome-extension-production"

echo "🔍 Auditing UI Components..."
echo "Experiment (source of truth): $EXPERIMENT_DIR"
echo "Production: $PRODUCTION_DIR"
echo ""

MISMATCHES=0

# Function to check file differences
check_file() {
  local file=$1
  local label=$2

  echo -n "$label: "

  if [ ! -f "$EXPERIMENT_DIR/$file" ]; then
    echo "⚠️  Missing in experiment"
    return
  fi

  if [ ! -f "$PRODUCTION_DIR/$file" ]; then
    echo "❌ Missing in production"
    MISMATCHES=$((MISMATCHES + 1))
    return
  fi

  diff -q "$EXPERIMENT_DIR/$file" "$PRODUCTION_DIR/$file" > /dev/null
  if [ $? -eq 0 ]; then
    echo "✅ Match"
  else
    echo "❌ MISMATCH"
    MISMATCHES=$((MISMATCHES + 1))
    echo "   Run: cp $EXPERIMENT_DIR/$file $PRODUCTION_DIR/$file"
  fi
}

# Check shared UI components
echo "📦 Shared UI Components (must match experiment):"
check_file "src/content/statusIndicator.js" "  statusIndicator.js"
check_file "src/content/saveNotification.js" "  saveNotification.js"
check_file "src/content/wisdomRecommendations.js" "  wisdomRecommendations.js"
check_file "src/content/inject-bridge.js" "  inject-bridge.js"

echo ""
echo "🎨 CSS Files (must match experiment):"
check_file "src/content/styles/statusIndicator.css" "  statusIndicator.css"
check_file "src/content/styles/saveNotification.css" "  saveNotification.css"

echo ""
echo "🔧 Shared Logic (should match experiment):"
check_file "src/content/inject-override.js" "  inject-override.js"
check_file "src/content/platform-adapters.js" "  platform-adapters.js"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $MISMATCHES -eq 0 ]; then
  echo "✅ All UI components match experiment!"
  echo "   Safe to add new platforms."
else
  echo "❌ Found $MISMATCHES mismatch(es)"
  echo "   ⚠️  WARNING: Production UI does not match experiment!"
  echo "   Run the suggested cp commands above to fix."
  exit 1
fi

echo ""
echo "🔍 Additional Checks:"

# Check for ES6 imports (should not exist in production content scripts)
echo -n "  ES6 imports in statusIndicator.js: "
if grep -q "^import " "$PRODUCTION_DIR/src/content/statusIndicator.js" 2>/dev/null; then
  echo "❌ Found (will break extension)"
  MISMATCHES=$((MISMATCHES + 1))
else
  echo "✅ None (correct)"
fi

echo -n "  ES6 imports in saveNotification.js: "
if grep -q "^import " "$PRODUCTION_DIR/src/content/saveNotification.js" 2>/dev/null; then
  echo "❌ Found (will break extension)"
  MISMATCHES=$((MISMATCHES + 1))
else
  echo "✅ None (correct)"
fi

# Check for menu code (should not exist in production)
echo -n "  Menu code in statusIndicator.js: "
if grep -q "showQuickMenu" "$PRODUCTION_DIR/src/content/statusIndicator.js" 2>/dev/null; then
  echo "❌ Found (not wanted in production)"
  MISMATCHES=$((MISMATCHES + 1))
else
  echo "✅ None (correct)"
fi

echo ""
if [ $MISMATCHES -eq 0 ]; then
  echo "✅✅✅ AUDIT PASSED - UI is production-ready!"
  exit 0
else
  echo "❌❌❌ AUDIT FAILED - Fix issues before proceeding"
  exit 1
fi
