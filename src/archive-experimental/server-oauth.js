#!/usr/bin/env node
/**
 * pūrmemo MCP Server v2.1.0 - Fixed OAuth Support
 * Non-blocking authentication for Claude Desktop compatibility
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fetch from 'node-fetch';
import OAuthManager from './auth/oauth-manager.js';

// Initialize OAuth manager
const authManager = new OAuthManager({
  apiUrl: process.env.PUO_MEMO_API_URL || 'https://api.purmemo.ai'
});

// API URL configuration
const API_URL = process.env.PUO_MEMO_API_URL || 'https://api.purmemo.ai';

// User state
let userInfo = null;
let memoryCount = 0;
let isAuthenticationInProgress = false;

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
        search_type: { 
          type: 'string', 
          enum: ['keyword', 'semantic', 'hybrid'],
          default: 'hybrid'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'entities',
    description: '🏷️ Extract entities from memories (people, places, concepts)',
    inputSchema: {
      type: 'object',
      properties: {
        entity_name: { type: 'string', description: 'Optional: Specific entity to look up' },
        entity_type: { 
          type: 'string',
          enum: ['person', 'organization', 'location', 'concept', 'technology', 'project', 'document', 'event'],
          description: 'Optional: Filter by entity type'
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

/**
 * Get authentication token - NON-BLOCKING version
 * Returns null if no token available, doesn't wait for OAuth
 */
async function getAuthTokenNonBlocking() {
  try {
    // Only get existing token, don't trigger OAuth flow
    const token = await authManager.getToken();
    return token;
  } catch (error) {
    // Silent error handling for MCP compatibility
    return null;
  }
}

/**
 * Create helpful authentication message
 */
function createAuthMessage(toolName) {
  return {
    content: [
      {
        type: 'text',
        text: `🔐 Authentication Required for ${toolName}\n\n` +
              `To use Purmemo tools, you need to authenticate first.\n\n` +
              `🚀 **Quick Setup:**\n` +
              `1. Run in terminal: \`npx purmemo-mcp setup\`\n` +
              `2. Follow the OAuth flow\n` +
              `3. Come back and try again!\n\n` +
              `🌐 **Alternative Setup:**\n` +
              `• Visit: https://app.purmemo.ai/settings\n` +
              `• Generate an API key\n` +
              `• Set environment variable: \`PUO_MEMO_API_KEY=your_key\`\n\n` +
              `After authentication, all tools will work seamlessly! 🚀`
      }
    ]
  };
}

/**
 * Check memory limit without blocking
 */
async function checkMemoryLimit(token) {
  if (!userInfo || !token) return { exceeded: false };
  
  try {
    const response = await fetch(`${API_URL}/api/v5/memories?limit=1`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'purmemo-mcp/2.1.0'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      memoryCount = data.total_count || 0;
      
      if (memoryCount >= userInfo.memory_limit) {
        return {
          exceeded: true,
          message: `You've reached your free tier limit of ${userInfo.memory_limit} memories. Upgrade to Pro at https://app.purmemo.ai for unlimited memories.`,
          current: memoryCount,
          limit: userInfo.memory_limit
        };
      }
    }
  } catch (error) {
    // Silent error handling for MCP compatibility
  }
  
  return { exceeded: false };
}

// Create server
const server = new Server(
  {
    name: 'purmemo-mcp',
    version: '2.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS
}));

// Handle tool execution - NON-BLOCKING VERSION
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    // Get auth token without blocking
    const token = await getAuthTokenNonBlocking();
    
    // If no token, return helpful auth message instead of hanging
    if (!token) {
      return createAuthMessage(name);
    }
    
    // Proceed with authenticated tool execution
    switch (name) {
      case 'memory':
        return await handleMemory(args, token);
      case 'recall':
        return await handleRecall(args, token);
      case 'entities':
        return await handleEntities(args, token);
      case 'attach':
        return await handleAttach(args, token);
      case 'correction':
        return await handleCorrection(args, token);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ Error executing ${name}: ${error.message}\n\n` +
                `If this is an authentication error, please run: \`npx purmemo-mcp setup\``
        }
      ]
    };
  }
});

