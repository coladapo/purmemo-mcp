#!/usr/bin/env node

/**
 * Comprehensive Automated MCP Test Suite for Purmemo
 * 
 * This script uses @modelcontextprotocol/sdk to:
 * 1. Start the MCP server programmatically
 * 2. Connect via MCP client SDK
 * 3. Test each tool with valid and invalid inputs
 * 4. Capture response times and formats
 * 5. Generate a test report with pass/fail status
 */

import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'fs/promises';
import path from 'path';

class MCPTester {
    constructor() {
        this.results = {
            startTime: new Date().toISOString(),
            serverStartup: null,
            connection: null,
            tools: [],
            resources: [],
            prompts: [],
            summary: {
                passed: 0,
                failed: 0,
                errors: []
            }
        };
        this.client = null;
        this.transport = null;
        this.serverProcess = null;
    }

    log(message, level = 'INFO') {
        const timestamp = new Date().toISOString();
        const color = {
            'INFO': '\x1b[36m',    // Cyan
            'SUCCESS': '\x1b[32m', // Green  
            'ERROR': '\x1b[31m',   // Red
            'WARN': '\x1b[33m'     // Yellow
        }[level] || '\x1b[0m';
        
        console.log(`${color}[${timestamp}] ${level}: ${message}\x1b[0m`);
    }

    async startServer() {
        this.log('Starting MCP server...', 'INFO');
        
        return new Promise((resolve, reject) => {
            try {
                // Start server as child process
                this.serverProcess = spawn('node', ['src/server-oauth.js'], {
                    cwd: process.cwd(),
                    env: {
                        ...process.env,
                        PURMEMO_API_URL: 'https://api.purmemo.ai',
                        PURMEMO_OAUTH_CALLBACK_URL: 'http://localhost:3456/callback',
                        PURMEMO_FRONTEND_URL: 'https://app.purmemo.ai'
                    },
                    stdio: 'pipe'
                });

                let serverOutput = '';
                let errorOutput = '';
                
                this.serverProcess.stdout.on('data', (data) => {
                    const output = data.toString();
                    serverOutput += output;
                    
                    if (output.includes('Ready to serve MCP requests')) {
                        this.log('Server startup completed', 'SUCCESS');
                        this.results.serverStartup = {
                            success: true,
                            output: serverOutput,
                            time: Date.now()
                        };
                        resolve();
                    }
                });

                this.serverProcess.stderr.on('data', (data) => {
                    errorOutput += data.toString();
                    this.log(`Server stderr: ${data.toString()}`, 'WARN');
                });

                this.serverProcess.on('error', (error) => {
                    this.log(`Server process error: ${error.message}`, 'ERROR');
                    this.results.serverStartup = {
                        success: false,
                        error: error.message,
                        time: Date.now()
                    };
                    reject(error);
                });

                this.serverProcess.on('exit', (code, signal) => {
                    if (code !== 0) {
                        this.log(`Server exited with code ${code}, signal ${signal}`, 'ERROR');
                        this.results.serverStartup = {
                            success: false,
                            exitCode: code,
                            signal,
                            stderr: errorOutput,
                            time: Date.now()
                        };
                        reject(new Error(`Server exited with code ${code}`));
                    }
                });

                // Timeout after 10 seconds
                setTimeout(() => {
                    if (!this.results.serverStartup) {
                        this.log('Server startup timeout', 'ERROR');
                        reject(new Error('Server startup timeout'));
                    }
                }, 10000);

            } catch (error) {
                this.log(`Error starting server: ${error.message}`, 'ERROR');
                reject(error);
            }
        });
    }

    async connectToServer() {
        this.log('Connecting to MCP server...', 'INFO');
        
        try {
            // Create transport using the server process
            this.transport = new StdioClientTransport({
                command: 'node',
                args: ['src/server-oauth.js'],
                env: {
                    PURMEMO_API_URL: 'https://api.purmemo.ai',
                    PURMEMO_OAUTH_CALLBACK_URL: 'http://localhost:3456/callback',
                    PURMEMO_FRONTEND_URL: 'https://app.purmemo.ai'
                }
            });

            this.client = new Client({
                name: "mcp-test-client",
                version: "1.0.0"
            }, {
                capabilities: {
                    roots: {
                        listChanged: true
                    },
                    sampling: {}
                }
            });

            await this.client.connect(this.transport);
            
            this.log('Successfully connected to MCP server', 'SUCCESS');
            this.results.connection = {
                success: true,
                time: Date.now()
            };

        } catch (error) {
            this.log(`Failed to connect: ${error.message}`, 'ERROR');
            this.results.connection = {
                success: false,
                error: error.message,
                stack: error.stack,
                time: Date.now()
            };
            throw error;
        }
    }

