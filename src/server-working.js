#!/usr/bin/env node
/**
 * Working Purmemo MCP Server v3.0.0
 * Uses login-based authentication since API keys don't work
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// Configuration
const API_URL = process.env.PURMEMO_API_URL || 'https://api.purmemo.ai';
const USER_AGENT = 'purmemo-mcp/3.0.0';

// Store auth token in memory
let authToken = null;
let tokenExpiry = null;

// Tool definitions
const TOOLS = [
  {
    name: 'memory',
    description: '💾 Save anything to memory',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'What to remember' },
        title: { type: 'string', description: 'Optional: Title for the memory' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional: Tags' }
      },
      required: ['content']
    }
  },
  {
    name: 'recall',
    description: '🔍 Search your memories',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for' },
        limit: { type: 'integer', description: 'How many results (default: 10)', default: 10 }
      },
      required: ['query']
    }
  },
  {
    name: 'entities',
    description: '🏷️ Extract entities from memories',
    inputSchema: {
      type: 'object',
      properties: {
        entity_name: { type: 'string', description: 'Optional: Specific entity to look up' },
        entity_type: { type: 'string', description: 'Optional: Filter by entity type' }
      }
    }
  }
];

// Create server
const server = new Server(
  { name: 'purmemo-mcp', version: '3.0.0' },
  { capabilities: { tools: {} } }
);

// Authentication function using login
async function authenticate() {
  // Check if token is still valid
  if (authToken && tokenExpiry && Date.now() < tokenExpiry) {
    return authToken;
  }
  
  // Get credentials from environment
  const email = process.env.PURMEMO_EMAIL || process.env.PUO_MEMO_EMAIL || 'demo@puo-memo.com';
  const password = process.env.PURMEMO_PASSWORD || process.env.PUO_MEMO_PASSWORD || 'demodemo123';
  
  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT
      },
      body: new URLSearchParams({
        username: email,
        password: password,
        grant_type: 'password'
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      authToken = data.access_token;
      // Token expires in 1 hour, refresh 5 minutes early
      tokenExpiry = Date.now() + (55 * 60 * 1000);
      return authToken;
    }
  } catch (error) {
    // Silent failure for MCP compatibility
  }
  
  return null;
}

// Create auth message
function createAuthMessage(toolName) {
  return {
    content: [{
      type: 'text',
      text: `🔐 Authentication Required\n\n` +
            `To use ${toolName}, please set up credentials:\n\n` +
            `Add to your Claude Desktop config:\n` +
            `"env": {\n` +
            `  "PURMEMO_EMAIL": "your-email@example.com",\n` +
            `  "PURMEMO_PASSWORD": "your-password"\n` +
            `}\n\n` +
            `Or use the demo account:\n` +
            `"env": {\n` +
            `  "PURMEMO_EMAIL": "demo@puo-memo.com",\n` +
            `  "PURMEMO_PASSWORD": "demodemo123"\n` +
            `}\n\n` +
            `Then restart Claude Desktop.`
    }]
  };
}

// API call helper
async function makeApiCall(endpoint, options = {}) {
  const token = await authenticate();
  
  if (!token) {
    throw new Error('NO_AUTH');
  }
  
  const response = await fetch(`${API_URL}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT
    },
    ...options
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error ${response.status}: ${errorText}`);
  }
  
  return await response.json();
}

// Tool handlers
async function handleMemory(args) {
  try {
    const data = await makeApiCall('/api/v5/memories/', {
      method: 'POST',
      body: JSON.stringify({
        content: args.content,
        title: args.title,
        tags: args.tags || []
      })
    });

    return {
      content: [{
        type: 'text',
        text: `✅ Memory saved successfully!\n\n` +
              `📝 Content: ${args.content}\n` +
              `🔗 ID: ${data.id || data.memory_id || 'Unknown'}\n` +
              (args.title ? `📋 Title: ${args.title}\n` : '') +
              (args.tags?.length ? `🏷️ Tags: ${args.tags.join(', ')}\n` : '')
      }]
    };
  } catch (error) {
    if (error.message === 'NO_AUTH') {
      return createAuthMessage('memory');
    }
    return {
      content: [{
        type: 'text',
        text: `❌ Error saving memory: ${error.message}`
      }]
    };
  }
}

async function handleRecall(args) {
  try {
    const data = await makeApiCall('/api/v5/memories/search', {
      method: 'POST',
      body: JSON.stringify({
        query: args.query,
        limit: args.limit || 10
      })
    });

    if (!data.results || data.results.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `🔍 No memories found for "${args.query}"`
        }]
      };
    }

    let resultText = `🔍 Found ${data.results.length} memories for "${args.query}"\n\n`;
    
    data.results.forEach((memory, index) => {
      resultText += `${index + 1}. **${memory.title || 'Untitled'}**\n`;
      resultText += `   📝 ${memory.content.substring(0, 150)}${memory.content.length > 150 ? '...' : ''}\n`;
      if (memory.tags?.length) {
        resultText += `   🏷️ ${memory.tags.join(', ')}\n`;
      }
      resultText += '\n';
    });

    return {
      content: [{ type: 'text', text: resultText }]
    };
  } catch (error) {
    if (error.message === 'NO_AUTH') {
      return createAuthMessage('recall');
    }
    return {
      content: [{
        type: 'text',
        text: `❌ Error searching memories: ${error.message}`
      }]
    };
  }
}

async function handleEntities(args) {
  try {
    const params = new URLSearchParams();
    if (args.entity_name) params.set('name', args.entity_name);
    if (args.entity_type) params.set('type', args.entity_type);
    
    const data = await makeApiCall(`/api/v5/entities?${params}`);

    if (!data.entities || data.entities.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `🏷️ No entities found`
        }]
      };
    }

    let resultText = `🏷️ Found ${data.entities.length} entities\n\n`;
    
    data.entities.forEach(entity => {
      resultText += `**${entity.name}** (${entity.type})\n`;
      if (entity.frequency) {
        resultText += `   📊 Mentioned ${entity.frequency} times\n`;
      }
      resultText += '\n';
    });

    return {
      content: [{ type: 'text', text: resultText }]
    };
  } catch (error) {
    if (error.message === 'NO_AUTH') {
      return createAuthMessage('entities');
    }
    return {
      content: [{
        type: 'text',
        text: `❌ Error fetching entities: ${error.message}`
      }]
    };
  }
}

// Request handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    switch (name) {
      case 'memory':
        return await handleMemory(args);
      case 'recall':
        return await handleRecall(args);
      case 'entities':
        return await handleEntities(args);
      default:
        return {
          content: [{
            type: 'text',
            text: `❌ Unknown tool: ${name}`
          }]
        };
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `❌ Unexpected error: ${error.message}`
      }]
    };
  }
});

// Start server
const transport = new StdioServerTransport();
server.connect(transport).catch(() => process.exit(1));