// Tool handlers (implement the actual API calls)
async function handleMemory(args, token) {
  const limitCheck = await checkMemoryLimit(token);
  if (limitCheck.exceeded) {
    return {
      content: [
        {
          type: 'text',
          text: `💾 Memory Limit Reached\n\n${limitCheck.message}`
        }
      ]
    };
  }

  const response = await fetch(`${API_URL}/api/v5/memories/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'purmemo-mcp/2.1.0'
    },
    body: JSON.stringify({
      content: args.content,
      title: args.title,
      tags: args.tags || [],
      attachments: args.attachments || []
    })
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.detail || 'Failed to create memory');
  }

  memoryCount++;
  
  return {
    content: [
      {
        type: 'text',
        text: `💾 Memory Saved Successfully!\n\n` +
              `📝 **Content:** ${args.content}\n` +
              `🔗 **ID:** ${data.memory_id}\n` +
              (args.title ? `📋 **Title:** ${args.title}\n` : '') +
              (args.tags?.length ? `🏷️ **Tags:** ${args.tags.join(', ')}\n` : '') +
              `📊 **Total Memories:** ${memoryCount}\n\n` +
              `✨ Your memory is now part of your AI-powered second brain!`
      }
    ]
  };
}

async function handleRecall(args, token) {
  const response = await fetch(`${API_URL}/api/v5/memories/search`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'purmemo-mcp/2.1.0'
    },
    body: JSON.stringify({
      query: args.query,
      limit: args.limit || 10,
      search_type: args.search_type || 'hybrid'
    })
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.detail || 'Failed to search memories');
  }

  if (!data.results || data.results.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: `🔍 No Memories Found\n\n` +
                `Query: "${args.query}"\n` +
                `No matching memories were found. Try different keywords or create some memories first!`
        }
      ]
    };
  }

  let resultText = `🔍 Found ${data.results.length} memories for "${args.query}"\n\n`;
  
  data.results.forEach((memory, index) => {
    resultText += `${index + 1}. **${memory.title || 'Untitled'}**\n`;
    resultText += `   📝 ${memory.content.substring(0, 150)}${memory.content.length > 150 ? '...' : ''}\n`;
    resultText += `   📅 ${new Date(memory.created_at).toLocaleDateString()}\n`;
    if (memory.tags?.length) {
      resultText += `   🏷️ ${memory.tags.join(', ')}\n`;
    }
    resultText += `   🔗 ID: ${memory.memory_id}\n\n`;
  });

  return {
    content: [
      {
        type: 'text',
        text: resultText
      }
    ]
  };
}

async function handleEntities(args, token) {
  const queryParams = new URLSearchParams();
  if (args.entity_name) queryParams.set('entity_name', args.entity_name);
  if (args.entity_type) queryParams.set('entity_type', args.entity_type);

  const response = await fetch(`${API_URL}/api/v5/entities?${queryParams}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'purmemo-mcp/2.1.0'
    }
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.detail || 'Failed to get entities');
  }

  if (!data.entities || data.entities.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: `🏷️ No Entities Found\n\n` +
                `No entities match your criteria. Add more memories to extract entities!`
        }
      ]
    };
  }

  let resultText = `🏷️ Found ${data.entities.length} entities\n\n`;
  
  data.entities.forEach(entity => {
    resultText += `**${entity.name}** (${entity.type})\n`;
    resultText += `   📊 Mentioned ${entity.frequency} times\n`;
    if (entity.description) {
      resultText += `   📝 ${entity.description}\n`;
    }
    resultText += `\n`;
  });

  return {
    content: [
      {
        type: 'text',
        text: resultText
      }
    ]
  };
}

async function handleAttach(args, token) {
  const response = await fetch(`${API_URL}/api/v5/memories/${args.memory_id}/attachments`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'purmemo-mcp/2.1.0'
    },
    body: JSON.stringify({
      file_paths: args.file_paths
    })
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.detail || 'Failed to attach files');
  }

  return {
    content: [
      {
        type: 'text',
        text: `📎 Files Attached Successfully!\n\n` +
              `Memory ID: ${args.memory_id}\n` +
              `Attached ${args.file_paths.length} file(s):\n` +
              args.file_paths.map(path => `• ${path}`).join('\n')
      }
    ]
  };
}

async function handleCorrection(args, token) {
  const response = await fetch(`${API_URL}/api/v5/memories/${args.memory_id}/corrections`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'purmemo-mcp/2.1.0'
    },
    body: JSON.stringify({
      correction: args.correction,
      reason: args.reason
    })
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.detail || 'Failed to add correction');
  }

  return {
    content: [
      {
        type: 'text',
        text: `✏️ Correction Added Successfully!\n\n` +
              `Memory ID: ${args.memory_id}\n` +
              `Correction: ${args.correction}\n` +
              (args.reason ? `Reason: ${args.reason}\n` : '') +
              `\n✨ Your memory has been updated!`
      }
    ]
  };
}

// Start server
async function main() {
  // Silent startup for MCP protocol compatibility
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  process.exit(1);
});