#!/usr/bin/env node

/**
 * Advanced MCP Test Suite with Deep Testing Strategies
 * Principal Engineer Level Testing Implementation
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

// Advanced test configuration
const TEST_CONFIG = {
  serverCommand: 'node',
  serverArgs: [path.join(__dirname, '..', 'bin', 'puo-memo-mcp')],
  env: {
    PUO_MEMO_API_URL: process.env.PUO_MEMO_API_URL || 'http://localhost:8000',
    PUO_MEMO_API_KEY: process.env.PUO_MEMO_API_KEY || 'test-api-key',
    PYTHONUNBUFFERED: '1'
  },
  timing: {
    serverStartupDelay: 2000,
    betweenTests: 100,
    stressTestDelay: 10,
    connectionTimeout: 30000
  },
  performance: {
    acceptableLatency: 1000, // ms
    memoryThreshold: 100 * 1024 * 1024, // 100MB
  }
};

// Deep test scenarios
class TestScenarios {
  static generateUniqueId() {
    return crypto.randomBytes(8).toString('hex');
  }

  static getMemoryScenarios() {
    const uniqueId = this.generateUniqueId();
    
    return {
      basic: [
        {
          name: 'Simple text memory',
          params: {
            content: `Basic memory test ${uniqueId}`,
            title: 'Simple Test',
            tags: ['test']
          },
          validate: (response) => ({
            valid: response.content?.[0]?.text?.includes('successfully'),
            error: 'Failed to store simple memory'
          })
        }
      ],
      
      edgeCases: [
        {
          name: 'Unicode and emoji content',
          params: {
            content: '测试 🎉 مرحبا 🌍 Тест ❤️',
            title: 'Unicode Test',
            tags: ['unicode', 'emoji']
          }
        },
        {
          name: 'Very long content',
          params: {
            content: 'A'.repeat(10000),
            title: 'Long Content Test'
          }
        },
        {
          name: 'Special characters in title',
          params: {
            content: 'Test content',
            title: 'Title with <script>alert("xss")</script>',
            tags: ['security', 'xss']
          }
        },
        {
          name: 'Nested JSON in content',
          params: {
            content: JSON.stringify({
              nested: { deep: { data: 'test' } }
            }),
            title: 'JSON Content'
          }
        },
        {
          name: 'Empty arrays and nullish values',
          params: {
            content: 'Content with empty data',
            title: '',
            tags: []
          }
        }
      ],
      
      malformed: [
        {
          name: 'Missing required content',
          params: { title: 'No content' },
          shouldFail: true
        },
        {
          name: 'Wrong type for tags',
          params: {
            content: 'Test',
            tags: 'not-an-array'
          },
          shouldFail: true
        },
        {
          name: 'Null content',
          params: {
            content: null,
            title: 'Null content'
          },
          shouldFail: true
        },
        {
          name: 'Number as content',
          params: {
            content: 12345,
            title: 'Number content'
          },
          shouldFail: true
        }
      ],
      
      performance: [
        {
          name: 'Concurrent memory creation',
          concurrent: 10,
          params: (index) => ({
            content: `Concurrent test ${uniqueId} - ${index}`,
            title: `Concurrent ${index}`,
            tags: ['concurrent', 'performance']
          })
        }
      ],
      
      stateful: [
        {
          name: 'Create and verify retrieval',
          sequence: [
            {
              tool: 'memory',
              params: {
                content: `Stateful test ${uniqueId}`,
                title: 'Stateful Memory',
                tags: ['stateful', uniqueId]
              },
              captureResponse: 'memoryId'
            },
            {
              tool: 'recall',
              params: {
                query: uniqueId,
                limit: 1
              },
              validate: (response, context) => ({
                valid: response.content?.[0]?.text?.includes(uniqueId),
                error: 'Failed to retrieve created memory'
              })
            }
          ]
        }
      ]
    };
  }

  static getRecallScenarios() {
    return {
      basic: [
        {
          name: 'Simple keyword search',
          params: {
            query: 'test',
            limit: 10
          }
        }
      ],
      
      edgeCases: [
        {
          name: 'Empty query',
          params: {
            query: '',
            limit: 5
          }
        },
        {
          name: 'Special regex characters',
          params: {
            query: '.*[]()+?^$',
            limit: 5
          }
        },
        {
          name: 'Very large limit',
          params: {
            query: 'test',
            limit: 1000
          }
        },
        {
          name: 'Zero limit',
          params: {
            query: 'test',
            limit: 0
          }
        },
        {
          name: 'Negative limit',
          params: {
            query: 'test',
            limit: -1
          }
        },
        {
          name: 'Unicode search query',
          params: {
            query: '测试 🎉',
            limit: 5
          }
        }
      ],
      
      malformed: [
        {
          name: 'Missing query',
          params: { limit: 10 },
          shouldFail: true
        },
        {
          name: 'Wrong type for limit',
          params: {
            query: 'test',
            limit: 'not-a-number'
          },
          shouldFail: true
        },
        {
          name: 'Object as query',
          params: {
            query: { nested: 'object' },
            limit: 5
          },
          shouldFail: true
        }
      ]
    };
  }

  static getEntityScenarios() {
    return {
      basic: [
        {
          name: 'List all entities',
          params: {}
        },
        {
          name: 'Filter by person type',
          params: {
            entity_type: 'person'
          }
        }
      ],
      
      edgeCases: [
        {
          name: 'All valid entity types',
          sequence: ['person', 'organization', 'location', 'event', 'project', 
                     'technology', 'concept', 'document', 'other'].map(type => ({
            name: `Filter by ${type}`,
            params: { entity_type: type }
          }))
        },
        {
          name: 'Entity with special characters',
          params: {
            entity_name: 'Test & Entity <name>'
          }
        },
        {
          name: 'Multiple filters',
          params: {
            entity_name: 'test',
            entity_type: 'person'
          }
        }
      ],
      
      malformed: [
        {
          name: 'Invalid entity type',
          params: {
            entity_type: 'invalid_type'
          },
          shouldFail: false // Might just return empty
        },
        {
          name: 'Unexpected parameters',
          params: {
            unknown_param: 'value',
            another_param: 123
          }
        }
      ]
    };
  }
}

// Advanced test runner
class AdvancedMCPTestSuite {
  constructor() {
    this.client = null;
    this.transport = null;
    this.serverProcess = null;
    this.metrics = {
      memory: {
        initial: process.memoryUsage(),
        peak: process.memoryUsage()
      },
      timing: {
        toolCalls: []
      },
      errors: []
    };
    this.context = {}; // Shared context for stateful tests
  }

  async initialize() {
    const startTime = Date.now();
    console.log('\n🚀 Initializing MCP Test Suite...\n');
    
    try {
      // Start server process
      this.serverProcess = spawn(
        TEST_CONFIG.serverCommand,
        TEST_CONFIG.serverArgs,
        {
          env: { ...process.env, ...TEST_CONFIG.env },
          stdio: ['pipe', 'pipe', 'pipe']
        }
      );

      // Monitor server output
      this.serverProcess.stderr.on('data', (data) => {
        if (process.env.DEBUG) {
          console.error('[SERVER]', data.toString());
        }
      });

      this.serverProcess.on('error', (error) => {
        console.error('Server process error:', error);
        this.metrics.errors.push({ phase: 'initialization', error: error.message });
      });

      // Wait for server to start
      await this.sleep(TEST_CONFIG.timing.serverStartupDelay);

      // Create transport
      this.transport = new StdioClientTransport({
        command: TEST_CONFIG.serverCommand,
        args: TEST_CONFIG.serverArgs,
        env: TEST_CONFIG.env
      });

      // Create client with timeout
      this.client = new Client({
        name: 'mcp-advanced-test-suite',
        version: '1.0.0'
      }, {
        capabilities: {}
      });

      // Connect with timeout (connect also initializes)
      const connectPromise = this.client.connect(this.transport);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), TEST_CONFIG.timing.connectionTimeout)
      );

      await Promise.race([connectPromise, timeoutPromise]);
      
      // Get server info
      const serverInfo = {
        serverInfo: {
          name: this.client.getServerCapabilities()?.name || 'puo-memo',
          version: this.client.getServerVersion() || 'unknown'
        }
      };
      
      const initTime = Date.now() - startTime;
      console.log(`✅ Connected to MCP server`);
      console.log(`⏱️  Initialization time: ${initTime}ms\n`);
      
      return serverInfo;
      
    } catch (error) {
      console.error('❌ Initialization failed:', error.message);
      throw error;
    }
  }

  async runComprehensiveTests() {
    const report = {
      startTime: new Date().toISOString(),
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        apiUrl: TEST_CONFIG.env.PUO_MEMO_API_URL
      },
      phases: {},
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0
      }
    };

    try {
      // Phase 1: Discovery and Analysis
      console.log('📊 PHASE 1: DISCOVERY AND ANALYSIS\n');
      report.phases.discovery = await this.phaseDiscovery();

      // Phase 2: Functional Testing
      console.log('\n🧪 PHASE 2: FUNCTIONAL TESTING\n');
      report.phases.functional = await this.phaseFunctionalTesting();

      // Phase 3: Error Handling and Edge Cases
      console.log('\n🔥 PHASE 3: ERROR HANDLING AND EDGE CASES\n');
      report.phases.errorHandling = await this.phaseErrorHandling();

      // Phase 4: Performance and Stress Testing
      console.log('\n⚡ PHASE 4: PERFORMANCE AND STRESS TESTING\n');
      report.phases.performance = await this.phasePerformanceTesting();

      // Phase 5: Stateful and Integration Testing
      console.log('\n🔄 PHASE 5: STATEFUL AND INTEGRATION TESTING\n');
      report.phases.integration = await this.phaseIntegrationTesting();

      // Generate comprehensive report
      report.endTime = new Date().toISOString();
      report.metrics = this.metrics;
      report.summary = this.calculateSummary(report);

      // Save report
      await this.saveReport(report);
      
      // Display summary
      this.displaySummary(report);

    } catch (error) {
      console.error('Test suite error:', error);
      report.fatalError = error.message;
    } finally {
      await this.cleanup();
    }

    return report;
  }

  async phaseDiscovery() {
    const phase = {
      name: 'Discovery',
      tests: []
    };

    // Test 1: List tools
    const toolsTest = await this.runTest('List Available Tools', async () => {
      const result = await this.client.listTools();
      return {
        success: result.tools.length > 0,
        data: result.tools,
        validation: {
          hasMemoryTool: result.tools.some(t => t.name === 'memory'),
          hasRecallTool: result.tools.some(t => t.name === 'recall'),
          hasEntitiesTool: result.tools.some(t => t.name === 'entities')
        }
      };
    });
    phase.tests.push(toolsTest);

    // Test 2: Validate tool schemas
    const schemaTest = await this.runTest('Validate Tool Schemas', async () => {
      const tools = await this.client.listTools();
      const validations = tools.tools.map(tool => {
        const hasSchema = !!tool.inputSchema;
        const schemaType = tool.inputSchema?.type === 'object';
        const hasProperties = !!tool.inputSchema?.properties;
        
        return {
          tool: tool.name,
          valid: hasSchema && schemaType && hasProperties,
          details: { hasSchema, schemaType, hasProperties }
        };
      });
      
      return {
        success: validations.every(v => v.valid),
        data: validations
      };
    });
    phase.tests.push(schemaTest);

    return phase;
  }

  async phaseFunctionalTesting() {
    const phase = {
      name: 'Functional Testing',
      tests: []
    };

    // Memory tool tests
    const memoryScenarios = TestScenarios.getMemoryScenarios();
    for (const scenario of memoryScenarios.basic) {
      const test = await this.runToolTest('memory', scenario);
      phase.tests.push(test);
    }

    // Recall tool tests
    const recallScenarios = TestScenarios.getRecallScenarios();
    for (const scenario of recallScenarios.basic) {
      const test = await this.runToolTest('recall', scenario);
      phase.tests.push(test);
    }

    // Entity tool tests
    const entityScenarios = TestScenarios.getEntityScenarios();
    for (const scenario of entityScenarios.basic) {
      const test = await this.runToolTest('entities', scenario);
      phase.tests.push(test);
    }

    return phase;
  }

  async phaseErrorHandling() {
    const phase = {
      name: 'Error Handling',
      tests: []
    };

    // Test malformed requests
    const scenarios = {
      memory: TestScenarios.getMemoryScenarios().malformed,
      recall: TestScenarios.getRecallScenarios().malformed,
      entities: TestScenarios.getEntityScenarios().malformed
    };

    for (const [tool, toolScenarios] of Object.entries(scenarios)) {
      for (const scenario of toolScenarios) {
        const test = await this.runToolTest(tool, scenario);
        phase.tests.push(test);
      }
    }

    // Test edge cases
    const edgeCases = {
      memory: TestScenarios.getMemoryScenarios().edgeCases,
      recall: TestScenarios.getRecallScenarios().edgeCases,
      entities: TestScenarios.getEntityScenarios().edgeCases
    };

    for (const [tool, toolScenarios] of Object.entries(edgeCases)) {
      for (const scenario of toolScenarios) {
        const test = await this.runToolTest(tool, scenario);
        phase.tests.push(test);
      }
    }

    return phase;
  }

  async phasePerformanceTesting() {
    const phase = {
      name: 'Performance Testing',
      tests: []
    };

    // Test 1: Response time under normal load
    const latencyTest = await this.runTest('Response Latency Test', async () => {
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
      
      return {
        success: avgLatency < TEST_CONFIG.performance.acceptableLatency,
        data: {
          average: avgLatency,
          max: maxLatency,
          all: latencies
        }
      };
    });
    phase.tests.push(latencyTest);

    // Test 2: Concurrent operations
    const concurrentTest = await this.runTest('Concurrent Operations', async () => {
      const concurrentOps = 20;
      const results = await Promise.allSettled(
        Array(concurrentOps).fill(0).map((_, i) => 
          this.client.callTool({
            name: 'memory',
            arguments: {
              content: `Concurrent test ${i}`,
              title: `Concurrent ${i}`
            }
          })
        )
      );
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      
      return {
        success: successful === concurrentOps,
        data: {
          total: concurrentOps,
          successful,
          failed: concurrentOps - successful
        }
      };
    });
    phase.tests.push(concurrentTest);

    // Test 3: Memory usage
    const memoryTest = await this.runTest('Memory Usage Test', async () => {
      const initialMemory = process.memoryUsage();
      
      // Perform memory-intensive operations
      for (let i = 0; i < 100; i++) {
        await this.client.callTool({
          name: 'memory',
          arguments: {
            content: 'A'.repeat(1000),
            title: `Memory test ${i}`
          }
        });
      }
      
      const finalMemory = process.memoryUsage();
      const heapGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      
      return {
        success: heapGrowth < TEST_CONFIG.performance.memoryThreshold,
        data: {
          initial: initialMemory,
          final: finalMemory,
          heapGrowth
        }
      };
    });
    phase.tests.push(memoryTest);

    return phase;
  }

  async phaseIntegrationTesting() {
    const phase = {
      name: 'Integration Testing',
      tests: []
    };

    // Test stateful operations
    const statefulTest = await this.runTest('Stateful Operations', async () => {
      const uniqueId = TestScenarios.generateUniqueId();
      
      // Step 1: Create memory
      const createResult = await this.client.callTool({
        name: 'memory',
        arguments: {
          content: `Integration test ${uniqueId}`,
          title: 'Integration Test',
          tags: ['integration', uniqueId]
        }
      });
      
      // Step 2: Search for it
      await this.sleep(500); // Give API time to index
      
      const searchResult = await this.client.callTool({
        name: 'recall',
        arguments: {
          query: uniqueId,
          limit: 10
        }
      });
      
      // Step 3: Check entities
      const entityResult = await this.client.callTool({
        name: 'entities',
        arguments: {}
      });
      
      const found = searchResult.content?.[0]?.text?.includes(uniqueId);
      
      return {
        success: found,
        data: {
          created: createResult.content?.[0]?.text,
          found,
          searchResponse: searchResult.content?.[0]?.text
        }
      };
    });
    phase.tests.push(statefulTest);

    return phase;
  }

  // Helper methods
  async runTest(name, testFn) {
    console.log(`  Running: ${name}`);
    const startTime = Date.now();
    
    try {
      const result = await testFn();
      const duration = Date.now() - startTime;
      
      console.log(`    ${result.success ? '✅' : '❌'} ${name} (${duration}ms)`);
      
      return {
        name,
        success: result.success,
        duration,
        data: result.data,
        error: null
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`    ❌ ${name} - Error: ${error.message} (${duration}ms)`);
      
      return {
        name,
        success: false,
        duration,
        data: null,
        error: error.message
      };
    }
  }

  async runToolTest(toolName, scenario) {
    const startTime = Date.now();
    
    try {
      const response = await this.client.callTool({
        name: toolName,
        arguments: scenario.params
      });
      
      const duration = Date.now() - startTime;
      this.metrics.timing.toolCalls.push({ tool: toolName, duration });
      
      let success = !scenario.shouldFail;
      
      if (scenario.validate) {
        const validation = scenario.validate(response, this.context);
        success = validation.valid;
      }
      
      console.log(`    ${success ? '✅' : '❌'} ${toolName}/${scenario.name} (${duration}ms)`);
      
      return {
        name: `${toolName}/${scenario.name}`,
        success,
        duration,
        response: response.content?.[0]?.text,
        error: null
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const success = !!scenario.shouldFail;
      
      console.log(`    ${success ? '✅' : '❌'} ${toolName}/${scenario.name} - ${error.message} (${duration}ms)`);
      
      return {
        name: `${toolName}/${scenario.name}`,
        success,
        duration,
        response: null,
        error: error.message
      };
    }
  }

  calculateSummary(report) {
    let total = 0, passed = 0, failed = 0;
    
    for (const phase of Object.values(report.phases)) {
      for (const test of phase.tests) {
        total++;
        if (test.success) passed++;
        else failed++;
      }
    }
    
    return { total, passed, failed, successRate: (passed / total * 100).toFixed(1) };
  }

  displaySummary(report) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUITE SUMMARY');
    console.log('='.repeat(60));
    
    console.log(`\n📈 Overall Results:`);
    console.log(`   Total Tests: ${report.summary.total}`);
    console.log(`   ✅ Passed: ${report.summary.passed}`);
    console.log(`   ❌ Failed: ${report.summary.failed}`);
    console.log(`   📊 Success Rate: ${report.summary.successRate}%`);
    
    console.log(`\n⏱️  Performance Metrics:`);
    const avgLatency = this.metrics.timing.toolCalls.length > 0
      ? this.metrics.timing.toolCalls.reduce((sum, t) => sum + t.duration, 0) / this.metrics.timing.toolCalls.length
      : 0;
    console.log(`   Average Tool Call Latency: ${avgLatency.toFixed(0)}ms`);
    
    console.log(`\n💾 Memory Usage:`);
    const currentMemory = process.memoryUsage();
    const heapGrowth = currentMemory.heapUsed - this.metrics.memory.initial.heapUsed;
    console.log(`   Heap Growth: ${(heapGrowth / 1024 / 1024).toFixed(2)}MB`);
    
    if (report.summary.failed > 0) {
      console.log(`\n⚠️  Failed Tests:`);
      for (const phase of Object.values(report.phases)) {
        const failedTests = phase.tests.filter(t => !t.success);
        for (const test of failedTests) {
          console.log(`   - ${test.name}: ${test.error || 'Validation failed'}`);
        }
      }
    }
    
    console.log('\n' + '='.repeat(60));
  }

  async saveReport(report) {
    const reportPath = path.join(__dirname, '..', 'test-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  }

  async cleanup() {
    if (this.client) {
      await this.client.close();
    }
    
    if (this.serverProcess) {
      this.serverProcess.kill();
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
async function main() {
  console.clear();
  console.log('🔬 MCP Advanced Test Suite');
  console.log('Principal Engineer Level Testing Implementation');
  console.log('='.repeat(60));
  
  // Check dependencies
  try {
    require.resolve('@modelcontextprotocol/sdk');
  } catch (error) {
    console.log('📦 Installing MCP SDK...');
    require('child_process').execSync('npm install @modelcontextprotocol/sdk', { stdio: 'inherit' });
  }
  
  const suite = new AdvancedMCPTestSuite();
  
  try {
    await suite.initialize();
    const report = await suite.runComprehensiveTests();
    
    process.exit(report.summary.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Execute
if (require.main === module) {
  main();
}