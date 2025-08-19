#!/usr/bin/env node
/**
 * pūrmemo MCP Server v2.0.0 - With OAuth Support
 * Seamless authentication without manual API key configuration
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
        search_type: { type: 'string', enum: ['keyword', 'semantic', 'hybrid'], default: 'hybrid' }
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

// Create server
const server = new Server(
  {
    name: 'purmemo-mcp',
    version: '2.0.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

/**
 * Get authentication token, prompting for OAuth if needed
 */
async function getAuthToken() {
  let token = await authManager.getToken();
  
  if (!token) {
    console.log('\n⚠️  Authentication required for Purmemo MCP');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('This is a one-time setup. You\'ll be redirected to sign in.');
    console.log('After authentication, all tools will work automatically.\n');
    
    token = await authManager.authenticate();
    
    // Get user info after authentication
    userInfo = await authManager.tokenStore.getUserInfo();
    if (userInfo) {
      console.log(`👤 Authenticated as: ${userInfo.email}`);
      console.log(`📊 Account tier: ${userInfo.tier}`);
      if (userInfo.memory_limit) {
        console.log(`📝 Memory limit: ${userInfo.memory_limit} (upgrade to Pro for unlimited)`);
      }
      console.log('');
    }
  }
  
  return token;
}

/**
 * Check if user has reached memory limit (for free tier)
 */
async function checkMemoryLimit(token) {
  if (!userInfo) {
    userInfo = await authManager.tokenStore.getUserInfo();
  }
  
  if (userInfo && userInfo.tier === 'free' && userInfo.memory_limit) {
    // Get current memory count
    try {
      const response = await fetch(`${API_URL}/api/v5/memories?limit=1`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'purmemo-mcp/2.0.0'
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
      console.error('Failed to check memory limit:', error);
    }
  }
  
  return { exceeded: false };
}

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS
}));

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    // Get auth token (will prompt for OAuth if needed)
    const token = await getAuthToken();
    
    if (!token) {
      throw new Error('Authentication required. Please run the setup command to authenticate.');
    }
    
    // Check memory limit for memory creation
    if (name === 'memory') {
      const limitCheck = await checkMemoryLimit(token);
      if (limitCheck.exceeded) {
        return {
          error: 'Memory limit exceeded',
          message: limitCheck.message,
          current_count: limitCheck.current,
          limit: limitCheck.limit,
          upgrade_url: 'https://app.purmemo.ai/upgrade'
        };
      }
    }
    
    let response;
    
    switch (name) {
      case 'memory':
        // POST request for creating memory
        response = await fetch(`${API_URL}/api/v5/memories`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'purmemo-mcp/2.0.0'
          },
          body: JSON.stringify(args)
        });
        
        // Increment memory count for free tier tracking
        if (response.ok && userInfo?.tier === 'free') {
          memoryCount++;
          if (userInfo.memory_limit) {
            const remaining = userInfo.memory_limit - memoryCount;
            if (remaining > 0 && remaining <= 10) {
              console.log(`ℹ️  ${remaining} memories remaining in free tier`);
            }
          }
        }
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
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'purmemo-mcp/2.0.0'
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
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'purmemo-mcp/2.0.0'
          }
        });
        break;
        
      case 'attach':
        // POST request for attachments
        response = await fetch(`${API_URL}/api/v5/memories/${args.memory_id}/attachments`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'purmemo-mcp/2.0.0'
          },
          body: JSON.stringify({ file_paths: args.file_paths })
        });
        break;
        
      case 'correction':
        // POST request for corrections
        response = await fetch(`${API_URL}/api/v5/memories/${args.memory_id}/corrections`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'purmemo-mcp/2.0.0'
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
      
      // Handle specific error cases
      if (response.status === 401) {
        // Token might be expired, try to refresh
        console.log('🔄 Authentication expired, refreshing...');
        await authManager.tokenStore.clearToken();
        const newToken = await authManager.authenticate();
        
        // Suggest retrying the operation
        throw new Error('Authentication refreshed. Please try your request again.');
      }
      
      throw new Error(`API error: ${error}`);
    }
    
    return await response.json();
    
  } catch (error) {
    console.error(`❌ Error executing ${name}:`, error.message);
    
    // Provide helpful error messages
    if (error.message.includes('ECONNREFUSED')) {
      throw new Error('Unable to connect to Purmemo API. Please check your internet connection.');
    }
    
    if (error.message.includes('Authentication')) {
      throw new Error(`Authentication issue: ${error.message}. You may need to reconnect your account.`);
    }
    
    throw error;
  }
});

// Initialize on startup
async function initialize() {
  console.log('🧠 pūrmemo MCP v2.0.0 starting...\n');
  
  // Check if we have stored authentication
  const hasAuth = await authManager.tokenStore.hasToken();
  
  if (hasAuth) {
    userInfo = await authManager.tokenStore.getUserInfo();
    if (userInfo) {
      console.log(`✅ Authenticated as: ${userInfo.email}`);
      console.log(`📊 Account tier: ${userInfo.tier}`);
      if (userInfo.memory_limit) {
        console.log(`📝 Memory limit: ${userInfo.memory_limit}`);
      }
    }
  } else {
    // Check for legacy API key
    if (process.env.PUO_MEMO_API_KEY) {
      console.log('📔 Using API key from environment (legacy mode)');
      console.log('💡 Tip: Remove PUO_MEMO_API_KEY to use OAuth authentication');
    } else {
      console.log('🔐 No authentication found');
      console.log('📱 You\'ll be prompted to sign in when you use your first tool');
      console.log('   This is a one-time setup for seamless access');
    }
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Ready to serve MCP requests\n');
}

// Handle CLI commands if provided
async function handleCliCommands() {
  const args = process.argv.slice(2);
  if (args.length > 0) {
    const command = args[0];
    
    if (command === 'setup' || command === 'status' || command === 'logout' || command === 'upgrade') {
      // Delegate to setup script for CLI commands
      const { execSync } = await import('child_process');
      const setupPath = new URL('./setup.js', import.meta.url).pathname;
      
      try {
        execSync(`node "${setupPath}" ${args.join(' ')}`, { 
          stdio: 'inherit',
          cwd: process.cwd()
        });
        process.exit(0);
      } catch (error) {
        process.exit(error.status || 1);
      }
    }
  }
}

// Start server or handle CLI commands
handleCliCommands().then(() => {
  // If we get here, it's not a CLI command, so start the MCP server
  initialize().then(() => {
    const transport = new StdioServerTransport();
    server.connect(transport);
  }).catch(error => {
    console.error('Failed to initialize:', error);
    process.exit(1);
  });
}).catch(error => {
  console.error('Failed to handle CLI commands:', error);
  process.exit(1);
});