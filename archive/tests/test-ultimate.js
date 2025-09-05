#!/usr/bin/env node
/**
 * BRUTAL HONESTY TEST - Ultimate Server
 * Tests what ACTUALLY works vs what just prints success
 */

import { spawn } from 'child_process';
import fetch from 'node-fetch';

const API_KEY = '***REMOVED***';

class UltimateServerTest {
  constructor() {
    this.serverProcess = null;
    this.testResults = {
      passed: 0,
      failed: 0,
      details: []
    };
  }

  async run() {
    console.log('🔬 ULTIMATE SERVER BRUTAL HONESTY TEST\n');
    console.log('Testing: What ACTUALLY works vs fake success messages\n');
    console.log('='.repeat(70));

    try {
      await this.startServer();
      
      // Test 1: Rejection for insufficient content (should reject)
      await this.testRejection();
      
      // Test 2: Small complete conversation (should save single)
      await this.testSmallConversation();
      
      // Test 3: Large conversation (should auto-chunk)
      await this.testLargeConversation();
      
      // Test 4: Conversation with artifacts (should preserve artifacts)
      await this.testConversationWithArtifacts();
      
      // Test 5: Recall functionality (should find saved memories)
      await this.testRecall();
      
      // Test 6: Memory details retrieval
      await this.testMemoryDetails();
      
      // Verify all saves in API
      await this.verifyApiSaves();
      
    } finally {
      this.cleanup();
      this.printResults();
    }
  }

  async startServer() {
    console.log('\n🚀 Starting server.js (production)...');
    
    this.serverProcess = spawn('node', ['src/server.js'], {
      env: {
        ...process.env,
        PURMEMO_API_KEY: API_KEY
      }
    });

    this.serverProcess.stderr.on('data', (data) => {
      // Log server debug info
      process.stderr.write(`[SERVER] ${data}`);
    });

    await this.delay(2000);
    console.log('✓ Server started\n');
  }

  async testRejection() {
    console.log('📝 Test 1: Content Validation (should REJECT insufficient content)');
    
    const response = await this.callTool('save_conversation', {
      conversationContent: 'save this conversation'
    });

    const text = response?.result?.content?.[0]?.text || '';
    
    if (text.includes('INSUFFICIENT CONTENT DETECTED')) {
      this.logPass('Correctly rejected insufficient content');
    } else {
      this.logFail('Should have rejected "save this conversation" but didn\'t');
    }
  }

  async testSmallConversation() {
    console.log('\n📝 Test 2: Small Complete Conversation (should save single)');
    
    const conversationContent = `=== CONVERSATION START ===
USER: What is 2 + 2?
ASSISTANT: 2 + 2 equals 4. This is basic arithmetic where we're adding two identical numbers together.

USER: Can you show me this in Python code?
ASSISTANT: Here's how you can do 2 + 2 in Python:

\`\`\`python
result = 2 + 2
print(f"2 + 2 = {result}")
# Output: 2 + 2 = 4
\`\`\`

USER: Thank you, that's helpful.
ASSISTANT: You're welcome! Feel free to ask if you have any other questions about math or programming.
=== END ===`;

    const response = await this.callTool('save_conversation', {
      conversationContent,
      title: 'Test Small Conversation'
    });

    const text = response?.result?.content?.[0]?.text || '';
    const memoryIdMatch = text.match(/Memory ID: ([a-f0-9-]+)/);
    
    if (text.includes('CONVERSATION SAVED!') && memoryIdMatch) {
      // Verify in API
      const actualMemory = await this.verifyMemoryInApi(memoryIdMatch[1]);
      if (actualMemory && actualMemory.content.length > 500) {
        this.logPass(`Small conversation saved (${actualMemory.content.length} chars)`);
      } else {
        this.logFail('Claimed success but memory not found or too small');
      }
    } else {
      this.logFail('Small conversation save failed');
    }
  }

