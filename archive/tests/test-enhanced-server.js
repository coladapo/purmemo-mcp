#!/usr/bin/env node
/**
 * Automated MCP Test Suite for Enhanced Purmemo Server
 * Tests all tools programmatically using the MCP SDK
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';
import { writeFileSync } from 'fs';

// Test configuration
const TEST_CONFIG = {
  serverPath: './src/enhanced-server.js',
  apiKey: process.env.PURMEMO_API_KEY || '***REMOVED***',
  verbose: true
};

// Test results storage
const testResults = {
  timestamp: new Date().toISOString(),
  server: 'enhanced-server.js',
  tests: [],
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    errors: 0
  }
};

// Color output helpers
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  gray: (text) => `\x1b[90m${text}\x1b[0m`
};

// Log helper
function log(message, type = 'info') {
  const prefix = {
    'info': colors.blue('[INFO]'),
    'success': colors.green('[✓]'),
    'fail': colors.red('[✗]'),
    'error': colors.red('[ERROR]'),
    'test': colors.yellow('[TEST]')
  };
  console.log(`${prefix[type] || ''} ${message}`);
}

// Test runner
class MCPTestRunner {
  constructor() {
    this.client = null;
    this.transport = null;
    this.serverProcess = null;
  }

  async initialize() {
    log('Starting Enhanced Purmemo MCP Server...', 'info');
    
    try {
      // Spawn the server process
      this.serverProcess = spawn('node', [TEST_CONFIG.serverPath], {
        env: {
          ...process.env,
          PURMEMO_API_KEY: TEST_CONFIG.apiKey
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Create transport and client
      this.transport = new StdioClientTransport({
        command: 'node',
        args: [TEST_CONFIG.serverPath],
        env: {
          PURMEMO_API_KEY: TEST_CONFIG.apiKey
        }
      });

      this.client = new Client({
        name: 'mcp-test-client',
        version: '1.0.0'
      }, {
        capabilities: {}
      });

      // Connect client to transport
      await this.client.connect(this.transport);
      
      log('Successfully connected to MCP server', 'success');
      return true;
    } catch (error) {
      log(`Failed to initialize: ${error.message}`, 'error');
      return false;
    }
  }

  async listTools() {
    try {
      const response = await this.client.request({
        method: 'tools/list'
      });
      return response.tools;
    } catch (error) {
      log(`Failed to list tools: ${error.message}`, 'error');
      return [];
    }
  }

  async testTool(toolName, args, expectSuccess = true) {
    const startTime = Date.now();
    const test = {
      tool: toolName,
      args: args,
      expectSuccess: expectSuccess,
      startTime: new Date().toISOString()
    };

    try {
      log(`Testing tool: ${toolName}`, 'test');
      if (TEST_CONFIG.verbose) {
        log(colors.gray(`  Args: ${JSON.stringify(args, null, 2)}`));
      }

      const response = await this.client.request({
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      });

      const duration = Date.now() - startTime;
      test.duration = duration;
      test.success = true;
      test.response = response;

      if (expectSuccess) {
        log(`  ✓ Passed (${duration}ms)`, 'success');
      } else {
        log(`  ✗ Expected failure but succeeded`, 'fail');
        test.success = false;
      }

      testResults.tests.push(test);
      testResults.summary.total++;
      if (test.success) testResults.summary.passed++;
      else testResults.summary.failed++;

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      test.duration = duration;
      test.error = error.message;
      test.success = !expectSuccess; // If we expected failure, this is success

      if (!expectSuccess) {
        log(`  ✓ Failed as expected: ${error.message}`, 'success');
        testResults.summary.passed++;
      } else {
        log(`  ✗ Unexpected error: ${error.message}`, 'fail');
        testResults.summary.failed++;
      }

      testResults.tests.push(test);
      testResults.summary.total++;
      testResults.summary.errors++;

      return null;
    }
  }

  async runAllTests() {
    log('\n=== Starting Automated MCP Test Suite ===\n', 'info');

    // Test 1: List all tools
    log('TEST 1: List Available Tools', 'info');
    const tools = await this.listTools();
    log(`  Found ${tools.length} tools`, 'info');
    tools.forEach(tool => {
      log(colors.gray(`    - ${tool.name}: ${tool.description}`));
    });

    // Test 2: Basic memory tool
    log('\nTEST 2: Basic Memory Tool', 'info');
    await this.testTool('memory', {
      content: 'Test memory from automated test suite',
      title: 'Test Memory',
      tags: ['test', 'automated']
    });

    // Test 3: Memory with missing required field (should fail)
    log('\nTEST 3: Memory with Missing Required Field', 'info');
    await this.testTool('memory', {
      title: 'Missing content field'
    }, false);

    // Test 4: Enhanced conversation memory
    log('\nTEST 4: Enhanced Conversation Memory', 'info');
    const conversationResult = await this.testTool('memory_conversation', {
      user_prompt: 'How do I test MCP servers?',
      ai_response: 'You can test MCP servers using the SDK client programmatically',
      conversation_type: 'learning',
      project_name: 'MCP Testing',
      key_decisions: ['Use automated testing', 'Test all edge cases'],
      action_items: ['Create test suite', 'Run tests', 'Generate report'],
      evolution_notes: 'User learned about programmatic testing vs UI testing',
      tags: ['test', 'mcp', 'automated']
    });

    // Extract session ID if available
    let sessionId = null;
    if (conversationResult?.content?.[0]?.text) {
      const match = conversationResult.content[0].text.match(/Session:\*\* ([a-f0-9]+)/);
      if (match) sessionId = match[1];
    }

    // Test 5: Conversation memory with missing required fields
    log('\nTEST 5: Conversation Memory Missing Required Fields', 'info');
    await this.testTool('memory_conversation', {
      conversation_type: 'testing'
      // Missing user_prompt and ai_response
    }, false);

    // Test 6: Start session
    log('\nTEST 6: Start Session', 'info');
    const sessionResult = await this.testTool('start_session', {
      project_name: 'Automated Testing',
      session_type: 'testing',
      goals: ['Test all tools', 'Verify error handling', 'Generate report']
    });

    // Extract new session ID
    if (sessionResult?.content?.[0]?.text) {
      const match = sessionResult.content[0].text.match(/Session ID:\*\* ([a-f0-9]+)/);
      if (match) sessionId = match[1];
      log(`  Session ID: ${sessionId}`, 'info');
    }

    // Test 7: End session
    if (sessionId) {
      log('\nTEST 7: End Session', 'info');
      await this.testTool('end_session', {
        session_id: sessionId,
        summary: 'Completed automated testing',
        outcomes: ['All tools tested', 'Error cases verified'],
        next_steps: ['Review test report', 'Fix any failures']
      });
    }

    // Test 8: End non-existent session (should fail)
    log('\nTEST 8: End Non-Existent Session', 'info');
    await this.testTool('end_session', {
      session_id: 'nonexistent123',
      summary: 'This should fail'
    }, false);

    // Test 9: Code memory
    log('\nTEST 9: Code Memory', 'info');
    await this.testTool('memory_code', {
      problem_statement: 'Create a function to test MCP servers',
      code: 'async function testMCP(serverPath) { /* test code */ }',
      language: 'javascript',
      explanation: 'This function tests MCP servers programmatically',
      dependencies: ['@modelcontextprotocol/sdk'],
      tags: ['test', 'code', 'mcp']
    });

    // Test 10: Project evolution
    log('\nTEST 10: Project Evolution Memory', 'info');
    await this.testTool('memory_project_evolution', {
      project_name: 'Purmemo MCP',
      evolution_stage: 'testing',
      original_vision: 'Simple memory storage',
      current_vision: 'Full conversation context capture with threading',
      changes_from_last: ['Added enhanced tools', 'Implemented session management'],
      learnings: ['MCP can access full conversation context', 'Sessions enable threading'],
      tags: ['evolution', 'project', 'test']
    });

    // Test 11: Recall memories
    log('\nTEST 11: Recall Memories', 'info');
    await this.testTool('recall', {
      query: 'test',
      limit: 5
    });

    // Test 12: Recall with invalid limit
    log('\nTEST 12: Recall with Invalid Limit', 'info');
    await this.testTool('recall', {
      query: 'test',
      limit: -1
    }, false);

    // Test 13: Project recall
    log('\nTEST 13: Project Recall', 'info');
    await this.testTool('recall_project', {
      project_name: 'MCP Testing',
      include_evolution: true
    });

    // Test 14: Invalid tool name
    log('\nTEST 14: Invalid Tool Name', 'info');
    await this.testTool('nonexistent_tool', {
      some: 'data'
    }, false);

    // Test 15: Very long content (test content limits)
    log('\nTEST 15: Large Content Test', 'info');
    const longContent = 'x'.repeat(50000); // 50k characters
    await this.testTool('memory', {
      content: longContent,
      title: 'Large content test',
      tags: ['test', 'limits']
    });
  }

  async cleanup() {
    log('\nCleaning up...', 'info');
    
    if (this.client) {
      await this.client.close();
    }
    
    if (this.transport) {
      await this.transport.close();
    }
    
    if (this.serverProcess) {
      this.serverProcess.kill();
    }
  }

  generateReport() {
    const report = {
      ...testResults,
      duration: Date.now() - new Date(testResults.timestamp).getTime(),
      environment: {
        node: process.version,
        platform: process.platform,
        serverPath: TEST_CONFIG.serverPath
      }
    };

    // Console summary
    console.log('\n' + '='.repeat(50));
    console.log(colors.blue('TEST SUMMARY'));
    console.log('='.repeat(50));
    console.log(`Total Tests: ${report.summary.total}`);
    console.log(colors.green(`Passed: ${report.summary.passed}`));
    console.log(colors.red(`Failed: ${report.summary.failed}`));
    console.log(colors.yellow(`Errors: ${report.summary.errors}`));
    console.log(`Duration: ${report.duration}ms`);
    
    const passRate = (report.summary.passed / report.summary.total * 100).toFixed(1);
    console.log(`Pass Rate: ${passRate}%`);
    
    if (report.summary.failed > 0) {
      console.log('\n' + colors.red('Failed Tests:'));
      report.tests.filter(t => !t.success).forEach(test => {
        console.log(colors.red(`  - ${test.tool}: ${test.error || 'Unexpected success'}`));
      });
    }

    // Save detailed report to JSON
    const reportPath = './test-report.json';
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n${colors.blue('[INFO]')} Detailed report saved to: ${reportPath}`);

    return report;
  }
}

// Main execution
async function main() {
  const runner = new MCPTestRunner();
  
  try {
    // Initialize connection
    const initialized = await runner.initialize();
    if (!initialized) {
      log('Failed to initialize test runner', 'error');
      process.exit(1);
    }

    // Run all tests
    await runner.runAllTests();

    // Generate report
    const report = runner.generateReport();

    // Exit code based on test results
    const exitCode = report.summary.failed > 0 ? 1 : 0;
    
    // Cleanup
    await runner.cleanup();
    
    process.exit(exitCode);
  } catch (error) {
    log(`Fatal error: ${error.message}`, 'error');
    console.error(error);
    await runner.cleanup();
    process.exit(1);
  }
}

// Run tests
main().catch(console.error);