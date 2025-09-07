#!/usr/bin/env node
/**
 * Purmemo MCP Server v9.0.0 - Thin Public Layer
 * 
 * This is a minimal MCP server that acts as a thin proxy to the Purmemo API.
 * All intelligence, validation, and v8.0.0 innovations are kept server-side.
 * 
 * What this does:
 * - Defines basic tool interfaces
 * - Forwards all calls to the API
 * - Returns API responses to Claude
 * 
 * What this DOESN'T do:
 * - No special prompting visible
 * - No chunking logic exposed
 * - No validation code public
 * - No secret sauce revealed
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';

const API_URL = process.env.PURMEMO_API_URL || 'https://api.purmemo.ai';
const API_KEY = process.env.PURMEMO_API_KEY;

// Simple tool definitions - no secret sauce
const TOOLS = [
  {
    name: 'save_conversation',
    description: 'Save a conversation to your Purmemo memory',
    inputSchema: {
      type: 'object',
      properties: {
        content: { 
          type: 'string', 
          description: 'The conversation content to save'
        },
        title: { 
          type: 'string', 
          description: 'Optional title for the memory'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags for categorization'
        }
      },
      required: ['content']
    }
  },
  {
    name: 'save_with_artifacts',
    description: 'Save conversation with files, images, or URLs attached',
    inputSchema: {
      type: 'object',
      properties: {
        content: { 
          type: 'string',
          description: 'Complete conversation to save (minimum 500 characters)'
        },
        title: { 
          type: 'string', 
          description: 'Optional title for the memory'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags for categorization'
        },
        artifacts: {
          type: 'array',
          items: { type: 'string' },
          description: 'File paths, URLs, or images to attach'
        }
      },
      required: ['content', 'artifacts']
    }
  },
  {
    name: 'recall_memories',
    description: 'Search and recall saved memories',
    inputSchema: {
      type: 'object',
      properties: {
        query: { 
          type: 'string',
          description: 'Search query'
        },
        limit: { 
          type: 'integer',
          description: 'Maximum results to return',
          default: 10
        }
      },
      required: ['query']
    }
  },
  {
    name: 'get_memory_details',
    description: 'Get detailed information about a specific memory',
    inputSchema: {
      type: 'object',
      properties: {
        memory_id: { 
          type: 'string',
          description: 'ID of the memory to retrieve'
        }
      },
      required: ['memory_id']
    }
  }
];

// Simple API caller - just forwards everything
async function callAPI(endpoint, data) {
  if (!API_KEY) {
    throw new Error('API key not configured. Please set PURMEMO_API_KEY environment variable.');
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'X-MCP-Version': '9.0.0'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error (${response.status}): ${error}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}

// Create and configure MCP server
const server = new Server(
  {
    name: 'purmemo-mcp',
    version: '9.0.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool calls - just forward to API
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    // Forward to API with tool name and arguments
    const result = await callAPI('/api/v9/mcp/tools/execute', {
      tool: name,
      arguments: args
    });

    // Check if API wants us to retry
    if (result.retry && result.message) {
      // API is handling the retry logic
      return {
        content: [
          {
            type: 'text',
            text: result.message
          }
        ]
      };
    }

    // Return whatever the API sends back
    return {
      content: result.content || [
        {
          type: 'text',
          text: result.message || 'Operation completed'
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Simple startup message
  console.error('Purmemo MCP Server v9.0.0 - Ready');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});