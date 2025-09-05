#!/usr/bin/env node
/**
 * Comprehensive Test Suite for Smart Purmemo MCP Server
 * Tests all features including auto-extraction and edge cases
 */

import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';
import { writeFileSync } from 'fs';

const TEST_API_KEY = '***REMOVED***';

// Color helpers
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  gray: (text) => `\x1b[90m${text}\x1b[0m`
};

// Test report structure
const testReport = {
  server: 'smart-server.js',
  timestamp: new Date().toISOString(),
  tests: [],
  summary: {
    total: 0,
    passed: 0,
    failed: 0
  }
};

// Comprehensive test cases
const testCases = [
  // BASIC FUNCTIONALITY
  {
    name: 'List Tools',
    request: {
      jsonrpc: '2.0',
      method: 'tools/list',
      id: 1
    },
    validate: (response) => {
      return response.result?.tools?.length === 3 &&
             response.result.tools.some(t => t.name === 'memory') &&
             response.result.tools.some(t => t.name === 'recall') &&
             response.result.tools.some(t => t.name === 'update_context');
    }
  },
  
  // CONTEXT MANAGEMENT
  {
    name: 'Update Context',
    request: {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'update_context',
        arguments: {
          project: 'Smart MCP Testing',
          stage: 'testing',
          goals: ['Verify all features', 'Test edge cases']
        }
      },
      id: 2
    },
    validate: (response) => {
      const text = response.result?.content?.[0]?.text || '';
      return text.includes('Context updated') && text.includes('Smart MCP Testing');
    }
  },
  
  // SIMPLE MEMORY
  {
    name: 'Simple Memory Save',
    request: {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'memory',
        arguments: {
          content: 'Simple test memory',
          title: 'Test',
          tags: ['test']
        }
      },
      id: 3
    },
    validate: (response) => {
      const text = response.result?.content?.[0]?.text || '';
      return text.includes('✅') && text.includes('saved');
    }
  },
  
  // AUTO-EXTRACTION: CODE
  {
    name: 'Auto-Extract Code',
    request: {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'memory',
        arguments: {
          content: `Save this conversation with code:
\`\`\`javascript
function test() {
  return true;
}
\`\`\`
And Python:
\`\`\`python
def test():
    return True
\`\`\``
        }
      },
      id: 4
    },
    validate: (response) => {
      const text = response.result?.content?.[0]?.text || '';
      return text.includes('saved') && (text.includes('code') || text.includes('coding'));
    }
  },
  
  // AUTO-EXTRACTION: FILES
  {
    name: 'Auto-Extract Files',
    request: {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'memory',
        arguments: {
          content: `Modified files:
- /src/server.js
- ~/projects/test.py
- ./package.json`
        }
      },
      id: 5
    },
    validate: (response) => {
      const text = response.result?.content?.[0]?.text || '';
      return text.includes('saved');
    }
  },
  
  // FULL CONVERSATION
  {
    name: 'Full Conversation',
    request: {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'memory',
        arguments: {
          content: 'Save this conversation about testing MCP'
        }
      },
      id: 6
    },
    validate: (response) => {
      const text = response.result?.content?.[0]?.text || '';
      return text.includes('saved') || text.includes('Conversation saved');
    }
  },
  
  // RECALL
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
      id: 7
    },
    validate: (response) => {
      const text = response.result?.content?.[0]?.text || '';
      return text.includes('Found') || text.includes('memories');
    }
  },
  
  // ERROR CASES
  {
    name: 'Memory Missing Content',
    request: {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'memory',
        arguments: {
          title: 'No content'
        }
      },
      id: 8
    },
    validate: (response) => {
      return response.error !== undefined;
    },
    expectError: true
  },
  
  {
    name: 'Invalid Tool',
    request: {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'invalid_tool',
        arguments: {}
      },
      id: 9
    },
    validate: (response) => {
      const text = response.result?.content?.[0]?.text || '';
      return text.includes('Unknown tool') || response.error !== undefined;
    },
    expectError: true
  }
];

async function runTests() {
  console.log(colors.blue('=== Smart MCP Server Test Suite ===\n'));
  
  // Start server
  console.log(colors.yellow('Starting smart-server.js...'));
  const server = spawn('node', ['src/smart-server.js'], {
    env: {
      ...process.env,
      PURMEMO_API_KEY: TEST_API_KEY
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let responseBuffer = '';
  const responses = new Map();

  // Handle server output
  server.stdout.on('data', (data) => {
    responseBuffer += data.toString();
    const lines = responseBuffer.split('\n');
    responseBuffer = lines[lines.length - 1];
    
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (line && line.startsWith('{')) {
        try {
          const response = JSON.parse(line);
          responses.set(response.id, response);
        } catch (e) {
          // Not valid JSON
        }
      }
    }
  });

  server.stderr.on('data', (data) => {
    if (!data.toString().includes('ExperimentalWarning')) {
      console.error(colors.red(`Server error: ${data.toString()}`));
    }
  });

  // Wait for server startup
  await setTimeout(1000);

  // Run tests
  console.log(colors.yellow('\nRunning tests...\n'));
  
  for (const test of testCases) {
    // Send request
    server.stdin.write(JSON.stringify(test.request) + '\n');
    
    // Wait for response
    await setTimeout(500);
    
    // Check response
    const response = responses.get(test.request.id);
    let passed = false;
    let message = '';
    
    if (!response) {
      message = 'No response received';
    } else if (test.validate) {
      passed = test.validate(response);
      if (!passed) {
        message = response.error?.message || 'Validation failed';
      }
    } else {
      passed = !response.error;
    }
    
    // Record result
    testReport.tests.push({
      name: test.name,
      passed,
      message,
      expectError: test.expectError || false
    });
    
    testReport.summary.total++;
    if ((passed && !test.expectError) || (!passed && test.expectError)) {
      testReport.summary.passed++;
      console.log(colors.green(`✓ ${test.name}`));
    } else {
      testReport.summary.failed++;
      console.log(colors.red(`✗ ${test.name}: ${message}`));
    }
  }
  
  // Generate report
  console.log(colors.blue('\n=== Test Summary ==='));
  console.log(`Total: ${testReport.summary.total}`);
  console.log(colors.green(`Passed: ${testReport.summary.passed}`));
  console.log(colors.red(`Failed: ${testReport.summary.failed}`));
  
  const passRate = ((testReport.summary.passed / testReport.summary.total) * 100).toFixed(1);
  console.log(`Pass Rate: ${passRate}%`);
  
  // Save report
  writeFileSync('test-report-smart.json', JSON.stringify(testReport, null, 2));
  console.log(colors.blue('\nReport saved to test-report-smart.json'));
  
  // Cleanup
  server.kill();
  
  // Exit code
  process.exit(testReport.summary.failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
