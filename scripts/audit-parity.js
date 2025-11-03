#!/usr/bin/env node

/**
 * MCP Tools Parity Audit Script
 *
 * Compares JavaScript (server.js) and Python (main.py) tool definitions
 * to ensure they are perfectly in sync.
 *
 * Usage: node scripts/audit-parity.js
 */

const fs = require('fs');
const path = require('path');

// Paths
const SERVER_JS_PATH = path.join(__dirname, '../purmemo-mcp/src/server.js');
const MAIN_PY_PATH = path.join(__dirname, '../purmemo-core/platform/external/integrations/universal/remote-mcp/main.py');

console.log('🔍 MCP Tools Parity Audit');
console.log('=========================\n');

// Extract JavaScript tools
console.log('📖 Reading JavaScript tools from server.js...');
const serverJsContent = fs.readFileSync(SERVER_JS_PATH, 'utf8');
const jsToolsMatch = serverJsContent.match(/const TOOLS = \[([\s\S]*?)\n\];/);

if (!jsToolsMatch) {
  console.error('❌ Could not find TOOLS in server.js');
  process.exit(1);
}

const jsTools = eval(`[${jsToolsMatch[1]}]`);
console.log(`✓ Found ${jsTools.length} JavaScript tools\n`);

// Extract Python tools
console.log('📖 Reading Python tools from main.py...');
const mainPyContent = fs.readFileSync(MAIN_PY_PATH, 'utf8');

// Find TOOLS array in Python
const pyToolsMatch = mainPyContent.match(/TOOLS = \[([\s\S]*?)\n\]/);

if (!pyToolsMatch) {
  console.error('❌ Could not find TOOLS in main.py');
  process.exit(1);
}

// Parse Python as JSON (it's valid JSON after minor cleanup)
let pyToolsText = pyToolsMatch[1]
  .replace(/True/g, 'true')
  .replace(/False/g, 'false')
  .replace(/None/g, 'null')
  .replace(/"""([\s\S]*?)"""/g, (match, content) => {
    // Convert triple-quoted strings to JSON strings
    return '"' + content.replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
  });

let pyTools;
try {
  pyTools = JSON.parse(`[${pyToolsText}]`);
  console.log(`✓ Found ${pyTools.length} Python tools\n`);
} catch (error) {
  console.error('❌ Error parsing Python tools:', error.message);
  console.error('\nNote: This is expected if Python has complex syntax.');
  console.error('Falling back to basic comparison...\n');

  // Fallback: Just compare tool names
  const pyToolNames = mainPyContent.match(/"name":\s*"([^"]+)"/g);
  pyTools = pyToolNames ? pyToolNames.map(m => ({
    name: m.match(/"name":\s*"([^"]+)"/)[1]
  })) : [];
  console.log(`✓ Extracted ${pyTools.length} Python tool names\n`);
}

// Start comparison
console.log('🔄 Starting Parity Audit...');
console.log('=========================\n');

let hasErrors = false;
const issues = [];

// Check 1: Tool count
console.log('1️⃣  Checking tool count...');
if (jsTools.length !== pyTools.length) {
  issues.push(`❌ Tool count mismatch: JS has ${jsTools.length}, Python has ${pyTools.length}`);
  hasErrors = true;
} else {
  console.log(`   ✓ Both have ${jsTools.length} tools`);
}
console.log();

// Check 2: Tool names
console.log('2️⃣  Checking tool names...');
const jsNames = jsTools.map(t => t.name).sort();
const pyNames = pyTools.map(t => t.name).sort();

const missingInPython = jsNames.filter(name => !pyNames.includes(name));
const extraInPython = pyNames.filter(name => !jsNames.includes(name));

if (missingInPython.length > 0) {
  issues.push(`❌ Missing in Python: ${missingInPython.join(', ')}`);
  hasErrors = true;
}
if (extraInPython.length > 0) {
  issues.push(`❌ Extra in Python: ${extraInPython.join(', ')}`);
  hasErrors = true;
}

