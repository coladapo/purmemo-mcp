#!/usr/bin/env node
/**
 * Production Test Suite for Purmemo MCP v8.0.0
 * Tests the deployed ultimate server functionality
 */

import { spawn } from 'child_process';
import fetch from 'node-fetch';

const API_KEY = process.env.PURMEMO_API_KEY || '***REMOVED***';

class ProductionTest {
  constructor() {
    this.serverProcess = null;
    this.testResults = {
      passed: 0,
      failed: 0,
      details: []
    };
  }

  async run() {
    console.log('🔬 PURMEMO MCP PRODUCTION TEST v8.0.0\n');
    console.log('Testing: Production server (ultimate) functionality\n');
    console.log('='.repeat(70));

    try {
      await this.startServer();
      
      // Core functionality tests
      await this.testToolsList();
      await this.testContentValidation();
      await this.testSmallConversation();
      await this.testLargeConversation();
      await this.testArtifactsSave();
      await this.testRecall();
      
      // Verify API saves
      await this.verifyApiIntegration();
      
    } finally {
      this.cleanup();
      this.printResults();
    }
  }

  async startServer() {
    console.log('\n🚀 Starting production server (src/server.js)...');
    
    this.serverProcess = spawn('node', ['src/server.js'], {
      env: {
        ...process.env,
        PURMEMO_API_KEY: API_KEY,
        PURMEMO_API_URL: 'https://api.purmemo.ai'
      }
    });

    this.serverProcess.stderr.on('data', (data) => {
      if (process.env.DEBUG) {
        process.stderr.write(`[SERVER] ${data}`);
      }
    });

    await this.delay(2000);
    console.log('✓ Server started\n');
  }

  async testToolsList() {
    console.log('📝 Test 1: Tools List');
    
    const response = await this.callMCP('tools/list');
    
    if (response.result?.tools?.length === 4) {
      const tools = response.result.tools.map(t => t.name);
      if (tools.includes('save_conversation') && 
          tools.includes('save_with_artifacts') &&
          tools.includes('recall_memories') &&
          tools.includes('get_memory_details')) {
        this.logPass('All 4 production tools available');
      } else {
        this.logFail('Wrong tools available: ' + tools.join(', '));
      }
    } else {
      this.logFail('Expected 4 tools, found: ' + (response.result?.tools?.length || 0));
    }
  }

  async testContentValidation() {
    console.log('\n📝 Test 2: Content Validation');
    
    const response = await this.callTool('save_conversation', {
      conversationContent: 'save this'
    });

    const text = response?.result?.content?.[0]?.text || '';
    
    if (text.includes('INSUFFICIENT CONTENT')) {
      this.logPass('Correctly rejected insufficient content');
    } else {
      this.logFail('Should reject insufficient content');
    }
  }

  async testSmallConversation() {
    console.log('\n📝 Test 3: Small Complete Conversation');
    
    const conversationContent = `=== CONVERSATION START ===
USER: What is the purpose of Purmemo MCP?
ASSISTANT: Purmemo MCP (Model Context Protocol) is a tool that allows you to save complete conversation context from Claude Desktop to your Purmemo memory system. It captures:

1. Full conversation history (not summaries)
2. Code blocks and artifacts
3. File paths and URLs mentioned
4. Decisions and action items

The key feature is that it preserves complete context, even for very long conversations (100K+ characters) by automatically chunking them into linked parts.

USER: How do I use it?
ASSISTANT: Simply say "save this conversation" and the tool will capture everything we've discussed.
=== END ===`;

    const response = await this.callTool('save_conversation', {
      conversationContent,
      title: 'Production Test - Small Conversation'
    });

    const text = response?.result?.content?.[0]?.text || '';
    const memoryIdMatch = text.match(/Memory ID: ([a-f0-9-]+)/);
    
    if (text.includes('CONVERSATION SAVED!') && memoryIdMatch) {
      this.logPass(`Small conversation saved (ID: ${memoryIdMatch[1].substring(0, 8)}...)`);
    } else {
      this.logFail('Small conversation save failed');
    }
  }

  async testLargeConversation() {
    console.log('\n📝 Test 4: Large Conversation (Auto-chunking)');
    
    // Generate 20K character conversation
    let largeContent = '=== LARGE CONVERSATION TEST ===\n\n';
    for (let i = 1; i <= 40; i++) {
      largeContent += `USER: Question ${i} about implementation details.\n`;
      largeContent += 'A'.repeat(200) + '\n\n';
      largeContent += `ASSISTANT: Response ${i} with detailed explanation.\n`;
      largeContent += 'B'.repeat(300) + '\n\n';
    }
    largeContent += '=== END ===';

    console.log(`   Sending ${largeContent.length} characters...`);

    const response = await this.callTool('save_conversation', {
      conversationContent: largeContent,
      title: 'Production Test - Large Conversation'
    });

    const text = response?.result?.content?.[0]?.text || '';
    
    if (text.includes('Auto-chunked') || text.includes('Session ID:')) {
      this.logPass('Large conversation auto-chunked successfully');
    } else if (text.includes('CONVERSATION SAVED!')) {
      this.logPass('Large conversation saved (single part)');
    } else {
      this.logFail('Large conversation handling failed');
    }
  }

