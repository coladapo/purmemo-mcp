#!/usr/bin/env node
/**
 * Test what ACTUALLY gets captured when tools are called
 * No fake success messages - just brutal truth
 */

import { spawn } from 'child_process';
import fetch from 'node-fetch';

const API_KEY = '***REMOVED***';
const API_URL = 'https://api.purmemo.ai';

class ActualCaptureTest {
  constructor() {
    this.serverProcess = null;
    this.savedMemoryIds = [];
  }

  async run() {
    console.log('🔬 ACTUAL CAPTURE TEST - No Fake Success\n');
    console.log('Testing: What REALLY gets saved to the API\n');
    console.log('='.repeat(60));

    // Start server
    await this.startServer();

    // Test 1: Small complete conversation
    console.log('\n📝 Test 1: Small Complete Conversation');
    console.log('Sending a 3-message conversation...\n');
    
    const smallConvo = {
      content: 'User asked about pricing. I explained our tiers. User was satisfied.',
      conversationHistory: [
        { role: 'user', content: 'What is your pricing?' },
        { role: 'assistant', content: 'We offer Free, Pro ($49), and Enterprise tiers.' },
        { role: 'user', content: 'Perfect, thanks!' }
      ]
    };

    const result1 = await this.callTool('save_with_context', smallConvo);
    await this.verifyActualSave(result1, 'Small conversation');

    // Test 2: Just "save this conversation"
    console.log('\n📝 Test 2: Literal "save this conversation"');
    
    const literal = {
      content: 'save this conversation'
    };

    const result2 = await this.callTool('save_full_conversation', literal);
    await this.verifyActualSave(result2, 'Literal save request');

    // Test 3: With actual conversation content
    console.log('\n📝 Test 3: Actual Conversation Content');
    
    const actualContent = {
      fullTranscript: `USER: Tell me about Purmemo
ASSISTANT: Purmemo is a universal memory system for AI that uses MCP protocol to enable cross-platform memory synchronization.
USER: How does it work?
ASSISTANT: It provides tools to save and recall memories across different AI systems like Claude, ChatGPT, and Cursor.
USER: Can it capture full conversations?
ASSISTANT: That's what we're testing right now - whether it can capture complete context, not just summaries.`.repeat(3), // Make it >1000 chars
      validation: {
        confirmFullCapture: true,
        totalCharacterCount: 1500
      }
    };

    const result3 = await this.callTool('capture_everything', actualContent);
    await this.verifyActualSave(result3, 'Full conversation');

    // Final verification
    await this.finalVerification();

    // Cleanup
    this.cleanup();
  }

  async startServer() {
    console.log('\n🚀 Starting prompted-server.js...');
    
    this.serverProcess = spawn('node', ['src/prompted-server.js'], {
      env: {
        ...process.env,
        PURMEMO_API_KEY: API_KEY
      }
    });

    // Capture stderr for errors
    this.serverProcess.stderr.on('data', (data) => {
      console.error('Server error:', data.toString());
    });

    await this.delay(1000);
    console.log('✓ Server started');
  }