    async testTools() {
        this.log('Testing all available tools...', 'INFO');
        
        try {
            // List available tools
            const toolsResponse = await this.client.listTools();
            this.log(`Found ${toolsResponse.tools.length} tools`, 'INFO');
            
            for (const tool of toolsResponse.tools) {
                await this.testTool(tool);
            }
            
        } catch (error) {
            this.log(`Error listing tools: ${error.message}`, 'ERROR');
            this.results.summary.errors.push({
                phase: 'list_tools',
                error: error.message
            });
        }
    }

    async testTool(tool) {
        this.log(`Testing tool: ${tool.name}`, 'INFO');
        
        const toolResult = {
            name: tool.name,
            description: tool.description,
            schema: tool.inputSchema,
            tests: []
        };

        // Test cases for each tool
        const testCases = this.generateTestCases(tool);
        
        for (const testCase of testCases) {
            const startTime = Date.now();
            
            try {
                this.log(`  Running test: ${testCase.description}`, 'INFO');
                
                const result = await this.client.callTool({
                    name: tool.name,
                    arguments: testCase.arguments
                });
                
                const duration = Date.now() - startTime;
                
                toolResult.tests.push({
                    description: testCase.description,
                    arguments: testCase.arguments,
                    success: true,
                    result: result,
                    duration,
                    expected: testCase.expected
                });
                
                this.log(`  ✅ ${testCase.description} (${duration}ms)`, 'SUCCESS');
                this.results.summary.passed++;
                
            } catch (error) {
                const duration = Date.now() - startTime;
                
                toolResult.tests.push({
                    description: testCase.description,
                    arguments: testCase.arguments,
                    success: false,
                    error: error.message,
                    duration,
                    expected: testCase.expected
                });
                
                this.log(`  ❌ ${testCase.description}: ${error.message}`, 'ERROR');
                this.results.summary.failed++;
            }
        }
        
        this.results.tools.push(toolResult);
    }

    generateTestCases(tool) {
        const cases = [];
        
        // Generate test cases based on tool name and schema
        switch (tool.name) {
            case 'memory_store':
                cases.push(
                    {
                        description: 'Store a simple memory',
                        arguments: { content: 'Test memory for MCP testing', tags: ['test', 'mcp'] },
                        expected: 'success'
                    },
                    {
                        description: 'Store empty memory (should fail)',
                        arguments: { content: '', tags: [] },
                        expected: 'error'
                    }
                );
                break;

            case 'memory_search':
                cases.push(
                    {
                        description: 'Search for test memories',
                        arguments: { query: 'test', limit: 5 },
                        expected: 'results'
                    },
                    {
                        description: 'Search with empty query',
                        arguments: { query: '', limit: 10 },
                        expected: 'results'
                    }
                );
                break;

            case 'memory_retrieve':
                cases.push(
                    {
                        description: 'Retrieve non-existent memory',
                        arguments: { memory_id: 'non-existent-id' },
                        expected: 'error'
                    }
                );
                break;

            case 'entities_list':
                cases.push(
                    {
                        description: 'List all entities',
                        arguments: {},
                        expected: 'results'
                    }
                );
                break;

            case 'attach_to_conversation':
                cases.push(
                    {
                        description: 'Attach memories to conversation',
                        arguments: { query: 'test', max_memories: 3 },
                        expected: 'success'
                    }
                );
                break;

            default:
                // Generic test case for unknown tools
                cases.push({
                    description: `Generic test for ${tool.name}`,
                    arguments: {},
                    expected: 'any'
                });
        }
        
        return cases;
    }

