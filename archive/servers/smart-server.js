#!/usr/bin/env node
/**
 * Smart Purmemo MCP Server v5.0
 * Automatically captures full context without needing special tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import crypto from 'crypto';

// Configuration
const API_URL = process.env.PURMEMO_API_URL || 'https://api.purmemo.ai';
const USER_AGENT = 'purmemo-mcp-smart/5.0.0';

// Store auth token in memory
let authToken = null;
let tokenExpiry = null;

// Context tracking
const contextTracker = {
  recentExchanges: [],
  currentProject: null,
  sessionId: null,
  decisions: [],
  actionItems: [],
  codeBlocks: [],
  filesReferenced: [],  // Track files discussed
  attachments: []        // Track things that should be attached
};

// SIMPLIFIED TOOLS - Only what users actually need
const TOOLS = [
  {
    name: 'memory',
    description: '💾 Save to memory (automatically captures full context when available)',
    inputSchema: {
      type: 'object',
      properties: {
        content: { 
          type: 'string', 
          description: 'What to save (or just say "save this conversation")'
        },
        title: { 
          type: 'string', 
          description: 'Optional: Title (auto-generated if not provided)'
        },
        tags: { 
          type: 'array', 
          items: { type: 'string' },
          description: 'Optional: Tags for organization'
        },
        project: {
          type: 'string',
          description: 'Optional: Project this relates to'
        }
      },
      required: ['content']
    }
  },
  
  {
    name: 'recall',
    description: '🔍 Search memories (automatically includes context)',
    inputSchema: {
      type: 'object',
      properties: {
        query: { 
          type: 'string', 
          description: 'What to search for (or project name for all project memories)'
        },
        limit: { 
          type: 'integer', 
          description: 'Max results (default: 10)',
          default: 10
        }
      },
      required: ['query']
    }
  },
  
  {
    name: 'update_context',
    description: '📝 Tell me about the current project/task (helps capture better context)',
    inputSchema: {
      type: 'object',
      properties: {
        project: { 
          type: 'string',
          description: 'Current project name'
        },
        stage: {
          type: 'string',
          enum: ['planning', 'building', 'debugging', 'reviewing', 'learning'],
          description: 'What stage you\'re in'
        },
        goals: {
          type: 'array',
          items: { type: 'string' },
          description: 'What you\'re trying to achieve'
        }
      }
    }
  }
];

// Create server
const server = new Server(
  { name: 'purmemo-mcp-smart', version: '5.0.0' },
  { capabilities: { tools: {} } }
);

// Authentication
async function authenticate() {
  const apiKey = process.env.PURMEMO_API_KEY;
  if (apiKey) return apiKey;
  
  if (authToken && tokenExpiry && Date.now() < tokenExpiry) {
    return authToken;
  }
  
  const email = process.env.PURMEMO_EMAIL || 'demo@puo-memo.com';
  const password = process.env.PURMEMO_PASSWORD || 'demodemo123';
  
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
      tokenExpiry = Date.now() + (55 * 60 * 1000);
      return authToken;
    }
  } catch (error) {
    // Silent failure
  }
  
  return null;
}

// API helper
async function makeApiCall(endpoint, options = {}) {
  const token = await authenticate();
  
  if (!token) {
    throw new Error('NO_AUTH');
  }
  
  const defaultHeaders = {
    'Authorization': `Bearer ${token}`,
    'User-Agent': USER_AGENT
  };
  
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

// Smart context extraction
function extractContext(content) {
  const context = {
    hasUserPrompt: false,
    hasAiResponse: false,
    hasCode: false,
    hasDecisions: false,
    hasActions: false,
    hasFiles: false,
    type: 'general',
    codeBlocks: [],
    filePaths: [],
    urls: []
  };
  
  // Detect conversation patterns
  if (content.includes('User:') || content.includes('Q:') || content.includes('Question:')) {
    context.hasUserPrompt = true;
  }
  
  if (content.includes('Assistant:') || content.includes('A:') || content.includes('Answer:')) {
    context.hasAiResponse = true;
  }
  
  // Extract code blocks
  const codeMatches = content.match(/```[\s\S]*?```/g);
  if (codeMatches) {
    context.hasCode = true;
    context.type = 'coding';
    context.codeBlocks = codeMatches.map(block => {
      const lines = block.split('\n');
      const lang = lines[0].replace('```', '').trim();
      const code = lines.slice(1, -1).join('\n');
      return { language: lang || 'plaintext', code };
    });
  }
  
  // Extract file paths
  const pathMatches = content.match(/[\/~][\w\-\.\/]+\.\w+/g);
  if (pathMatches) {
    context.hasFiles = true;
    context.filePaths = [...new Set(pathMatches)]; // Unique paths
  }
  
  // Extract URLs  
  const urlMatches = content.match(/https?:\/\/[^\s]+/g);
  if (urlMatches) {
    context.urls = urlMatches;
  }
  
  // Detect decisions
  if (content.includes('decided') || content.includes('chose') || content.includes('will use')) {
    context.hasDecisions = true;
    context.type = 'decision';
  }
  
  // Detect action items
  if (content.includes('TODO') || content.includes('- [ ]') || content.includes('next step')) {
    context.hasActions = true;
    context.type = 'planning';
  }
  
  // Detect debugging
  if (content.includes('error') || content.includes('bug') || content.includes('fix')) {
    context.type = 'debugging';
  }
  
  return context;
}

// SMART MEMORY HANDLER - Automatically captures context
async function handleMemory(args) {
  try {
    let finalContent = args.content;
    let finalTitle = args.title;
    let finalTags = args.tags || [];
    let metadata = {};
    
    // Analyze the content
    const context = extractContext(args.content);
    
    // Smart enhancements based on content
    if (args.content.toLowerCase().includes('save this conversation') || 
        args.content.toLowerCase().includes('save our discussion') ||
        args.content.toLowerCase().includes('remember this')) {
      
      // User wants to save conversation - enhance it
      finalTitle = finalTitle || `Conversation: ${contextTracker.currentProject || new Date().toLocaleDateString()}`;
      
      // Build enhanced content
      finalContent = `# ${finalTitle}\n\n`;
      finalContent += `## Context\n`;
      finalContent += `Project: ${contextTracker.currentProject || 'General'}\n`;
      finalContent += `Session: ${contextTracker.sessionId || 'No session'}\n\n`;
      finalContent += `## Discussion\n${args.content}\n\n`;
      
      // Add extracted code blocks
      if (context.codeBlocks.length > 0) {
        finalContent += `## Code Snippets\n`;
        context.codeBlocks.forEach((block, idx) => {
          finalContent += `### Snippet ${idx + 1} (${block.language})\n`;
          finalContent += `\`\`\`${block.language}\n${block.code}\n\`\`\`\n\n`;
        });
        metadata.codeBlocks = context.codeBlocks.length;
      }
      
      // Add referenced files
      if (context.filePaths.length > 0) {
        finalContent += `## Files Referenced\n`;
        context.filePaths.forEach(path => {
          finalContent += `- \`${path}\`\n`;
        });
        finalContent += '\n';
        metadata.filesReferenced = context.filePaths;
      }
      
      // Add URLs/resources
      if (context.urls.length > 0) {
        finalContent += `## Resources\n`;
        context.urls.forEach(url => {
          finalContent += `- ${url}\n`;
        });
        finalContent += '\n';
        metadata.resources = context.urls;
      }
      
      if (contextTracker.decisions.length > 0) {
        finalContent += `## Decisions Made\n`;
        contextTracker.decisions.forEach(d => {
          finalContent += `- ${d}\n`;
        });
        finalContent += '\n';
      }
      
      if (contextTracker.actionItems.length > 0) {
        finalContent += `## Action Items\n`;
        contextTracker.actionItems.forEach(a => {
          finalContent += `- [ ] ${a}\n`;
        });
        finalContent += '\n';
      }
      
      metadata.enhanced = true;
      metadata.hasContext = true;
      metadata.autoExtracted = {
        codeBlocks: context.codeBlocks.length,
        files: context.filePaths.length,
        urls: context.urls.length
      };
    }
    
    // Auto-generate title if needed
    if (!finalTitle) {
      // Extract first meaningful line or use content type
      const firstLine = args.content.split('\n')[0];
      if (firstLine.length < 100) {
        finalTitle = firstLine;
      } else {
        finalTitle = `${context.type} memory - ${new Date().toLocaleDateString()}`;
      }
    }
    
    // Auto-add relevant tags
    if (context.type && !finalTags.includes(context.type)) {
      finalTags.push(context.type);
    }
    
    if (contextTracker.currentProject) {
      finalTags.push(contextTracker.currentProject.toLowerCase().replace(/\s+/g, '-'));
    }
    
    if (context.hasCode) finalTags.push('code');
    if (context.hasDecisions) finalTags.push('decisions');
    if (context.hasActions) finalTags.push('action-items');
    
    // Add metadata
    metadata = {
      ...metadata,
      type: context.type,
      project: contextTracker.currentProject || args.project,
      session: contextTracker.sessionId,
      hasCode: context.hasCode,
      hasDecisions: context.hasDecisions,
      hasActions: context.hasActions,
      timestamp: new Date().toISOString(),
      autoEnhanced: true
    };
    
    // Save to API
    const data = await makeApiCall('/api/v5/memories/', {
      method: 'POST',
      body: JSON.stringify({
        content: finalContent,
        title: finalTitle,
        tags: [...new Set(finalTags)], // Remove duplicates
        metadata
      })
    });
    
    // Track this memory
    if (!contextTracker.sessionId) {
      contextTracker.sessionId = crypto.randomBytes(8).toString('hex');
    }
    
    contextTracker.recentExchanges.push({
      id: data.id,
      timestamp: new Date().toISOString(),
      type: context.type
    });
    
    return {
      content: [{
        type: 'text',
        text: `✅ ${context.hasUserPrompt && context.hasAiResponse ? 'Conversation' : 'Memory'} saved!\n\n` +
              `📝 **Title:** ${finalTitle}\n` +
              `🏷️ **Tags:** ${finalTags.join(', ')}\n` +
              `🔗 **ID:** ${data.id || data.memory_id}\n` +
              (metadata.enhanced ? `✨ **Enhanced:** Added context automatically\n` : '') +
              (contextTracker.currentProject ? `📁 **Project:** ${contextTracker.currentProject}\n` : '') +
              `\n💡 **Tip:** Say "save this conversation" to capture full context automatically!`
      }]
    };
  } catch (error) {
    if (error.message === 'NO_AUTH') {
      return {
        content: [{
          type: 'text',
          text: '🔐 Set PURMEMO_API_KEY in environment'
        }]
      };
    }
    return {
      content: [{
        type: 'text',
        text: `❌ Error: ${error.message}`
      }]
    };
  }
}

// SMART RECALL - Knows about projects
async function handleRecall(args) {
  try {
    // Check if searching for a project
    const isProjectSearch = contextTracker.currentProject && 
      args.query.toLowerCase().includes(contextTracker.currentProject.toLowerCase());
    
    const params = new URLSearchParams({
      query: args.query,
      page_size: String(args.limit || 10)
    });
    
    // If it's a project search, adjust query
    if (isProjectSearch) {
      params.set('query', contextTracker.currentProject);
      params.set('page_size', '20'); // Get more results for projects
    }
    
    const data = await makeApiCall(`/api/v5/memories/?${params}`, {
      method: 'GET'
    });
    
    const memories = data.results || data.memories || data;
    
    if (!memories || memories.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `🔍 No memories found for "${args.query}"\n\n` +
                `💡 **Tip:** Try broader search terms or check your project name`
        }]
      };
    }
    
    let resultText = `🔍 Found ${memories.length} memories${isProjectSearch ? ` for project "${contextTracker.currentProject}"` : ` for "${args.query}"`}\n\n`;
    
    // Group by type if metadata available
    const byType = {};
    memories.forEach(memory => {
      const type = memory.metadata?.type || 'general';
      if (!byType[type]) byType[type] = [];
      byType[type].push(memory);
    });
    
    // Display grouped results
    Object.entries(byType).forEach(([type, mems]) => {
      if (mems.length > 0) {
        resultText += `**${type.charAt(0).toUpperCase() + type.slice(1)} (${mems.length})**\n`;
        mems.forEach((memory, idx) => {
          resultText += `${idx + 1}. ${memory.title || 'Untitled'}\n`;
          resultText += `   ${memory.content.substring(0, 100)}...\n`;
          if (memory.metadata?.project) {
            resultText += `   📁 Project: ${memory.metadata.project}\n`;
          }
          if (memory.created_at) {
            resultText += `   📅 ${new Date(memory.created_at).toLocaleDateString()}\n`;
          }
          resultText += '\n';
        });
      }
    });
    
    return {
      content: [{ type: 'text', text: resultText }]
    };
  } catch (error) {
    if (error.message === 'NO_AUTH') {
      return {
        content: [{
          type: 'text',
          text: '🔐 Set PURMEMO_API_KEY in environment'
        }]
      };
    }
    return {
      content: [{
        type: 'text',
        text: `❌ Error: ${error.message}`
      }]
    };
  }
}

// UPDATE CONTEXT - Helps the server understand what you're doing
async function handleUpdateContext(args) {
  if (args.project) {
    contextTracker.currentProject = args.project;
  }
  
  if (args.stage) {
    contextTracker.currentStage = args.stage;
  }
  
  if (args.goals) {
    contextTracker.currentGoals = args.goals;
  }
  
  // Generate new session if project changed
  if (args.project && args.project !== contextTracker.currentProject) {
    contextTracker.sessionId = crypto.randomBytes(8).toString('hex');
    contextTracker.recentExchanges = [];
    contextTracker.decisions = [];
    contextTracker.actionItems = [];
  }
  
  return {
    content: [{
      type: 'text',
      text: `✅ Context updated!\n\n` +
            `📁 **Project:** ${contextTracker.currentProject || 'Not set'}\n` +
            `📊 **Stage:** ${contextTracker.currentStage || 'Not set'}\n` +
            `🎯 **Goals:** ${contextTracker.currentGoals?.join(', ') || 'Not set'}\n` +
            `🔗 **Session:** ${contextTracker.sessionId || 'Will create on first save'}\n\n` +
            `Now when you save memories, I'll automatically include this context!`
    }]
  };
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
      case 'update_context':
        return await handleUpdateContext(args);
      default:
        return {
          content: [{
            type: 'text',
            text: `❌ Unknown tool: ${name}\n\nAvailable: memory, recall, update_context`
          }]
        };
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `❌ Error: ${error.message}`
      }]
    };
  }
});

// Start server
const transport = new StdioServerTransport();
server.connect(transport).catch(() => process.exit(1));