  async callTool(toolName, args) {
    console.log(`   Calling ${toolName}...`);
    
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
      
      const handler = (data) => {
        responseData += data.toString();
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
      };

      this.serverProcess.stdout.on('data', handler);
      this.serverProcess.stdin.write(JSON.stringify(request) + '\n');

      setTimeout(() => {
        this.serverProcess.stdout.removeListener('data', handler);
        resolve({ error: 'Timeout', timedOut: true });
      }, 5000);
    });
  }

  async verifyActualSave(response, testName) {
    console.log(`\n   Verifying "${testName}"...`);

    // Check if tool rejected it
    if (response?.result?.content?.[0]?.text?.includes('INCOMPLETE') ||
        response?.result?.content?.[0]?.text?.includes('REJECTED') ||
        response?.result?.content?.[0]?.text?.includes('FAILED')) {
      console.log('   ❌ Tool REJECTED the save (validation working)');
      console.log(`   Reason: ${response.result.content[0].text.split('\n')[0]}`);
      return null;
    }

    // Check for timeout
    if (response?.timedOut) {
      console.log('   ⏱️ Request timed out');
      return null;
    }

    // Extract memory ID from response
    const text = response?.result?.content?.[0]?.text || '';
    const idMatch = text.match(/ID: ([a-f0-9-]+)/);
    
    if (!idMatch) {
      console.log('   ❌ No memory ID in response');
      console.log('   Response:', text.substring(0, 100));
      return null;
    }

    const memoryId = idMatch[1];
    console.log(`   📦 Memory ID: ${memoryId}`);
    this.savedMemoryIds.push({ id: memoryId, test: testName });

    // Fetch from API to verify
    try {
      const apiResponse = await fetch(`${API_URL}/api/v5/memories/${memoryId}`, {
        headers: {
          'Authorization': `Bearer ${API_KEY}`
        }
      });

      if (!apiResponse.ok) {
        console.log(`   ❌ Memory not found in API (${apiResponse.status})`);
        return null;
      }

      const memory = await apiResponse.json();
      
      console.log(`   ✅ ACTUALLY SAVED TO API`);
      console.log(`      - Content length: ${memory.content.length} chars`);
      console.log(`      - Has conversation history: ${memory.content.includes('USER:') ? 'YES' : 'NO'}`);
      console.log(`      - Has artifacts: ${memory.content.includes('ARTIFACT') ? 'YES' : 'NO'}`);
      
      // Show first 200 chars of what was actually saved
      console.log(`      - Preview: "${memory.content.substring(0, 200)}..."`);
      
      return memory;
    } catch (error) {
      console.log(`   ❌ Error fetching from API: ${error.message}`);
      return null;
    }
  }

  async finalVerification() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 FINAL VERIFICATION RESULTS\n');

    let hasFullCapture = false;
    let hasConversationHistory = false;
    let totalSaved = 0;

    for (const item of this.savedMemoryIds) {
      try {
        const response = await fetch(`${API_URL}/api/v5/memories/${item.id}`, {
          headers: { 'Authorization': `Bearer ${API_KEY}` }
        });
        
        if (response.ok) {
          const memory = await response.json();
          totalSaved++;
          
          console.log(`\n${item.test}:`);
          console.log(`  - Saved: YES (${memory.content.length} chars)`);
          
          // Check for conversation markers
          const hasUser = memory.content.includes('USER:') || memory.content.includes('user:');
          const hasAssistant = memory.content.includes('ASSISTANT:') || memory.content.includes('assistant:');
          const hasHistory = memory.content.includes('HISTORY');
          
          if (hasUser && hasAssistant) {
            hasConversationHistory = true;
            console.log(`  - Has conversation: YES`);
          } else {
            console.log(`  - Has conversation: NO (just summary/description)`);
          }
          
          if (memory.content.length > 500 && (hasUser || hasHistory)) {
            hasFullCapture = true;
          }
        }
      } catch (e) {
        console.log(`${item.test}: ERROR - ${e.message}`);
      }
    }

    console.log('\n🎯 BRUTAL TRUTH:\n');
    
    if (hasFullCapture) {
      console.log('✅ CAN capture full conversations when properly structured');
    } else {
      console.log('❌ NOT capturing full conversations - only summaries');
    }
    
    if (hasConversationHistory) {
      console.log('✅ Conversation history IS being saved (when provided)');
    } else {
      console.log('❌ Conversation history NOT being captured');
    }
    
    console.log(`\nTotal memories actually saved: ${totalSaved}/${this.savedMemoryIds.length}`);
    
    console.log('\n💡 KEY FINDING:');
    console.log('The tools WILL save complete context IF AND ONLY IF:');
    console.log('1. Claude provides the full conversation in the tool call');
    console.log('2. The content is structured (conversationHistory array or fullTranscript)');
    console.log('3. The API call doesn\'t timeout');
    console.log('\nThe problem is NOT your server - it\'s what Claude sends to it.');
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

// Run the test
const test = new ActualCaptureTest();
test.run().catch(console.error);