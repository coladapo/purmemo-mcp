#!/usr/bin/env node
/**
 * Minimal Purmemo MCP Server - No Console Output
 * Emergency version for Claude Desktop compatibility
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// Direct API communication without OAuth dependencies
const API_URL = process.env.PURMEMO_API_URL || 'https://api.purmemo.ai';

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
  },
  {
    name: 'attach',
    description: '📎 Attach files to an existing memory',
    inputSchema: {
      type: 'object',
      properties: {
        memory_id: { type: 'string', description: 'Memory ID to attach files to' },
        file_paths: { type: 'array', items: { type: 'string' }, description: 'File paths or URLs' }
      },
      required: ['memory_id', 'file_paths']
    }
  },
  {
    name: 'correction',
    description: '✏️ Add a correction to an existing memory',
    inputSchema: {
      type: 'object',
      properties: {
        memory_id: { type: 'string', description: 'ID of the memory to correct' },
        correction: { type: 'string', description: 'The corrected content' },
        reason: { type: 'string', description: 'Optional: Reason for the correction' }
      },
      required: ['memory_id', 'correction']
    }
  }
];

// Create server
const server = new Server(
  { name: 'purmemo-mcp', version: '2.1.6' },
  { capabilities: { tools: {} } }
);

// Get auth token from environment
function getAuthToken() {
  return process.env.PUO_MEMO_API_KEY || null;
}

// Create auth message
function createAuthMessage(toolName) {
  return {
    content: [{
      type: 'text',
      text: `🔐 Authentication Required for ${toolName}\n\n` +
            `To use Purmemo tools, get your API key from:\n` +
            `https://app.purmemo.ai/settings\n\n` +
            `Then add it to your Claude Desktop config:\n` +
            `"env": { "PUO_MEMO_API_KEY": "your-key-here" }`
    }]
  };
}

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const token = getAuthToken();
  
  if (!token) {
    return createAuthMessage(name);
  }

  try {
    let response;
    
    switch (name) {
      case 'memory':
        response = await fetch(`${API_URL}/api/v5/memories/`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'purmemo-mcp/2.1.6'
          },
          body: JSON.stringify({
            content: args.content,
            title: args.title,
            tags: args.tags || []
          })
        });
        break;
        
      case 'recall':
        response = await fetch(`${API_URL}/api/v5/memories/search`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'purmemo-mcp/2.1.6'
          },
          body: JSON.stringify({
            query: args.query,
            limit: args.limit || 10
          })
        });
        break;
        
      case 'entities':
        const params = new URLSearchParams();
        if (args.entity_name) params.set('name', args.entity_name);
        if (args.entity_type) params.set('type', args.entity_type);
        
        response = await fetch(`${API_URL}/api/v5/entities?${params}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'purmemo-mcp/2.1.6'
          }
        });
        break;
        
      case 'attach':
        response = await fetch(`${API_URL}/api/v5/memories/${args.memory_id}/attachments`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'purmemo-mcp/2.1.6'
          },
          body: JSON.stringify({ file_paths: args.file_paths })
        });
        break;
        
      case 'correction':
        response = await fetch(`${API_URL}/api/v5/memories/${args.memory_id}/corrections`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'purmemo-mcp/2.1.6'
          },
          body: JSON.stringify({
            correction: args.correction,
            reason: args.reason
          })
        });
        break;
        
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401) {
        return createAuthMessage(name);
      }
      throw new Error(`API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    return {
      content: [{
        type: 'text',
        text: `✅ ${name} completed successfully!\n\n${JSON.stringify(data, null, 2)}`
      }]
    };

  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `❌ Error executing ${name}: ${error.message}`
      }]
    };
  }
});

// Start server silently
const transport = new StdioServerTransport();
await server.connect(transport);