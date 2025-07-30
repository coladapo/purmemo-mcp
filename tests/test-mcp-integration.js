#!/usr/bin/env node

/**
 * Integration test for PUO Memo MCP Server
 * Tests the actual MCP functionality
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

async function testMCPServer() {
  log('\n🧪 Testing MCP Server Integration', 'blue');
  
  const binPath = path.join(__dirname, '..', 'bin', 'puo-memo-mcp');
  
  // Test 1: Check if server starts with --help
  log('\n1. Testing --help flag...', 'blue');
  
  return new Promise((resolve, reject) => {
    const helpProc = spawn('node', [binPath, '--help']);
    
    let output = '';
    helpProc.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    helpProc.on('close', (code) => {
      if (code === 0 && output.includes('PUO Memo MCP Server')) {
        log('✓ Help command works correctly', 'green');
        
        // Test 2: Check Python detection
        log('\n2. Testing Python detection...', 'blue');
        
        const testProc = spawn('node', [binPath], {
          env: { ...process.env, PUO_MEMO_TEST_MODE: 'true' }
        });
        
        let testOutput = '';
        let errorOutput = '';
        
        testProc.stdout.on('data', (data) => {
          testOutput += data.toString();
        });
        
        testProc.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
        
        // Give it 2 seconds to detect Python and exit
        setTimeout(() => {
          testProc.kill();
          
          if (errorOutput.includes('Python 3 is required') || 
              errorOutput.includes('Starting PUO Memo MCP server')) {
            log('✓ Python detection logic works', 'green');
            resolve(true);
          } else {
            log('✗ Python detection failed', 'red');
            resolve(false);
          }
        }, 2000);
        
      } else {
        log('✗ Help command failed', 'red');
        resolve(false);
      }
    });
  });
}

async function runIntegrationTests() {
  log('PUO Memo MCP Integration Tests', 'blue');
  log('================================\n', 'blue');
  
  try {
    const result = await testMCPServer();
    
    if (result) {
      log('\n✅ All integration tests passed!', 'green');
      process.exit(0);
    } else {
      log('\n❌ Some integration tests failed', 'red');
      process.exit(1);
    }
  } catch (error) {
    log(`\n❌ Test error: ${error.message}`, 'red');
    process.exit(1);
  }
}

// Only run if called directly
if (require.main === module) {
  runIntegrationTests();
}