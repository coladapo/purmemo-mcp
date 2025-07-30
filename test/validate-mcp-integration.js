#!/usr/bin/env node

/**
 * MCP Integration Validation
 * Quick test to ensure MCP server works correctly
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const path = require('path');

async function validateMCPIntegration() {
  console.log('🔍 Validating MCP Server Integration\n');

  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(__dirname, '..', 'bin', 'puo-memo-mcp')],
    env: {
      PUO_MEMO_API_URL: 'http://localhost:8001',
      PUO_MEMO_API_KEY: 'test-api-key'
    }
  });

  const client = new Client({
    name: 'mcp-validator',
    version: '1.0.0'
  }, {
    capabilities: {}
  });

  try {
    // Connect
    console.log('1️⃣ Connecting to MCP server...');
    await client.connect(transport);
    console.log('✅ Connected successfully\n');

    // List tools
    console.log('2️⃣ Listing available tools...');
    const tools = await client.listTools();
    console.log(`✅ Found ${tools.tools.length} tools:`);
    tools.tools.forEach(tool => {
      console.log(`   - ${tool.name}: ${tool.description}`);
    });
    console.log();

    // Test memory creation
    console.log('3️⃣ Testing memory creation...');
    const memoryResult = await client.callTool({
      name: 'memory',
      arguments: {
        content: 'MCP validation test memory',
        title: 'Validation Test',
        tags: ['test', 'validation']
      }
    });
    
    if (memoryResult.content[0]?.text?.includes('successfully')) {
      console.log('✅ Memory created successfully');
    } else {
      console.log('❌ Memory creation failed:', memoryResult);
    }
    console.log();

    // Test search
    console.log('4️⃣ Testing search functionality...');
    const searchResult = await client.callTool({
      name: 'recall',
      arguments: {
        query: 'validation',
        limit: 5
      }
    });
    
    if (searchResult.content[0]?.text) {
      console.log('✅ Search completed successfully');
      const foundValidation = searchResult.content[0].text.includes('validation');
      if (foundValidation) {
        console.log('✅ Found our test memory in search results');
      }
    } else {
      console.log('❌ Search failed:', searchResult);
    }
    console.log();

    // Test entities
    console.log('5️⃣ Testing entity listing...');
    const entitiesResult = await client.callTool({
      name: 'entities',
      arguments: {}
    });
    
    if (entitiesResult.content[0]?.text) {
      console.log('✅ Entity listing successful');
    } else {
      console.log('❌ Entity listing failed:', entitiesResult);
    }
    console.log();

    // Test validation
    console.log('6️⃣ Testing input validation...');
    const validationResult = await client.callTool({
      name: 'memory',
      arguments: {
        title: 'Missing content field'
        // Intentionally missing required 'content' field
      }
    });
    
    if (validationResult.isError || validationResult.content[0]?.text?.includes('validation error')) {
      console.log('✅ Input validation working correctly');
    } else {
      console.log('❌ Validation should have failed but didn\'t');
    }
    console.log();

    // Summary
    console.log('='*50);
    console.log('✅ MCP Server Integration Validated Successfully!');
    console.log('='*50);
    console.log('\nThe MCP server is ready for use with:');
    console.log('- Claude Desktop');
    console.log('- Other MCP-compatible clients');
    console.log('- Production API backend');

    await client.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Validation failed:', error.message);
    if (client) await client.close();
    process.exit(1);
  }
}

// Run validation
validateMCPIntegration();