    async testResources() {
        this.log('Testing available resources...', 'INFO');
        
        try {
            const resourcesResponse = await this.client.listResources();
            this.log(`Found ${resourcesResponse.resources.length} resources`, 'INFO');
            
            for (const resource of resourcesResponse.resources) {
                await this.testResource(resource);
            }
            
        } catch (error) {
            this.log(`Error listing resources: ${error.message}`, 'ERROR');
            this.results.summary.errors.push({
                phase: 'list_resources',
                error: error.message
            });
        }
    }

    async testResource(resource) {
        this.log(`Testing resource: ${resource.uri}`, 'INFO');
        
        const resourceResult = {
            uri: resource.uri,
            name: resource.name,
            description: resource.description,
            mimeType: resource.mimeType,
            tests: []
        };

        const startTime = Date.now();
        
        try {
            const result = await this.client.readResource({ uri: resource.uri });
            const duration = Date.now() - startTime;
            
            resourceResult.tests.push({
                description: 'Read resource',
                success: true,
                result: result,
                duration
            });
            
            this.log(`  ✅ Read resource (${duration}ms)`, 'SUCCESS');
            this.results.summary.passed++;
            
        } catch (error) {
            const duration = Date.now() - startTime;
            
            resourceResult.tests.push({
                description: 'Read resource',
                success: false,
                error: error.message,
                duration
            });
            
            this.log(`  ❌ Read resource: ${error.message}`, 'ERROR');
            this.results.summary.failed++;
        }
        
        this.results.resources.push(resourceResult);
    }

    async generateReport() {
        this.log('Generating test report...', 'INFO');
        
        this.results.endTime = new Date().toISOString();
        this.results.duration = Date.now() - new Date(this.results.startTime).getTime();
        
        // Generate summary
        const total = this.results.summary.passed + this.results.summary.failed;
        const passRate = total > 0 ? (this.results.summary.passed / total * 100).toFixed(1) : 0;
        
        this.log(`\n📊 TEST SUMMARY`, 'INFO');
        this.log(`===============`, 'INFO');
        this.log(`Total Tests: ${total}`, 'INFO');
        this.log(`Passed: ${this.results.summary.passed}`, 'SUCCESS');
        this.log(`Failed: ${this.results.summary.failed}`, this.results.summary.failed > 0 ? 'ERROR' : 'INFO');
        this.log(`Pass Rate: ${passRate}%`, passRate >= 80 ? 'SUCCESS' : 'WARN');
        this.log(`Duration: ${(this.results.duration / 1000).toFixed(2)}s`, 'INFO');
        
        // Save detailed report
        const reportPath = path.join(process.cwd(), 'mcp-test-report.json');
        await fs.writeFile(reportPath, JSON.stringify(this.results, null, 2));
        this.log(`Detailed report saved to: ${reportPath}`, 'SUCCESS');
        
        return this.results;
    }

    async cleanup() {
        this.log('Cleaning up...', 'INFO');
        
        if (this.client) {
            try {
                await this.client.close();
            } catch (error) {
                this.log(`Error closing client: ${error.message}`, 'WARN');
            }
        }
        
        if (this.serverProcess) {
            this.serverProcess.kill('SIGTERM');
            
            // Wait for process to exit
            await new Promise((resolve) => {
                this.serverProcess.on('exit', resolve);
                setTimeout(resolve, 5000); // Force cleanup after 5s
            });
        }
    }

    async runFullTest() {
        try {
            this.log('🧠 Starting Comprehensive Purmemo MCP Test Suite', 'INFO');
            this.log('================================================', 'INFO');
            
            // Connect to server (using transport instead of starting separately)
            await this.connectToServer();
            
            // Run all tests
            await this.testTools();
            await this.testResources();
            
            // Generate report
            const results = await this.generateReport();
            
            return results;
            
        } catch (error) {
            this.log(`Fatal error during testing: ${error.message}`, 'ERROR');
            this.results.summary.errors.push({
                phase: 'fatal',
                error: error.message,
                stack: error.stack
            });
            throw error;
            
        } finally {
            await this.cleanup();
        }
    }
}

// Run the test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const tester = new MCPTester();
    
    tester.runFullTest()
        .then(results => {
            const success = results.summary.failed === 0 && results.connection?.success;
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Test suite failed:', error.message);
            process.exit(1);
        });
}

export { MCPTester };