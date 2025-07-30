#!/usr/bin/env node

/**
 * Automated MCP Test Suite for PUO Memo MCP Server
 * 
 * Tests all tools with proper error handling and execution flow tracking
 * Generates detailed test report with real-time console progress
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class MCPTestSuite {
    constructor(projectPath) {
        this.projectPath = projectPath;
        this.client = null;
        this.transport = null;
        this.results = {
            timestamp: new Date().toISOString(),
            projectPath,
            summary: {
                totalTests: 0,
                passed: 0,
                failed: 0,
                errors: 0
            },
            tools: {},
            executionFlow: [],
            errors: []
        };
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = {
            info: '📋',
            success: '✅',
            error: '❌',
            warning: '⚠️',
            progress: '🔄'
        }[type] || '📋';
        
        console.log(`${prefix} [${timestamp}] ${message}`);
        
        this.results.executionFlow.push({
            timestamp,
            type,
            message
        });
    }

    async initialize() {
        this.log('Initializing MCP Test Suite', 'progress');
        
        try {
            // Spawn the MCP server process
            const serverPath = path.join(this.projectPath, 'venv/bin/python3');
            const scriptPath = path.join(this.projectPath, 'run_server.py');
            
            this.log(`Starting MCP server: ${serverPath} ${scriptPath}`, 'progress');
            
            const serverProcess = spawn(serverPath, ['-u', scriptPath], {
                cwd: this.projectPath,
                env: {
                    ...process.env,
                    PATH: `${this.projectPath}/venv/bin:/usr/bin:/bin`,
                    PYTHONPATH: this.projectPath,
                    PYTHONUNBUFFERED: '1',
                    DB_HOST: 'aws-0-us-west-1.pooler.supabase.com',
                    DB_PORT: '6543',
                    DB_NAME: 'postgres',
                    DB_USER: 'postgres.bcmsutoahlxqriealrjb',
                    DB_PASSWORD: '8b6ppMV2F03xNyIy',
                    GEMINI_API_KEY: 'AIzaSyAD_1-jBTeYGeXAAUQkqp3GZTFNj-S7irw',
                    GOOGLE_CLOUD_PROJECT: 'puo-studio',
                    GCS_BUCKET_NAME: 'puo-memo-attachments',
                    DEFAULT_CONTEXT: 'claude',
                    REDIS_URL: 'redis://localhost:6379'
                }
            });

            // Create transport and client
            this.transport = new StdioClientTransport({
                spawn: () => serverProcess
            });
            
            this.client = new Client({
                name: 'mcp-test-suite',
                version: '1.0.0'
            }, {
                capabilities: {}
            });

            // Connect to server
            await this.client.connect(this.transport);
            this.log('Successfully connected to MCP server', 'success');
            
            return true;
        } catch (error) {
            this.log(`Failed to initialize: ${error.message}`, 'error');
            this.results.errors.push({
                phase: 'initialization',
                error: error.message,
                timestamp: new Date().toISOString()
            });
            return false;
        }
    }

    async discoverTools() {
        this.log('Discovering available tools', 'progress');
        
        try {
            const toolsResponse = await this.client.listTools();
            const tools = toolsResponse.tools || [];
            
            this.log(`Discovered ${tools.length} tools: ${tools.map(t => t.name).join(', ')}`, 'info');
            
            // Initialize tool results structure
            tools.forEach(tool => {
                this.results.tools[tool.name] = {
                    description: tool.description,
                    inputSchema: tool.inputSchema,
                    tests: []
                };
            });
            
            return tools;
        } catch (error) {
            this.log(`Failed to discover tools: ${error.message}`, 'error');
            this.results.errors.push({
                phase: 'discovery',
                error: error.message,
                timestamp: new Date().toISOString()
            });
            return [];
        }
    }

    async testTool(toolName, testCase) {
        const testId = `${toolName}-${testCase.name}`;
        this.log(`Testing ${testId}`, 'progress');
        this.results.summary.totalTests++;
        
        const result = {
            name: testCase.name,
            description: testCase.description,
            arguments: testCase.arguments,
            expectedResult: testCase.expectedResult,
            timestamp: new Date().toISOString(),
            success: false,
            response: null,
            error: null,
            executionTime: 0
        };

        try {
            const startTime = Date.now();
            
            const response = await this.client.callTool({
                name: toolName,
                arguments: testCase.arguments || {}
            });
            
            result.executionTime = Date.now() - startTime;
            result.response = response;
            
            // Check if response indicates success
            if (response && response.content && response.content.length > 0) {
                const content = response.content[0];
                if (content.type === 'text') {
                    try {
                        const parsed = JSON.parse(content.text);
                        
                        // Check for expected results
                        if (testCase.expectedResult) {
                            if (testCase.expectedResult.errorExpected) {
                                result.success = !!parsed.error;
                            } else {
                                result.success = !parsed.error && (
                                    testCase.expectedResult.hasId ? !!parsed.memory?.id : true
                                ) && (
                                    testCase.expectedResult.hasResults ? !!parsed.memories || !!parsed.results : true
                                );
                            }
                        } else {
                            result.success = !parsed.error;
                        }
                        
                    } catch (parseError) {
                        result.success = false;
                        result.error = `Failed to parse response: ${parseError.message}`;
                    }
                } else {
                    result.success = true; // Non-JSON responses are OK
                }
            } else {
                result.success = false;
                result.error = 'Empty or invalid response';
            }
            
            if (result.success) {
                this.log(`✅ ${testId}: PASSED (${result.executionTime}ms)`, 'success');
                this.results.summary.passed++;
            } else {
                this.log(`❌ ${testId}: FAILED - ${result.error || 'Unexpected result'}`, 'error');
                this.results.summary.failed++;
            }
            
        } catch (error) {
            result.error = error.message;
            result.executionTime = Date.now() - Date.now();
            this.log(`❌ ${testId}: ERROR - ${error.message}`, 'error');
            this.results.summary.errors++;
        }
        
        this.results.tools[toolName].tests.push(result);
        return result;
    }

    getTestCases() {
        return {
            memory: [
                {
                    name: 'create-basic-memory',
                    description: 'Create a basic memory with content only',
                    arguments: {
                        content: 'Test memory creation from automated test suite'
                    },
                    expectedResult: { hasId: true }
                },
                {
                    name: 'create-memory-with-metadata',
                    description: 'Create memory with title and tags',
                    arguments: {
                        content: 'Test memory with metadata',
                        title: 'Automated Test Memory',
                        tags: ['test', 'automation', 'mcp-suite']
                    },
                    expectedResult: { hasId: true }
                },
                {
                    name: 'create-memory-missing-content',
                    description: 'Test error handling for missing required content',
                    arguments: {
                        title: 'Memory without content'
                    },
                    expectedResult: { errorExpected: true }
                },
                {
                    name: 'update-existing-memory',
                    description: 'Update an existing memory',
                    arguments: {
                        memory_id: 'd73549ff-b5c3-4c9f-8d48-a3d00c3399e0', // Known ID from logs
                        content: 'Updated content from test suite',
                        merge_strategy: 'smart'
                    },
                    expectedResult: { hasId: true }
                },
                {
                    name: 'update-nonexistent-memory',
                    description: 'Test error handling for invalid memory ID',
                    arguments: {
                        memory_id: 'invalid-uuid-12345',
                        content: 'This should fail'
                    },
                    expectedResult: { errorExpected: true }
                }
            ],
            recall: [
                {
                    name: 'list-recent-memories',
                    description: 'List recent memories without query',
                    arguments: {},
                    expectedResult: { hasResults: true }
                },
                {
                    name: 'search-with-query',
                    description: 'Search memories with specific query',
                    arguments: {
                        query: 'test',
                        limit: 5
                    },
                    expectedResult: { hasResults: true }
                },
                {
                    name: 'semantic-search',
                    description: 'Test semantic search functionality',
                    arguments: {
                        query: 'automated testing',
                        search_type: 'semantic',
                        limit: 3
                    },
                    expectedResult: { hasResults: true }
                },
                {
                    name: 'keyword-search',
                    description: 'Test keyword search functionality',
                    arguments: {
                        query: 'memory',
                        search_type: 'keyword',
                        limit: 5
                    },
                    expectedResult: { hasResults: true }
                },
                {
                    name: 'hybrid-search',
                    description: 'Test hybrid search (default)',
                    arguments: {
                        query: 'integration test',
                        search_type: 'hybrid',
                        limit: 3
                    },
                    expectedResult: { hasResults: true }
                },
                {
                    name: 'pagination-test',
                    description: 'Test pagination with offset',
                    arguments: {
                        query: '',
                        limit: 5,
                        offset: 10
                    },
                    expectedResult: { hasResults: true }
                },
                {
                    name: 'invalid-search-type',
                    description: 'Test with invalid search type',
                    arguments: {
                        query: 'test',
                        search_type: 'invalid-type'
                    },
                    expectedResult: { errorExpected: true }
                }
            ]
        };
    }

    async runAllTests() {
        this.log('Starting comprehensive MCP test suite', 'info');
        
        // Phase 1: Analyze - Discover tools
        const tools = await this.discoverTools();
        if (tools.length === 0) {
            this.log('No tools discovered, aborting test suite', 'error');
            return false;
        }

        // Phase 2: Plan - Get test cases
        const testCases = this.getTestCases();
        const totalTests = Object.values(testCases).reduce((sum, cases) => sum + cases.length, 0);
        this.log(`Planned ${totalTests} test cases across ${tools.length} tools`, 'info');

        // Phase 3: Execute - Run tests
        for (const tool of tools) {
            const toolTests = testCases[tool.name] || [];
            
            if (toolTests.length === 0) {
                this.log(`No test cases defined for tool: ${tool.name}`, 'warning');
                continue;
            }

            this.log(`Testing tool: ${tool.name} (${toolTests.length} test cases)`, 'info');
            
            for (const testCase of toolTests) {
                await this.testTool(tool.name, testCase);
                
                // Small delay between tests to avoid overwhelming the server
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        // Phase 4: Monitor - Generate results
        await this.generateReport();
        this.displaySummary();
        
        return true;
    }

    async generateReport() {
        const reportPath = path.join(this.projectPath, 'test-report.json');
        
        try {
            await fs.writeFile(reportPath, JSON.stringify(this.results, null, 2));
            this.log(`Test report saved to: ${reportPath}`, 'success');
        } catch (error) {
            this.log(`Failed to save test report: ${error.message}`, 'error');
        }
    }

    displaySummary() {
        this.log('='.repeat(60), 'info');
        this.log('MCP TEST SUITE SUMMARY', 'info');
        this.log('='.repeat(60), 'info');
        
        const { summary } = this.results;
        const successRate = summary.totalTests > 0 ? 
            Math.round((summary.passed / summary.totalTests) * 100) : 0;
        
        this.log(`Total Tests: ${summary.totalTests}`, 'info');
        this.log(`Passed: ${summary.passed}`, 'success');
        this.log(`Failed: ${summary.failed}`, summary.failed > 0 ? 'error' : 'info');
        this.log(`Errors: ${summary.errors}`, summary.errors > 0 ? 'error' : 'info');
        this.log(`Success Rate: ${successRate}%`, successRate >= 90 ? 'success' : 'warning');
        
        this.log('='.repeat(60), 'info');
        
        // Tool-specific summary
        Object.entries(this.results.tools).forEach(([toolName, toolData]) => {
            const toolPassed = toolData.tests.filter(t => t.success).length;
            const toolTotal = toolData.tests.length;
            const toolRate = toolTotal > 0 ? Math.round((toolPassed / toolTotal) * 100) : 0;
            
            this.log(`${toolName}: ${toolPassed}/${toolTotal} (${toolRate}%)`, 
                toolRate >= 90 ? 'success' : 'warning');
        });
    }

    async cleanup() {
        if (this.client) {
            try {
                await this.client.close();
                this.log('MCP client connection closed', 'info');
            } catch (error) {
                this.log(`Error closing client: ${error.message}`, 'warning');
            }
        }
    }
}

// Main execution
async function main() {
    const projectPath = process.argv[2] || '/Users/wivak/puo-jects/active/cos-mcp/puo memo mcp';
    
    console.log('🚀 Starting MCP Test Suite');
    console.log(`📁 Project Path: ${projectPath}`);
    console.log('');
    
    const testSuite = new MCPTestSuite(projectPath);
    
    try {
        const initialized = await testSuite.initialize();
        if (!initialized) {
            console.error('❌ Failed to initialize test suite');
            process.exit(1);
        }
        
        const success = await testSuite.runAllTests();
        
        if (success) {
            console.log('✅ Test suite completed successfully');
            process.exit(testSuite.results.summary.failed > 0 || testSuite.results.summary.errors > 0 ? 1 : 0);
        } else {
            console.error('❌ Test suite failed');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('❌ Unexpected error:', error.message);
        process.exit(1);
    } finally {
        await testSuite.cleanup();
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { MCPTestSuite };