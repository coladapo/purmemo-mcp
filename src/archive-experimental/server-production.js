#!/usr/bin/env node
/**
 * Production Purmemo MCP Server v2.1.7
 * Zero console output, robust error handling, API key authentication
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// Configuration
const API_URL = process.env.PURMEMO_API_URL || 'https://api.purmemo.ai';
const USER_AGENT = 'purmemo-mcp/2.1.7';

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

// Create server with production configuration
const server = new Server(
  { name: 'purmemo-mcp', version: '2.1.7' },
  { capabilities: { tools: {} } }
);

// Authentication helper
function getAuthToken() {
  return process.env.PUO_MEMO_API_KEY || process.env.PURMEMO_API_KEY || null;
}

// Create authentication message
function createAuthMessage(toolName) {
  return {
    content: [{
      type: 'text',
      text: `🔐 Authentication Required\n\n` +
            `To use ${toolName}, please set up authentication:\n\n` +
            `1. Get your API key from: https://app.purmemo.ai/settings\n` +
            `2. Add it to your Claude Desktop config:\n\n` +
            `"env": {\n` +
            `  "PUO_MEMO_API_KEY": "your-api-key-here"\n` +
            `}\n\n` +
            `3. Restart Claude Desktop\n\n` +
            `Visit https://docs.purmemo.ai/mcp for setup help.`
    }]
  };
}

// Enhanced API call with retry logic
async function makeApiCall(endpoint, options = {}) {
  const token = getAuthToken();
  if (!token) {
    throw new Error('NO_AUTH_TOKEN');
  }

  const url = `${API_URL}${endpoint}`;
  const requestOptions = {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT
    },
    ...options
  };

  // Try multiple API versions/endpoints
  const endpoints = [
    endpoint,
    endpoint.replace('/api/v5/', '/api/v4/'),
    endpoint.replace('/api/v5/', '/api/')
  ];

  let lastError;
  
  for (const tryEndpoint of endpoints) {
    try {
      const response = await fetch(`${API_URL}${tryEndpoint}`, requestOptions);
      
      if (response.ok) {
        return await response.json();
      }
      
      if (response.status === 401 || response.status === 403) {
        throw new Error('INVALID_TOKEN');
      }
      
      if (response.status === 404) {
        lastError = new Error(`Endpoint not found: ${tryEndpoint}`);
        continue; // Try next endpoint
      }
      
      const errorText = await response.text().catch(() => 'Unknown error');
      lastError = new Error(`API Error ${response.status}: ${errorText}`);
      
    } catch (error) {
      if (error.name === 'AbortError') {
        lastError = new Error('Request timeout');
      } else if (error.message === 'INVALID_TOKEN') {
        throw error; // Don't retry auth errors
      } else {
        lastError = error;
      }
    }
  }
  
  throw lastError || new Error('All API endpoints failed');
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
              `🔗 ID: ${data.memory_id || data.id || 'Unknown'}\n` +
              (args.title ? `📋 Title: ${args.title}\n` : '') +
              (args.tags?.length ? `🏷️ Tags: ${args.tags.join(', ')}\n` : '') +
              `\n✨ Your memory is now part of your AI-powered second brain!`
      }]
    };
  } catch (error) {
    if (error.message === 'NO_AUTH_TOKEN') {
      return createAuthMessage('memory');
    }
    if (error.message === 'INVALID_TOKEN') {
      return {
        content: [{
          type: 'text',
          text: `🔐 Invalid API Key\n\n` +
                `Your API key appears to be invalid or expired.\n` +
                `Please get a new one from: https://app.purmemo.ai/settings`
        }]
      };
    }
    return {
      content: [{
        type: 'text',
        text: `❌ Error saving memory: ${error.message}\n\n` +
              `Please check your internet connection and API key.`
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
          text: `🔍 No memories found for "${args.query}"\n\n` +
                `Try different keywords or create some memories first!`
        }]
      };
    }

    let resultText = `🔍 Found ${data.results.length} memories for "${args.query}"\n\n`;
    
    data.results.forEach((memory, index) => {
      resultText += `${index + 1}. **${memory.title || 'Untitled'}**\n`;
      resultText += `   📝 ${memory.content.substring(0, 150)}${memory.content.length > 150 ? '...' : ''}\n`;
      if (memory.created_at) {
        resultText += `   📅 ${new Date(memory.created_at).toLocaleDateString()}\n`;
      }
      if (memory.tags?.length) {
        resultText += `   🏷️ ${memory.tags.join(', ')}\n`;
      }
      resultText += `   🔗 ID: ${memory.memory_id || memory.id}\n\n`;
    });

    return {
      content: [{ type: 'text', text: resultText }]
    };
    
  } catch (error) {
    if (error.message === 'NO_AUTH_TOKEN') {
      return createAuthMessage('recall');
    }
    if (error.message === 'INVALID_TOKEN') {
      return {
        content: [{
          type: 'text',
          text: `🔐 Invalid API Key\n\n` +
                `Your API key appears to be invalid or expired.\n` +
                `Please get a new one from: https://app.purmemo.ai/settings`
        }]
      };
    }
    return {
      content: [{
        type: 'text',
        text: `❌ Error searching memories: ${error.message}\n\n` +
              `Please check your internet connection and API key.`
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
          text: `🏷️ No entities found\n\n` +
                `Add more memories to extract entities automatically!`
        }]
      };
    }

    let resultText = `🏷️ Found ${data.entities.length} entities\n\n`;
    
    data.entities.forEach(entity => {
      resultText += `**${entity.name}** (${entity.type})\n`;
      resultText += `   📊 Mentioned ${entity.frequency || 1} times\n`;
      if (entity.description) {
        resultText += `   📝 ${entity.description}\n`;
      }
      resultText += '\n';
    });

    return {
      content: [{ type: 'text', text: resultText }]
    };
    
  } catch (error) {
    if (error.message === 'NO_AUTH_TOKEN') {
      return createAuthMessage('entities');
    }
    if (error.message === 'INVALID_TOKEN') {
      return {
        content: [{
          type: 'text',
          text: `🔐 Invalid API Key\n\n` +
                `Your API key appears to be invalid or expired.\n` +
                `Please get a new one from: https://app.purmemo.ai/settings`
        }]
      };
    }
    return {
      content: [{
        type: 'text',
        text: `❌ Error fetching entities: ${error.message}\n\n` +
              `Please check your internet connection and API key.`
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
          }],
          isError: true
        };
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `❌ Unexpected error in ${name}: ${error.message}`
      }],
      isError: true
    };
  }
});

// Start server - completely silent
const transport = new StdioServerTransport();
server.connect(transport).catch(() => process.exit(1));