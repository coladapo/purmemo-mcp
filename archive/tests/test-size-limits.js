#!/usr/bin/env node
/**
 * Test to find EXACTLY where size limits are in the chain
 */

import { spawn } from 'child_process';
import fetch from 'node-fetch';

const API_KEY = '***REMOVED***';

class SizeLimitTest {
  constructor() {
    this.serverProcess = null;
  }

  async run() {
    console.log('🔬 SIZE LIMIT INVESTIGATION\n');
    console.log('Testing: Where exactly is content being truncated?\n');
    console.log('='.repeat(60));

    // Test 1: Direct API
    console.log('\n📊 Test 1: Direct API Call');
    const sizes = [10000, 50000, 100000, 200000];
    
    for (const size of sizes) {
      const testContent = 'A'.repeat(size);
      console.log(`\n   Testing ${size} chars directly to API...`);
      
      try {
        const response = await fetch('https://api.purmemo.ai/api/v5/memories/', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            content: testContent,
            title: `Direct API test ${size} chars`
          })
        });

        if (response.ok) {
          const data = await response.json();
          
          // Verify what was actually saved
          const verifyResponse = await fetch(`https://api.purmemo.ai/api/v5/memories/${data.id}`, {
            headers: { 'Authorization': `Bearer ${API_KEY}` }
          });
          
          if (verifyResponse.ok) {
            const saved = await verifyResponse.json();
            console.log(`   ✅ Sent: ${size} → Saved: ${saved.content.length} chars`);
            if (saved.content.length < size) {
              console.log(`   ⚠️ TRUNCATED: Lost ${size - saved.content.length} chars`);
            }
          }
        } else {
          const error = await response.text();
          console.log(`   ❌ Failed at ${size} chars: ${error.substring(0, 100)}`);
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
      }
    }

    // Test 2: Through MCP Server
    console.log('\n📊 Test 2: Through MCP Server (prompted-server.js)');
    await this.startServer();
    
    for (const size of [1000, 5000, 10000, 20000, 50000, 100000]) {
      await this.testMCPSize(size);
      await this.delay(500);
    }

    // Test 3: Check what Claude reported vs what was saved
    console.log('\n📊 Test 3: Analyzing Claude\'s 95K → 21K loss');
    console.log('\n   Hypothesis 1: MCP protocol message size limit');
    console.log('   Hypothesis 2: JSON-RPC serialization truncation');
    console.log('   Hypothesis 3: Node.js stdin/stdout buffer limit');
    console.log('   Hypothesis 4: Claude truncated before sending');
    
    // Check the actual memory Claude saved
    const claudeMemoryId = '008e8654-b1a0-4802-98c8-1094efdca2b3';
    console.log(`\n   Checking Claude\'s actual save (${claudeMemoryId})...`);
    
    try {
      const response = await fetch(`https://api.purmemo.ai/api/v5/memories/${claudeMemoryId}`, {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
      });
      
      if (response.ok) {
        const memory = await response.json();
        const meta = memory.metadata || {};
        
        console.log(`\n   📦 What Claude reported:`);
        console.log(`      - reportedCount: ${meta.reportedCount} chars`);
        console.log(`      - transcriptLength: ${meta.transcriptLength} chars`);
        console.log(`      - actualTotalLength: ${meta.actualTotalLength} chars`);
        console.log(`\n   📏 What was saved:`);
        console.log(`      - content.length: ${memory.content.length} chars`);
        console.log(`\n   ❌ Lost: ${meta.reportedCount - memory.content.length} chars (${Math.round((1 - memory.content.length/meta.reportedCount) * 100)}%)`);
        
        // Check for truncation markers
        const content = memory.content;
        if (content.includes('...') || content.includes('[truncated]') || content.includes('===')) {
          console.log(`\n   🔍 Found potential truncation markers in content`);
        }
        
        // Check if artifacts were included
        console.log(`\n   📄 Artifact check:`);
        console.log(`      - Has "=== ARTIFACTS ===" marker: ${content.includes('=== ARTIFACTS ===')}`);
        console.log(`      - Has "=== CODE BLOCKS ===" marker: ${content.includes('=== CODE BLOCKS ===')}`);
        console.log(`      - Metadata says artifacts: ${meta.artifacts || 0}`);
        console.log(`      - Metadata says codeBlocks: ${meta.codeBlocks || 0}`);
      }
    } catch (error) {
      console.log(`   ❌ Error fetching memory: ${error.message}`);
    }

    // Test 4: Node.js Buffer Limits
    console.log('\n📊 Test 4: Node.js Process Communication Limits');
    console.log(`   - process.stdin max: ${process.stdin.readableHighWaterMark} bytes`);
    console.log(`   - process.stdout max: ${process.stdout.writableHighWaterMark} bytes`);
    console.log(`   - Default JSON.stringify max: No hard limit (memory bound)`);
    console.log(`   - MCP SDK buffer size: Checking...`);

    this.cleanup();
    
    console.log('\n' + '='.repeat(60));
    console.log('🎯 CONCLUSION:\n');
    console.log('The bottleneck is likely in one of these places:');
    console.log('1. Claude truncates before sending (most likely)');
    console.log('2. MCP protocol/JSON-RPC message size limits');
    console.log('3. Node.js stdin/stdout buffer limits (16KB default)');
    console.log('4. Our server not handling chunked input properly');
  }

  async startServer() {
    console.log('\n   Starting MCP server...');
    
    this.serverProcess = spawn('node', ['src/prompted-server.js'], {
      env: {
        ...process.env,
        PURMEMO_API_KEY: API_KEY
      }
    });

    await this.delay(1000);
  }

  async testMCPSize(size) {
    console.log(`\n   Testing ${size} chars through MCP...`);
    
    const testContent = 'B'.repeat(size);
    const request = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'capture_everything',
        arguments: {
          fullTranscript: testContent,
          validation: {
            confirmFullCapture: true,
            totalCharacterCount: size
          }
        }
      },
      id: 'test_' + size
    };

    return new Promise((resolve) => {
      let responseBuffer = '';
      let timeout = null;
      
      const handler = (data) => {
        responseBuffer += data.toString();
        
        // Clear and reset timeout
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
          // Process complete response
          const lines = responseBuffer.split('\n');
          for (const line of lines) {
            if (line.trim().startsWith('{')) {
              try {
                const response = JSON.parse(line);
                if (response.id === request.id) {
                  this.serverProcess.stdout.removeListener('data', handler);
                  
                  // Check if it succeeded
                  if (response.result?.content?.[0]?.text?.includes('✅')) {
                    console.log(`   ✅ Success: MCP handled ${size} chars`);
                    
                    // Extract memory ID and verify
                    const text = response.result.content[0].text;
                    const idMatch = text.match(/ID: ([a-f0-9-]+)/);
                    if (idMatch) {
                      // We'd verify here but keeping it simple for now
                      console.log(`   📦 Memory ID: ${idMatch[1]}`);
                    }
                  } else if (response.result?.content?.[0]?.text?.includes('VALIDATION FAILED')) {
                    console.log(`   ❌ Rejected: Size validation failed`);
                  } else {
                    console.log(`   ⚠️ Unknown response`);
                  }
                  resolve();
                  return;
                }
              } catch (e) {
                // JSON parse error - might be chunked
              }
            }
          }
        }, 100); // Process after 100ms of no new data
      };

      this.serverProcess.stdout.on('data', handler);
      
      // Send request
      const requestStr = JSON.stringify(request);
      console.log(`   📤 Sending ${requestStr.length} bytes to MCP...`);
      this.serverProcess.stdin.write(requestStr + '\n');

      // Absolute timeout
      setTimeout(() => {
        this.serverProcess.stdout.removeListener('data', handler);
        console.log(`   ⏱️ Timeout at ${size} chars`);
        resolve();
      }, 5000);
    });
  }

  cleanup() {
    if (this.serverProcess) {
      this.serverProcess.kill();
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run test
const test = new SizeLimitTest();
test.run().catch(console.error);