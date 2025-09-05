#!/usr/bin/env node
/**
 * Test the working MCP server
 */

import { spawn } from 'child_process';

async function testServer() {
  console.log('🧪 Testing Working MCP Server\n');
  
  // Set environment for demo account
  const env = {
    ...process.env,
    PURMEMO_EMAIL: 'demo@puo-memo.com',
    PURMEMO_PASSWORD: 'demodemo123',
    PURMEMO_API_URL: 'https://api.purmemo.ai'
  };
  
  // Start the server
  const server = spawn('node', ['src/server-working.js'], {
    env,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  let outputBuffer = '';
  
  server.stdout.on('data', (data) => {
    outputBuffer += data.toString();
  });
  
  server.stderr.on('data', (data) => {
    console.error('Server error:', data.toString());
  });
  
  // Test tool listing
  console.log('1️⃣ Testing tool listing...');
  server.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/list',
    params: {},
    id: 1
  }) + '\n');
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  if (outputBuffer.includes('memory') && outputBuffer.includes('recall')) {
    console.log('   ✅ Tools listed successfully');
  } else {
    console.log('   ❌ Tool listing failed');
  }
  
  // Test memory creation
  console.log('\n2️⃣ Testing memory creation...');
  outputBuffer = '';
  
  server.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'memory',
      arguments: {
        content: 'Test memory from MCP server',
        title: 'MCP Test',
        tags: ['test', 'mcp']
      }
    },
    id: 2
  }) + '\n');
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  if (outputBuffer.includes('successfully') || outputBuffer.includes('saved')) {
    console.log('   ✅ Memory creation works!');
    console.log('   Response:', outputBuffer.substring(0, 200));
  } else if (outputBuffer.includes('Authentication')) {
    console.log('   ⚠️  Authentication required');
    console.log('   Response:', outputBuffer.substring(0, 200));
  } else {
    console.log('   ❌ Memory creation failed');
    console.log('   Response:', outputBuffer);
  }
  
  // Test recall
  console.log('\n3️⃣ Testing memory recall...');
  outputBuffer = '';
  
  server.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'recall',
      arguments: {
        query: 'test',
        limit: 5
      }
    },
    id: 3
  }) + '\n');
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  if (outputBuffer.includes('Found') || outputBuffer.includes('memories')) {
    console.log('   ✅ Recall works!');
  } else {
    console.log('   ❌ Recall failed');
    console.log('   Response:', outputBuffer.substring(0, 200));
  }
  
  // Clean up
  server.kill();
  
  console.log('\n✅ Testing complete!');
}

testServer().catch(console.error);