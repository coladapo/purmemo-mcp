#!/usr/bin/env node

/**
 * Test script for PUO Memo MCP NPM package
 * This tests the Node.js wrapper functionality
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function testFile(filePath, description) {
  if (fs.existsSync(filePath)) {
    log(`✓ ${description}`, 'green');
    return true;
  } else {
    log(`✗ ${description} - Not found: ${filePath}`, 'red');
    return false;
  }
}

async function testBinScript() {
  return new Promise((resolve) => {
    log('\nTesting bin script...', 'blue');
    
    const binPath = path.join(__dirname, '..', 'bin', 'puo-memo-mcp');
    const proc = spawn('node', [binPath, '--help'], {
      env: { ...process.env, NO_PYTHON_CHECK: 'true' }
    });
    
    let output = '';
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    proc.stderr.on('data', (data) => {
      output += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code === 0 && output.includes('PUO Memo MCP Server')) {
        log('✓ Bin script executes correctly', 'green');
        resolve(true);
      } else {
        log('✗ Bin script failed to execute', 'red');
        console.log('Output:', output);
        resolve(false);
      }
    });
  });
}

async function testPythonDetection() {
  return new Promise((resolve) => {
    log('\nTesting Python detection...', 'blue');
    
    const testCode = `
const { execSync } = require('child_process');
function findPython() {
  const commands = process.platform === 'win32' 
    ? ['python', 'python3', 'py -3'] 
    : ['python3', 'python'];
  
  for (const cmd of commands) {
    try {
      const result = execSync(\`\${cmd} --version\`, { 
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
      if (result.includes('Python 3.')) {
        return cmd;
      }
    } catch (e) {}
  }
  return null;
}
console.log(findPython() || 'none');
`;
    
    const proc = spawn('node', ['-e', testCode]);
    let output = '';
    
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    proc.on('close', () => {
      const pythonCmd = output.trim();
      if (pythonCmd !== 'none') {
        log(`✓ Python detected: ${pythonCmd}`, 'green');
        resolve(true);
      } else {
        log('⚠ Python not detected (this is OK for NPM package)', 'yellow');
        resolve(true);
      }
    });
  });
}

async function runTests() {
  log('PUO Memo MCP NPM Package Tests', 'blue');
  log('================================\n', 'blue');
  
  let passed = 0;
  let total = 0;
  
  // Test 1: Check file structure
  log('1. File Structure Tests:', 'blue');
  const filesToCheck = [
    ['package.json', 'Package manifest'],
    ['bin/puo-memo-mcp', 'Bin executable'],
    ['src/mcp/server.py', 'Python MCP server'],
    ['requirements.txt', 'Python requirements'],
    ['scripts/postinstall.js', 'Postinstall script'],
    ['index.js', 'Main entry point']
  ];
  
  for (const [file, desc] of filesToCheck) {
    total++;
    if (testFile(path.join(__dirname, '..', file), desc)) passed++;
  }
  
  // Test 2: Package.json validation
  log('\n2. Package Configuration:', 'blue');
  total++;
  try {
    const pkg = require('../package.json');
    if (pkg.name === 'puo-memo-mcp' && pkg.bin && pkg.bin['puo-memo-mcp']) {
      log('✓ Package.json is correctly configured', 'green');
      passed++;
    } else {
      log('✗ Package.json missing required fields', 'red');
    }
  } catch (e) {
    log('✗ Failed to read package.json', 'red');
  }
  
  // Test 3: Bin script execution
  total++;
  if (await testBinScript()) passed++;
  
  // Test 4: Python detection
  total++;
  if (await testPythonDetection()) passed++;
  
  // Summary
  log('\n================================', 'blue');
  const passRate = Math.round((passed / total) * 100);
  const color = passRate === 100 ? 'green' : passRate >= 70 ? 'yellow' : 'red';
  log(`Test Results: ${passed}/${total} passed (${passRate}%)`, color);
  
  process.exit(passed === total ? 0 : 1);
}

// Run tests
runTests().catch((err) => {
  log(`Test error: ${err.message}`, 'red');
  process.exit(1);
});