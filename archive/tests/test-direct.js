#!/usr/bin/env node
/**
 * Direct test of Enhanced Purmemo MCP Server
 * Simulates what Claude Desktop would send
 */

import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

const TEST_API_KEY = '***REMOVED***';

// Color helpers
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`
};

// Test cases
const testCases = [
  {
    name: 'List Tools',
    request: {
      jsonrpc: '2.0',
      method: 'tools/list',
      id: 1
    }
  },
  {
    name: 'Basic Memory',
    request: {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'memory',
        arguments: {
          content: 'Test from direct test script',
          title: 'Direct Test',
          tags: ['test', 'direct']
        }
      },
      id: 2
    }
  },
  {
    name: 'Enhanced Conversation Memory',
    request: {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'memory_conversation',
        arguments: {
          user_prompt: 'How do I test the enhanced MCP server?',
          ai_response: 'You can test it using direct JSON-RPC calls like this script does',
          conversation_type: 'testing',
          project_name: 'Enhanced MCP Testing',
          key_decisions: ['Test directly', 'Verify all tools'],
          action_items: ['Run tests', 'Check results'],
          tags: ['test', 'enhanced', 'conversation']
        }
      },
      id: 3
    }
  },
  {
    name: 'Start Session',
    request: {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'start_session',
        arguments: {
          project_name: 'Direct Testing',
          session_type: 'testing',
          goals: ['Test enhanced tools', 'Verify functionality']
        }
      },
      id: 4
    }
  },
  {
    name: 'Recall Memories',
    request: {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'recall',
        arguments: {
          query: 'test',
          limit: 3
        }
      },
      id: 5
    }
  }
];

async function runTest() {
  console.log(colors.blue('=== Direct Enhanced MCP Server Test ===\n'));
  
  // Start the server
  console.log(colors.yellow('Starting enhanced server...'));
  const server = spawn('node', ['src/enhanced-server.js'], {
    env: {
      ...process.env,
      PURMEMO_API_KEY: TEST_API_KEY
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let results = [];
  let responseBuffer = '';

  // Handle server output
  server.stdout.on('data', (data) => {
    responseBuffer += data.toString();
    
    // Try to parse complete JSON responses
    const lines = responseBuffer.split('\n');
    responseBuffer = lines[lines.length - 1]; // Keep incomplete line
    
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (line && line.startsWith('{')) {
        try {
          const response = JSON.parse(line);
          results.push(response);
          
          // Find matching test
          const test = testCases.find(t => t.request.id === response.id);
          if (test) {
            if (response.error) {
              console.log(colors.red(`✗ ${test.name}: ${response.error.message}`));
            } else {
              console.log(colors.green(`✓ ${test.name}`));
              if (response.result) {
                // Show key info
                if (test.name === 'List Tools') {
                  console.log(`  Found ${response.result.tools?.length || 0} tools`);
                  response.result.tools?.forEach(tool => {
                    console.log(`    - ${tool.name}`);
                  });
                } else if (response.result.content?.[0]?.text) {
                  const text = response.result.content[0].text;
                  const firstLine = text.split('\n')[0];
                  console.log(`  ${firstLine.substring(0, 60)}...`);
                }
              }
            }
          }
        } catch (e) {
          // Not valid JSON yet, continue
        }
      }
    }
  });

  server.stderr.on('data', (data) => {
    console.error(colors.red(`Server error: ${data.toString()}`));
  });

  // Wait for server to start
  await setTimeout(1000);

  // Send test requests
  console.log(colors.yellow('\nRunning tests...\n'));
  
  for (const test of testCases) {
    console.log(colors.blue(`Sending: ${test.name}`));
    server.stdin.write(JSON.stringify(test.request) + '\n');
    await setTimeout(500); // Give server time to process
  }

  // Wait for responses
  await setTimeout(2000);

  // Summary
  console.log(colors.blue('\n=== Test Summary ==='));
  console.log(`Total tests: ${testCases.length}`);
  console.log(`Responses received: ${results.length}`);
  
  const successful = results.filter(r => !r.error).length;
  const failed = results.filter(r => r.error).length;
  
  console.log(colors.green(`Successful: ${successful}`));
  console.log(colors.red(`Failed: ${failed}`));

  // Cleanup
  server.kill();
  
  // Exit code
  process.exit(failed > 0 ? 1 : 0);
}

runTest().catch(console.error);