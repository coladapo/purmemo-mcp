#!/usr/bin/env node
/**
 * pūrmemo MCP Server v11.0.0
 *
 * Comprehensive solution that combines all our learnings:
 * - Smart content detection and routing
 * - Aggressive prompting for complete capture
 * - Automatic chunking for large content
 * - Artifact and code block extraction
 * - Session management for multi-part saves
 * - Living document pattern with auto-ID from title
 * - 🌍 Cross-platform discovery via semantic clusters
 * - 🔗 Find related conversations across ChatGPT, Claude, Gemini
 * - 🧠 NEW: Intelligent memory saving with auto-context extraction
 * - 📊 NEW: Automatic project/component/feature detection
 * - 🎯 NEW: Smart title generation (no more timestamps!)
 * - 🗺️ NEW: Roadmap tracking across AI tools
 * - 🛡️ PHASE 16.4: Unicode sanitization to prevent JSON encoding errors
 *   - Fixes "no low surrogate" errors from corrupted Unicode in memories
 *   - Automatically cleans all text before sending to Claude API
 *   - Prevents 400 errors caused by unpaired surrogate characters
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import {
  extractProjectContext,
  generateIntelligentTitle,
  extractProgressIndicators,
  extractRelationships
} from './intelligent-memory.js';

const API_URL = process.env.PURMEMO_API_URL || 'https://api.purmemo.ai';
const API_KEY = process.env.PURMEMO_API_KEY;

// Debug: Log API key status (without exposing the full key)
console.error(`[Purmemo MCP Debug] API_URL: ${API_URL}`);
console.error(`[Purmemo MCP Debug] API_KEY present: ${!!API_KEY}`);
console.error(`[Purmemo MCP Debug] API_KEY prefix: ${API_KEY ? API_KEY.substring(0, 15) + '...' : 'MISSING'}`);

// Platform detection: user specifies via MCP_PLATFORM env var
// Supported: 'claude', 'claude-code', 'cursor', 'chatgpt', 'windsurf', 'zed'
// MCP is a universal protocol - same server works across all platforms
// Auto-detect Claude Code vs Claude Desktop
const detectPlatform = () => {
  // 1. Explicit override (highest priority)
  if (process.env.MCP_PLATFORM) {
    return process.env.MCP_PLATFORM;
  }

  // 2. Auto-detect Claude Code via env vars set by Claude Code CLI
  // Claude Code sets CLAUDECODE=1 and CLAUDE_CODE_ENTRYPOINT=cli
  if (process.env.CLAUDECODE === '1' || process.env.CLAUDE_CODE_ENTRYPOINT === 'cli') {
    return 'claude-code';
  }

  // 3. Default to claude for Claude Desktop
  return 'claude';
};

const PLATFORM = detectPlatform();

// Log detected platform for debugging (only in development)
if (process.env.NODE_ENV !== 'production') {
  console.error(`[Purmemo MCP] Detected platform: ${PLATFORM}`);
}

// Session management for chunked captures
const sessions = {
  active: new Map(),
  completed: new Map()
};

// ULTIMATE TOOL DEFINITIONS
// MCP Tool Annotations (Anthropic Connector Directory Requirement #17)
// - readOnlyHint: true for tools that only read data, false for write operations
// - destructiveHint: true for tools that delete/modify existing data destructively
// - idempotentHint: true for tools that produce same result when called multiple times
// - openWorldHint: true for tools that interact with external world beyond local data
// - title: Human-readable title for display in UIs
const TOOLS = [
  {
    name: 'save_conversation',
    annotations: {
      title: 'Save Conversation',
      readOnlyHint: false,      // This tool WRITES data to storage
      destructiveHint: false,   // Updates existing memories, doesn't delete
      idempotentHint: false,    // Same content may create different IDs
      openWorldHint: true       // Interacts with Purmemo cloud API
    },
    description: `Save complete conversations as living documents. REQUIRED: Send COMPLETE conversation in 'conversationContent' parameter (minimum 100 chars, should be thousands). Include EVERY message verbatim - NO summaries or partial content.

    Intelligently tracks context, extracts project details, and maintains a single memory per conversation topic.

    LIVING DOCUMENT + INTELLIGENT PROJECT TRACKING:
    - Each conversation becomes a living document that grows over time
    - Automatically extracts project context (name, component, feature being discussed)
    - Detects work iteration and status (planning/in_progress/completed/blocked)
    - Generates smart titles like "Purmemo - Timeline View - Implementation" (no more timestamp titles!)
    - Tracks technologies, tools used, and identifies relationships/dependencies
    - Works like Chrome extension: intelligent memory that grows with each save

    How memory updating works:
    - Conversation ID auto-generated from title (e.g., "MCP Tools" → "mcp-tools")
    - Same title → UPDATES existing memory (not create duplicate)
    - "Save progress" → Updates most recent memory for current project context
    - Explicit conversationId → Always updates that specific memory
    - Example: Saving "Project X Planning" three times = ONE memory updated three times
    - To force new memory: Change title or use different conversationId

    SERVER AUTO-CHUNKING:
    - Large conversations (>15K chars) automatically split into linked chunks
    - Small conversations (<15K chars) saved directly as single memory
    - You always send complete content - server handles chunking intelligently
    - All chunks linked together for seamless retrieval

    EXAMPLES:
    User: "Save progress" (working on Purmemo timeline feature)
    → System auto-generates: "Purmemo - Timeline View - Implementation"
    → Updates existing memory if this title was used before

    User: "Save this conversation" (discussing React hooks implementation)
    → System auto-generates: "Frontend - React Hooks - Implementation"

    User: "Save as conversation react-hooks-guide"
    → You call save_conversation with conversationId="react-hooks-guide"
    → Creates or updates memory with this specific ID

    WHAT TO INCLUDE (COMPLETE CONVERSATION REQUIRED):
    - EVERY user message (verbatim, not paraphrased)
    - EVERY assistant response (complete, not summarized)
    - ALL code blocks with full syntax
    - ALL artifacts with complete content (not just titles/descriptions)
    - ALL file paths, URLs, and references mentioned
    - ALL system messages and tool outputs
    - EXACT conversation flow and context
    - Minimum 500 characters expected - should be THOUSANDS of characters

    FORMAT REQUIRED:
    === CONVERSATION START ===
    [timestamp] USER: [complete user message 1]
    [timestamp] ASSISTANT: [complete assistant response 1]
    [timestamp] USER: [complete user message 2]
    [timestamp] ASSISTANT: [complete assistant response 2]
    ... [continue for ALL exchanges]
    === ARTIFACTS ===
    [Include ALL artifacts with full content]
    === CODE BLOCKS ===
    [Include ALL code with syntax highlighting]
    === END ===

    IMPORTANT: Do NOT send just "save this conversation" or summaries. If you send less than 500 chars, you're doing it wrong. Include the COMPLETE conversation with all details.`,
    inputSchema: {
      type: 'object',
      properties: {
        conversationContent: {
          type: 'string',
          description: 'COMPLETE conversation transcript - minimum 500 characters expected. Include EVERYTHING discussed.',
          minLength: 100
        },
        title: {
          type: 'string',
          description: 'Title for this conversation memory',
          default: `Conversation ${new Date().toISOString()}`
        },
        conversationId: {
          type: 'string',
          description: 'Optional unique identifier for living document pattern. If provided and memory exists with this conversationId, UPDATES that memory instead of creating new one. Use for maintaining single memory per conversation that updates over time.'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for categorization',
          default: ['complete-conversation']
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Priority level for this memory',
          default: 'medium'
        }
      },
      required: ['conversationContent']
    }
  },
  {
    name: 'recall_memories',
    annotations: {
      title: 'Recall Memories',
      readOnlyHint: true,       // This tool only READS data, never writes
      destructiveHint: false,   // No data modification
      idempotentHint: true,     // Same query returns same results
      openWorldHint: true       // Interacts with Purmemo cloud API
    },
    description: `Search and retrieve saved memories with intelligent semantic ranking.

🎯 BASIC SEARCH:
  recall_memories(query="authentication")
  → Returns all memories about authentication, ranked by semantic relevance

🔍 FILTERED SEARCH (Phase 2 Knowledge Graph Intelligence):
  Use filters when you need PRECISION over semantic similarity:

  ✓ entity="name" - Find memories mentioning specific people/projects/technologies
    Example: entity="purmemo" → Only memories discussing purmemo

  ✓ has_observations=true - Find substantial, fact-dense conversations
    Example: has_observations=true → Only high-quality technical discussions

  ✓ initiative="project" - Scope to specific initiatives/goals
    Example: initiative="Q1 OKRs" → Only Q1-related memories

  ✓ intent="type" - Filter by conversation purpose
    Options: decision, learning, question, blocker
    Example: intent="blocker" → Only conversations about blockers

💡 WHEN TO FILTER:
  - Use entity when user asks about specific person/project by name
  - Use has_observations for "detailed" or "substantial" requests
  - Use initiative/stakeholder for project-specific searches
  - Use intent when user asks for decisions, learnings, or blockers

📝 COMBINED EXAMPLES:
  recall_memories(query="auth", entity="purmemo", has_observations=true)
  → Find detailed technical discussions about purmemo authentication

  recall_memories(query="blockers", intent="blocker", stakeholder="Engineering")
  → Find engineering team blockers`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { 
          type: 'string',
          description: 'Search query - can be keywords, topics, or specific content'
        },
        includeChunked: {
          type: 'boolean',
          default: true,
          description: 'Include chunked/multi-part conversations in results'
        },
        limit: { 
          type: 'integer', 
          default: 10,
          description: 'Maximum number of memories to return'
        },
        contentPreview: {
          type: 'boolean',
          default: true,
          description: 'Include content preview in results'
        },
        // Phase 2: Knowledge Graph Intelligence - Entity & Context Filters
        entity: {
          type: 'string',
          description: 'Filter by entity name (people, projects, technologies). Use when user asks about a specific person, project, or technology by name. Example: entity="Alice" finds only memories mentioning Alice. More precise than semantic search. Supports partial matching.'
        },
        initiative: {
          type: 'string',
          description: 'Filter by initiative/project name from conversation context. Use when user scopes search to specific project or goal. Example: initiative="Q1 OKRs" finds only Q1-related memories. Supports partial matching (ILIKE).'
        },
        stakeholder: {
          type: 'string',
          description: 'Filter by stakeholder (person or team) from conversation context. Use when user asks about specific person\'s or team\'s involvement. Example: stakeholder="Engineering Team" finds memories where Engineering Team was mentioned as stakeholder. Supports partial matching (ILIKE).'
        },
        deadline: {
          type: 'string',
          description: 'Filter by deadline date from conversation context (YYYY-MM-DD format). Use when user asks about time-sensitive memories or specific deadlines. Example: deadline="2025-03-31" finds memories with March 31, 2025 deadline. Exact match only.'
        },
        intent: {
          type: 'string',
          description: 'Filter by conversation intent/purpose. Options: "decision" (decisions made), "learning" (knowledge gained), "question" (open questions), "blocker" (obstacles/issues). Use when user asks specifically for one of these types. Example: intent="decision" finds only conversations where decisions were made. Exact match only.'
        },
        has_observations: {
          type: 'boolean',
          description: 'Filter by conversation quality based on extracted observations (atomic facts). Set to true to find substantial, structured conversations with extracted knowledge (high-quality technical discussions, detailed planning). Set to false for lightweight chats. Omit to return all memories regardless of observation count. Use when user asks for "detailed", "substantial", or "in-depth" information.'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'get_memory_details',
    annotations: {
      title: 'Get Memory Details',
      readOnlyHint: true,       // This tool only READS data, never writes
      destructiveHint: false,   // No data modification
      idempotentHint: true,     // Same memoryId returns same result
      openWorldHint: true       // Interacts with Purmemo cloud API
    },
    description: 'Get complete details of a specific memory, including all linked parts if chunked',
    inputSchema: {
      type: 'object',
      properties: {
        memoryId: {
          type: 'string',
          description: 'ID of the memory to retrieve'
        },
        includeLinkedParts: {
          type: 'boolean',
          default: true,
          description: 'Include all linked parts if this is a chunked memory'
        }
      },
      required: ['memoryId']
    }
  },
  {
    name: 'discover_related_conversations',
    annotations: {
      title: 'Discover Related Conversations',
      readOnlyHint: true,       // This tool only READS data, never writes
      destructiveHint: false,   // No data modification
      idempotentHint: true,     // Same query returns same clustered results
      openWorldHint: true       // Interacts with Purmemo cloud API
    },
    description: `CROSS-PLATFORM DISCOVERY: Find related conversations across ALL AI platforms.

    Uses Purmemo's semantic clustering to automatically discover conversations about similar topics,
    regardless of which AI platform was used (ChatGPT, Claude Desktop, Gemini, etc).

    WHAT THIS DOES:
    - Searches for memories matching your query
    - Uses AI-organized semantic clusters to find related conversations
    - Groups results by topic cluster with platform indicators
    - Shows conversations you may have forgotten about on other platforms

    EXAMPLES:
    User: "Show me all conversations about the marketing project"
    → Finds conversations across ChatGPT, Claude, Gemini automatically

    User: "What have I discussed about licensing requirements?"
    → Discovers related discussions from all platforms, grouped by semantic similarity

    User: "Find everything about React hooks"
    → Returns conversations from any platform where you discussed React hooks

    RESPONSE FORMAT:
    Shows memories grouped by semantic cluster with platform badges (ChatGPT, Claude, Gemini)
    Each cluster represents conversations about similar topics across all platforms`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language query for discovering related conversations across platforms'
        },
        limit: {
          type: 'integer',
          default: 10,
          description: 'Maximum number of initial search results (will find related for each)'
        },
        relatedPerMemory: {
          type: 'integer',
          default: 5,
          description: 'Maximum related conversations to find per result'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'get_acknowledged_errors',
    annotations: {
      title: 'Get Acknowledged Errors',
      readOnlyHint: true,       // This tool only READS data, never writes
      destructiveHint: false,   // No data modification
      idempotentHint: true,     // Same parameters return same results
      openWorldHint: true       // Interacts with Purmemo cloud API
    },
    description: `Fetch acknowledged errors waiting for AI investigation.

    Used to fetch errors that have been acknowledged in the admin panel and need investigation.
    Returns errors with full context including logs, metadata, occurrence count.

    USAGE:
    - Call this when user says "investigate acknowledged errors" or "/investigate-errors"
    - Errors are sorted by occurrence count (most frequent first)
    - Returns full error details for investigation

    QUERY PARAMETERS:
    - limit: Max errors to return (default: 10)
    - level_filter: Filter by level - 'all', 'critical', 'error', 'warning' (default: 'all')
    - min_occurrences: Only errors with occurrence_count >= this (default: 1)

    EXAMPLE:
    get_acknowledged_errors(limit=5, level_filter="error", min_occurrences=3)
    → Returns top 5 error-level issues that occurred 3+ times

    RETURNS:
    - acknowledged_errors: Array of error objects
    - total_count: Number of errors returned
    - filters_applied: Summary of filters used`,
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          default: 10,
          description: 'Maximum number of errors to return'
        },
        level_filter: {
          type: 'string',
          default: 'all',
          enum: ['all', 'critical', 'error', 'warning'],
          description: 'Filter by error level'
        },
        min_occurrences: {
          type: 'integer',
          default: 1,
          description: 'Only errors with occurrence_count >= this'
        }
      },
      required: []
    }
  },
  {
    name: 'save_investigation_result',
    annotations: {
      title: 'Save Investigation Result',
      readOnlyHint: false,      // This tool WRITES data to storage
      destructiveHint: false,   // Creates new records, doesn't delete
      idempotentHint: false,    // Each call creates new investigation record
      openWorldHint: true       // Interacts with Purmemo cloud API
    },
    description: `Save AI investigation results for an error incident.

    Used to store investigation results for audit trail and learning from past fixes.
    Call this after investigating an error and proposing/deploying a fix.

    USAGE:
    - Call after completing investigation and deploying fix
    - Stores root cause analysis, research sources, proposed changes
    - Creates audit trail for learning from past investigations

    REQUEST FIELDS:
    - incident_id: UUID of the error incident (from get_acknowledged_errors)
    - root_cause_analysis: Your analysis of what caused the error
    - similar_incidents_analyzed: Array of similar incident IDs found
    - research_sources: Array of URLs used (search_web_ai, Context7 docs)
    - fix_type: Type of fix - 'code_change', 'config_update', 'deployment', 'migration', 'documentation'
    - proposed_changes: Object with file paths and changes made
    - confidence_score: Your confidence in the fix (0.0-1.0)
    - risk_level: Risk assessment - 'low', 'medium', 'high'
    - test_plan: How you tested the fix
    - rollback_plan: How to roll back if needed
    - deployment_commit_hash: Git commit hash of the fix
    - deployment_results: Object with deployment success/failure details

    EXAMPLE:
    save_investigation_result({
      incident_id: "550e8400-e29b-41d4-a716-446655440000",
      root_cause_analysis: "Timeout set to 5s, too short for slow networks",
      fix_type: "code_change",
      confidence_score: 0.85,
      risk_level: "low",
      deployment_commit_hash: "abc123def456"
    })

    RETURNS:
    - investigation_id: UUID of saved investigation
    - incident_id: UUID of the error incident
    - investigation_status: 'in_progress' or 'completed'
    - deployment_status: 'not_started', 'in_progress', 'completed'
    - success: true if saved successfully`,
    inputSchema: {
      type: 'object',
      properties: {
        incident_id: {
          type: 'string',
          description: 'UUID of the error incident from get_acknowledged_errors'
        },
        root_cause_analysis: {
          type: 'string',
          description: 'Your analysis of what caused the error'
        },
        similar_incidents_analyzed: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of similar incident IDs found via recall_memories'
        },
        research_sources: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              url: { type: 'string' },
              title: { type: 'string' },
              source: { type: 'string' }
            }
          },
          description: 'Array of research sources used (URLs from search_web_ai, Context7)'
        },
        fix_type: {
          type: 'string',
          enum: ['code_change', 'config_update', 'deployment', 'migration', 'documentation'],
          description: 'Type of fix applied'
        },
        proposed_changes: {
          type: 'object',
          description: 'Object with file paths and changes made'
        },
        confidence_score: {
          type: 'number',
          minimum: 0.0,
          maximum: 1.0,
          description: 'AI confidence in proposed fix (0.0-1.0)'
        },
        risk_level: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Risk assessment of the fix'
        },
        test_plan: {
          type: 'string',
          description: 'How the fix was tested'
        },
        rollback_plan: {
          type: 'string',
          description: 'How to roll back if fix fails'
        },
        deployment_commit_hash: {
          type: 'string',
          description: 'Git commit hash of the deployed fix'
        },
        deployment_results: {
          type: 'object',
          description: 'Deployment success/failure details'
        }
      },
      required: ['incident_id']
    }
  }
];

const server = new Server(
  { name: 'purmemo-mcp', version: '11.2.3' },
  { capabilities: { tools: {} } }
);

// Utility functions

/**
 * Sanitize text to remove invalid Unicode characters that would break JSON encoding.
 * Fixes "no low surrogate" errors by removing unpaired surrogates and other invalid chars.
 *
 * @param {string} text - Text to sanitize
 * @returns {string} - Sanitized text safe for JSON encoding
 */
