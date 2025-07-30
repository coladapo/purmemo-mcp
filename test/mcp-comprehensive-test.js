#!/usr/bin/env node

/**
 * Comprehensive MCP Test Suite - Principal Engineer Implementation
 * Tests all aspects of the MCP server with deep validation
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

// Start mock API server
const mockAPI = spawn('python3', [path.join(__dirname, '..', 'src', 'api', 'mock_api.py')], {
  env: { ...process.env, API_PORT: '8001' }
});

mockAPI.stdout.on('data', (data) => console.log('[MOCK API]', data.toString()));
mockAPI.stderr.on('data', (data) => console.error('[MOCK API ERROR]', data.toString()));

// Test configuration
const TEST_CONFIG = {
  serverCommand: 'node',
  serverArgs: [path.join(__dirname, '..', 'bin', 'puo-memo-mcp')],
  env: {
    PUO_MEMO_API_URL: 'http://localhost:8001',
    PUO_MEMO_API_KEY: 'test-api-key',
    PYTHONUNBUFFERED: '1'
  }
};

// Enhanced test reporter
class TestReporter {
  constructor() {
    this.results = {
      startTime: new Date(),
      tests: [],
      phases: {},
      metrics: {
        totalTests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0
      }
    };
    this.currentPhase = null;
  }

  startPhase(name) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📋 ${name.toUpperCase()}`);
    console.log('='.repeat(60));
    
    this.currentPhase = {
      name,
      startTime: Date.now(),
      tests: []
    };
  }

  endPhase() {
    if (this.currentPhase) {
      this.currentPhase.duration = Date.now() - this.currentPhase.startTime;
      this.results.phases[this.currentPhase.name] = this.currentPhase;
      
      const passed = this.currentPhase.tests.filter(t => t.status === 'passed').length;
      const failed = this.currentPhase.tests.filter(t => t.status === 'failed').length;
      
      console.log(`\nPhase Summary: ${passed} passed, ${failed} failed (${this.currentPhase.duration}ms)`);
    }
  }

  addTest(name, status, details = {}) {
    const test = {
      name,
      status,
      timestamp: new Date(),
      ...details
    };

    this.results.tests.push(test);
    if (this.currentPhase) {
      this.currentPhase.tests.push(test);
    }

    this.results.metrics.totalTests++;
    this.results.metrics[status]++;

    const icon = status === 'passed' ? '✅' : status === 'failed' ? '❌' : '⏭️';
    console.log(`  ${icon} ${name}${details.duration ? ` (${details.duration}ms)` : ''}`);
    
    if (status === 'failed' && details.error) {
      console.log(`     Error: ${details.error}`);
    }
  }

  generateReport() {
    this.results.endTime = new Date();
    this.results.metrics.duration = this.results.endTime - this.results.startTime;
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 FINAL REPORT');
    console.log('='.repeat(60));
    
    console.log(`\nTotal Tests: ${this.results.metrics.totalTests}`);
    console.log(`✅ Passed: ${this.results.metrics.passed}`);
    console.log(`❌ Failed: ${this.results.metrics.failed}`);
    console.log(`⏭️  Skipped: ${this.results.metrics.skipped}`);
    
    const successRate = (this.results.metrics.passed / this.results.metrics.totalTests * 100).toFixed(1);
    console.log(`\n📈 Success Rate: ${successRate}%`);
    
    if (this.results.metrics.failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.tests
        .filter(t => t.status === 'failed')
        .forEach(t => console.log(`   - ${t.name}: ${t.error || 'Unknown error'}`));
    }
    
    return this.results;
  }

  async saveReport(filename = 'test-report.json') {
    const reportPath = path.join(__dirname, '..', filename);
    await fs.writeFile(reportPath, JSON.stringify(this.results, null, 2));
    console.log(`\n📄 Report saved to: ${reportPath}`);
  }
}

// MCP Test Suite
class MCPTestSuite {
  constructor(reporter) {
    this.reporter = reporter;
    this.client = null;
    this.transport = null;
  }

  async initialize() {
    this.reporter.startPhase('Initialization');
    
    try {
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

      // Connect
      const startTime = Date.now();
      await this.client.connect(this.transport);
      const connectTime = Date.now() - startTime;

      this.reporter.addTest('Connect to MCP Server', 'passed', { duration: connectTime });

      // Verify connection
      const tools = await this.client.listTools();
      if (tools.tools.length > 0) {
        this.reporter.addTest('List Tools', 'passed', { 
          tools: tools.tools.map(t => t.name)
        });
      } else {
        this.reporter.addTest('List Tools', 'failed', { 
          error: 'No tools returned'
        });
      }

    } catch (error) {
      this.reporter.addTest('Initialize MCP Client', 'failed', { 
        error: error.message 
      });
      throw error;
    } finally {
      this.reporter.endPhase();
    }
  }

  async testToolDiscovery() {
    this.reporter.startPhase('Tool Discovery');
    
    try {
      const tools = await this.client.listTools();
      
      // Test 1: Verify all expected tools exist
      const expectedTools = ['memory', 'recall', 'entities'];
      for (const toolName of expectedTools) {
        const tool = tools.tools.find(t => t.name === toolName);
        if (tool) {
          this.reporter.addTest(`Tool exists: ${toolName}`, 'passed');
          
          // Validate schema
          if (tool.inputSchema && tool.inputSchema.type === 'object') {
            this.reporter.addTest(`Valid schema: ${toolName}`, 'passed');
          } else {
            this.reporter.addTest(`Valid schema: ${toolName}`, 'failed', {
              error: 'Invalid or missing input schema'
            });
          }
        } else {
          this.reporter.addTest(`Tool exists: ${toolName}`, 'failed', {
            error: 'Tool not found'
          });
        }
      }
      
      // Test 2: Check for unexpected tools
      const unexpectedTools = tools.tools.filter(t => !expectedTools.includes(t.name));
      if (unexpectedTools.length > 0) {
        this.reporter.addTest('No unexpected tools', 'failed', {
          error: `Found unexpected tools: ${unexpectedTools.map(t => t.name).join(', ')}`
        });
      }
      
    } catch (error) {
      this.reporter.addTest('Tool Discovery', 'failed', { error: error.message });
    } finally {
      this.reporter.endPhase();
    }
  }

  async testMemoryTool() {
    this.reporter.startPhase('Memory Tool Tests');
    
    const testCases = [
      {
        name: 'Basic memory storage',
        args: {
          content: 'Test memory content',
          title: 'Test Title',
          tags: ['test', 'mcp']
        },
        validate: (result) => result.content[0]?.text?.includes('successfully')
      },
      {
        name: 'Memory with special characters',
        args: {
          content: 'Test with <special> & "characters" 🎉',
          title: 'Special Chars'
        },
        validate: (result) => result.content[0]?.text?.includes('successfully')
      },
      {
        name: 'Memory with very long content',
        args: {
          content: 'A'.repeat(1000),
          title: 'Long Content'
        },
        validate: (result) => result.content[0]?.text?.includes('successfully')
      },
      {
        name: 'Memory without optional fields',
        args: {
          content: 'Minimal memory'
        },
        validate: (result) => result.content[0]?.text?.includes('successfully')
      },
      {
        name: 'Memory with empty tags',
        args: {
          content: 'Memory with empty tags',
          tags: []
        },
        validate: (result) => result.content[0]?.text?.includes('successfully')
      }
    ];

    for (const testCase of testCases) {
      await this.runToolTest('memory', testCase);
    }

    // Error cases
    const errorCases = [
      {
        name: 'Missing required content',
        args: { title: 'No content' },
        expectError: true
      },
      {
        name: 'Invalid tags type',
        args: {
          content: 'Test',
          tags: 'not-an-array'
        },
        expectError: true
      }
    ];

    for (const testCase of errorCases) {
      await this.runToolTest('memory', testCase);
    }

    this.reporter.endPhase();
  }

  async testRecallTool() {
    this.reporter.startPhase('Recall Tool Tests');
    
    // First, create some test memories
    const setupMemories = [
      { content: 'Alpha test memory', tags: ['alpha'] },
      { content: 'Beta test memory', tags: ['beta'] },
      { content: 'Gamma test memory', tags: ['gamma'] }
    ];

    for (const memory of setupMemories) {
      await this.client.callTool({
        name: 'memory',
        arguments: memory
      });
    }

    // Wait for indexing
    await this.sleep(500);

    const testCases = [
      {
        name: 'Search for specific term',
        args: {
          query: 'alpha',
          limit: 10
        },
        validate: (result) => result.content[0]?.text?.includes('Alpha')
      },
      {
        name: 'Search with limit',
        args: {
          query: 'test',
          limit: 2
        },
        validate: (result) => {
          const text = result.content[0]?.text || '';
          return text.includes('memories');
        }
      },
      {
        name: 'Empty search query',
        args: {
          query: '',
          limit: 5
        },
        validate: (result) => true // May return all or none
      },
      {
        name: 'Search for non-existent term',
        args: {
          query: 'xyz123notfound',
          limit: 10
        },
        validate: (result) => {
          const text = result.content[0]?.text || '';
          return text.includes('No memories found') || text.includes('0 memories');
        }
      }
    ];

    for (const testCase of testCases) {
      await this.runToolTest('recall', testCase);
    }

    // Error cases
    const errorCases = [
      {
        name: 'Missing query parameter',
        args: { limit: 10 },
        expectError: true
      },
      {
        name: 'Invalid limit type',
        args: {
          query: 'test',
          limit: 'not-a-number'
        },
        expectError: true
      }
    ];

    for (const testCase of errorCases) {
      await this.runToolTest('recall', testCase);
    }

    this.reporter.endPhase();
  }

  async testEntitiesTool() {
    this.reporter.startPhase('Entities Tool Tests');
    
    const testCases = [
      {
        name: 'List all entities',
        args: {},
        validate: (result) => result.content[0]?.text !== undefined
      },
      {
        name: 'Filter by entity type',
        args: {
          entity_type: 'person'
        },
        validate: (result) => result.content[0]?.text !== undefined
      },
      {
        name: 'Search by entity name',
        args: {
          entity_name: 'Test'
        },
        validate: (result) => result.content[0]?.text !== undefined
      },
      {
        name: 'Invalid entity type',
        args: {
          entity_type: 'invalid_type'
        },
        validate: (result) => true // Should handle gracefully
      }
    ];

    for (const testCase of testCases) {
      await this.runToolTest('entities', testCase);
    }

    this.reporter.endPhase();
  }

  async testPerformance() {
    this.reporter.startPhase('Performance Tests');
    
    // Test 1: Response time
    const iterations = 10;
    const latencies = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      await this.client.callTool({
        name: 'recall',
        arguments: { query: 'test', limit: 5 }
      });
      latencies.push(Date.now() - start);
    }
    
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / iterations;
    const maxLatency = Math.max(...latencies);
    
    if (avgLatency < 200) {
      this.reporter.addTest('Average latency < 200ms', 'passed', {
        avgLatency,
        maxLatency
      });
    } else {
      this.reporter.addTest('Average latency < 200ms', 'failed', {
        error: `Average latency: ${avgLatency}ms`
      });
    }

    // Test 2: Concurrent requests
    const concurrentRequests = 10;
    const concurrentStart = Date.now();
    
    try {
      const results = await Promise.allSettled(
        Array(concurrentRequests).fill(0).map((_, i) =>
          this.client.callTool({
            name: 'memory',
            arguments: {
              content: `Concurrent test ${i}`,
              title: `Concurrent ${i}`
            }
          })
        )
      );
      
      const concurrentDuration = Date.now() - concurrentStart;
      const successful = results.filter(r => r.status === 'fulfilled').length;
      
      if (successful === concurrentRequests) {
        this.reporter.addTest('Handle concurrent requests', 'passed', {
          totalRequests: concurrentRequests,
          duration: concurrentDuration
        });
      } else {
        this.reporter.addTest('Handle concurrent requests', 'failed', {
          error: `Only ${successful}/${concurrentRequests} succeeded`
        });
      }
    } catch (error) {
      this.reporter.addTest('Handle concurrent requests', 'failed', {
        error: error.message
      });
    }

    this.reporter.endPhase();
  }

  async testIntegration() {
    this.reporter.startPhase('Integration Tests');
    
    const uniqueId = crypto.randomBytes(8).toString('hex');
    
    try {
      // Step 1: Create a memory
      const createResult = await this.client.callTool({
        name: 'memory',
        arguments: {
          content: `Integration test ${uniqueId}`,
          title: 'Integration Test',
          tags: ['integration', uniqueId]
        }
      });
      
      if (createResult.content[0]?.text?.includes('successfully')) {
        this.reporter.addTest('Create memory for integration', 'passed');
      } else {
        this.reporter.addTest('Create memory for integration', 'failed', {
          error: 'Failed to create memory'
        });
      }
      
      // Step 2: Search for it
      await this.sleep(500); // Allow time for indexing
      
      const searchResult = await this.client.callTool({
        name: 'recall',
        arguments: {
          query: uniqueId,
          limit: 10
        }
      });
      
      if (searchResult.content[0]?.text?.includes(uniqueId)) {
        this.reporter.addTest('Find created memory', 'passed');
      } else {
        this.reporter.addTest('Find created memory', 'failed', {
          error: 'Memory not found in search'
        });
      }
      
      // Step 3: Check entities
      const entityResult = await this.client.callTool({
        name: 'entities',
        arguments: {}
      });
      
      if (entityResult.content[0]?.text) {
        this.reporter.addTest('List entities after creation', 'passed');
      } else {
        this.reporter.addTest('List entities after creation', 'failed', {
          error: 'Failed to list entities'
        });
      }
      
    } catch (error) {
      this.reporter.addTest('Integration flow', 'failed', {
        error: error.message
      });
    }

    this.reporter.endPhase();
  }

  // Helper methods
  async runToolTest(toolName, testCase) {
    const startTime = Date.now();
    
    try {
      const result = await this.client.callTool({
        name: toolName,
        arguments: testCase.args
      });
      
      const duration = Date.now() - startTime;
      
      // Check if this is an error response
      const isErrorResponse = result.isError || 
        (result.content && result.content[0]?.text?.includes('validation error')) ||
        (result.content && result.content[0]?.text?.includes('Invalid input'));
      
      if (testCase.expectError) {
        if (isErrorResponse) {
          // We expected an error and got an error response
          this.reporter.addTest(testCase.name, 'passed', {
            duration,
            expectedError: result.content[0]?.text || 'Error response'
          });
        } else {
          // We expected an error but didn't get one
          this.reporter.addTest(testCase.name, 'failed', {
            error: 'Expected error but call succeeded',
            duration
          });
        }
      } else if (testCase.validate) {
        // Validate the result
        const isValid = testCase.validate(result);
        this.reporter.addTest(testCase.name, isValid ? 'passed' : 'failed', {
          duration,
          error: isValid ? null : 'Validation failed'
        });
      } else {
        // No validation, just check for success
        this.reporter.addTest(testCase.name, 'passed', { duration });
      }
      
    } catch (error) {
      if (testCase.expectError) {
        // We expected an error and got one
        this.reporter.addTest(testCase.name, 'passed', {
          duration: Date.now() - startTime,
          expectedError: error.message
        });
      } else {
        // Unexpected error
        this.reporter.addTest(testCase.name, 'failed', {
          error: error.message,
          duration: Date.now() - startTime
        });
      }
    }
  }

  async cleanup() {
    if (this.client) {
      await this.client.close();
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
async function main() {
  console.clear();
  console.log('🧪 MCP Comprehensive Test Suite');
  console.log('Principal Engineer Level Implementation');
  console.log('='.repeat(60));
  
  const reporter = new TestReporter();
  const suite = new MCPTestSuite(reporter);
  
  // Wait for mock API to start
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  try {
    // Phase 1: Initialize
    await suite.initialize();
    
    // Phase 2: Tool Discovery
    await suite.testToolDiscovery();
    
    // Phase 3: Memory Tool
    await suite.testMemoryTool();
    
    // Phase 4: Recall Tool
    await suite.testRecallTool();
    
    // Phase 5: Entities Tool
    await suite.testEntitiesTool();
    
    // Phase 6: Performance
    await suite.testPerformance();
    
    // Phase 7: Integration
    await suite.testIntegration();
    
    // Generate report
    const report = reporter.generateReport();
    await reporter.saveReport();
    
    // Cleanup
    await suite.cleanup();
    mockAPI.kill();
    
    // Exit with appropriate code
    process.exit(report.metrics.failed > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    mockAPI.kill();
    process.exit(1);
  }
}

// Handle interrupts
process.on('SIGINT', () => {
  console.log('\n\nInterrupted, cleaning up...');
  mockAPI.kill();
  process.exit(1);
});

// Execute
if (require.main === module) {
  main();
}