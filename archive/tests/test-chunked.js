#!/usr/bin/env node
/**
 * Test chunked capture with ACTUAL verification
 */

import { spawn } from 'child_process';
import fetch from 'node-fetch';

const API_KEY = '***REMOVED***';

class ChunkedTest {
  constructor() {
    this.serverProcess = null;
    this.sessionId = null;
    this.savedMemoryIds = [];
  }

  async run() {
    console.log('🧪 CHUNKED CAPTURE TEST\n');
    console.log('Testing: Multi-part capture with verification\n');
    console.log('='.repeat(60));

    await this.startServer();

    // Test 1: Small single capture
    console.log('\n📝 Test 1: Single capture (5K chars)');
    await this.testSingleCapture(5000);

    // Test 2: Auto-chunked large capture  
    console.log('\n📝 Test 2: Auto-chunked capture (35K chars)');
    await this.testAutoChunked(35000);

    // Test 3: Manual chunked capture with session
    console.log('\n📝 Test 3: Manual chunked capture (100K chars in 7 parts)');
    await this.testManualChunked(100000, 7);

    // Verify what was ACTUALLY saved
    await this.verifyAllSaves();

    this.cleanup();
  }

  async startServer() {
    console.log('Starting chunked-server.js...');
    
    this.serverProcess = spawn('node', ['src/chunked-server.js'], {
      env: {
        ...process.env,
        PURMEMO_API_KEY: API_KEY
      }
    });

    this.serverProcess.stderr.on('data', (data) => {
      console.error('Server error:', data.toString());
    });

    await this.delay(1000);
    console.log('✓ Server started\n');
  }

  async testSingleCapture(size) {
    const content = `Test content ${size} chars: ${'A'.repeat(size - 30)}`;
    
    const response = await this.callTool('single_capture', {
      content,
      title: `Single test ${size}`
    });

    const text = response?.result?.content?.[0]?.text || '';
    console.log('   Response:', text.split('\n')[0]);
    
    // Extract memory ID
    const idMatch = text.match(/ID: ([a-f0-9-]+)/);
    if (idMatch) {
      this.savedMemoryIds.push({ 
        id: idMatch[1], 
        test: 'single', 
        expectedSize: size 
      });
    }
  }

  async testAutoChunked(size) {
    const content = `Large content ${size} chars: ${'B'.repeat(size - 30)}`;
    
    const response = await this.callTool('single_capture', {
      content,
      title: `Auto-chunked test ${size}`
    });

    const text = response?.result?.content?.[0]?.text || '';
    console.log('   Response:', text.split('\n')[0]);
    
    // Extract session ID for verification
    const sessionMatch = text.match(/Session: ([a-f0-9]+)/);
    if (sessionMatch) {
      console.log(`   Session created: ${sessionMatch[1]}`);
    }
  }

  async testManualChunked(totalSize, numParts) {
    console.log(`   Creating ${numParts} parts of ~${Math.floor(totalSize/numParts)} chars each`);
    
    // Start session
    const startResponse = await this.callTool('start_chunked_capture', {
      title: 'Manual chunked test 100K',
      totalParts: numParts,
      estimatedTotalSize: totalSize,
      metadata: {
        hasArtifacts: true,
        artifactCount: 2,
        codeBlockCount: 5,
        messageCount: 20
      }
    });

    const startText = startResponse?.result?.content?.[0]?.text || '';
    const sessionMatch = startText.match(/Session ID: ([a-f0-9]+)/);
    
    if (!sessionMatch) {
      console.log('   ❌ Failed to start session');
      return;
    }

    this.sessionId = sessionMatch[1];
    console.log(`   ✓ Session started: ${this.sessionId}`);

    // Send parts
    const partSize = Math.floor(totalSize / numParts);
    for (let i = 1; i <= numParts; i++) {
      const isLast = i === numParts;
      const content = `Part ${i}/${numParts}: ${'C'.repeat(partSize - 20)}`;
      
      console.log(`   Sending part ${i} (${content.length} chars)...`);
      
      const response = await this.callTool('continue_capture', {
        sessionId: this.sessionId,
        partNumber: i,
        content,
        contentType: i <= 3 ? 'conversation' : i <= 5 ? 'code' : 'artifact',
        isLastPart: isLast
      });

      const text = response?.result?.content?.[0]?.text || '';
      
      if (isLast) {
        // Parse finalization response
        const savedMatch = text.match(/Total saved: (\d+) characters/);
        if (savedMatch) {
          console.log(`   ✓ Finalized: ${savedMatch[1]} total chars saved`);
        }
        
        // Extract memory IDs
        const idMatches = text.matchAll(/\[([a-f0-9-]+)\]/g);
        for (const match of idMatches) {
          if (match[1].length === 36) { // UUID length
            this.savedMemoryIds.push({
              id: match[1],
              test: 'manual-chunked',
              part: this.savedMemoryIds.filter(m => m.test === 'manual-chunked').length + 1
            });
          }
        }
      } else {
        const progressMatch = text.match(/Progress: (\d+)\/(\d+)/);
        if (progressMatch) {
          console.log(`   ✓ Progress: ${progressMatch[1]}/${progressMatch[2]}`);
        }
      }
    }
  }