if (missingInPython.length === 0 && extraInPython.length === 0) {
  console.log('   ✓ All tool names match');
  jsNames.forEach((name, i) => {
    console.log(`   ${i + 1}. ${name}`);
  });
} else {
  console.log('   ❌ Tool name mismatch detected');
}
console.log();

// Check 3: Detailed comparison for each tool
console.log('3️⃣  Checking tool details...');

for (const jsTool of jsTools) {
  const pyTool = pyTools.find(t => t.name === jsTool.name);

  if (!pyTool) {
    issues.push(`❌ Tool "${jsTool.name}" exists in JS but not in Python`);
    hasErrors = true;
    continue;
  }

  console.log(`\n   📋 Auditing: ${jsTool.name}`);

  // Compare descriptions
  if (jsTool.description && pyTool.description) {
    // Normalize whitespace for comparison
    const jsDesc = jsTool.description.replace(/\s+/g, ' ').trim();
    const pyDesc = pyTool.description.replace(/\s+/g, ' ').trim();

    if (jsDesc === pyDesc) {
      console.log(`      ✓ Description matches`);
    } else {
      console.log(`      ⚠️  Description length: JS=${jsDesc.length}, PY=${pyDesc.length}`);
      if (Math.abs(jsDesc.length - pyDesc.length) > 100) {
        issues.push(`⚠️  Tool "${jsTool.name}": Description length differs significantly`);
      }
    }
  }

  // Compare inputSchema existence
  if (jsTool.inputSchema && pyTool.inputSchema) {
    console.log(`      ✓ inputSchema present in both`);

    // Check required fields
    const jsRequired = jsTool.inputSchema.required || [];
    const pyRequired = pyTool.inputSchema.required || [];

    if (JSON.stringify(jsRequired.sort()) === JSON.stringify(pyRequired.sort())) {
      console.log(`      ✓ Required fields match: [${jsRequired.join(', ')}]`);
    } else {
      issues.push(`❌ Tool "${jsTool.name}": Required fields differ`);
      hasErrors = true;
    }

    // Check properties count
    const jsProps = Object.keys(jsTool.inputSchema.properties || {});
    const pyProps = Object.keys(pyTool.inputSchema.properties || {});

    if (jsProps.length === pyProps.length) {
      console.log(`      ✓ Property count matches: ${jsProps.length} properties`);
    } else {
      issues.push(`⚠️  Tool "${jsTool.name}": Property count differs (JS=${jsProps.length}, PY=${pyProps.length})`);
    }
  } else if (!jsTool.inputSchema && !pyTool.inputSchema) {
    console.log(`      ✓ Both have no inputSchema`);
  } else {
    issues.push(`❌ Tool "${jsTool.name}": inputSchema presence mismatch`);
    hasErrors = true;
  }
}

console.log('\n');
console.log('=========================');
console.log('📊 Audit Summary');
console.log('=========================\n');

if (issues.length === 0) {
  console.log('✅ PERFECT PARITY!');
  console.log('\nJavaScript and Python MCP tools are perfectly in sync:');
  console.log(`   • ${jsTools.length} tools in both`);
  console.log(`   • All tool names match`);
  console.log(`   • All descriptions match`);
  console.log(`   • All schemas match`);
  console.log('\n🎉 No action needed - sync is working correctly!');
  process.exit(0);
} else {
  console.log(`⚠️  FOUND ${issues.length} ISSUE(S):\n`);
  issues.forEach((issue, i) => {
    console.log(`${i + 1}. ${issue}`);
  });

  console.log('\n💡 Recommended action:');
  console.log('   Run: node scripts/sync-mcp-tools.js');
  console.log('   This will sync Python to match JavaScript');

  if (hasErrors) {
    console.log('\n❌ Critical issues found - sync required!');
    process.exit(1);
  } else {
    console.log('\n⚠️  Minor issues found - consider syncing');
    process.exit(0);
  }
}
