#!/usr/bin/env node
/**
 * Ultimate Purmemo MCP Server v9.3.0 (Phase 13D)
 *
 * Comprehensive solution that combines all our learnings:
 * - Smart content detection and routing
 * - Aggressive prompting for complete capture
 * - Automatic chunking for large content
 * - Artifact and code block extraction
 * - Session management for multi-part saves
 * - Living document pattern with auto-ID from title
 * - 🌍 NEW: Cross-platform discovery via semantic clusters
 * - 🔗 NEW: Find related conversations across ChatGPT, Claude, Gemini
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';

const API_URL = process.env.PURMEMO_API_URL || 'https://api.purmemo.ai';
const API_KEY = process.env.PURMEMO_API_KEY;

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
const TOOLS = [
  {
    name: 'save_conversation',
    description: `🚨 CRITICAL INSTRUCTION TO CLAUDE: When this tool is called, you MUST provide the COMPLETE conversation.

    💡 LIVING DOCUMENT PATTERN (AUTO-ENABLED):
    - Conversation ID automatically generated from title (e.g., "Brandon and Wivak Business" → "brandon-and-wivak-business")
    - Subsequent saves with SAME title will UPDATE existing memory (not create duplicates)
    - Example: Saving "Project X Planning" twice = ONE memory updated twice
    - To force new memory: Change title or provide explicit conversationId parameter
    - Manual conversationId still supported for advanced use cases

    EXAMPLES:
    User: "Save this as conversation react-hooks-guide"
    → You call save_conversation with conversationId="react-hooks-guide"

    User: "Update conversation react-hooks-guide"
    → You call save_conversation with conversationId="react-hooks-guide" (updates existing)

    WHAT TO INCLUDE:
    - EVERY user message (verbatim, not paraphrased)
    - EVERY assistant response (complete, not summarized)
    - ALL code blocks with full syntax
    - ALL artifacts with complete content (not just titles/descriptions)
    - ALL file paths, URLs, and references mentioned
    - ALL system messages and tool outputs
    - EXACT conversation flow and context

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

    ⚠️ DO NOT send just "save this conversation" or summaries.
    ⚠️ The content should be THOUSANDS of characters.
    ⚠️ If you send less than 500 chars, you're doing it wrong.

    The server will auto-chunk if needed (>15K chars) or save directly (<15K chars).`,
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
    name: 'save_with_artifacts', 
    description: `Save conversation content along with any artifacts, code, or files created.

    INSTRUCTION TO CLAUDE: When artifacts or code was created during our conversation, 
    you MUST include the COMPLETE content of those artifacts, not just references or summaries.
    
    Expected format:
    - conversationSummary: Key points discussed
    - artifacts: Array of complete artifact content
    - codeBlocks: Array of complete code blocks
    - context: Full conversation context`,
    inputSchema: {
      type: 'object',
      properties: {
        conversationSummary: {
          type: 'string',
          description: 'Summary of the conversation context'
        },
        artifacts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              type: { type: 'string', enum: ['code', 'document', 'config', 'data', 'other'] },
              content: { type: 'string', description: 'COMPLETE artifact content, not summary' },
              language: { type: 'string', description: 'Programming language if applicable' }
            },
            required: ['title', 'content']
          },
          description: 'Complete artifacts created during conversation'
        },
        codeBlocks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              language: { type: 'string' },
              code: { type: 'string' },
              context: { type: 'string', description: 'What this code does/why it was created' }
            }
          },
          description: 'All code blocks discussed'
        },
        fullContext: {
          type: 'string',
          description: 'Complete conversation if artifacts are part of larger discussion'
        }
      },
      required: ['conversationSummary']
    }
  },
  {
    name: 'recall_memories',
    description: 'Search and retrieve saved memories with support for chunked conversations',
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
        }
      },
      required: ['query']
    }
  },
  {
    name: 'get_memory_details',
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
    description: `🌍 CROSS-PLATFORM DISCOVERY: Find related conversations across ALL AI platforms.

    Uses Purmemo's semantic clustering to automatically discover conversations about similar topics,
    regardless of which AI platform was used (ChatGPT, Claude Desktop, Gemini, etc).

    WHAT THIS DOES:
    - Searches for memories matching your query
    - Uses AI-organized semantic clusters to find related conversations
    - Groups results by topic cluster with platform indicators
    - Shows conversations you may have forgotten about on other platforms

    EXAMPLES:
    User: "Show me all conversations about Brandon and Wivak business"
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
  }
];

const server = new Server(
  { name: 'purmemo-ultimate', version: '9.3.0' },
  { capabilities: { tools: {} } }
);

// Utility functions
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
    const errorText = await response.text();
    throw new Error(`API Error ${response.status}: ${errorText}`);
  }
  
  return await response.json();
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
        conversation_id: metadata.conversationId || null,  // For living document pattern
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
      conversation_id: metadata.conversationId || null,  // For living document pattern
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
    size: content.length
  };
}

// Tool handlers
async function handleSaveConversation(args) {
  const content = args.conversationContent || '';
  const contentLength = content.length;
  const title = args.title || `Conversation ${new Date().toISOString()}`;
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

          const updateResponse = await makeApiCall(`/api/v1/memories/${memoryId}/`, {
            method: 'PATCH',
            body: JSON.stringify({
              content: content,
              title: title,
              tags: tags,
              metadata: {
                ...metadata,
                captureType: shouldChunk(content) ? 'chunked' : 'single',
                isComplete: true,
                lastUpdated: new Date().toISOString()
              }
            })
          });

          // Success response for UPDATE
          const isAutoGenerated = !args.conversationId && conversationId;
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
                    `✓ Updated existing memory (not duplicated)!`
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
                `✓ Complete conversation preserved!`
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

async function handleSaveWithArtifacts(args) {
  let fullContent = args.conversationSummary || '';
  const metadata = {
    hasArtifacts: false,
    hasCode: false,
    artifactCount: 0,
    codeBlockCount: 0
  };
  
  // Add artifacts section
  if (args.artifacts && args.artifacts.length > 0) {
    fullContent += '\n\n=== ARTIFACTS ===\n';
    args.artifacts.forEach((artifact, index) => {
      fullContent += `\n## Artifact ${index + 1}: ${artifact.title}\n`;
      fullContent += `Type: ${artifact.type}\n`;
      if (artifact.language) {
        fullContent += `Language: ${artifact.language}\n`;
      }
      fullContent += `\nContent:\n\`\`\`${artifact.language || ''}\n${artifact.content}\n\`\`\`\n`;
    });
    metadata.hasArtifacts = true;
    metadata.artifactCount = args.artifacts.length;
  }
  
  // Add code blocks section
  if (args.codeBlocks && args.codeBlocks.length > 0) {
    fullContent += '\n\n=== CODE BLOCKS ===\n';
    args.codeBlocks.forEach((block, index) => {
      fullContent += `\n## Code Block ${index + 1}\n`;
      fullContent += `Language: ${block.language}\n`;
      fullContent += `Context: ${block.context}\n`;
      fullContent += `\n\`\`\`${block.language}\n${block.code}\n\`\`\`\n`;
    });
    metadata.hasCode = true;
    metadata.codeBlockCount = args.codeBlocks.length;
  }
  
  // Add full context if provided
  if (args.fullContext) {
    fullContent += '\n\n=== FULL CONVERSATION CONTEXT ===\n';
    fullContent += args.fullContext;
  }
  
  const title = `Conversation with Artifacts - ${new Date().toISOString()}`;
  const tags = ['conversation-with-artifacts', 'complete-capture'];
  
  try {
    const extractedMetadata = extractContentMetadata(fullContent);
    const combinedMetadata = { ...extractedMetadata, ...metadata };
    
    if (shouldChunk(fullContent)) {
      const result = await saveChunkedContent(fullContent, title, tags, combinedMetadata);
      
      return {
        content: [{
          type: 'text',
          text: `✅ CONVERSATION WITH ARTIFACTS SAVED!\n\n` +
                `📏 Total size: ${result.totalSize} characters\n` +
                `📦 Artifacts: ${metadata.artifactCount}\n` +
                `💻 Code blocks: ${metadata.codeBlockCount}\n` +
                `🔗 Session: ${result.sessionId}\n` +
                `📋 Index: ${result.indexId}\n\n` +
                `✓ All artifacts and code preserved in full!`
        }]
      };
    } else {
      const result = await saveSingleContent(fullContent, title, tags, combinedMetadata);
      
      return {
        content: [{
          type: 'text',
          text: `✅ CONVERSATION WITH ARTIFACTS SAVED!\n\n` +
                `📏 Size: ${result.size} characters\n` +
                `📦 Artifacts: ${metadata.artifactCount}\n` +
                `💻 Code blocks: ${metadata.codeBlockCount}\n` +
                `🔗 Memory: ${result.memoryId}\n\n` +
                `✓ All artifacts and code preserved!`
        }]
      };
    }
    
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `❌ Save Error: ${error.message}`
      }]
    };
  }
}

async function handleDiscoverRelated(args) {
  try {
    const limit = args.limit || 10;
    const relatedLimit = args.relatedPerMemory || 5;

    // Step 1: Search for memories matching the query
    const params = new URLSearchParams({
      query: args.query,
      page_size: String(limit)
    });

    const data = await makeApiCall(`/api/v1/memories/?${params}`, {
      method: 'GET'
    });

    const initialMemories = data.results || data.memories || data;

    if (!initialMemories || initialMemories.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `🔍 No memories found for "${args.query}"\n\nTry different keywords or check if conversations were saved.`
        }]
      };
    }

    // Step 2: For each memory, get related conversations via clusters
    const clusterMap = new Map(); // cluster_id -> {cluster_info, memories}
    const processedMemoryIds = new Set();
    let totalRelatedFound = 0;

    for (const memory of initialMemories) {
      const memoryId = memory.id || memory.memory_id;

      if (processedMemoryIds.has(memoryId)) continue;
      processedMemoryIds.add(memoryId);

      try {
        // Get related memories in same cluster
        const relatedData = await makeApiCall(
          `/api/v1/clusters/memory/${memoryId}/related?limit=${relatedLimit}`,
          { method: 'GET' }
        );

        const relatedMemories = relatedData.related_memories || [];
        totalRelatedFound += relatedMemories.length;

        // Get cluster info by fetching one of the related memories
        if (relatedMemories.length > 0) {
          // Group by cluster (we'll use a synthetic cluster ID based on the set of related memories)
          const clusterId = `cluster_${memoryId}`; // Use first memory as cluster anchor

          if (!clusterMap.has(clusterId)) {
            clusterMap.set(clusterId, {
              anchorMemory: memory,
              memories: [memory, ...relatedMemories.map(r => ({
                id: r.id,
                title: r.title,
                content: r.content_preview || '',
                created_at: r.created_at,
                updated_at: r.updated_at,
                platform: 'unknown', // Will be populated if available
                similarity: r.similarity
              }))]
            });
          }
        } else {
          // No related memories found, still show this memory
          const clusterId = `single_${memoryId}`;
          clusterMap.set(clusterId, {
            anchorMemory: memory,
            memories: [memory]
          });
        }
      } catch (error) {
        console.error(`Error fetching related for memory ${memoryId}:`, error.message);
        // Still include the original memory even if related fetch fails
        const clusterId = `single_${memoryId}`;
        if (!clusterMap.has(clusterId)) {
          clusterMap.set(clusterId, {
            anchorMemory: memory,
            memories: [memory]
          });
        }
      }
    }

    // Step 3: Format results grouped by cluster with platform indicators
    let resultText = `🌍 **Cross-Platform Discovery Results**\n`;
    resultText += `🔍 Query: "${args.query}"\n`;
    resultText += `📊 Found ${initialMemories.length} direct matches, ${totalRelatedFound} related conversations\n`;
    resultText += `🎯 Organized into ${clusterMap.size} topic clusters\n\n`;
    resultText += `${'─'.repeat(60)}\n\n`;

    let clusterIndex = 1;
    for (const [clusterId, clusterData] of clusterMap) {
      const { anchorMemory, memories } = clusterData;

      // Count platforms
      const platformCounts = {};
      memories.forEach(m => {
        const platform = m.platform || 'unknown';
        platformCounts[platform] = (platformCounts[platform] || 0) + 1;
      });

      const platformBadges = Object.entries(platformCounts)
        .map(([platform, count]) => {
          const emoji = platform === 'chatgpt' ? '🤖' :
                       platform === 'claude' ? '🟣' :
                       platform === 'gemini' ? '💎' : '❓';
          return `${emoji} ${platform}: ${count}`;
        })
        .join(' | ');

      resultText += `## Cluster ${clusterIndex}: ${anchorMemory.title}\n`;
      if (memories.length > 1) {
        resultText += `🔗 ${memories.length} related conversations | ${platformBadges}\n\n`;
      } else {
        resultText += `📝 Single conversation | ${platformBadges}\n\n`;
      }

      // Show memories in this cluster
      memories.forEach((mem, idx) => {
        const memId = mem.id || mem.memory_id;
        const platform = mem.platform || 'unknown';
        const emoji = platform === 'chatgpt' ? '🤖' :
                     platform === 'claude' ? '🟣' :
                     platform === 'gemini' ? '💎' : '❓';

        resultText += `  ${idx + 1}. ${emoji} **${mem.title}**\n`;
        resultText += `     Platform: ${platform} | ${mem.content?.length || 0} chars\n`;
        resultText += `     Created: ${mem.created_at ? new Date(mem.created_at).toLocaleString() : 'Unknown'}\n`;
        if (mem.similarity) {
          resultText += `     Similarity: ${(mem.similarity * 100).toFixed(1)}%\n`;
        }
        resultText += `     ID: ${memId}\n`;

        if (mem.content && mem.content.length > 0) {
          const preview = mem.content.substring(0, 100).replace(/\n/g, ' ');
          resultText += `     Preview: ${preview}...\n`;
        }
        resultText += `\n`;
      });

      resultText += `\n`;
      clusterIndex++;
    }

    resultText += `${'─'.repeat(60)}\n\n`;
    resultText += `💡 **Tips:**\n`;
    resultText += `- Use 'get_memory_details' with any memory ID to read full content\n`;
    resultText += `- Related conversations are grouped by semantic similarity\n`;
    resultText += `- Platform badges show which AI tool was used for each conversation\n`;

    return {
      content: [{ type: 'text', text: resultText }]
    };

  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `❌ Discovery Error: ${error.message}\n\nThis could be due to:\n- Network connectivity issues\n- API endpoint changes\n- Clustering system not yet initialized\n\nTry using 'recall_memories' for basic search.`
      }]
    };
  }
}

async function handleRecallMemories(args) {
  try {
    const params = new URLSearchParams({
      query: args.query,
      page_size: String(args.limit || 10)
    });

    const data = await makeApiCall(`/api/v1/memories/?${params}`, {
      method: 'GET'
    });

    const memories = data.results || data.memories || data;
    
    if (!memories || memories.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `🔍 No memories found for "${args.query}"\n\nTry different keywords or check if the conversation was saved successfully.`
        }]
      };
    }

    let resultText = `🔍 Found ${memories.length} memories for "${args.query}"\n\n`;
    
    // Group chunked memories by session
    const chunkedSessions = new Map();
    const singleMemories = [];
    
    memories.forEach(memory => {
      const meta = memory.metadata || {};
      if (meta.sessionId && args.includeChunked) {
        if (!chunkedSessions.has(meta.sessionId)) {
          chunkedSessions.set(meta.sessionId, []);
        }
        chunkedSessions.get(meta.sessionId).push(memory);
      } else {
        singleMemories.push(memory);
      }
    });
    
    // Display chunked memories
    let index = 1;
    for (const [sessionId, parts] of chunkedSessions) {
      const indexMemory = parts.find(p => p.metadata?.captureType === 'chunked-index');
      const contentParts = parts.filter(p => p.metadata?.captureType === 'chunked').sort(
        (a, b) => (a.metadata?.partNumber || 0) - (b.metadata?.partNumber || 0)
      );
      
      if (indexMemory) {
        const totalSize = contentParts.reduce((sum, p) => sum + p.content.length, 0);
        resultText += `${index}. **${indexMemory.title.replace(' - Index', '')}** [CHUNKED]\n`;
        resultText += `   📦 ${contentParts.length} parts, ${totalSize} total chars\n`;
        resultText += `   🔗 Session: ${sessionId.substring(0, 12)}...\n`;
        
        if (args.contentPreview) {
          const firstPart = contentParts[0];
          if (firstPart) {
            resultText += `   📝 Preview: ${firstPart.content.substring(0, 150)}...\n`;
          }
        }
        resultText += `   📋 Index ID: ${indexMemory.id || indexMemory.memory_id}\n\n`;
        index++;
      }
    }
    
    // Display single memories
    singleMemories.forEach(memory => {
      const meta = memory.metadata || {};
      const platform = memory.platform || 'unknown';
      const emoji = platform === 'chatgpt' ? '🤖' :
                   platform === 'claude' ? '🟣' :
                   platform === 'gemini' ? '💎' : '❓';

      resultText += `${index}. ${emoji} **${memory.title}**\n`;
      resultText += `   📏 ${memory.content.length} chars`;

      if (meta.conversationTurns > 0) {
        resultText += ` (${meta.conversationTurns} turns)`;
      }
      if (meta.hasArtifacts) {
        resultText += ` [${meta.artifactCount} artifacts]`;
      }
      if (meta.hasCodeBlocks) {
        resultText += ` [${meta.codeBlockCount} code blocks]`;
      }
      resultText += `\n`;
      resultText += `   🌍 Platform: ${platform}\n`;

      if (args.contentPreview) {
        resultText += `   📝 Preview: ${memory.content.substring(0, 150)}...\n`;
      }
      resultText += `   🔗 ID: ${memory.id || memory.memory_id}\n\n`;
      index++;
    });

    // Add cluster discovery hint at the end
    resultText += `${'─'.repeat(60)}\n\n`;
    resultText += `💡 **Discover More:**\n`;
    resultText += `Use 'discover_related_conversations' with your query to find related\n`;
    resultText += `conversations across ALL platforms (ChatGPT, Claude, Gemini).\n`;
    resultText += `Automatically grouped by AI-organized semantic clusters!\n`;

    return {
      content: [{ type: 'text', text: resultText }]
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
  try {
    // Get the main memory
    const memory = await makeApiCall(`/api/v1/memories/${args.memoryId}/`, {
      method: 'GET'
    });
    
    const meta = memory.metadata || {};
    let result = `📋 **${memory.title}**\n\n`;
    result += `📏 Size: ${memory.content.length} characters\n`;
    result += `📅 Created: ${memory.created_at || 'Unknown'}\n`;
    
    if (meta.captureType) {
      result += `🔧 Type: ${meta.captureType}\n`;
    }
    
    // If this is a chunked memory, get all related parts
    if (meta.sessionId && args.includeLinkedParts) {
      try {
        const sessionMemories = await makeApiCall(`/api/v1/memories/?query=session:${meta.sessionId}&page_size=50`, {
          method: 'GET'
        });
        
        const memories = sessionMemories.results || sessionMemories.memories || [];
        const parts = memories.filter(m => m.metadata?.captureType === 'chunked').sort(
          (a, b) => (a.metadata?.partNumber || 0) - (b.metadata?.partNumber || 0)
        );
        
        if (parts.length > 0) {
          const totalSize = parts.reduce((sum, p) => sum + p.content.length, 0);
          result += `\n🔗 **Chunked Memory Details:**\n`;
          result += `   📦 Total parts: ${parts.length}\n`;
          result += `   📏 Combined size: ${totalSize} characters\n`;
          result += `   🆔 Session: ${meta.sessionId}\n\n`;
          
          result += `**All Parts:**\n`;
          parts.forEach(part => {
            const partMeta = part.metadata || {};
            result += `• Part ${partMeta.partNumber}: ${part.content.length} chars [${part.id}]\n`;
          });
          result += `\n`;
        }
      } catch (e) {
        result += `⚠️ Could not load linked parts: ${e.message}\n`;
      }
    }
    
    // Content analysis
    if (meta.conversationTurns > 0) {
      result += `💬 Conversation turns: ${meta.conversationTurns}\n`;
    }
    if (meta.hasCodeBlocks) {
      result += `💻 Code blocks: ${meta.codeBlockCount}\n`;
    }
    if (meta.hasArtifacts) {
      result += `📦 Artifacts: ${meta.artifactCount}\n`;
    }
    if (meta.hasUrls) {
      result += `🔗 URLs: ${meta.urlCount}\n`;
    }
    if (meta.hasFilePaths) {
      result += `📁 File paths: ${meta.filePathCount}\n`;
    }
    
    result += `\n**Content Preview:**\n`;
    result += `${memory.content.substring(0, 500)}${memory.content.length > 500 ? '...' : ''}\n`;
    
    return {
      content: [{ type: 'text', text: result }]
    };
    
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `❌ Error retrieving memory: ${error.message}`
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
    case 'save_with_artifacts':
      return await handleSaveWithArtifacts(args);
    case 'recall_memories':
      return await handleRecallMemories(args);
    case 'get_memory_details':
      return await handleGetMemoryDetails(args);
    case 'discover_related_conversations':
      return await handleDiscoverRelated(args);
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
    console.error('✅ Purmemo MCP Server v9.3.0 (Phase 13D) started successfully');
    console.error(`   API URL: ${API_URL}`);
    console.error(`   API Key: ${API_KEY ? 'Configured ✓' : 'NOT CONFIGURED ✗'}`);
    console.error(`   Platform: ${PLATFORM}`);
    console.error(`   Tools: ${TOOLS.length} available (including cross-platform discovery)`);
    console.error(`   🌍 New: Cluster-powered discovery across ChatGPT, Claude, Gemini`);
  })
  .catch((error) => {
    console.error('❌ Failed to start MCP server:', error.message);
    process.exit(1);
  });