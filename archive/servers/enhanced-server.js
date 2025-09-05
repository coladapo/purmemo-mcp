#!/usr/bin/env node
/**
 * Enhanced Purmemo MCP Server v4.0.0
 * With structured conversation capture and context preservation
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import crypto from 'crypto';

// Configuration
const API_URL = process.env.PURMEMO_API_URL || 'https://api.purmemo.ai';
const USER_AGENT = 'purmemo-mcp/4.0.0';

// Store auth token in memory
let authToken = null;
let tokenExpiry = null;

// Session tracking for conversation context
const conversationSessions = new Map();

// Enhanced tool definitions
const TOOLS = [
  // Original simple memory tool (kept for compatibility)
  {
    name: 'memory',
    description: '💾 Save simple memory (basic)',
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
  
  // NEW: Structured conversation memory
  {
    name: 'memory_conversation',
    description: '💬 Save full conversation with context (captures user prompts, AI responses, decisions, and evolution)',
    inputSchema: {
      type: 'object',
      properties: {
        user_prompt: { 
          type: 'string', 
          description: 'REQUIRED: The exact user question/prompt that initiated this exchange'
        },
        ai_response: { 
          type: 'string', 
          description: 'REQUIRED: The complete AI response/solution'
        },
        conversation_type: {
          type: 'string',
          enum: ['project_planning', 'debugging', 'learning', 'coding', 'analysis', 'brainstorming', 'decision_making'],
          description: 'Type of conversation'
        },
        project_name: {
          type: 'string',
          description: 'Project this relates to (for tracking evolution)'
        },
        
        // Context extraction
        key_decisions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Important decisions made in this exchange'
        },
        action_items: {
          type: 'array',
          items: { type: 'string' },
          description: 'Action items identified'
        },
        requirements_identified: {
          type: 'array',
          items: { type: 'string' },
          description: 'New requirements or constraints discovered'
        },
        technical_details: {
          type: 'object',
          description: 'Technical specifications, stack choices, architecture decisions'
        },
        
        // Evolution tracking
        evolution_notes: {
          type: 'string',
          description: 'How has the user\'s understanding or requirements evolved?'
        },
        questions_raised: {
          type: 'array',
          items: { type: 'string' },
          description: 'New questions that emerged from this conversation'
        },
        
        // Relationship tracking
        previous_memory_id: {
          type: 'string',
          description: 'ID of related previous memory (for threading)'
        },
        session_id: {
          type: 'string',
          description: 'Session ID to group related conversations'
        },
        
        // Full context capture
        full_exchange: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string', enum: ['user', 'assistant'] },
              content: { type: 'string' },
              timestamp: { type: 'string' }
            }
          },
          description: 'Complete conversation history if available'
        },
        
        tags: { 
          type: 'array', 
          items: { type: 'string' },
          description: 'Tags for categorization'
        }
      },
      required: ['user_prompt', 'ai_response']
    }
  },
  
  // NEW: Code solution capture
  {
    name: 'memory_code',
    description: '👨‍💻 Save code solution with full context',
    inputSchema: {
      type: 'object',
      properties: {
        problem_statement: {
          type: 'string',
          description: 'The problem this code solves (user\'s original ask)'
        },
        code: {
          type: 'string',
          description: 'The complete code solution'
        },
        language: {
          type: 'string',
          description: 'Programming language'
        },
        explanation: {
          type: 'string',
          description: 'How the code works'
        },
        usage_example: {
          type: 'string',
          description: 'How to use this code'
        },
        dependencies: {
          type: 'array',
          items: { type: 'string' },
          description: 'Required libraries/dependencies'
        },
        limitations: {
          type: 'array',
          items: { type: 'string' },
          description: 'Known limitations or edge cases'
        },
        improvements_suggested: {
          type: 'array',
          items: { type: 'string' },
          description: 'Potential improvements for future'
        },
        related_memory_id: {
          type: 'string',
          description: 'ID of related conversation/project'
        },
        tags: { type: 'array', items: { type: 'string' } }
      },
      required: ['problem_statement', 'code', 'language']
    }
  },
  
  // NEW: Project evolution tracker
  {
    name: 'memory_project_evolution',
    description: '📈 Track how a project/idea evolves over time',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: {
          type: 'string',
          description: 'Name of the project being tracked'
        },
        evolution_stage: {
          type: 'string',
          enum: ['inception', 'planning', 'design', 'implementation', 'testing', 'refinement', 'completion'],
          description: 'Current stage of the project'
        },
        original_vision: {
          type: 'string',
          description: 'What the user originally wanted'
        },
        current_vision: {
          type: 'string',
          description: 'How the vision has evolved'
        },
        changes_from_last: {
          type: 'array',
          items: { type: 'string' },
          description: 'What changed since last update'
        },
        learnings: {
          type: 'array',
          items: { type: 'string' },
          description: 'What the user learned'
        },
        pivots: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              from: { type: 'string' },
              to: { type: 'string' },
              reason: { type: 'string' }
            }
          },
          description: 'Major pivots or direction changes'
        },
        next_questions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Questions to explore next'
        },
        timeline: {
          type: 'array',
          items: { type: 'string' },
          description: 'Updated timeline/milestones'
        },
        previous_evolution_id: {
          type: 'string',
          description: 'Link to previous evolution memory'
        },
        tags: { type: 'array', items: { type: 'string' } }
      },
      required: ['project_name', 'evolution_stage', 'current_vision']
    }
  },
  
  // NEW: Session management
  {
    name: 'start_session',
    description: '🎬 Start a new conversation session for tracking context',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: { type: 'string', description: 'Project this session relates to' },
        session_type: { 
          type: 'string',
          enum: ['planning', 'coding', 'debugging', 'review', 'brainstorming'],
          description: 'Type of session'
        },
        goals: {
          type: 'array',
          items: { type: 'string' },
          description: 'What you want to accomplish in this session'
        }
      },
      required: []
    }
  },
  
  {
    name: 'end_session',
    description: '🏁 End session and save complete context',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Session ID to end' },
        summary: { type: 'string', description: 'Session summary' },
        outcomes: {
          type: 'array',
          items: { type: 'string' },
          description: 'What was accomplished'
        },
        next_steps: {
          type: 'array',
          items: { type: 'string' },
          description: 'What to do next'
        }
      },
      required: ['session_id']
    }
  },
  
  // Original recall tool
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
  
  // NEW: Project recall
  {
    name: 'recall_project',
    description: '📊 Get all memories related to a project (see evolution)',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: { type: 'string', description: 'Project name to search for' },
        include_evolution: { 
          type: 'boolean', 
          description: 'Include evolution history',
          default: true
        }
      },
      required: ['project_name']
    }
  }
];

// Create server
const server = new Server(
  { name: 'purmemo-mcp-enhanced', version: '4.0.0' },
  { capabilities: { tools: {} } }
);

// Authentication function
async function authenticate() {
  const apiKey = process.env.PURMEMO_API_KEY;
  if (apiKey) {
    return apiKey;
  }
  
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
    // Silent failure for MCP compatibility
  }
  
  return null;
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

// Enhanced handler for conversation memory
async function handleConversationMemory(args) {
  try {
    // Generate session ID if not provided
    const sessionId = args.session_id || crypto.randomBytes(16).toString('hex');
    
    // Format the comprehensive memory
    let content = `# Conversation: ${args.project_name || 'General'}
${args.conversation_type ? `*Type: ${args.conversation_type}*` : ''}
${args.session_id ? `*Session: ${args.session_id}*` : ''}

## User Asked:
${args.user_prompt}

## AI Response:
${args.ai_response}

${args.key_decisions?.length ? `## Key Decisions Made:
${args.key_decisions.map(d => `- ${d}`).join('\n')}` : ''}

${args.action_items?.length ? `## Action Items:
${args.action_items.map(a => `- [ ] ${a}`).join('\n')}` : ''}

${args.requirements_identified?.length ? `## New Requirements Identified:
${args.requirements_identified.map(r => `- ${r}`).join('\n')}` : ''}

${args.technical_details ? `## Technical Details:
\`\`\`json
${JSON.stringify(args.technical_details, null, 2)}
\`\`\`` : ''}

${args.evolution_notes ? `## How Understanding Evolved:
${args.evolution_notes}` : ''}

${args.questions_raised?.length ? `## New Questions Raised:
${args.questions_raised.map(q => `- ${q}`).join('\n')}` : ''}

${args.full_exchange?.length ? `## Full Exchange:
${args.full_exchange.map(ex => `**${ex.role}** (${ex.timestamp || 'no timestamp'}):\n${ex.content}`).join('\n\n')}` : ''}

---
*Captured: ${new Date().toISOString()}*
*Session: ${sessionId}*
${args.previous_memory_id ? `*Previous: ${args.previous_memory_id}*` : ''}`;

    // Create comprehensive metadata
    const metadata = {
      type: 'conversation',
      conversation_type: args.conversation_type,
      project_name: args.project_name,
      session_id: sessionId,
      has_decisions: (args.key_decisions?.length || 0) > 0,
      has_actions: (args.action_items?.length || 0) > 0,
      has_requirements: (args.requirements_identified?.length || 0) > 0,
      has_technical: !!args.technical_details,
      evolution_tracked: !!args.evolution_notes,
      previous_memory: args.previous_memory_id,
      user_prompt_hash: crypto.createHash('sha256').update(args.user_prompt).digest('hex').substring(0, 8),
      timestamp: new Date().toISOString()
    };

    const data = await makeApiCall('/api/v5/memories/', {
      method: 'POST',
      body: JSON.stringify({
        content,
        title: args.project_name 
          ? `${args.project_name}: ${args.conversation_type || 'Discussion'}` 
          : `Conversation: ${new Date().toLocaleDateString()}`,
        tags: [
          ...(args.tags || []),
          'conversation',
          args.conversation_type,
          args.project_name,
          'has-user-prompt',
          'has-ai-response',
          'structured'
        ].filter(Boolean),
        metadata
      })
    });

    // Track in session
    if (sessionId) {
      if (!conversationSessions.has(sessionId)) {
        conversationSessions.set(sessionId, {
          memories: [],
          project: args.project_name,
          started: new Date().toISOString()
        });
      }
      conversationSessions.get(sessionId).memories.push(data.id);
    }

    return {
      content: [{
        type: 'text',
        text: `✅ Conversation memory saved with full context!

📝 **Captured:**
- User prompt: ✓
- AI response: ✓
- Decisions: ${args.key_decisions?.length || 0}
- Actions: ${args.action_items?.length || 0}
- Evolution notes: ${args.evolution_notes ? '✓' : '-'}

🔗 **Memory ID:** ${data.id}
🏷️ **Session:** ${sessionId}
${args.previous_memory_id ? `🔙 **Linked to:** ${args.previous_memory_id}` : ''}

💡 **Tip:** Use session_id "${sessionId}" in next memory to link them together!`
      }]
    };
  } catch (error) {
    if (error.message === 'NO_AUTH') {
      return createAuthMessage('memory_conversation');
    }
    return {
      content: [{
        type: 'text',
        text: `❌ Error saving conversation memory: ${error.message}`
      }]
    };
  }
}

// Session management handlers
async function handleStartSession(args) {
  const sessionId = crypto.randomBytes(16).toString('hex');
  
  conversationSessions.set(sessionId, {
    id: sessionId,
    project: args.project_name,
    type: args.session_type,
    goals: args.goals || [],
    started: new Date().toISOString(),
    memories: []
  });

  return {
    content: [{
      type: 'text',
      text: `🎬 Session started!

**Session ID:** ${sessionId}
${args.project_name ? `**Project:** ${args.project_name}` : ''}
${args.session_type ? `**Type:** ${args.session_type}` : ''}
${args.goals?.length ? `**Goals:**\n${args.goals.map(g => `- ${g}`).join('\n')}` : ''}

💡 **Important:** Use this session ID in all memory_conversation calls to link them together:
\`\`\`
session_id: "${sessionId}"
\`\`\`

This will create a threaded conversation history!`
    }]
  };
}

async function handleEndSession(args) {
  const session = conversationSessions.get(args.session_id);
  
  if (!session) {
    return {
      content: [{
        type: 'text',
        text: '❌ Session not found'
      }]
    };
  }

  // Save session summary
  const content = `# Session Summary: ${session.project || 'General'}

**Duration:** ${new Date(session.started).toLocaleString()} - ${new Date().toLocaleString()}
**Type:** ${session.type || 'General'}

## Goals:
${session.goals?.map(g => `- ${g}`).join('\n') || 'No specific goals set'}

## Summary:
${args.summary}

## Outcomes:
${args.outcomes?.map(o => `- ✅ ${o}`).join('\n') || 'No outcomes specified'}

## Next Steps:
${args.next_steps?.map(s => `- [ ] ${s}`).join('\n') || 'No next steps identified'}

## Memories Created:
${session.memories.map(id => `- ${id}`).join('\n')}

---
*Session ended: ${new Date().toISOString()}*`;

  try {
    const data = await makeApiCall('/api/v5/memories/', {
      method: 'POST',
      body: JSON.stringify({
        content,
        title: `Session Summary: ${session.project || args.session_id}`,
        tags: ['session-summary', session.type, session.project].filter(Boolean),
        metadata: {
          type: 'session_summary',
          session_id: args.session_id,
          memories_created: session.memories,
          duration_minutes: Math.round((Date.now() - new Date(session.started).getTime()) / 60000)
        }
      })
    });

    conversationSessions.delete(args.session_id);

    return {
      content: [{
        type: 'text',
        text: `🏁 Session ended and saved!

**Summary saved with ID:** ${data.id}
**Memories in this session:** ${session.memories.length}
**Duration:** ${Math.round((Date.now() - new Date(session.started).getTime()) / 60000)} minutes`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `❌ Error saving session summary: ${error.message}`
      }]
    };
  }
}

// Original handlers (kept for compatibility)
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
        text: `✅ Memory saved successfully!\n\n📝 Content: ${args.content.substring(0, 100)}...\n🔗 ID: ${data.id}`
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
      resultText += `   📝 ${memory.content.substring(0, 150)}${memory.content.length > 150 ? '...' : ''}\n`;
      if (memory.metadata?.type === 'conversation') {
        resultText += `   💬 Type: ${memory.metadata.conversation_type || 'conversation'}\n`;
        resultText += `   📁 Project: ${memory.metadata.project_name || 'none'}\n`;
      }
      if (memory.tags?.length) {
        resultText += `   🏷️ ${memory.tags.join(', ')}\n`;
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

// Create auth message
function createAuthMessage(toolName) {
  return {
    content: [{
      type: 'text',
      text: `🔐 Authentication Required\n\nTo use ${toolName}, add to Claude Desktop config:\n\n"env": {\n  "PURMEMO_API_KEY": "your-api-key"\n}`
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
      case 'memory_conversation':
        return await handleConversationMemory(args);
      case 'start_session':
        return await handleStartSession(args);
      case 'end_session':
        return await handleEndSession(args);
      case 'recall':
        return await handleRecall(args);
      // Add other handlers as needed
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