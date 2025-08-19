#!/usr/bin/env node
/**
 * Complete Purmemo MCP Server v4.0.0
 * Implements all 7 backend-supported MCP tools for comprehensive memory management
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// Configuration
const API_URL = process.env.PURMEMO_API_URL || 'https://api.purmemo.ai';
const USER_AGENT = 'purmemo-mcp/4.0.0';

// Store auth token in memory
let authToken = null;
let tokenExpiry = null;

// Complete tool definitions (7 tools total)
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
    description: '🏷️ Extract and list entities from memories',
    inputSchema: {
      type: 'object',
      properties: {
        entity_type: { type: 'string', description: 'Optional: Filter by entity type (person, place, organization, concept)' },
        limit: { type: 'integer', description: 'How many entities (default: 100)', default: 100 }
      }
    }
  },
  {
    name: 'attach',
    description: '📎 Attach files or URLs to a memory',
    inputSchema: {
      type: 'object',
      properties: {
        memory_id: { type: 'string', description: 'Memory ID to attach to' },
        file_paths: { type: 'array', items: { type: 'string' }, description: 'File paths or URLs to attach' }
      },
      required: ['memory_id', 'file_paths']
    }
  },
  {
    name: 'correct',
    description: '✏️ Add correction to a memory (version control)',
    inputSchema: {
      type: 'object',
      properties: {
        memory_id: { type: 'string', description: 'Memory ID to correct' },
        correction: { type: 'string', description: 'Corrected content' },
        reason: { type: 'string', description: 'Optional: Reason for correction' }
      },
      required: ['memory_id', 'correction']
    }
  },
  {
    name: 'entity_graph',
    description: '🕸️ Explore entity relationship graph',
    inputSchema: {
      type: 'object',
      properties: {
        entity_name: { type: 'string', description: 'Entity name to explore' },
        depth: { type: 'integer', description: 'Graph depth (1-3, default: 1)', default: 1, minimum: 1, maximum: 3 }
      },
      required: ['entity_name']
    }
  },
  {
    name: 'entity_search',
    description: '🔎 Advanced entity search with filtering',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Search entities by name' },
        type: { type: 'string', description: 'Filter by type: person, place, organization, concept, technology' },
        min_mentions: { type: 'integer', description: 'Minimum mention count' },
        limit: { type: 'integer', description: 'Results limit (default: 50)', default: 50 }
      }
    }
  }
];

// Create server
const server = new Server(
  { name: 'purmemo-mcp-complete', version: '4.0.0' },
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
              (args.tags?.length ? `🏷️ Tags: ${args.tags.join(', ')}\n` : '') +
              `\n💡 You can now attach files or add corrections using the memory ID.`
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
    // Use GET with query parameter (fixed method)
    const params = new URLSearchParams({
      query: args.query,
      page_size: String(args.limit || 10)
    });
    
    const data = await makeApiCall(`/api/v5/memories/?${params}`, {
      method: 'GET'
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
      resultText += `   🆔 ID: ${memory.id}\n`;
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
    if (args.entity_type) params.set('entity_type', args.entity_type);
    if (args.limit) params.set('limit', String(args.limit));
    
    const data = await makeApiCall(`/api/v5/entities?${params}`, {
      method: 'GET'
    });

    // Check for backend error
    if (data.error) {
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
      const name = entity.name || entity.entity_name;
      const type = entity.entityType || entity.entity_type || entity.type;
      const mentions = entity.mention_count || entity.occurrence_count || 0;
      
      resultText += `**${name}** (${type})\n`;
      if (mentions) {
        resultText += `   📊 Mentioned ${mentions} times\n`;
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

async function handleAttach(args) {
  try {
    const data = await makeApiCall(`/api/v5/memories/${args.memory_id}/attachments`, {
      method: 'POST',
      body: JSON.stringify({
        file_paths: args.file_paths
      })
    });

    let resultText = `📎 Successfully attached ${data.count || args.file_paths.length} files to memory ${args.memory_id}\n\n`;
    
    if (data.attachments) {
      data.attachments.forEach((attachment, index) => {
        const fileName = attachment.file_name || attachment.filename || 'Unknown';
        const filePath = attachment.file_path || attachment.storage_path || 'Unknown path';
        const isUrl = filePath.startsWith('http');
        
        resultText += `${index + 1}. ${isUrl ? '🌐' : '📄'} **${fileName}**\n`;
        resultText += `   🔗 Path: ${filePath}\n`;
        resultText += `   📋 Type: ${attachment.mime_type || 'Unknown'}\n\n`;
      });
    }

    return {
      content: [{ type: 'text', text: resultText }]
    };
  } catch (error) {
    if (error.message === 'NO_AUTH') {
      return createAuthMessage('attach');
    }
    return {
      content: [{
        type: 'text',
        text: `❌ Error attaching files: ${error.message}`
      }]
    };
  }
}

async function handleCorrect(args) {
  try {
    const data = await makeApiCall(`/api/v5/memories/${args.memory_id}/corrections`, {
      method: 'POST',
      body: JSON.stringify({
        correction: args.correction,
        reason: args.reason || 'User correction'
      })
    });

    return {
      content: [{
        type: 'text',
        text: `✏️ Correction added successfully!\n\n` +
              `🆔 Memory ID: ${args.memory_id}\n` +
              `📝 Correction: ${args.correction}\n` +
              `💭 Reason: ${args.reason || 'User correction'}\n\n` +
              `✅ Original content preserved with version control.`
      }]
    };
  } catch (error) {
    if (error.message === 'NO_AUTH') {
      return createAuthMessage('correct');
    }
    return {
      content: [{
        type: 'text',
        text: `❌ Error adding correction: ${error.message}`
      }]
    };
  }
}

async function handleEntityGraph(args) {
  try {
    const params = new URLSearchParams();
    if (args.depth) params.set('depth', String(args.depth));
    
    const data = await makeApiCall(`/api/v5/entities/${args.entity_name}/graph?${params}`, {
      method: 'GET'
    });

    let resultText = `🕸️ Entity relationship graph for "${args.entity_name}"\n\n`;
    
    if (data.entity) {
      const entity = data.entity;
      resultText += `**${entity.name}** (${entity.type})\n`;
      resultText += `📊 Mentioned ${entity.mention_count} times\n`;
      resultText += `📅 First seen: ${new Date(entity.first_seen).toLocaleDateString()}\n`;
      resultText += `📅 Last seen: ${new Date(entity.last_seen).toLocaleDateString()}\n\n`;
    }

    if (data.statistics) {
      resultText += `📈 Graph Statistics:\n`;
      resultText += `   Total memories: ${data.statistics.total_memories}\n`;
      resultText += `   Connected entities: ${data.statistics.connected_entities}\n`;
      resultText += `   Graph depth: ${data.statistics.graph_depth}\n\n`;
    }

    if (data.graph && data.graph.nodes && data.graph.nodes.length > 0) {
      resultText += `🔗 Connected entities:\n`;
      data.graph.nodes.forEach(node => {
        if (node.name !== args.entity_name) {
          resultText += `   • ${node.name} (${node.type})\n`;
        }
      });
    }

    return {
      content: [{ type: 'text', text: resultText }]
    };
  } catch (error) {
    if (error.message === 'NO_AUTH') {
      return createAuthMessage('entity_graph');
    }
    return {
      content: [{
        type: 'text',
        text: `❌ Error fetching entity graph: ${error.message}`
      }]
    };
  }
}

async function handleEntitySearch(args) {
  try {
    const params = new URLSearchParams();
    if (args.name) params.set('name', args.name);
    if (args.type) params.set('entity_type', args.type);
    if (args.limit) params.set('limit', String(args.limit));
    
    const data = await makeApiCall(`/api/v5/entities?${params}`, {
      method: 'GET'
    });

    // Check for backend error
    if (data.error) {
      if (data.error.includes('entities table')) {
        return {
          content: [{
            type: 'text',
            text: `🔎 Entity search unavailable\n\n` +
                  `The entity extraction feature is currently being configured.\n` +
                  `Please check back later once setup is complete.`
          }]
        };
      }
      throw new Error(data.error);
    }

    if (!data.entities || data.entities.length === 0) {
      let searchCriteria = [];
      if (args.name) searchCriteria.push(`name containing "${args.name}"`);
      if (args.type) searchCriteria.push(`type "${args.type}"`);
      if (args.min_mentions) searchCriteria.push(`min ${args.min_mentions} mentions`);
      
      return {
        content: [{
          type: 'text',
          text: `🔎 No entities found matching ${searchCriteria.join(', ')}\n\n` +
                `Try broadening your search criteria or save more memories for entity extraction.`
        }]
      };
    }

    let resultText = `🔎 Entity search results (${data.entities.length} found)\n\n`;
    
    // Group by type for better organization
    const entityTypes = {};
    data.entities.forEach(entity => {
      const type = entity.type || 'unknown';
      if (!entityTypes[type]) entityTypes[type] = [];
      entityTypes[type].push(entity);
    });

    Object.entries(entityTypes).forEach(([type, entities]) => {
      resultText += `## ${type.toUpperCase()} (${entities.length})\n`;
      entities.forEach(entity => {
        const mentions = entity.mention_count || 0;
        resultText += `   • **${entity.name}** - ${mentions} mentions\n`;
        if (args.min_mentions && mentions < args.min_mentions) {
          // This shouldn't happen due to backend filtering, but just in case
          return;
        }
      });
      resultText += '\n';
    });

    return {
      content: [{ type: 'text', text: resultText }]
    };
  } catch (error) {
    if (error.message === 'NO_AUTH') {
      return createAuthMessage('entity_search');
    }
    return {
      content: [{
        type: 'text',
        text: `❌ Error searching entities: ${error.message}`
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
      case 'attach':
        return await handleAttach(args);
      case 'correct':
        return await handleCorrect(args);
      case 'entity_graph':
        return await handleEntityGraph(args);
      case 'entity_search':
        return await handleEntitySearch(args);
      default:
        return {
          content: [{
            type: 'text',
            text: `❌ Unknown tool: ${name}\n\nAvailable tools:\n• memory - Save memories\n• recall - Search memories\n• entities - List entities\n• attach - Attach files\n• correct - Add corrections\n• entity_graph - Explore relationships\n• entity_search - Advanced entity search`
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