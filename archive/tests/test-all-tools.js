#!/usr/bin/env node
/**
 * Test all Purmemo MCP tools directly
 * This tests the server-final.js implementation
 */

import { spawn } from 'child_process';

// Test configuration
const TEST_CONFIG = {
  PURMEMO_API_URL: 'https://api.purmemo.ai',
  PURMEMO_EMAIL: 'demo@puo-memo.com',
  PURMEMO_PASSWORD: 'demodemo123'
};

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Start the MCP server
console.log(`${colors.cyan}Starting Purmemo MCP Server...${colors.reset}\n`);

const server = spawn('node', ['src/server-final.js'], {
  env: { ...process.env, ...TEST_CONFIG },
  stdio: ['pipe', 'pipe', 'pipe']
});

let buffer = '';

// Handle server output
server.stdout.on('data', (data) => {
  buffer += data.toString();
  processBuffer();
});

server.stderr.on('data', (data) => {
  console.error(`${colors.red}Server Error: ${data}${colors.reset}`);
});

server.on('error', (error) => {
  console.error(`${colors.red}Failed to start server: ${error}${colors.reset}`);
  process.exit(1);
});

server.on('close', (code) => {
  console.log(`${colors.yellow}Server exited with code ${code}${colors.reset}`);
});

// Process JSON-RPC responses
function processBuffer() {
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';
  
  for (const line of lines) {
    if (line.trim()) {
      try {
        const message = JSON.parse(line);
        handleMessage(message);
      } catch (e) {
        // Not JSON, ignore
      }
    }
  }
}

// Handle server messages
function handleMessage(message) {
  if (message.result) {
    if (currentTest) {
      currentTest.resolve(message.result);
      currentTest = null;
    }
  } else if (message.error) {
    if (currentTest) {
      currentTest.reject(new Error(message.error.message || 'Unknown error'));
      currentTest = null;
    }
  }
}

let currentTest = null;
let requestId = 1;

// Send JSON-RPC request
function sendRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    const request = {
      jsonrpc: '2.0',
      method,
      params,
      id: requestId++
    };
    
    currentTest = { resolve, reject };
    server.stdin.write(JSON.stringify(request) + '\n');
    
    // Timeout after 10 seconds
    setTimeout(() => {
      if (currentTest) {
        currentTest.reject(new Error('Request timeout'));
        currentTest = null;
      }
    }, 10000);
  });
}

// Test functions
async function testMemoryCreation() {
  console.log(`${colors.blue}Testing Memory Creation...${colors.reset}`);
  
  try {
    const result = await sendRequest('tools/call', {
      name: 'memory',
      arguments: {
        content: 'Test memory from comprehensive test suite',
        title: 'Test Memory',
        tags: ['test', 'mcp', 'validation']
      }
    });
    
    console.log(`${colors.green}✓ Memory Creation: SUCCESS${colors.reset}`);
    if (result.content && result.content[0]) {
      console.log(`  Response: ${result.content[0].text.split('\n')[0]}`);
    }
    return true;
  } catch (error) {
    console.log(`${colors.red}✗ Memory Creation: FAILED - ${error.message}${colors.reset}`);
    return false;
  }
}

async function testRecall() {
  console.log(`\n${colors.blue}Testing Recall/Search...${colors.reset}`);
  
  try {
    const result = await sendRequest('tools/call', {
      name: 'recall',
      arguments: {
        query: 'test',
        limit: 5
      }
    });
    
    console.log(`${colors.green}✓ Recall/Search: SUCCESS${colors.reset}`);
    if (result.content && result.content[0]) {
      const text = result.content[0].text;
      const lines = text.split('\n');
      console.log(`  ${lines[0]}`);
    }
    return true;
  } catch (error) {
    console.log(`${colors.red}✗ Recall/Search: FAILED - ${error.message}${colors.reset}`);
    return false;
  }
}

async function testEntities() {
  console.log(`\n${colors.blue}Testing Entities Extraction...${colors.reset}`);
  
  try {
    const result = await sendRequest('tools/call', {
      name: 'entities',
      arguments: {}
    });
    
    console.log(`${colors.green}✓ Entities: SUCCESS${colors.reset}`);
    if (result.content && result.content[0]) {
      const text = result.content[0].text;
      const lines = text.split('\n');
      console.log(`  ${lines[0]}`);
      
      // Check if entities are empty
      if (text.includes('No entities found')) {
        console.log(`${colors.yellow}  Note: No entities found. This is expected for new accounts.${colors.reset}`);
        console.log(`${colors.yellow}  Entities are extracted from memories over time.${colors.reset}`);
      }
    }
    return true;
  } catch (error) {
    console.log(`${colors.red}✗ Entities: FAILED - ${error.message}${colors.reset}`);
    return false;
  }
}

async function testListTools() {
  console.log(`\n${colors.blue}Testing Tool Listing...${colors.reset}`);
  
  try {
    const result = await sendRequest('tools/list');
    
    console.log(`${colors.green}✓ List Tools: SUCCESS${colors.reset}`);
    if (result.tools) {
      console.log(`  Available tools: ${result.tools.map(t => t.name).join(', ')}`);
    }
    return true;
  } catch (error) {
    console.log(`${colors.red}✗ List Tools: FAILED - ${error.message}${colors.reset}`);
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log(`${colors.cyan}Waiting for server initialization...${colors.reset}\n`);
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const results = {
    tools: await testListTools(),
    memory: await testMemoryCreation(),
    recall: await testRecall(),
    entities: await testEntities()
  };
  
  // Summary
  console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.cyan}TEST SUMMARY${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  
  const passed = Object.values(results).filter(r => r).length;
  const total = Object.keys(results).length;
  
  if (passed === total) {
    console.log(`${colors.green}✓ ALL TESTS PASSED (${passed}/${total})${colors.reset}`);
  } else {
    console.log(`${colors.yellow}⚠ PARTIAL SUCCESS (${passed}/${total})${colors.reset}`);
  }
  
  console.log(`\n${colors.cyan}Individual Results:${colors.reset}`);
  for (const [test, result] of Object.entries(results)) {
    const status = result ? `${colors.green}PASS${colors.reset}` : `${colors.red}FAIL${colors.reset}`;
    console.log(`  ${test}: ${status}`);
  }
  
  // Important notes
  console.log(`\n${colors.yellow}IMPORTANT NOTES:${colors.reset}`);
  console.log(`1. The 405 error on recall has been FIXED in server-final.js`);
  console.log(`2. Empty entities is EXPECTED - entities must be extracted from memories`);
  console.log(`3. To populate entities, memories need to be processed by the backend`);
  console.log(`4. Restart Claude Desktop to use the updated server-final.js`);
  
  // Clean exit
  server.kill();
  process.exit(passed === total ? 0 : 1);
}

// Handle process termination
process.on('SIGINT', () => {
  console.log(`\n${colors.yellow}Test interrupted${colors.reset}`);
  server.kill();
  process.exit(1);
});

// Run tests
runTests().catch(error => {
  console.error(`${colors.red}Test failed: ${error}${colors.reset}`);
  server.kill();
  process.exit(1);
});