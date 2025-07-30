#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('\n🚀 PUO Memo MCP Server Installation\n');

// Check Python installation
try {
  const pythonVersion = execSync('python3 --version', { encoding: 'utf8' }).trim();
  console.log(`✅ Python found: ${pythonVersion}`);
} catch (error) {
  console.error(`❌ Python 3 is required but not found in PATH.
     
Please install Python 3.8 or later from https://www.python.org/downloads/
After installation, re-run: npm install puo-memo-mcp
`);
  process.exit(0); // Exit gracefully to not break npm install
}

// Check for required Python packages
console.log('\n📦 Checking Python dependencies...');
const requiredPackages = [
  'aiohttp',
  'pydantic',
  'python-dotenv'
];

let missingPackages = [];
for (const pkg of requiredPackages) {
  try {
    execSync(`python3 -c "import ${pkg}"`, { stdio: 'ignore' });
  } catch (error) {
    missingPackages.push(pkg);
  }
}

if (missingPackages.length > 0) {
  console.log(`\n⚠️  Missing Python packages: ${missingPackages.join(', ')}`);
  console.log('\nTo install them, run:');
  console.log(`  pip install ${missingPackages.join(' ')}`);
} else {
  console.log('✅ All Python dependencies are installed');
}

// Display configuration instructions
console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎉 PUO Memo MCP Server installed successfully!

📋 Next Steps:

1. Get your API key from https://puo-memo.com
   
2. Configure Claude Desktop:
   Add to ~/Library/Application Support/Claude/claude_desktop_config.json:
   
   {
     "mcpServers": {
       "puo-memo": {
         "command": "npx",
         "args": ["puo-memo-mcp"],
         "env": {
           "PUO_MEMO_API_KEY": "your-api-key-here"
         }
       }
     }
   }

3. Restart Claude Desktop

📚 Documentation: https://github.com/coladapo/puo-memo-mcp
🐛 Issues: https://github.com/coladapo/puo-memo-mcp/issues

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);