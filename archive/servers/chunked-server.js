#!/usr/bin/env node
/**
 * Purmemo MCP Server with Chunked Capture Support v8.0
 * Handles large content by splitting into multiple linked memories
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import crypto from 'crypto';

const API_URL = process.env.PURMEMO_API_URL || 'https://api.purmemo.ai';
const API_KEY = process.env.PURMEMO_API_KEY;

// REAL limits based on testing
const CHUNK_SIZE = 20000; // 20K chars per chunk (safe under Node buffer limits)
const MAX_TOOL_CALL_SIZE = 15000; // What Claude can reliably send per tool call
const API_MAX_SIZE = 100000; // API's hard limit

// Session storage for multi-part captures
const captureSession = {
  active: {},
  completed: {}
};

// Tool definitions
const TOOLS = [
  {
    name: 'start_chunked_capture',
    description: `Start a multi-part capture session for large conversations.
    Use this when you have more than 15K characters to save.
    This will return a session ID to use with continue_capture.`,
    inputSchema: {
      type: 'object',
      properties: {
        title: { 
          type: 'string', 
          description: 'Title for the complete capture' 
        },
        totalParts: {
          type: 'integer',
          description: 'Estimated number of parts (chunks) you will send',
          minimum: 2
        },
        estimatedTotalSize: {
          type: 'integer',
          description: 'Estimated total characters across all parts'
        },
        metadata: {
          type: 'object',
          description: 'Metadata about the full conversation',
          properties: {
            hasArtifacts: { type: 'boolean' },
            artifactCount: { type: 'integer' },
            codeBlockCount: { type: 'integer' },
            messageCount: { type: 'integer' }
          }
        }
      },
      required: ['title', 'totalParts']
    }
  },
  {
    name: 'continue_capture',
    description: `Continue adding content to a chunked capture session.
    Send up to 15K characters per call. Call multiple times as needed.
    Include part number to maintain order.`,
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Session ID from start_chunked_capture'
        },
        partNumber: {
          type: 'integer',
          description: 'Which part this is (1, 2, 3, etc.)',
          minimum: 1
        },
        content: {
          type: 'string',
          description: 'Content chunk (up to 15K chars). Can be conversation, artifacts, or code.',
          maxLength: 15000
        },
        contentType: {
          type: 'string',
          enum: ['conversation', 'artifact', 'code', 'mixed'],
          description: 'Type of content in this chunk'
        },
        isLastPart: {
          type: 'boolean',
          description: 'Set to true for the final chunk',
          default: false
        }
      },
      required: ['sessionId', 'partNumber', 'content']
    }
  },
  {
    name: 'finalize_capture',
    description: `Finalize a chunked capture session and save all parts as linked memories.
    This will combine smaller chunks into optimal sizes and create navigation links.`,
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Session ID to finalize'
        },
        createIndex: {
          type: 'boolean',
          description: 'Create an index memory with links to all parts',
          default: true
        }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'single_capture',
    description: `For smaller captures under 15K chars. Falls back to chunked if content is too large.
    This is the simple option when you know content fits in one save.`,
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Complete content to save (will auto-chunk if > 15K)'
        },
        title: {
          type: 'string',
          description: 'Title for the memory'
        },
        includeMetadata: {
          type: 'boolean',
          description: 'Extract and include metadata',
          default: true
        }
      },
      required: ['content']
    }
  },
  {
    name: 'recall_chunked',
    description: 'Search memories including chunked captures',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        includeLinked: {
          type: 'boolean',
          description: 'Include linked memories from chunked captures',
          default: true
        },
        limit: { type: 'integer', default: 10 }
      },
      required: ['query']
    }
  }
];

const server = new Server(
  { name: 'purmemo-chunked', version: '8.0.0' },
  { capabilities: { tools: {} } }
);

async function makeApiCall(endpoint, options = {}) {
  if (!API_KEY) throw new Error('PURMEMO_API_KEY not configured');
  
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error ${response.status}: ${error}`);
  }
  
  return await response.json();
}

async function handleStartChunkedCapture(args) {
  const sessionId = crypto.randomBytes(16).toString('hex');
  
  captureSession.active[sessionId] = {
    id: sessionId,
    title: args.title,
    totalParts: args.totalParts,
    estimatedTotalSize: args.estimatedTotalSize || 0,
    metadata: args.metadata || {},
    parts: [],
    startedAt: new Date().toISOString(),
    memoryIds: []
  };
  
  return {
    content: [{
      type: 'text',
      text: `✅ Chunked capture session started!\n\n` +
            `📝 Session ID: ${sessionId}\n` +
            `📦 Expected parts: ${args.totalParts}\n` +
            `📏 Estimated size: ${args.estimatedTotalSize || 'Unknown'}\n\n` +
            `Use 'continue_capture' with this session ID to add content.\n` +
            `Each part can be up to 15,000 characters.\n` +
            `Call 'finalize_capture' when all parts are sent.`
    }]
  };
}

async function handleContinueCapture(args) {
  const session = captureSession.active[args.sessionId];
  
  if (!session) {
    return {
      content: [{
        type: 'text',
        text: `❌ Session not found: ${args.sessionId}\n\n` +
              `Start a new session with 'start_chunked_capture' first.`
      }]
    };
  }
  
  // Store the part
  session.parts[args.partNumber - 1] = {
    partNumber: args.partNumber,
    content: args.content,
    contentType: args.contentType || 'mixed',
    size: args.content.length,
    receivedAt: new Date().toISOString()
  };
  
  const receivedParts = session.parts.filter(p => p).length;
  const totalSize = session.parts.reduce((sum, p) => sum + (p?.size || 0), 0);
  
  // Auto-finalize if last part
  if (args.isLastPart || receivedParts === session.totalParts) {
    return await handleFinalizeCapture({ sessionId: args.sessionId, createIndex: true });
  }
  
  return {
    content: [{
      type: 'text',
      text: `✅ Part ${args.partNumber} received!\n\n` +
            `📦 Size: ${args.content.length} characters\n` +
            `📊 Progress: ${receivedParts}/${session.totalParts} parts\n` +
            `📏 Total so far: ${totalSize} characters\n` +
            `🔄 Type: ${args.contentType || 'mixed'}\n\n` +
            (args.isLastPart ? 'Finalizing capture...' : 
             `Continue with part ${receivedParts + 1} or call 'finalize_capture'.`)
    }]
  };
}

async function handleFinalizeCapture(args) {
  const session = captureSession.active[args.sessionId];
  
  if (!session) {
    return {
      content: [{
        type: 'text',
        text: `❌ Session not found: ${args.sessionId}`
      }]
    };
  }
  
  // Combine parts into optimal chunks for API
  const combinedParts = [];
  let currentChunk = '';
  let chunkMetadata = { types: new Set(), partNumbers: [] };
  
  // Sort parts by part number
  const sortedParts = session.parts
    .filter(p => p)
    .sort((a, b) => a.partNumber - b.partNumber);
  
  for (const part of sortedParts) {
    // If adding this part would exceed API limit, save current chunk
    if (currentChunk.length + part.content.length > API_MAX_SIZE - 1000) {
      if (currentChunk) {
        combinedParts.push({
          content: currentChunk,
          metadata: { ...chunkMetadata, types: Array.from(chunkMetadata.types) }
        });
      }
      currentChunk = part.content;
      chunkMetadata = { types: new Set([part.contentType]), partNumbers: [part.partNumber] };
    } else {
      currentChunk += '\n\n' + part.content;
      chunkMetadata.types.add(part.contentType);
      chunkMetadata.partNumbers.push(part.partNumber);
    }
  }
  
  // Save last chunk
  if (currentChunk) {
    combinedParts.push({
      content: currentChunk,
      metadata: { ...chunkMetadata, types: Array.from(chunkMetadata.types) }
    });
  }
  
  // Save each combined chunk to API
  const savedMemories = [];
  for (let i = 0; i < combinedParts.length; i++) {
    const chunk = combinedParts[i];
    const isLast = i === combinedParts.length - 1;
    
    try {
      const memory = await makeApiCall('/api/v5/memories/', {
        method: 'POST',
        body: JSON.stringify({
          title: `${session.title} - Part ${i + 1}/${combinedParts.length}`,
          content: chunk.content,
          tags: ['chunked-capture', `session-${args.sessionId}`, ...chunk.metadata.types],
          metadata: {
            sessionId: args.sessionId,
            partNumber: i + 1,
            totalParts: combinedParts.length,
            includedParts: chunk.metadata.partNumbers,
            contentTypes: chunk.metadata.types,
            originalMetadata: session.metadata,
            captureType: 'chunked',
            size: chunk.content.length,
            isLastPart: isLast
          }
        })
      });
      
      savedMemories.push({
        id: memory.id,
        size: chunk.content.length,
        part: i + 1
      });
      
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ Error saving part ${i + 1}: ${error.message}\n\n` +
                `Successfully saved: ${savedMemories.length} parts\n` +
                `Failed at: Part ${i + 1}`
        }]
      };
    }
  }
  
  // Create index memory if requested
  let indexId = null;
  if (args.createIndex && savedMemories.length > 1) {
    try {
      const indexContent = `# ${session.title} - Complete Capture Index\n\n` +
        `## Capture Summary\n` +
        `- Total Parts: ${combinedParts.length}\n` +
        `- Total Size: ${savedMemories.reduce((sum, m) => sum + m.size, 0)} characters\n` +
        `- Captured: ${session.startedAt}\n` +
        `- Session: ${args.sessionId}\n\n` +
        `## Parts\n` +
        savedMemories.map(m => 
          `- Part ${m.part}: ${m.size} chars [Memory ID: ${m.id}]`
        ).join('\n') +
        `\n\n## Metadata\n` +
        JSON.stringify(session.metadata, null, 2);
      
      const index = await makeApiCall('/api/v5/memories/', {
        method: 'POST',
        body: JSON.stringify({
          title: `${session.title} - Index`,
          content: indexContent,
          tags: ['chunked-index', `session-${args.sessionId}`],
          metadata: {
            type: 'index',
            sessionId: args.sessionId,
            linkedMemories: savedMemories.map(m => m.id),
            totalSize: savedMemories.reduce((sum, m) => sum + m.size, 0)
          }
        })
      });
      
      indexId = index.id;
    } catch (error) {
      console.error('Failed to create index:', error);
    }
  }
  
  // Move session to completed
  captureSession.completed[args.sessionId] = {
    ...session,
    completedAt: new Date().toISOString(),
    savedMemories,
    indexId
  };
  delete captureSession.active[args.sessionId];
  
  const totalSize = savedMemories.reduce((sum, m) => sum + m.size, 0);
  
  return {
    content: [{
      type: 'text',
      text: `✅ Chunked capture finalized!\n\n` +
            `📊 Summary:\n` +
            `- Original parts received: ${sortedParts.length}\n` +
            `- Optimized into: ${savedMemories.length} memories\n` +
            `- Total saved: ${totalSize} characters\n` +
            (indexId ? `- Index created: ${indexId}\n` : '') +
            `\n📦 Saved Memories:\n` +
            savedMemories.map(m => 
              `- Part ${m.part}: ${m.size} chars [${m.id}]`
            ).join('\n') +
            `\n\n✨ All parts successfully saved and linked!`
    }]
  };
}

async function handleSingleCapture(args) {
  const contentLength = args.content.length;
  
  // If content is small enough, save directly
  if (contentLength <= MAX_TOOL_CALL_SIZE) {
    try {
      const memory = await makeApiCall('/api/v5/memories/', {
        method: 'POST',
        body: JSON.stringify({
          title: args.title || `Capture ${new Date().toISOString()}`,
          content: args.content,
          tags: ['single-capture'],
          metadata: {
            captureType: 'single',
            size: contentLength,
            includesMetadata: args.includeMetadata
          }
        })
      });
      
      return {
        content: [{
          type: 'text',
          text: `✅ Content saved!\n\n` +
                `📏 Size: ${contentLength} characters\n` +
                `🔗 ID: ${memory.id}\n` +
                `📝 Title: ${args.title || 'Auto-generated'}`
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
  
  // Content too large, auto-chunk
  const numChunks = Math.ceil(contentLength / MAX_TOOL_CALL_SIZE);
  
  // Start session
  const startResult = await handleStartChunkedCapture({
    title: args.title || `Auto-chunked Capture`,
    totalParts: numChunks,
    estimatedTotalSize: contentLength
  });
  
  // Extract session ID from response
  const sessionMatch = startResult.content[0].text.match(/Session ID: ([a-f0-9]+)/);
  if (!sessionMatch) {
    return {
      content: [{
        type: 'text',
        text: `❌ Failed to create chunked session`
      }]
    };
  }
  
  const sessionId = sessionMatch[1];
  
  // Split and save chunks
  for (let i = 0; i < numChunks; i++) {
    const start = i * MAX_TOOL_CALL_SIZE;
    const end = Math.min(start + MAX_TOOL_CALL_SIZE, contentLength);
    const chunk = args.content.substring(start, end);
    
    await handleContinueCapture({
      sessionId,
      partNumber: i + 1,
      content: chunk,
      contentType: 'mixed',
      isLastPart: i === numChunks - 1
    });
  }
  
  // Response already returned by last continue_capture call
  return captureSession.completed[sessionId] ? {
    content: [{
      type: 'text',
      text: `✅ Auto-chunked and saved!\n\n` +
            `Original size: ${contentLength} chars\n` +
            `Split into: ${numChunks} chunks\n` +
            `Session: ${sessionId}`
    }]
  } : {
    content: [{
      type: 'text',
      text: `⚠️ Auto-chunking completed but finalization pending`
    }]
  };
}

async function handleRecallChunked(args) {
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

    let resultText = `🔍 Found ${memories.length} memories\n\n`;
    
    memories.forEach((memory, index) => {
      const meta = memory.metadata || {};
      const isChunked = meta.captureType === 'chunked';
      const isIndex = meta.type === 'index';
      
      resultText += `${index + 1}. **${memory.title}**\n`;
      
      if (isIndex) {
        resultText += `   📚 Index for chunked capture\n`;
        resultText += `   🔗 Links to ${meta.linkedMemories?.length || 0} parts\n`;
      } else if (isChunked) {
        resultText += `   📦 Part ${meta.partNumber}/${meta.totalParts}\n`;
        resultText += `   🔗 Session: ${meta.sessionId?.substring(0, 8)}...\n`;
      }
      
      resultText += `   📏 Size: ${memory.content.length} chars\n`;
      resultText += `   📝 Preview: ${memory.content.substring(0, 150)}...\n\n`;
    });
    
    // Check for linked memories
    if (args.includeLinked) {
      const chunkedMemories = memories.filter(m => m.metadata?.captureType === 'chunked');
      if (chunkedMemories.length > 0) {
        resultText += `\n💡 Tip: Found ${chunkedMemories.length} chunked captures. `;
        resultText += `Use the session ID to retrieve all linked parts.`;
      }
    }

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
    case 'start_chunked_capture':
      return await handleStartChunkedCapture(args);
    case 'continue_capture':
      return await handleContinueCapture(args);
    case 'finalize_capture':
      return await handleFinalizeCapture(args);
    case 'single_capture':
      return await handleSingleCapture(args);
    case 'recall_chunked':
      return await handleRecallChunked(args);
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