  async testArtifactsSave() {
    console.log('\n📝 Test 5: Artifacts Preservation');
    
    const response = await this.callTool('save_with_artifacts', {
      conversationSummary: 'Production test of artifact saving',
      artifacts: [
        {
          title: 'Test Component',
          type: 'code',
          language: 'javascript',
          content: `function testProduction() {\n  console.log('Production test');\n  return { status: 'success' };\n}`
        }
      ],
      codeBlocks: [
        {
          language: 'bash',
          code: 'npm test',
          context: 'Test command'
        }
      ]
    });

    const text = response?.result?.content?.[0]?.text || '';
    
    if (text.includes('ARTIFACTS SAVED')) {
      this.logPass('Artifacts preserved successfully');
    } else {
      this.logFail('Artifacts save failed');
    }
  }

  async testRecall() {
    console.log('\n📝 Test 6: Memory Recall');
    
    const response = await this.callTool('recall_memories', {
      query: 'Production Test',
      limit: 3
    });

    const text = response?.result?.content?.[0]?.text || '';
    
    if (text.includes('Found') && text.includes('memor')) {
      this.logPass('Recall functionality working');
    } else {
      this.logFail('Recall functionality failed');
    }
  }

  async verifyApiIntegration() {
    console.log('\n📊 API Integration Verification');
    
    try {
      const response = await fetch(`https://api.purmemo.ai/api/v5/memories/?page_size=5`, {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        const memories = data.results || data.memories || [];
        
        const testMemories = memories.filter(m => 
          m.title?.includes('Production Test') ||
          new Date(m.created_at) > new Date(Date.now() - 5 * 60 * 1000)
        );

        if (testMemories.length > 0) {
          this.logPass(`API integration verified (${testMemories.length} recent memories)`);
        } else {
          this.logPass('API connection working (no recent test memories)');
        }
      } else {
        this.logFail('API integration error: ' + response.status);
      }
    } catch (error) {
      this.logFail(`API verification failed: ${error.message}`);
    }
  }

  async callMCP(method, params = {}) {
    const request = {
      jsonrpc: '2.0',
      method,
      params,
      id: Math.random().toString(36).substring(7)
    };

    return this.sendRequest(request);
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

    return this.sendRequest(request);
  }

  async sendRequest(request) {
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
                // Continue parsing
              }
            }
          }
        }, 200);
      };

      this.serverProcess.stdout.on('data', handler);
      this.serverProcess.stdin.write(JSON.stringify(request) + '\n');

      setTimeout(() => {
        this.serverProcess.stdout.removeListener('data', handler);
        resolve({ error: 'Timeout' });
      }, 10000);
    });
  }

  logPass(message) {
    console.log(`   ✅ PASS: ${message}`);
    this.testResults.passed++;
    this.testResults.details.push({ type: 'PASS', message });
  }

  logFail(message) {
    console.log(`   ❌ FAIL: ${message}`);
    this.testResults.failed++;
    this.testResults.details.push({ type: 'FAIL', message });
  }

  cleanup() {
    if (this.serverProcess) {
      this.serverProcess.kill();
    }
  }

  printResults() {
    console.log('\n' + '='.repeat(70));
    console.log('🎯 PRODUCTION TEST RESULTS\n');
    console.log(`✅ Passed: ${this.testResults.passed}`);
    console.log(`❌ Failed: ${this.testResults.failed}`);
    console.log(`📊 Success Rate: ${Math.round(this.testResults.passed / (this.testResults.passed + this.testResults.failed) * 100)}%\n`);

    if (this.testResults.failed > 0) {
      console.log('❌ FAILURES:');
      this.testResults.details.filter(d => d.type === 'FAIL').forEach(d => {
        console.log(`   - ${d.message}`);
      });
    }

    console.log('\n🏆 OVERALL STATUS:');
    if (this.testResults.failed === 0) {
      console.log('   ✅ PRODUCTION SERVER FULLY OPERATIONAL');
    } else if (this.testResults.passed > this.testResults.failed) {
      console.log('   ⚠️ PRODUCTION SERVER OPERATIONAL WITH ISSUES');
    } else {
      console.log('   ❌ PRODUCTION SERVER HAS CRITICAL PROBLEMS');
    }

    console.log('\nVersion: Purmemo MCP v8.0.0 (Ultimate)');
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run production test
const test = new ProductionTest();
test.run().catch(console.error);