#!/usr/bin/env node
/**
 * Final Working Purmemo MCP Server v3.1.0
 * Fixed search endpoint to use correct HTTP method
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// Configuration
const API_URL = process.env.PURMEMO_API_URL || 'https://api.purmemo.ai';
const USER_AGENT = 'purmemo-mcp/3.1.0';

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
  { name: 'purmemo-mcp', version: '3.1.0' },
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
        username: email,  // OAuth2 uses 'username' field for email
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
  
  const defaultHeaders = {
    'Authorization': `Bearer ${token}`,
    'User-Agent': USER_AGENT
  };
  
  // Only add Content-Type for POST/PUT requests with body
  if (options.body) {
    defaultHeaders['Content-Type'] = 'application/json';
  }
  
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers
    }
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
    // FIXED: Use GET with query parameter instead of POST to /search
    const params = new URLSearchParams({
      query: args.query,
      page_size: String(args.limit || 10)
    });
    
    const data = await makeApiCall(`/api/v5/memories/?${params}`, {
      method: 'GET'  // Use GET not POST
    });

    // Handle both direct array response and paginated response
    const memories = data.results || data.memories || data;
    
    if (!memories || (Array.isArray(memories) && memories.length === 0)) {
      return {
        content: [{
          type: 'text',
          text: `🔍 No memories found for "${args.query}"`
        }]
      };
    }

    const memoryList = Array.isArray(memories) ? memories : [memories];
    let resultText = `🔍 Found ${memoryList.length} memories for "${args.query}"\n\n`;
    
    memoryList.forEach((memory, index) => {
      resultText += `${index + 1}. **${memory.title || 'Untitled'}**\n`;
      resultText += `   📝 ${memory.content.substring(0, 150)}${memory.content.length > 150 ? '...' : ''}\n`;
      if (memory.tags?.length) {
        resultText += `   🏷️ ${memory.tags.join(', ')}\n`;
      }
      if (memory.created_at) {
        resultText += `   📅 ${new Date(memory.created_at).toLocaleDateString()}\n`;
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
    
    const data = await makeApiCall(`/api/v5/entities?${params}`, {
      method: 'GET'
    });

    // Check for backend error
    if (data.error) {
      // Handle known error about missing entities table
      if (data.error.includes('entities table')) {
        return {
          content: [{
            type: 'text',
            text: `🏷️ Entity extraction is being set up\n\n` +
                  `The entity extraction feature is currently being configured.\n` +
                  `This feature will automatically extract:\n\n` +
                  `• People: names mentioned in memories\n` +
                  `• Places: locations referenced\n` +
                  `• Organizations: companies, teams\n` +
                  `• Technologies: tools, frameworks\n` +
                  `• Concepts: ideas, topics\n\n` +
                  `Please check back later once setup is complete.`
          }]
        };
      }
      // Other errors
      throw new Error(data.error);
    }

    // Handle empty entities
    if (!data.entities || data.entities.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `🏷️ No entities found\n\n` +
                `Entities are extracted from your memories. ` +
                `Save some memories first, and entities will be automatically extracted.\n\n` +
                `Examples of entities:\n` +
                `• People: names mentioned in memories\n` +
                `• Places: locations referenced\n` +
                `• Organizations: companies, teams\n` +
                `• Concepts: ideas, technologies`
        }]
      };
    }

    let resultText = `🏷️ Found ${data.entities.length} entities\n\n`;
    
    data.entities.forEach(entity => {
      // Handle both camelCase and snake_case field names
      const name = entity.name || entity.entity_name;
      const type = entity.entityType || entity.entity_type || entity.type;
      const occurrences = entity.metrics?.occurrences || entity.occurrence_count || entity.frequency;
      
      resultText += `**${name}** (${type})\n`;
      if (occurrences) {
        resultText += `   📊 Mentioned ${occurrences} times\n`;
      }
      if (entity.metrics?.confidence) {
        resultText += `   🎯 Confidence: ${(entity.metrics.confidence * 100).toFixed(0)}%\n`;
      }
      resultText += '\n';
    });

    if (data.summary) {
      resultText += `\n📈 Summary:\n`;
      resultText += `   Total entities: ${data.summary.totalEntities}\n`;
      resultText += `   Types found: ${data.summary.typesFound}\n`;
      if (data.summary.averageConfidence) {
        resultText += `   Average confidence: ${(data.summary.averageConfidence * 100).toFixed(0)}%\n`;
      }
    }

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