function sanitizeUnicode(text) {
  if (!text || typeof text !== 'string') return text;

  try {
    // Method 1: Replace unpaired surrogates with replacement character
    // High surrogates: 0xD800-0xDBFF, Low surrogates: 0xDC00-0xDFFF
    return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g, '\uFFFD')
               // Also remove other problematic characters
               .replace(/\uFFFE|\uFFFF/g, '') // Non-characters
               .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // Control characters except \n, \r, \t
  } catch (error) {
    console.error('[SANITIZE] Error sanitizing text:', error.message);
    // Fallback: try to encode/decode to fix encoding issues
    try {
      return Buffer.from(text, 'utf8').toString('utf8');
    } catch (fallbackError) {
      console.error('[SANITIZE] Fallback failed, returning empty string');
      return '';
    }
  }
}

async function makeApiCall(endpoint, options = {}) {
  const method = options.method || 'GET';
  console.error(`[API_CALL] ${method} ${API_URL}${endpoint}`);
  console.error(`[API_CALL] API_KEY configured: ${API_KEY ? 'Yes (length: ' + API_KEY.length + ')' : 'NO'}`);
  console.error(`[API_CALL] API_KEY prefix: ${API_KEY ? API_KEY.substring(0, 20) + '...' : 'NONE'}`);

  if (!API_KEY) {
    console.error(`[API_CALL] FATAL: PURMEMO_API_KEY not configured`);
    throw new Error('PURMEMO_API_KEY not configured');
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    console.error(`[API_CALL] Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[API_CALL] ERROR RESPONSE (${response.status}):`, errorText.substring(0, 500));

      // Special handling for quota exceeded (429)
      if (response.status === 429) {
        try {
          const errorData = JSON.parse(errorText);
          const upgradeUrl = errorData.upgrade_url || 'https://app.purmemo.ai/dashboard/plans';
          const currentUsage = errorData.current_usage || '?';
          const quotaLimit = errorData.quota_limit || '?';
          const tier = errorData.tier || 'FREE';
          const billingPeriod = errorData.billing_period || 'this month';

          // Calculate reset date (first day of next month)
          const now = new Date();
          const resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          const resetDateStr = resetDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

          const userMessage = [
            `❌ Monthly recall quota exceeded (${currentUsage}/${quotaLimit} used)`,
            ``,
            `You've reached the ${tier.toUpperCase()} tier limit of ${quotaLimit} recalls per month.`,
            ``,
            `🚀 Upgrade to PRO for unlimited recalls:`,
            `   ${upgradeUrl}`,
            ``,
            `📅 Your quota will reset on ${resetDateStr}`,
            ``,
            `For immediate access, please upgrade your subscription.`
          ].join('\n');

          throw new Error(userMessage);
        } catch (parseError) {
          // If JSON parsing fails, fall back to generic quota message
          throw new Error(`Monthly recall quota exceeded. Upgrade to PRO for unlimited recalls:\nhttps://app.purmemo.ai/dashboard/plans`);
        }
      }

      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.error(`[API_CALL] Success - Response has ${Object.keys(data).length} top-level keys`);
    console.error(`[API_CALL] Success - Response size: ${JSON.stringify(data).length} bytes`);

    return data;

  } catch (error) {
    console.error(`[API_CALL] EXCEPTION CAUGHT:`, error);
    console.error(`[API_CALL] Exception type: ${error.constructor.name}`);
    console.error(`[API_CALL] Exception message: ${error.message}`);
    if (error.stack) console.error(`[API_CALL] Exception stack:`, error.stack);
    throw error;
  }
}

