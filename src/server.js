#!/usr/bin/env node
/**
 * PUO Memo MCP Server - Secure Thin Client v1.0.6
 * All processing happens on PUO Memo servers
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fetch from 'node-fetch';

// Check for required environment variables
const API_KEY = process.env.PUO_MEMO_API_KEY;
const API_URL = process.env.PUO_MEMO_API_URL || 'https://api.puo-memo.com';

if (!API_KEY) {
  console.error('❌ PUO_MEMO_API_KEY environment variable is required');
  console.error('Get your API key at https://api.puo-memo.com');
  process.exit(1);
}

// Tool definitions - just schemas, no implementation
const TOOLS = [
  {
    name: 'memory',
    description: '💾 Save anything to memory',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'What to remember' },
        title: { type: 'string', description: 'Optional: Title for the memory' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional: Tags' },
        attachments: { type: 'array', items: { type: 'string' }, description: 'Optional: File paths or URLs' }
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
        limit: { type: 'integer', description: 'How many results (default: 10)', default: 10 },
        search_type: { type: 'string', enum: ['keyword', 'semantic', 'hybrid'], default: 'hybrid' }
      }
    }
  },
  {
    name: 'entities',
    description: '🧠 List entities or get entity graph',
    inputSchema: {
      type: 'object',
      properties: {
        entity_name: { type: 'string', description: 'Entity to get graph for' },
        entity_type: { 
          type: 'string', 
          enum: ['person', 'organization', 'location', 'event', 'project'],
          description: 'Filter by entity type'
        }
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

// Create MCP server
const server = new Server(
  {
    name: 'puo-memo',
    vendor: 'PUO Memo',
    version: '1.0.6'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS
}));

// Handle tool execution - forward all to API
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    let response;
    
    switch (name) {
      case 'memory':
        // POST request for creating memory
        response = await fetch(`${API_URL}/api/v5/memories`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
            'User-Agent': 'puo-memo-mcp/1.0.6'
          },
          body: JSON.stringify(args)
        });
        break;
        
      case 'recall':
        // GET request for search
        const searchParams = new URLSearchParams({
          q: args.query || '',
          limit: args.limit || 10,
          search_type: args.search_type || 'hybrid'
        });
        response = await fetch(`${API_URL}/api/v5/memories/search?${searchParams}`, {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'User-Agent': 'puo-memo-mcp/1.0.6'
          }
        });
        break;
        
      case 'entities':
        // GET request for entities
        const entityParams = new URLSearchParams();
        if (args.entity_name) entityParams.append('name', args.entity_name);
        if (args.entity_type) entityParams.append('type', args.entity_type);
        
        response = await fetch(`${API_URL}/api/v5/entities?${entityParams}`, {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'User-Agent': 'puo-memo-mcp/1.0.6'
          }
        });
        break;
        
      case 'attach':
        // POST request for attachments
        response = await fetch(`${API_URL}/api/v5/memories/${args.memory_id}/attachments`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
            'User-Agent': 'puo-memo-mcp/1.0.6'
          },
          body: JSON.stringify({ file_paths: args.file_paths })
        });
        break;
        
      case 'correction':
        // POST request for corrections
        response = await fetch(`${API_URL}/api/v5/memories/${args.memory_id}/corrections`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
            'User-Agent': 'puo-memo-mcp/1.0.6'
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
      const error = await response.text();
      throw new Error(`API error: ${error}`);
    }
    
    const result = await response.json();
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }]
    };
    
  } catch (error) {
    console.error('Tool execution error:', error);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: error.message }, null, 2)
      }]
    };
  }
});

// Start the server
async function main() {
  console.error('🚀 PUO Memo MCP Server v1.0.6 - Secure Thin Client');
  console.error('📡 Connected to:', API_URL);
  console.error('🔐 Using API key authentication');
  console.error('💡 All processing happens on PUO Memo servers');
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});