#!/usr/bin/env node
/**
 * Minimal test for CI/CD
 * Verifies the MCP server structure is valid
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Running Purmemo MCP v9.0.0 Tests\n');

// Test 1: Check thin-server.js exists
const serverPath = join(__dirname, 'src', 'thin-server.js');
if (!existsSync(serverPath)) {
  console.error('❌ Test failed: thin-server.js not found');
  process.exit(1);
}
console.log('✅ thin-server.js exists');

// Test 2: Try to start the server
const serverProcess = spawn('node', [serverPath], {
  env: {
    ...process.env,
    PURMEMO_API_KEY: process.env.PURMEMO_API_KEY || 'test-key'
  },
  stdio: ['pipe', 'pipe', 'pipe']
});

let serverStarted = false;
let errorOccurred = false;

serverProcess.stderr.on('data', (data) => {
  const output = data.toString();
  if (output.includes('v9.0.0')) {
    serverStarted = true;
  }
});

serverProcess.on('error', (err) => {
  errorOccurred = true;
  console.error('❌ Failed to start server:', err.message);
});

// Give server time to start
setTimeout(() => {
  serverProcess.kill();
  
  if (errorOccurred) {
    process.exit(1);
  }
  
  if (serverStarted) {
    console.log('✅ Server starts successfully');
    console.log('\n✅ All tests passed!');
    process.exit(0);
  } else {
    console.error('❌ Server failed to start properly');
    process.exit(1);
  }
}, 2000);