function extractContentMetadata(content) {
  const metadata = {
    characterCount: content.length,
    wordCount: content.split(/\s+/).length,
    hasCodeBlocks: false,
    codeBlockCount: 0,
    hasArtifacts: false,
    artifactCount: 0,
    hasUrls: false,
    urlCount: 0,
    hasFilePaths: false,
    filePathCount: 0,
    conversationTurns: 0
  };

  // Count code blocks
  const codeMatches = content.match(/```[\s\S]*?```/g);
  if (codeMatches) {
    metadata.hasCodeBlocks = true;
    metadata.codeBlockCount = codeMatches.length;
  }

  // Count conversation turns (USER:/ASSISTANT: patterns)
  const turnMatches = content.match(/(USER|ASSISTANT):/g);
  if (turnMatches) {
    metadata.conversationTurns = turnMatches.length;
  }

  // Count URLs
  const urlMatches = content.match(/https?:\/\/[^\s]+/g);
  if (urlMatches) {
    metadata.hasUrls = true;
    metadata.urlCount = urlMatches.length;
  }

  // Count file paths
  const pathMatches = content.match(/[\/~][\w\-\.\/]+\.\w+/g);
  if (pathMatches) {
    metadata.hasFilePaths = true;
    metadata.filePathCount = pathMatches.length;
  }

  // Check for artifacts section
  if (content.includes('=== ARTIFACTS ===') || content.includes('ARTIFACT:')) {
    metadata.hasArtifacts = true;
    // Rough count of artifacts
    const artifactSections = content.match(/ARTIFACT:|=== ARTIFACTS ===/g);
    metadata.artifactCount = artifactSections ? artifactSections.length : 1;
  }

  return metadata;
}