  async testLargeConversation() {
    console.log('\n📝 Test 3: Large Conversation (should auto-chunk)');
    
    // Generate 25K character conversation
    let largeContent = '=== CONVERSATION START ===\n';
    for (let i = 1; i <= 50; i++) {
      largeContent += `USER: This is message ${i}. `;
      largeContent += 'A'.repeat(200) + '\n';
      largeContent += `ASSISTANT: This is response ${i}. `;
      largeContent += 'B'.repeat(300) + '\n';
    }
    largeContent += '=== END ===';

    console.log(`   Sending ${largeContent.length} characters...`);

    const response = await this.callTool('save_conversation', {
      conversationContent: largeContent,
      title: 'Test Large Conversation'
    });

    const text = response?.result?.content?.[0]?.text || '';
    const sessionMatch = text.match(/Session ID: ([a-f0-9_]+)/);
    
    if (text.includes('Auto-chunked') && sessionMatch) {
      // Verify chunked saves exist
      const sessionId = sessionMatch[1];
      const chunkedMemories = await this.findSessionMemories(sessionId);
      
      if (chunkedMemories.length > 1) {
        const totalSaved = chunkedMemories.reduce((sum, m) => sum + m.content.length, 0);
        this.logPass(`Large conversation auto-chunked: ${chunkedMemories.length} parts, ${totalSaved} total chars`);
      } else {
        this.logFail('Claimed auto-chunked but no chunked memories found');
      }
    } else {
      this.logFail('Large conversation auto-chunking failed');
    }
  }

  async testConversationWithArtifacts() {
    console.log('\n📝 Test 4: Conversation With Artifacts (should preserve artifacts)');
    
    const response = await this.callTool('save_with_artifacts', {
      conversationSummary: 'We created a React component and discussed its implementation.',
      artifacts: [
        {
          title: 'TodoList Component',
          type: 'code',
          language: 'jsx',
          content: `import React, { useState } from 'react';

function TodoList() {
  const [todos, setTodos] = useState([]);
  const [inputValue, setInputValue] = useState('');

  const addTodo = () => {
    if (inputValue.trim()) {
      setTodos([...todos, { id: Date.now(), text: inputValue, completed: false }]);
      setInputValue('');
    }
  };

  return (
    <div className="todo-list">
      <h2>Todo List</h2>
      <div>
        <input 
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Add a todo..."
        />
        <button onClick={addTodo}>Add</button>
      </div>
      <ul>
        {todos.map(todo => (
          <li key={todo.id}>{todo.text}</li>
        ))}
      </ul>
    </div>
  );
}

export default TodoList;`
        }
      ],
      codeBlocks: [
        {
          language: 'bash',
          code: 'npm install react',
          context: 'Command to install React dependency'
        }
      ]
    });

    const text = response?.result?.content?.[0]?.text || '';
    const memoryIdMatch = text.match(/Memory: ([a-f0-9-]+)/);
    
    if (text.includes('ARTIFACTS SAVED') && memoryIdMatch) {
      const actualMemory = await this.verifyMemoryInApi(memoryIdMatch[1]);
      if (actualMemory && actualMemory.content.includes('TodoList Component') && actualMemory.content.includes('npm install react')) {
        this.logPass(`Artifacts preserved (${actualMemory.content.length} chars with full artifact code)`);
      } else {
        this.logFail('Claimed artifacts saved but content missing or incomplete');
      }
    } else {
      this.logFail('Artifacts save failed');
    }
  }

  async testRecall() {
    console.log('\n📝 Test 5: Recall Functionality (should find saved memories)');
    
    const response = await this.callTool('recall_memories', {
      query: 'conversation',
      limit: 5
    });

    const text = response?.result?.content?.[0]?.text || '';
    
    if (text.includes('Found') && text.includes('memories')) {
      const foundMatch = text.match(/Found (\d+) memories/);
      if (foundMatch && parseInt(foundMatch[1]) > 0) {
        this.logPass(`Recall found ${foundMatch[1]} memories`);
      } else {
        this.logFail('Recall claimed to find memories but count is 0');
      }
    } else {
      this.logFail('Recall functionality failed');
    }
  }

