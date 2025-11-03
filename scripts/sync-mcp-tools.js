#!/usr/bin/env node

/**
 * MCP Tools Sync Script
 *
 * Reads tool definitions from JavaScript server.js and generates
 * equivalent Python code for main.py
 *
 * Usage:
 *   node scripts/sync-mcp-tools.js
 *
 * This ensures Local/NPM MCP (JS) and Remote MCP (Python) stay in sync.
 */

const fs = require('fs');
const path = require('path');

// Paths
const SERVER_JS_PATH = path.join(__dirname, '../purmemo-mcp/src/server.js');
const MAIN_PY_PATH = path.join(__dirname, '../purmemo-core/platform/external/integrations/universal/remote-mcp/main.py');

console.log('🔄 MCP Tools Sync Script');
console.log('========================\n');

// Step 1: Read server.js
console.log('📖 Reading JavaScript tools from:', SERVER_JS_PATH);
const serverJsContent = fs.readFileSync(SERVER_JS_PATH, 'utf8');

// Step 2: Extract TOOLS array from server.js
// Find the TOOLS constant definition
const toolsMatch = serverJsContent.match(/const TOOLS = \[([\s\S]*?)\n\];/);
if (!toolsMatch) {
  console.error('❌ Could not find TOOLS array in server.js');
  process.exit(1);
}

console.log('✓ Found TOOLS array in server.js\n');

// Step 3: Parse tools using eval (safe because we control the source)
// Extract just the array content and wrap it for eval
const toolsArrayContent = toolsMatch[1];
let tools;
try {
  // Use Function constructor to safely evaluate the tools array
  tools = eval(`[${toolsArrayContent}]`);
  console.log(`✓ Parsed ${tools.length} tools from JavaScript\n`);
  tools.forEach((tool, i) => {
    console.log(`  ${i + 1}. ${tool.name}`);
  });
  console.log();
} catch (error) {
  console.error('❌ Error parsing tools:', error.message);
  process.exit(1);
}

// Step 4: Convert JavaScript tools to Python format
console.log('🐍 Converting to Python format...\n');

function jsToPython(obj, indent = 0) {
  const spaces = '    '.repeat(indent);

  if (obj === null || obj === undefined) {
    return 'None';
  }

  if (typeof obj === 'boolean') {
    return obj ? 'True' : 'False';
  }

  if (typeof obj === 'number') {
    return String(obj);
  }

  if (typeof obj === 'string') {
    // Handle multi-line strings - use Python triple quotes
    if (obj.includes('\n')) {
      // Escape any triple quotes in the string
      const escaped = obj.replace(/"""/g, '\\"\\"\\"');
      return `"""${escaped}"""`;
    }
    // Single line - escape quotes and use double quotes
    const escaped = obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
    return `"${escaped}"`;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';

    const items = obj.map(item => jsToPython(item, indent + 1));

    // If all items are simple (not objects/arrays), put on one line
    const allSimple = obj.every(item =>
      typeof item !== 'object' || item === null
    );

    if (allSimple && items.join(', ').length < 60) {
      return `[${items.join(', ')}]`;
    }

    // Multi-line array
    const itemsIndented = items.map(item => `${spaces}    ${item}`).join(',\n');
    return `[\n${itemsIndented}\n${spaces}]`;
  }

  if (typeof obj === 'object') {
    const entries = Object.entries(obj);
    if (entries.length === 0) return '{}';

    const pairs = entries.map(([key, value]) => {
      const pythonValue = jsToPython(value, indent + 1);
      return `${spaces}    "${key}": ${pythonValue}`;
    });

    return `{\n${pairs.join(',\n')}\n${spaces}}`;
  }

  return String(obj);
}

// Generate Python TOOLS array
const pythonTools = tools.map((tool, index) => {
  const toolDict = jsToPython(tool, 1);
  return `    ${toolDict}`;
}).join(',\n');

const pythonToolsArray = `# Tool definitions - v20.1.0 synced with ultimate server (no emojis, all 5 tools)
# Auto-generated from server.js - DO NOT EDIT MANUALLY
# Run: node scripts/sync-mcp-tools.js to update
TOOLS = [
${pythonTools}
]`;

console.log('✓ Python code generated\n');

// Step 5: Read main.py and replace TOOLS section
console.log('📝 Updating main.py...');

let mainPyContent = fs.readFileSync(MAIN_PY_PATH, 'utf8');

// Find and replace the TOOLS array
// Pattern: Match comment lines + TOOLS = [...] including everything inside
const toolsRegex = /((?:^#.*\n)+)TOOLS = \[[\s\S]*?\n\]/m;
const match = mainPyContent.match(toolsRegex);

if (!match) {
  console.error('❌ Could not find TOOLS array in main.py');
  console.error('   Looking for pattern:');
  console.error('   # Comment lines...');
  console.error('   TOOLS = [...]');
  console.error('\n   Current search pattern requires:');
  console.error('   - One or more lines starting with #');
  console.error('   - Followed by TOOLS = [');
  console.error('   - Closing with ]');
  process.exit(1);
}

mainPyContent = mainPyContent.replace(toolsRegex, pythonToolsArray);

// Step 6: Write updated main.py
fs.writeFileSync(MAIN_PY_PATH, mainPyContent, 'utf8');

console.log('✓ Updated main.py\n');

// Step 7: Summary
console.log('✅ SYNC COMPLETE!');
console.log('=================\n');
console.log(`📊 Summary:`);
console.log(`   - Tools synced: ${tools.length}`);
console.log(`   - Source: ${path.relative(process.cwd(), SERVER_JS_PATH)}`);
console.log(`   - Target: ${path.relative(process.cwd(), MAIN_PY_PATH)}`);
console.log('\n💡 Next steps:');
console.log('   1. Review the changes: git diff');
console.log('   2. Test locally if needed');
console.log('   3. Commit: git add . && git commit -m "Sync MCP tools"');
console.log('   4. Deploy: git push origin main');
console.log('\n🔗 For automatic syncing, run: npm run setup-sync-hook');