function shouldChunk(content) {
  // Auto-chunk if content is over 15K characters
  return content.length > 15000;
}

function chunkContent(content, maxChunkSize = 20000) {
  const chunks = [];
  let currentPos = 0;
  
  while (currentPos < content.length) {
    let chunkEnd = Math.min(currentPos + maxChunkSize, content.length);
    
    // Try to break at natural boundaries (paragraph, section, etc.)
    if (chunkEnd < content.length) {
      // Look for good break points within the last 1000 chars of the chunk
      const searchStart = Math.max(chunkEnd - 1000, currentPos);
      const segment = content.slice(searchStart, chunkEnd);
      
      // Try to break at section markers first
      const sectionBreak = segment.lastIndexOf('\n===');
      if (sectionBreak !== -1) {
        chunkEnd = searchStart + sectionBreak;
      } else {
        // Try to break at conversation turns
        const conversationBreak = segment.lastIndexOf('\nUSER:');
        if (conversationBreak !== -1) {
          chunkEnd = searchStart + conversationBreak;
        } else {
          // Break at paragraph
          const paragraphBreak = segment.lastIndexOf('\n\n');
          if (paragraphBreak !== -1) {
            chunkEnd = searchStart + paragraphBreak;
          }
        }
      }
    }
    
    const chunk = content.slice(currentPos, chunkEnd);
    chunks.push(chunk);
    currentPos = chunkEnd;
  }
  
  return chunks;
}