  async verifyAllSaves() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 VERIFICATION OF ACTUAL SAVES\n');

    let totalSaved = 0;
    let totalExpected = 0;

    for (const mem of this.savedMemoryIds) {
      try {
        const response = await fetch(`https://api.purmemo.ai/api/v5/memories/${mem.id}`, {
          headers: { 'Authorization': `Bearer ${API_KEY}` }
        });

        if (response.ok) {
          const data = await response.json();
          const actualSize = data.content.length;
          totalSaved += actualSize;
          
          console.log(`✅ ${mem.test} ${mem.part ? `Part ${mem.part}` : ''}`);
          console.log(`   ID: ${mem.id}`);
          console.log(`   Actual size: ${actualSize} chars`);
          
          if (mem.expectedSize) {
            totalExpected += mem.expectedSize;
            const diff = actualSize - mem.expectedSize;
            if (Math.abs(diff) > 50) {
              console.log(`   ⚠️ Size mismatch: Expected ${mem.expectedSize}, got ${actualSize}`);
            }
          }
          
          // Check metadata for chunked captures
          if (data.metadata?.captureType === 'chunked') {
            console.log(`   📦 Chunked: Part ${data.metadata.partNumber}/${data.metadata.totalParts}`);
            console.log(`   🔗 Session: ${data.metadata.sessionId?.substring(0, 8)}...`);
          }
        } else {
          console.log(`❌ ${mem.test}: Memory ${mem.id} not found`);
        }
      } catch (error) {
        console.log(`❌ Error verifying ${mem.id}: ${error.message}`);
      }
    }

    console.log('\n🎯 SUMMARY:');
    console.log(`Total memories saved: ${this.savedMemoryIds.length}`);
    console.log(`Total characters saved: ${totalSaved}`);
    if (totalExpected > 0) {
      console.log(`Efficiency: ${Math.round(totalSaved/totalExpected*100)}%`);
    }

    // Test recall with chunked support
    console.log('\n🔍 Testing recall with chunked support...');
    const recallResponse = await this.callTool('recall_chunked', {
      query: 'chunked test',
      includeLinked: true
    });

    const recallText = recallResponse?.result?.content?.[0]?.text || '';
    const foundMatch = recallText.match(/Found (\d+) memories/);
    if (foundMatch) {
      console.log(`Found ${foundMatch[1]} memories including chunked captures`);
    }
  }

  async callTool(toolName, args) {
    const request = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      },
      id: Math.random().toString(36).substring(7)
    };

    return new Promise((resolve) => {
      let responseData = '';
      let timeout = null;
      
      const handler = (data) => {
        responseData += data.toString();
        
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
          const lines = responseData.split('\n');
          for (const line of lines) {
            if (line.trim().startsWith('{')) {
              try {
                const response = JSON.parse(line);
                if (response.id === request.id) {
                  this.serverProcess.stdout.removeListener('data', handler);
                  resolve(response);
                  return;
                }
              } catch (e) {
                // Continue
              }
            }
          }
        }, 100);
      };

      this.serverProcess.stdout.on('data', handler);
      this.serverProcess.stdin.write(JSON.stringify(request) + '\n');

      setTimeout(() => {
        this.serverProcess.stdout.removeListener('data', handler);
        resolve({ error: 'Timeout' });
      }, 5000);
    });
  }

  cleanup() {
    console.log('\n🧹 Cleaning up...');
    if (this.serverProcess) {
      this.serverProcess.kill();
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run test
const test = new ChunkedTest();
test.run().catch(console.error);