  async testMemoryDetails() {
    console.log('\n📝 Test 6: Memory Details (should retrieve complete info)');
    
    // Get a recent memory ID first
    const recentMemories = await this.getRecentMemories();
    if (recentMemories.length === 0) {
      this.logFail('No memories found for details test');
      return;
    }

    const memoryId = recentMemories[0].id;
    const response = await this.callTool('get_memory_details', {
      memoryId,
      includeLinkedParts: true
    });

    const text = response?.result?.content?.[0]?.text || '';
    
    if (text.includes('Size:') && text.includes('Content Preview:')) {
      this.logPass('Memory details retrieved successfully');
    } else {
      this.logFail('Memory details retrieval failed');
    }
  }

  async verifyApiSaves() {
    console.log('\n📊 BRUTAL VERIFICATION: What was ACTUALLY saved in API');
    
    try {
      const response = await fetch(`https://api.purmemo.ai/api/v5/memories/?page_size=10`, {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        const memories = data.results || data.memories || [];
        const testMemories = memories.filter(m => 
          m.title.includes('Test') || 
          m.tags?.includes('complete-conversation') ||
          new Date(m.created_at) > new Date(Date.now() - 5 * 60 * 1000) // Last 5 minutes
        );

        console.log(`\n   Found ${testMemories.length} test memories in API:`);
        testMemories.forEach(mem => {
          const meta = mem.metadata || {};
          console.log(`   - ${mem.title}: ${mem.content.length} chars`);
          if (meta.captureType) {
            console.log(`     Type: ${meta.captureType}`);
          }
          if (meta.sessionId) {
            console.log(`     Session: ${meta.sessionId.substring(0, 12)}...`);
          }
        });

        if (testMemories.length > 0) {
          this.logPass(`${testMemories.length} memories actually saved in API`);
        } else {
          this.logFail('No test memories found in API despite success messages');
        }
      } else {
        this.logFail('Could not verify API saves - API error');
      }
    } catch (error) {
      this.logFail(`API verification failed: ${error.message}`);
    }
  }

  async verifyMemoryInApi(memoryId) {
    try {
      const response = await fetch(`https://api.purmemo.ai/api/v5/memories/${memoryId}`, {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
      });
      
      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch {
      return null;
    }
  }

  async findSessionMemories(sessionId) {
    try {
      const response = await fetch(`https://api.purmemo.ai/api/v5/memories/?query=session:${sessionId}&page_size=20`, {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.results || data.memories || [];
      }
      return [];
    } catch {
      return [];
    }
  }

  async getRecentMemories() {
    try {
      const response = await fetch(`https://api.purmemo.ai/api/v5/memories/?page_size=5`, {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.results || data.memories || [];
      }
      return [];
    } catch {
      return [];
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
    console.log('🎯 BRUTAL HONESTY TEST RESULTS\n');
    console.log(`✅ Passed: ${this.testResults.passed}`);
    console.log(`❌ Failed: ${this.testResults.failed}`);
    console.log(`📊 Success Rate: ${Math.round(this.testResults.passed / (this.testResults.passed + this.testResults.failed) * 100)}%\n`);

    if (this.testResults.failed > 0) {
      console.log('❌ FAILURES:');
      this.testResults.details.filter(d => d.type === 'FAIL').forEach(d => {
        console.log(`   - ${d.message}`);
      });
    }

    console.log('\n🏆 OVERALL ASSESSMENT:');
    if (this.testResults.failed === 0) {
      console.log('   ✅ ULTIMATE SERVER IS WORKING CORRECTLY');
      console.log('   All features tested and verified against actual API');
    } else if (this.testResults.passed > this.testResults.failed) {
      console.log('   ⚠️ MOSTLY WORKING WITH SOME ISSUES');
      console.log('   Core functionality works but needs fixes');
    } else {
      console.log('   ❌ SIGNIFICANT PROBLEMS DETECTED');
      console.log('   More failures than successes - major fixes needed');
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run brutal honesty test
const test = new UltimateServerTest();
test.run().catch(console.error);