async function saveChunkedContent(content, title, tags = [], metadata = {}) {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const chunks = chunkContent(content);
  const totalParts = chunks.length;
  
  console.error(`[CHUNKED] Saving ${content.length} chars in ${totalParts} parts`);
  
  const savedParts = [];
  
  // Save each chunk
  for (let i = 0; i < chunks.length; i++) {
    const partNumber = i + 1;
    const chunk = chunks[i];

    const partData = await makeApiCall('/api/v1/memories/', {
      method: 'POST',
      body: JSON.stringify({
        content: chunk,
        title: `${title} - Part ${partNumber}/${totalParts}`,
        tags: [...tags, 'chunked-conversation', `session:${sessionId}`],
        platform: PLATFORM,  // Auto-detected from MCP_PLATFORM env var
        conversation_id: `${sessionId}-part-${partNumber}`,  // Unique ID per part (prevents living document update)
        metadata: {
          ...metadata,
          captureType: 'chunked',
          sessionId,
          partNumber,
          totalParts,
          chunkSize: chunk.length,
          isComplete: false
        }
      })
    });
    
    savedParts.push({
      partNumber,
      memoryId: partData.id || partData.memory_id,
      size: chunk.length
    });
  }
  
  // Create index memory
  const indexContent = `# ${title} - Complete Capture Index

## Capture Summary
- Total Parts: ${totalParts}
- Total Size: ${content.length} characters
- Session ID: ${sessionId}
- Saved: ${new Date().toISOString()}

## Parts Overview
${savedParts.map(p => `- Part ${p.partNumber}: ${p.size} chars [${p.memoryId}]`).join('\n')}

## Metadata
${JSON.stringify(metadata, null, 2)}

## Full Content Access
Use recall_memories with session:${sessionId} to find all parts, or use get_memory_details with any part ID.`;

  const indexData = await makeApiCall('/api/v1/memories/', {
    method: 'POST',
    body: JSON.stringify({
      content: indexContent,
      title: `${title} - Index`,
      tags: [...tags, 'chunked-index', `session:${sessionId}`],
      platform: PLATFORM,  // 'claude' - MCP is Claude-specific
      conversation_id: `${sessionId}-index`,  // Unique ID for index (prevents living document update)
      metadata: {
        ...metadata,
        captureType: 'chunked-index',
        sessionId,
        totalParts,
        totalSize: content.length,
        partIds: savedParts.map(p => p.memoryId),
        isComplete: true
      }
    })
  });

  return {
    sessionId,
    totalParts,
    totalSize: content.length,
    indexId: indexData.id || indexData.memory_id,
    parts: savedParts
  };
}

async function saveSingleContent(content, title, tags = [], metadata = {}) {
  console.error(`[SINGLE] Saving ${content.length} chars directly`);

  const data = await makeApiCall('/api/v1/memories/', {
    method: 'POST',
    body: JSON.stringify({
      content,
      title,
      tags: [...tags, 'complete-conversation'],
      platform: PLATFORM,  // 'claude' - MCP is Claude-specific
      conversation_id: metadata.conversationId || null,  // For living document pattern
      metadata: {
        ...metadata,
        captureType: 'single',
        isComplete: true
      }
    })
  });

  return {
    memoryId: data.id || data.memory_id,
    size: content.length,
    wisdomSuggestion: data.wisdom_suggestion || null  // PHASE 16.3: Return wisdom suggestion
  };
}

