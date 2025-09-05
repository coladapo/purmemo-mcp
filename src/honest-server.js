#!/usr/bin/env node
/**
 * Honest Purmemo MCP Server v6.0
 * Actually tells you what it can and cannot do
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';

const API_URL = process.env.PURMEMO_API_URL || 'https://api.purmemo.ai';
const API_KEY = process.env.PURMEMO_API_KEY;

// Tool definitions - HONEST about capabilities
const TOOLS = [
  {
    name: 'memory',
    description: '💾 Save content to memory. NOTE: You must include the FULL content - saying "save this conversation" will NOT work!',
    inputSchema: {
      type: 'object',
      properties: {
        content: { 
          type: 'string', 
          description: 'The COMPLETE content to save. MCP cannot see conversation history!' 
        },
        title: { type: 'string', description: 'Optional: Title for the memory' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional: Tags' }
      },
      required: ['content']
    }
  },
  {
    name: 'recall',
    description: '🔍 Search your saved memories',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'integer', description: 'Max results (default: 10)', default: 10 }
      },
      required: ['query']
    }
  }
];

const server = new Server(
  { name: 'purmemo-honest', version: '6.0.0' },
  { capabilities: { tools: {} } }
);

async function makeApiCall(endpoint, options = {}) {
  if (!API_KEY) {
    throw new Error('PURMEMO_API_KEY not configured');
  }
  
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  
  if (!response.ok) {
    throw new Error(`API Error ${response.status}`);
  }
  
  return await response.json();
}

async function handleMemory(args) {
  try {
    // Check for common mistake
    if (args.content.toLowerCase() === 'save this conversation' ||
        args.content.toLowerCase() === 'save this' ||
        args.content.length < 50) {
      return {
        content: [{
          type: 'text',
          text: `⚠️ **Important Limitation**\n\n` +
                `MCP servers CANNOT access conversation history!\n\n` +
                `When you say "save this conversation", I only receive those exact words.\n\n` +
                `**To save content, you must:**\n` +
                `1. Copy the full text/artifact you want to save\n` +
                `2. Include it in your message: "Save this: [paste full content]"\n\n` +
                `What you sent: "${args.content}" (${args.content.length} characters)\n\n` +
                `This is a fundamental MCP limitation, not a bug.`
        }]
      };
    }
    
    // Extract smart context from the ACTUAL content provided
    const codeBlocks = (args.content.match(/```[\s\S]*?```/g) || []).length;
    const urls = (args.content.match(/https?:\/\/[^\s]+/g) || []).length;
    const files = (args.content.match(/[\/~][\w\-\.\/]+\.\w+/g) || []).length;
    
    // Save to API
    const data = await makeApiCall('/api/v5/memories/', {
      method: 'POST',
      body: JSON.stringify({
        content: args.content,
        title: args.title || `Memory from ${new Date().toLocaleDateString()}`,
        tags: args.tags || [],
        metadata: {
          codeBlocks,
          urls,
          files,
          characterCount: args.content.length,
          warning: args.content.length < 500 ? 'Short content - may be missing context' : null
        }
      })
    });

    return {
      content: [{
        type: 'text',
        text: `✅ Memory saved!\n\n` +
              `📝 **Content:** ${args.content.length} characters saved\n` +
              `🔗 **ID:** ${data.id || data.memory_id}\n` +
              (codeBlocks > 0 ? `💻 **Code blocks:** ${codeBlocks}\n` : '') +
              (urls > 0 ? `🔗 **URLs:** ${urls}\n` : '') +
              (files > 0 ? `📁 **Files:** ${files}\n` : '') +
              `\n⚠️ **Remember:** I can only save what you explicitly send me.\n` +
              `I cannot access conversation history or artifacts unless included.`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `❌ Error: ${error.message}`
      }]
    };
  }
}

async function handleRecall(args) {
  try {
    const params = new URLSearchParams({
      query: args.query,
      page_size: String(args.limit || 10)
    });
    
    const data = await makeApiCall(`/api/v5/memories/?${params}`, {
      method: 'GET'
    });

    const memories = data.results || data.memories || data;
    
    if (!memories || memories.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `🔍 No memories found for "${args.query}"`
        }]
      };
    }

    let resultText = `🔍 Found ${memories.length} memories for "${args.query}"\n\n`;
    
    memories.forEach((memory, index) => {
      resultText += `${index + 1}. **${memory.title || 'Untitled'}**\n`;
      resultText += `   📝 ${memory.content.substring(0, 200)}${memory.content.length > 200 ? '...' : ''}\n`;
      resultText += `   📏 Length: ${memory.content.length} characters\n`;
      if (memory.metadata?.warning) {
        resultText += `   ⚠️ ${memory.metadata.warning}\n`;
      }
      resultText += '\n';
    });

    return {
      content: [{ type: 'text', text: resultText }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `❌ Error: ${error.message}`
      }]
    };
  }
}

// Request handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  switch (name) {
    case 'memory':
      return await handleMemory(args);
    case 'recall':
      return await handleRecall(args);
    default:
      return {
        content: [{
          type: 'text',
          text: `❌ Unknown tool: ${name}`
        }]
      };
  }
});

// Start server
const transport = new StdioServerTransport();
server.connect(transport).catch(() => process.exit(1));