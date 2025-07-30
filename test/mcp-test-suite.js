#!/usr/bin/env node

/**
 * Automated MCP Test Suite
 * Tests all tools programmatically without UI
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

// Test configuration
const TEST_CONFIG = {
  serverCommand: 'node',
  serverArgs: [path.join(__dirname, '..', 'bin', 'puo-memo-mcp')],
  env: {
    PUO_MEMO_API_URL: process.env.PUO_MEMO_API_URL || 'http://localhost:8000',
    PUO_MEMO_API_KEY: process.env.PUO_MEMO_API_KEY || 'test-api-key',
    PYTHONUNBUFFERED: '1'
  }
};

// Test data
const TEST_DATA = {
  memory: {
    valid: {
      content: 'Test memory from automated suite',
      title: 'Automated Test Memory',
      tags: ['test', 'automated', 'mcp-suite']
    },
    invalid: {
      missingContent: { title: 'Missing content' },
      emptyContent: { content: '', title: 'Empty content' },
      invalidTags: { content: 'Test', tags: 'not-an-array' }
    }
  },
  recall: {
    valid: {
      query: 'test',
      limit: 5
    },
    invalid: {
      missingQuery: { limit: 10 },
      emptyQuery: { query: '' },
      invalidLimit: { query: 'test', limit: 'not-a-number' }
    }
  },
  entities: {
    valid: {
      listAll: {},
      byName: { entity_name: 'test-entity' },
      byType: { entity_type: 'person' }
    },
    invalid: {
      invalidType: { entity_type: 'invalid-type' },
      invalidParams: { unknown_param: 'value' }
    }
  }
};

// Test results
const testResults = {
  startTime: new Date().toISOString(),
  endTime: null,
  serverInfo: null,
  tools: [],
  testCases: [],
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0
  }
};

// Utility functions
function log(message, type = 'info') {
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    error: '\x1b[31m',
    warning: '\x1b[33m',
    reset: '\x1b[0m'
  };
  
  const prefix = {
    info: '📋',
    success: '✅',
    error: '❌',
    warning: '⚠️'
  };
  
  console.log(`${colors[type]}${prefix[type]} ${message}${colors.reset}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Main test class
class MCPTestSuite {
  constructor() {
    this.client = null;
    this.transport = null;
    this.serverProcess = null;
  }

  async initialize() {
    log('Starting MCP server...', 'info');
    
    // Spawn server process
    this.serverProcess = spawn(
      TEST_CONFIG.serverCommand,
      TEST_CONFIG.serverArgs,
      {
        env: { ...process.env, ...TEST_CONFIG.env },
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );

    // Create transport
    this.transport = new StdioClientTransport({
      command: TEST_CONFIG.serverCommand,
      args: TEST_CONFIG.serverArgs,
      env: TEST_CONFIG.env
    });

    // Create client
    this.client = new Client({
      name: 'mcp-test-suite',
      version: '1.0.0'
    }, {
      capabilities: {}
    });

    // Handle server stderr
    this.serverProcess.stderr.on('data', (data) => {
      console.error('[SERVER]', data.toString());
    });

    // Connect to server
    await this.client.connect(this.transport);
    
    // Initialize
    const initResult = await this.client.initialize();
    testResults.serverInfo = initResult;
    
    log(`Connected to ${initResult.serverInfo.name} v${initResult.serverInfo.version}`, 'success');
    
    return initResult;
  }

  async listTools() {
    log('Fetching available tools...', 'info');
    
    const tools = await this.client.listTools();
    testResults.tools = tools.tools;
    
    log(`Found ${tools.tools.length} tools:`, 'success');
    tools.tools.forEach(tool => {
      log(`  - ${tool.name}: ${tool.description}`, 'info');
    });
    
    return tools.tools;
  }

  async testTool(toolName, testCase) {
    const result = {
      tool: toolName,
      testCase: testCase.name,
      status: 'pending',
      request: testCase.params,
      response: null,
      error: null,
      duration: 0
    };

    const startTime = Date.now();

    try {
      log(`Testing ${toolName} - ${testCase.name}`, 'info');
      
      const response = await this.client.callTool({
        name: toolName,
        arguments: testCase.params
      });

      result.response = response;
      result.status = testCase.shouldFail ? 'failed' : 'passed';
      
      if (testCase.validate) {
        const validationResult = testCase.validate(response);
        if (!validationResult.valid) {
          result.status = 'failed';
          result.error = validationResult.error;
        }
      }
      
      if (result.status === 'passed') {
        log(`  ✓ ${testCase.name}`, 'success');
      } else {
        log(`  ✗ ${testCase.name}: ${result.error}`, 'error');
      }
      
    } catch (error) {
      result.error = error.message;
      result.status = testCase.shouldFail ? 'passed' : 'failed';
      
      if (testCase.shouldFail) {
        log(`  ✓ ${testCase.name} (expected failure)`, 'success');
      } else {
        log(`  ✗ ${testCase.name}: ${error.message}`, 'error');
      }
    }

    result.duration = Date.now() - startTime;
    testResults.testCases.push(result);
    testResults.summary.total++;
    testResults.summary[result.status]++;

    return result;
  }

  async runTestSuite() {
    log('\n=== MCP Test Suite Starting ===\n', 'info');

    // Phase 1: Analyze
    log('PHASE 1: ANALYZE - Discovering server capabilities', 'info');
    await this.initialize();
    const tools = await this.listTools();

    // Phase 2: Plan
    log('\nPHASE 2: PLAN - Creating test cases', 'info');
    const testPlan = this.createTestPlan(tools);
    log(`Created ${testPlan.length} test cases`, 'success');

    // Phase 3: Execute
    log('\nPHASE 3: EXECUTE - Running tests', 'info');
    
    for (const toolTests of testPlan) {
      log(`\nTesting tool: ${toolTests.tool}`, 'info');
      
      for (const testCase of toolTests.tests) {
        await this.testTool(toolTests.tool, testCase);
        await sleep(100); // Prevent overwhelming the server
      }
    }

    // Phase 4: Monitor
    log('\nPHASE 4: MONITOR - Analyzing results', 'info');
    await this.analyzeResults();

    // Cleanup
    await this.cleanup();
  }

  createTestPlan(tools) {
    const plan = [];

    // Test each discovered tool
    for (const tool of tools) {
      const toolTests = {
        tool: tool.name,
        tests: []
      };

      switch (tool.name) {
        case 'memory':
          // Valid cases
          toolTests.tests.push({
            name: 'Store simple memory',
            params: TEST_DATA.memory.valid,
            validate: (response) => ({
              valid: response.content[0]?.text?.includes('successfully'),
              error: 'Memory not stored successfully'
            })
          });

          // Invalid cases
          toolTests.tests.push({
            name: 'Missing content field',
            params: TEST_DATA.memory.invalid.missingContent,
            shouldFail: true
          });

          toolTests.tests.push({
            name: 'Empty content',
            params: TEST_DATA.memory.invalid.emptyContent,
            shouldFail: false // API might accept empty content
          });

          break;

        case 'recall':
          // Valid cases
          toolTests.tests.push({
            name: 'Search with query',
            params: TEST_DATA.recall.valid,
            validate: (response) => ({
              valid: response.content[0]?.text !== undefined,
              error: 'No response content'
            })
          });

          // Invalid cases
          toolTests.tests.push({
            name: 'Missing query field',
            params: TEST_DATA.recall.invalid.missingQuery,
            shouldFail: true
          });

          toolTests.tests.push({
            name: 'Empty query',
            params: TEST_DATA.recall.invalid.emptyQuery,
            shouldFail: false // API might accept empty query
          });

          break;

        case 'entities':
          // Valid cases
          toolTests.tests.push({
            name: 'List all entities',
            params: TEST_DATA.entities.valid.listAll,
            validate: (response) => ({
              valid: response.content[0]?.text !== undefined,
              error: 'No response content'
            })
          });

          toolTests.tests.push({
            name: 'Filter by type',
            params: TEST_DATA.entities.valid.byType,
            validate: (response) => ({
              valid: response.content[0]?.text !== undefined,
              error: 'No response content'
            })
          });

          // Invalid cases
          toolTests.tests.push({
            name: 'Invalid entity type',
            params: TEST_DATA.entities.invalid.invalidType,
            shouldFail: false // API might just return empty results
          });

          break;
      }

      if (toolTests.tests.length > 0) {
        plan.push(toolTests);
      }
    }

    return plan;
  }

  async analyzeResults() {
    testResults.endTime = new Date().toISOString();

    log('\n=== Test Summary ===', 'info');
    log(`Total tests: ${testResults.summary.total}`, 'info');
    log(`Passed: ${testResults.summary.passed}`, 'success');
    log(`Failed: ${testResults.summary.failed}`, testResults.summary.failed > 0 ? 'error' : 'info');
    log(`Skipped: ${testResults.summary.skipped}`, 'info');

    const successRate = (testResults.summary.passed / testResults.summary.total * 100).toFixed(1);
    log(`\nSuccess rate: ${successRate}%`, successRate >= 80 ? 'success' : 'warning');

    // Analyze failures
    if (testResults.summary.failed > 0) {
      log('\nFailed tests:', 'error');
      testResults.testCases
        .filter(tc => tc.status === 'failed' && !tc.testCase.includes('expected failure'))
        .forEach(tc => {
          log(`  - ${tc.tool}/${tc.testCase}: ${tc.error}`, 'error');
        });
    }

    // Performance analysis
    const avgDuration = testResults.testCases.reduce((sum, tc) => sum + tc.duration, 0) / testResults.testCases.length;
    log(`\nAverage test duration: ${avgDuration.toFixed(0)}ms`, 'info');

    // Save report
    await this.saveReport();
  }

  async saveReport() {
    const reportPath = path.join(__dirname, '..', 'test-report.json');
    
    try {
      await fs.writeFile(reportPath, JSON.stringify(testResults, null, 2));
      log(`\nTest report saved to: ${reportPath}`, 'success');
    } catch (error) {
      log(`Failed to save report: ${error.message}`, 'error');
    }
  }

  async cleanup() {
    log('\nCleaning up...', 'info');
    
    if (this.client) {
      await this.client.close();
    }
    
    if (this.serverProcess) {
      this.serverProcess.kill();
    }
    
    log('Test suite completed', 'success');
  }
}

// Error handling
process.on('unhandledRejection', (error) => {
  log(`Unhandled error: ${error.message}`, 'error');
  console.error(error);
  process.exit(1);
});

// Run test suite
async function main() {
  const suite = new MCPTestSuite();
  
  try {
    await suite.runTestSuite();
    process.exit(testResults.summary.failed > 0 ? 1 : 0);
  } catch (error) {
    log(`Test suite failed: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
  }
}

// Check if MCP SDK is installed
try {
  require.resolve('@modelcontextprotocol/sdk');
} catch (error) {
  log('MCP SDK not found. Installing...', 'warning');
  const { execSync } = require('child_process');
  execSync('npm install @modelcontextprotocol/sdk', { stdio: 'inherit' });
}

// Run the test suite
main();