// PHASE 16.3: Helper to format wisdom suggestions
function formatWisdomSuggestion(wisdomSuggestion) {
  if (!wisdomSuggestion) return '';

  const { tool, reason, confidence, url, best_for, context_prompt } = wisdomSuggestion;

  return `\n\n` +
    `🧠 WISDOM SUGGESTION (Phase 16.3):\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `✨ Recommended Next Tool: ${tool.toUpperCase()}\n` +
    `📊 Confidence: ${(confidence * 100).toFixed(0)}%\n` +
    `💡 Why: ${reason}\n` +
    `🔗 URL: ${url}\n\n` +
    `📋 Best For: ${best_for.join(', ')}\n\n` +
    `💬 Ready-to-use prompt:\n` +
    `${context_prompt.split('\n').slice(0, 8).join('\n')}\n` +
    `   [...see full prompt in ${tool}]\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🎯 Click the URL above to continue your workflow in ${tool}!\n`;
}

// Tool handlers
async function handleSaveConversation(args) {
  // ⚠️ PHASE 16.4: Sanitize content IMMEDIATELY to prevent JSON encoding errors
  const rawContent = args.conversationContent || '';
  const content = sanitizeUnicode(rawContent);
  const contentLength = content.length;

  // ============================================================================
  // PHASE 15: INTELLIGENT CONTEXT EXTRACTION
  // ============================================================================
  console.error('[Phase 15] Extracting intelligent context...');
  const intelligentContext = extractProjectContext(content);

  // Generate intelligent title (unless explicitly provided)
  let title = args.title;
  if (!title || title.startsWith('Conversation 202')) {
    title = generateIntelligentTitle(intelligentContext, content);
    console.error(`[Phase 15] Generated intelligent title: "${title}"`);
  }

  // Extract progress indicators and relationships
  const progressIndicators = extractProgressIndicators(content);
  const relationships = extractRelationships(content);

  const tags = args.tags || ['complete-conversation'];

  // AUTO-GENERATE conversation_id from title if not provided
  // This enables automatic living document pattern (like Chrome extension)
  let conversationId = args.conversationId;
  if (!conversationId && title && !title.startsWith('Conversation 202')) {
    // Generate stable ID from title (normalize to slug)
    conversationId = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with hyphens
      .replace(/^-+|-+$/g, '')       // Remove leading/trailing hyphens
      .substring(0, 100);             // Limit length

    console.error(`[AUTO-ID] Generated conversation_id from title: "${conversationId}"`);
  }

  // Validate content quality
  if (contentLength < 100) {
    return {
      content: [{
        type: 'text',
        text: `❌ INSUFFICIENT CONTENT DETECTED!\n\n` +
              `You provided only ${contentLength} characters.\n` +
              `This tool requires the COMPLETE conversation content.\n\n` +
              `What you sent: "${content.substring(0, 100)}..."\n\n` +
              `REQUIREMENTS:\n` +
              `- Include ALL user messages verbatim\n` +
              `- Include ALL assistant responses completely\n` +
              `- Include ALL code blocks and artifacts\n` +
              `- Minimum 500 characters expected for real conversations\n\n` +
              `Please retry with the FULL conversation content.`
      }]
    };
  }

  if (contentLength < 500 && !content.includes('USER:') && !content.includes('ASSISTANT:')) {
    return {
      content: [{
        type: 'text',
        text: `⚠️ POSSIBLE SUMMARY DETECTED!\n\n` +
              `Content: "${content}"\n\n` +
              `This appears to be a summary rather than the full conversation.\n` +
              `Please include the complete conversation with:\n` +
              `- USER: [exact messages]\n` +
              `- ASSISTANT: [exact responses]\n` +
              `- All code blocks and artifacts\n\n` +
              `Or confirm this is the complete content by adding more context.`
      }]
    };
  }

  try {
    const metadata = extractContentMetadata(content);

    // ==========================================
    // NEW: Check for existing memory (living document)
    // ==========================================
    if (conversationId) {
      try {
        // Search for existing memory with this conversation_id
        const params = new URLSearchParams({
          conversation_id: conversationId,
          platform: PLATFORM,
          page_size: '1'
        });

        const searchResponse = await makeApiCall(`/api/v1/memories/?${params}`, {
          method: 'GET'
        });

        const existingMemories = searchResponse.results || [];

        if (existingMemories.length > 0) {
          // FOUND existing memory - UPDATE it
          const existingMemory = existingMemories[0];
          const memoryId = existingMemory.id;

          console.error(`[LIVING DOC] Updating existing memory: ${memoryId}`);

          // ============================================================================
          // PHASE 15: ENRICH UPDATE WITH INTELLIGENT CONTEXT
          // ============================================================================
          const updateMetadata = {
            ...metadata,
            captureType: shouldChunk(content) ? 'chunked' : 'single',
            isComplete: true,
            lastUpdated: new Date().toISOString(),
            intelligent: {
              ...intelligentContext,
              progress_indicators: progressIndicators,
              ...relationships
            }
          };

          console.error(`[Phase 15] Updating with intelligent metadata:`, JSON.stringify({
            project: intelligentContext.project_name,
            phase: intelligentContext.phase,
            status: intelligentContext.status
          }));

          const updateResponse = await makeApiCall(`/api/v1/memories/${memoryId}/`, {
            method: 'PATCH',
            body: JSON.stringify({
              content: content,
              title: title,
              tags: tags,
              metadata: updateMetadata
            })
          });

          // Success response for UPDATE
          const isAutoGenerated = !args.conversationId && conversationId;
          const wisdomSuggestion = updateResponse.wisdom_suggestion || null;  // PHASE 16.3

          return {
            content: [{
              type: 'text',
              text: `✅ CONVERSATION UPDATED (Living Document)!\n\n` +
                    `📝 Conversation ID: ${conversationId}` + (isAutoGenerated ? ' (auto-generated from title)\n' : '\n') +
                    `📏 New size: ${content.length} characters\n` +
                    `🔗 Memory ID: ${memoryId}\n\n` +
                    `📊 Content Analysis:\n` +
                    `- Conversation turns: ${metadata.conversationTurns}\n` +
                    `- Code blocks: ${metadata.codeBlockCount}\n` +
                    `- Artifacts: ${metadata.artifactCount}\n` +
                    `- URLs: ${metadata.urlCount}\n\n` +
                    (isAutoGenerated ? `💡 Auto-living document: Saves with title "${title}" will update this memory\n` : '') +
                    `✓ Updated existing memory (not duplicated)!` +
                    formatWisdomSuggestion(wisdomSuggestion)  // PHASE 16.3: Display wisdom suggestion
            }]
          };
        } else {
          console.error(`[LIVING DOC] No existing memory found for conversation_id=${conversationId}, will create new`);
        }
      } catch (error) {
        console.error(`[LIVING DOC] Error checking for existing memory:`, error);
        // Fall through to create new memory
      }
    }
    // ==========================================
    // End of living document check
    // ==========================================

    // No conversation_id or no existing memory found - CREATE new memory
    metadata.conversationId = conversationId;  // Store in metadata

    // ============================================================================
    // PHASE 15: ENRICH METADATA WITH INTELLIGENT CONTEXT
    // ============================================================================
    metadata.intelligent = {
      ...intelligentContext,
      progress_indicators: progressIndicators,
      ...relationships
    };

    console.error(`[Phase 15] Enriched metadata:`, JSON.stringify({
      project: intelligentContext.project_name,
      component: intelligentContext.project_component,
      feature: intelligentContext.feature_name,
      phase: intelligentContext.phase,
      status: intelligentContext.status
    }, null, 2));

    // Decide whether to chunk or save directly
    if (shouldChunk(content)) {
      const result = await saveChunkedContent(content, title, tags, metadata);
      const isAutoGenerated = !args.conversationId && conversationId;

      return {
        content: [{
          type: 'text',
          text: `✅ LARGE CONVERSATION SAVED (Auto-chunked)!\n\n` +
                (conversationId ? `📝 Conversation ID: ${conversationId}` + (isAutoGenerated ? ' (auto-generated from title)\n' : '\n') : '') +
                `📏 Total size: ${result.totalSize} characters\n` +
                `📦 Saved as: ${result.totalParts} linked parts\n` +
                `🔗 Session ID: ${result.sessionId}\n` +
                `📋 Index ID: ${result.indexId}\n\n` +
                `📊 Content Analysis:\n` +
                `- Conversation turns: ${metadata.conversationTurns}\n` +
                `- Code blocks: ${metadata.codeBlockCount}\n` +
                `- Artifacts: ${metadata.artifactCount}\n` +
                `- URLs: ${metadata.urlCount}\n` +
                `- File paths: ${metadata.filePathCount}\n\n` +
                (conversationId && isAutoGenerated ? `💡 Auto-living document: Next save with title "${title}" will UPDATE this memory\n` : '') +
                (conversationId && !isAutoGenerated ? `✓ Use conversation ID "${conversationId}" to update this later!\n` : '') +
                `✓ Complete conversation preserved with all context!`
        }]
      };
    } else {
      const result = await saveSingleContent(content, title, tags, metadata);
      const isAutoGenerated = !args.conversationId && conversationId;

      return {
        content: [{
          type: 'text',
          text: `✅ CONVERSATION SAVED!\n\n` +
                (conversationId ? `📝 Conversation ID: ${conversationId}` + (isAutoGenerated ? ' (auto-generated from title)\n' : '\n') : '') +
                `📏 Size: ${result.size} characters\n` +
                `🔗 Memory ID: ${result.memoryId}\n\n` +
                `📊 Content Analysis:\n` +
                `- Conversation turns: ${metadata.conversationTurns}\n` +
                `- Code blocks: ${metadata.codeBlockCount}\n` +
                `- Artifacts: ${metadata.artifactCount}\n` +
                `- URLs: ${metadata.urlCount}\n` +
                `- File paths: ${metadata.filePathCount}\n\n` +
                (conversationId && isAutoGenerated ? `💡 Auto-living document: Next save with title "${title}" will UPDATE this memory\n` : '') +
                (conversationId && !isAutoGenerated ? `✓ Use conversation ID "${conversationId}" to update this later!\n` : '') +
                `✓ Complete conversation preserved!` +
                formatWisdomSuggestion(result.wisdomSuggestion)  // PHASE 16.3: Display wisdom suggestion
        }]
      };
    }
    
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `❌ Save Error: ${error.message}\n\nPlease try again or contact support if the issue persists.`
      }]
    };
  }
}

async function handleDiscoverRelated(args) {
  try {
    // Use v10 MCP endpoint for proper semantic clustering
    const safeQuery = sanitizeUnicode(args.query || '');

    const response = await makeApiCall('/api/v10/mcp/tools/execute', {
      method: 'POST',
      body: JSON.stringify({
        tool: 'discover_related_conversations',
        arguments: {
          query: args.query,
          limit: args.limit || 10,
          relatedPerMemory: args.relatedPerMemory || 5
        }
      })
    });

    // V10 returns MCP response format with extra fields, extract just content
    if (response.content && response.content[0]) {
      return {
        content: response.content
      };
    }

    // Fallback if no content
    return {
      content: [{
        type: 'text',
        text: `🔍 No related conversations found for "${safeQuery}"\n\nTry different keywords or check if conversations were saved successfully.`
      }]
    };

  } catch (error) {
    // Check if this is a quota error (HTTP 429)
    if (error.message && error.message.includes('429')) {
      return {
        content: [{
          type: 'text',
          text: `⚠️ Monthly recall quota exceeded.\n\n${error.message}\n\nNote: 'discover_related_conversations' shares the same quota pool as 'recall_memories'.`
        }]
      };
    }

    return {
      content: [{
        type: 'text',
        text: `❌ Discovery Error: ${error.message}\n\nThis could be due to:\n- Monthly quota limit reached (check with your API provider)\n- Network connectivity issues\n- API endpoint changes\n\nTry using 'recall_memories' for basic search, or upgrade to PRO for unlimited recalls.`
      }]
    };
  }
}

async function handleGetAcknowledgedErrors(args) {
  try {
    const limit = args.limit || 10;
    const levelFilter = args.level_filter || 'all';
    const minOccurrences = args.min_occurrences || 1;

    const response = await makeApiCall(
      `/api/v1/admin/acknowledged-errors?limit=${limit}&level_filter=${levelFilter}&min_occurrences=${minOccurrences}`,
      {
        method: 'GET'
      }
    );

    if (!response.acknowledged_errors || response.acknowledged_errors.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `✅ No acknowledged errors found!\n\nAll acknowledged errors have been investigated and resolved.`
        }]
      };
    }

    // Format response for Claude with rich context
    const errorList = response.acknowledged_errors.map((err, idx) => {
      let output = `\n${idx + 1}. **${err.level.toUpperCase()}** (ID: ${err.id})
   Message: ${err.message}
   Occurrences: ${err.occurrence_count}
   First Seen: ${err.first_seen_at}
   Last Seen: ${err.last_seen_at}
   Source: ${err.source}`;

      // Enhanced: Display rich error context if available
      if (err.metadata) {
        // Check for exception context from Phase 1 enhancement
        if (err.metadata.exception_type) {
          output += `\n\n   🔍 EXCEPTION DETAILS:`;
          output += `\n   Type: ${err.metadata.exception_type}`;
          if (err.metadata.exception_message) {
            output += `\n   Message: ${err.metadata.exception_message}`;
          }
        }

        // Display error location
        if (err.metadata.error_location) {
          const loc = err.metadata.error_location;
          output += `\n\n   📍 ERROR LOCATION:`;
          output += `\n   File: ${loc.file || loc.full_path}`;
          output += `\n   Line: ${loc.line}`;
          output += `\n   Function: ${loc.function}`;
          if (loc.code) {
            output += `\n   Code: ${loc.code}`;
          }
        }

        // Display traceback (first 5 frames)
        if (err.metadata.traceback_frames && err.metadata.traceback_frames.length > 0) {
          output += `\n\n   📚 STACK TRACE:`;
          const frames = err.metadata.traceback_frames.slice(-5); // Last 5 frames
          frames.forEach((frame, i) => {
            output += `\n   ${i + 1}. ${frame.file}:${frame.line} in ${frame.function}`;
            if (frame.code) {
              output += `\n      ${frame.code}`;
            }
          });
        }

        // Display request context
        if (err.metadata.request_context) {
          const req = err.metadata.request_context;
          output += `\n\n   🌐 REQUEST CONTEXT:`;
          output += `\n   Endpoint: ${req.endpoint || req.path}`;
          output += `\n   Method: ${req.method}`;
          if (req.user) output += `\n   User: ${req.user}`;
        }

        // Display other metadata compactly
        const displayedKeys = ['exception_type', 'exception_message', 'error_location', 'traceback_frames', 'traceback', 'request_context'];
        const otherMetadata = Object.keys(err.metadata)
          .filter(key => !displayedKeys.includes(key))
          .reduce((obj, key) => {
            obj[key] = err.metadata[key];
            return obj;
          }, {});

        if (Object.keys(otherMetadata).length > 0) {
          output += `\n\n   📋 OTHER METADATA: ${JSON.stringify(otherMetadata, null, 2)}`;
        }
      }

      if (err.sample_log_ids && err.sample_log_ids.length > 0) {
        output += `\n\n   📝 Sample Logs: ${err.sample_log_ids.join(', ')}`;
      }

      // Phase 2: Display similar past investigations
      if (err.similar_investigations && err.similar_investigations.length > 0) {
        output += `\n\n   🔄 SIMILAR PAST FIXES (${err.similar_investigations.length}):`;
        err.similar_investigations.forEach((inv, i) => {
          output += `\n\n   ${i + 1}. Fixed ${inv.fixed_at ? new Date(inv.fixed_at).toLocaleDateString() : 'previously'}`;
          if (inv.root_cause) {
            output += `\n      Root Cause: ${inv.root_cause}`;
          }
          if (inv.fix_type) {
            output += `\n      Fix Type: ${inv.fix_type}`;
          }
          if (inv.confidence !== null && inv.confidence !== undefined) {
            output += `\n      Confidence: ${(inv.confidence * 100).toFixed(0)}%`;
          }
          if (inv.risk_level) {
            output += `\n      Risk: ${inv.risk_level}`;
          }
          if (inv.commit_hash) {
            output += `\n      Commit: ${inv.commit_hash.substring(0, 7)}`;
          }
        });
        output += `\n\n   💡 TIP: We've fixed this error before! Review the past fixes above.`;
      }

      return output;
    }).join('\n');

    return {
      content: [{
        type: 'text',
        text: `🔍 Found ${response.total_count} Acknowledged Errors\n\nFilters Applied: Level=${levelFilter}, Min Occurrences=${minOccurrences}\n${errorList}\n\n📝 Next Steps:\n1. Choose an error to investigate\n2. Use recall_memories to check if we've seen similar errors\n3. Use search_web_ai to research solutions\n4. Use Context7 for library-specific docs\n5. Propose fix with confidence score\n6. Deploy fix when approved\n7. Call save_investigation_result to store audit trail`
      }]
    };

  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `❌ Error fetching acknowledged errors: ${error.message}\n\nMake sure:\n1. Backend API is running\n2. You have admin permissions\n3. Error tracking service is active`
      }]
    };
  }
}

