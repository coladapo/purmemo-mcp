#!/usr/bin/env node
/**
 * Production Diagnosis Tool for Purmemo MCP
 * Tests authentication and API connectivity without console pollution
 */

import { createWriteStream } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const API_URL = process.env.PURMEMO_API_URL || 'https://api.purmemo.ai';
const logFile = createWriteStream(join(__dirname, '..', 'diagnosis.log'), { flags: 'w' });

function log(message) {
  const timestamp = new Date().toISOString();
  logFile.write(`${timestamp}: ${message}\n`);
}

async function diagnose() {
  log('🔬 Starting Purmemo MCP Diagnosis');
  
  // Check environment variables
  const apiKey = process.env.PURMEMO_API_KEY;
  if (!apiKey) {
    log('❌ No API key found in environment variables');
    log('   Expected: PURMEMO_API_KEY');
    return false;
  }
  
  log('✅ API key found in environment');
  log(`   Length: ${apiKey.length} characters`);
  log(`   Starts with: ${apiKey.substring(0, 10)}...`);
  
  // Test API endpoints
  const endpoints = [
    '/api/v5/memories/',
    '/api/v4/memories/',
    '/api/memories/',
    '/api/v5/entities',
    '/api/v4/entities',
    '/api/entities'
  ];
  
  let workingEndpoints = [];
  
  for (const endpoint of endpoints) {
    try {
      log(`🔍 Testing endpoint: ${API_URL}${endpoint}`);
      
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'purmemo-mcp-diagnose/2.1.7'
        },
        signal: AbortSignal.timeout(10000)
      });
      
      log(`   Status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        workingEndpoints.push(endpoint);
        log('   ✅ Endpoint working');
        
        // Try to parse response
        try {
          const data = await response.json();
          log(`   📊 Response type: ${typeof data}`);
          if (data && typeof data === 'object') {
            log(`   📊 Response keys: ${Object.keys(data).join(', ')}`);
          }
        } catch (parseError) {
          log(`   ⚠️  Response not JSON: ${parseError.message}`);
        }
      } else {
        log(`   ❌ Endpoint failed: ${response.status}`);
        
        // Try to get error details
        try {
          const errorText = await response.text();
          log(`   📄 Error response: ${errorText.substring(0, 200)}`);
        } catch (e) {
          log('   📄 Could not read error response');
        }
      }
      
    } catch (error) {
      log(`   ❌ Network error: ${error.message}`);
      
      if (error.name === 'AbortError') {
        log('   ⏱️  Request timed out (>10s)');
      }
    }
  }
  
  // Test memory creation
  if (workingEndpoints.length > 0) {
    const memoryEndpoint = workingEndpoints.find(e => e.includes('memories')) || workingEndpoints[0];
    log(`🧪 Testing memory creation on: ${memoryEndpoint}`);
    
    try {
      const testMemory = {
        content: 'Test memory from diagnosis tool',
        title: 'MCP Diagnosis Test',
        tags: ['test', 'diagnosis']
      };
      
      const response = await fetch(`${API_URL}${memoryEndpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'purmemo-mcp-diagnose/2.1.7'
        },
        body: JSON.stringify(testMemory),
        signal: AbortSignal.timeout(10000)
      });
      
      log(`   Memory creation status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const data = await response.json();
        log('   ✅ Memory creation successful');
        log(`   📝 Created memory ID: ${data.memory_id || data.id || 'unknown'}`);
      } else {
        const errorText = await response.text();
        log(`   ❌ Memory creation failed: ${errorText.substring(0, 200)}`);
      }
      
    } catch (error) {
      log(`   ❌ Memory creation error: ${error.message}`);
    }
  }
  
  // Final summary
  log('\n📊 DIAGNOSIS SUMMARY');
  log(`Working endpoints: ${workingEndpoints.length}/${endpoints.length}`);
  log(`API key present: ${!!apiKey}`);
  log(`Working endpoints: ${workingEndpoints.join(', ')}`);
  
  const success = workingEndpoints.length > 0;
  log(`Overall status: ${success ? '✅ PASS' : '❌ FAIL'}`);
  
  if (success) {
    log('\n🎉 Purmemo MCP should work correctly!');
    log('💡 If you still see issues, check Claude Desktop logs for JSON parsing errors');
  } else {
    log('\n🚨 Issues detected:');
    log('1. Check your API key is valid and not expired');
    log('2. Verify network connectivity to api.purmemo.ai');
    log('3. Try getting a new API key from https://app.purmemo.ai/settings');
  }
  
  return success;
}

// Run diagnosis
diagnose()
  .then(success => {
    log('🔬 Diagnosis completed');
    logFile.end();
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    log(`💥 Diagnosis crashed: ${error.message}`);
    logFile.end();
    process.exit(1);
  });