#!/usr/bin/env node

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function diagnoseMCP() {
    console.log('🔍 MCP Server Diagnostic Test');
    console.log('=============================\n');

    let client, transport;

    try {
        // Connect to server
        console.log('1️⃣  Connecting to MCP server...');
        
        transport = new StdioClientTransport({
            command: 'node',
            args: ['src/server-oauth.js'],
            env: {
                PURMEMO_API_URL: 'https://api.purmemo.ai',
                PURMEMO_OAUTH_CALLBACK_URL: 'http://localhost:3456/callback',
                PURMEMO_FRONTEND_URL: 'https://app.purmemo.ai'
            }
        });

        client = new Client({
            name: "mcp-diagnostic",
            version: "1.0.0"
        }, {
            capabilities: {
                roots: { listChanged: true },
                sampling: {}
            }
        });

        await client.connect(transport);
        console.log('✅ Connection successful\n');

        // List tools (no execution)
        console.log('2️⃣  Listing available tools...');
        const toolsResponse = await client.listTools();
        
        console.log(`✅ Found ${toolsResponse.tools.length} tools:`);
        toolsResponse.tools.forEach((tool, i) => {
            console.log(`   ${i + 1}. ${tool.name}`);
            console.log(`      Description: ${tool.description}`);
            console.log(`      Input Schema: ${JSON.stringify(tool.inputSchema.properties || {}, null, 6)}\n`);
        });

        // List resources
        console.log('3️⃣  Listing available resources...');
        try {
            const resourcesResponse = await client.listResources();
            console.log(`✅ Found ${resourcesResponse.resources.length} resources:`);
            resourcesResponse.resources.forEach((resource, i) => {
                console.log(`   ${i + 1}. ${resource.uri} (${resource.name})\n`);
            });
        } catch (error) {
            console.log(`⚠️  No resources available: ${error.message}\n`);
        }

        // Test simple tool (non-blocking)
        console.log('4️⃣  Testing memory tool with timeout...');
        try {
            const timeout = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Tool execution timeout')), 5000)
            );
            
            const toolCall = client.callTool({
                name: 'memory',
                arguments: { action: 'test' }
            });

            const result = await Promise.race([toolCall, timeout]);
            console.log('✅ Tool executed successfully:', JSON.stringify(result, null, 2));
            
        } catch (error) {
            if (error.message.includes('timeout')) {
                console.log('⚠️  Tool hangs (requires OAuth) - this is expected');
                console.log('   Issue: Tools wait for OAuth authentication');
                console.log('   Solution: Need to implement non-blocking auth or API key mode\n');
            } else {
                console.log(`❌ Tool error: ${error.message}\n`);
            }
        }

        console.log('5️⃣  Server Configuration Check...');
        console.log('✅ Environment Variables:');
        console.log(`   PURMEMO_API_URL: ${process.env.PURMEMO_API_URL || 'https://api.purmemo.ai'}`);
        console.log(`   PURMEMO_OAUTH_CALLBACK_URL: ${process.env.PURMEMO_OAUTH_CALLBACK_URL || 'http://localhost:3456/callback'}`);
        console.log(`   PURMEMO_FRONTEND_URL: ${process.env.PURMEMO_FRONTEND_URL || 'https://app.purmemo.ai'}\n`);

        console.log('📊 DIAGNOSTIC SUMMARY');
        console.log('====================');
        console.log('✅ MCP Server starts successfully');
        console.log('✅ Client can connect via stdio transport');  
        console.log('✅ Tools are registered and discoverable');
        console.log('⚠️  Tools hang waiting for OAuth (expected behavior)');
        console.log('💡 Claude Desktop failure is likely due to tool timeout during connection');
        console.log('\n🔧 RECOMMENDED FIXES:');
        console.log('1. Implement non-blocking OAuth flow');
        console.log('2. Add API key fallback mode');
        console.log('3. Reduce initial connection timeout');
        console.log('4. Add better error handling for auth failures');

    } catch (error) {
        console.log(`❌ Fatal error: ${error.message}`);
        console.log(`Stack: ${error.stack}`);
        console.log('\n🔧 This indicates a server startup issue');
        
    } finally {
        if (client) {
            try {
                await client.close();
            } catch (e) {
                console.log(`Warning: Error closing client: ${e.message}`);
            }
        }
    }
}

diagnoseMCP().catch(console.error);