async function handleSaveInvestigation(args) {
  try {
    if (!args.incident_id) {
      return {
        content: [{
          type: 'text',
          text: `❌ Missing required field: incident_id\n\nPlease provide the incident_id from get_acknowledged_errors.`
        }]
      };
    }

    const response = await makeApiCall('/api/v1/admin/investigations', {
      method: 'POST',
      body: JSON.stringify(args)
    });

    if (response.success) {
      return {
        content: [{
          type: 'text',
          text: `✅ Investigation Saved Successfully!\n\n📋 Investigation ID: ${response.investigation_id}\n🔗 Incident ID: ${response.incident_id}\n📊 Status: ${response.investigation_status}\n🚀 Deployment: ${response.deployment_status}\n\n${args.deployment_commit_hash ? `✓ Deployed with commit: ${args.deployment_commit_hash}` : '⏳ Awaiting deployment'}\n\nThis investigation is now part of the audit trail and can be used to learn from similar errors in the future.`
        }]
      };
    } else {
      return {
        content: [{
          type: 'text',
          text: `⚠️ Investigation saved with warnings:\n\n${JSON.stringify(response, null, 2)}`
        }]
      };
    }

  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `❌ Error saving investigation: ${error.message}\n\nPlease check:\n1. incident_id is valid\n2. Backend API is running\n3. You have admin permissions`
      }]
    };
  }
}

