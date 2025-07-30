#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Test MCP server directly
const mcpPath = path.join(__dirname, '..', 'bin', 'puo-memo-mcp');

const mcp = spawn('node', [mcpPath], {
  env: { 
    ...process.env,
    PUO_MEMO_API_URL: 'http://localhost:8000',
    PUO_MEMO_API_KEY: 'test-api-key',
    PYTHONUNBUFFERED: '1'
  }
});

// Log output
let initialized = false;

mcp.stdout.on('data', (data) => {
  console.log('[STDOUT]:', data.toString());
  
  // Check if this is the initialize response
  if (!initialized && data.toString().includes('"id":1,"result"')) {
    initialized = true;
    console.log('[SENDING] Initialized notification');
    
    // Send initialized notification
    const initializedNotification = {
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    };
    mcp.stdin.write(JSON.stringify(initializedNotification) + '\n');
  }
});

mcp.stderr.on('data', (data) => {
  console.error('[STDERR]:', data.toString());
});

mcp.on('error', (err) => {
  console.error('[ERROR]:', err);
});

mcp.on('close', (code) => {
  console.log('[CLOSED] Exit code:', code);
});

// Send initialize request after a short delay
setTimeout(() => {
  console.log('[SENDING] Initialize request');
  const initRequest = {
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '0.1.0',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    },
    id: 1
  };
  
  mcp.stdin.write(JSON.stringify(initRequest) + '\n');
  
  // Send list tools after another delay
  setTimeout(() => {
    console.log('[SENDING] List tools request');
    const listToolsRequest = {
      jsonrpc: '2.0',
      method: 'tools/list',
      id: 2
    };
    
    mcp.stdin.write(JSON.stringify(listToolsRequest) + '\n');
    
    // Exit after a few seconds
    setTimeout(() => {
      console.log('[KILLING] Process');
      mcp.kill();
    }, 3000);
  }, 2000);
}, 1000);