async function handleRecallMemories(args) {
  try {
    // Use v10 MCP endpoint for semantic search with intelligent scoring
    const safeQuery = sanitizeUnicode(args.query || '');

    const response = await makeApiCall('/api/v10/mcp/tools/execute', {
      method: 'POST',
      body: JSON.stringify({
        tool: 'recall_memories',
        arguments: {
          query: args.query,
          limit: args.limit || 10,
          includeChunked: args.includeChunked !== false,
          contentPreview: args.contentPreview !== false,
          // Phase 2 Knowledge Graph filters
          entity: args.entity,
          initiative: args.initiative,
          stakeholder: args.stakeholder,
          deadline: args.deadline,
          intent: args.intent,
          has_observations: args.has_observations
        }
      })
    });

    // V10 returns MCP response format with extra fields, extract just content
    return {
      content: response.content || []
    };

  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `❌ Recall Error: ${error.message}`
      }]
    };
  }
}

async function handleGetMemoryDetails(args) {
  console.error(`[GET_MEMORY_DETAILS] Called with memoryId: ${args.memoryId}, includeLinkedParts: ${args.includeLinkedParts}`);

  try {
    console.error(`[GET_MEMORY_DETAILS] Using v10 MCP endpoint with auto-linked parts support`);

    // Use v10 MCP endpoint for enhanced memory details
    const response = await makeApiCall('/api/v10/mcp/tools/execute', {
      method: 'POST',
      body: JSON.stringify({
        tool: 'get_memory_details',
        arguments: {
          memoryId: args.memoryId,
          includeLinkedParts: args.includeLinkedParts !== false
        }
      })
    });

    console.error(`[GET_MEMORY_DETAILS] V10 API call succeeded`);

    // V10 returns MCP response format with extra fields, extract just content
    return {
      content: response.content || []
    };

  } catch (error) {
    console.error(`[GET_MEMORY_DETAILS] ERROR CAUGHT:`, error);
    console.error(`[GET_MEMORY_DETAILS] Error type: ${error.constructor.name}`);
    console.error(`[GET_MEMORY_DETAILS] Error message: ${error.message}`);
    console.error(`[GET_MEMORY_DETAILS] Error stack:`, error.stack);

    return {
      content: [{
        type: 'text',
        text: `❌ Error retrieving memory: ${error.message}\n\nMemory ID: ${args.memoryId}\nError Type: ${error.constructor.name}\n\nCheck logs for full details.`
      }]
    };
  }
}

// Setup server
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'save_conversation':
      return await handleSaveConversation(args);
    case 'recall_memories':
      return await handleRecallMemories(args);
    case 'get_memory_details':
      return await handleGetMemoryDetails(args);
    case 'discover_related_conversations':
      return await handleDiscoverRelated(args);
    case 'get_acknowledged_errors':
      return await handleGetAcknowledgedErrors(args);
    case 'save_investigation_result':
      return await handleSaveInvestigation(args);
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
server.connect(transport)
  .then(() => {
    console.error('✅ Purmemo MCP Server v10.0.2-phase16.4-fix started successfully');
    console.error(`   API URL: ${API_URL}`);
    console.error(`   API Key: ${API_KEY ? 'Configured ✓' : 'NOT CONFIGURED ✗'}`);
    console.error(`   Platform: ${PLATFORM}`);
    console.error(`   Tools: ${TOOLS.length} available`);
    console.error(`   🧠 Phase 15: Intelligent memory saving with auto-context extraction`);
    console.error(`   🎯 Phase 15: Smart title generation (no more timestamps!)`);
    console.error(`   📊 Phase 15: Automatic project/component/feature detection`);
    console.error(`   🗺️ Phase 15: Roadmap tracking across AI tools`);
    console.error(`   🌟 Phase 16.3: Wisdom Layer - AI-powered tool orchestration`);
    console.error(`   🔮 Phase 16.3: Proactive next-tool suggestions with context`);
    console.error(`   🌍 Cluster-powered discovery across ChatGPT, Claude, Gemini`);
    console.error(`   🛡️ Phase 16.4: Unicode sanitization - fixes "no low surrogate" errors`);
  })
  .catch((error) => {
    console.error('❌ Failed to start MCP server:', error.message);
    process.exit(1);
  });