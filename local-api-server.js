#!/usr/bin/env node
/**
 * Local API Server for Testing v9.0.0 Thin Layer
 * Simulates the private API endpoints with v8.0.0 logic
 */

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3456;

// v8.0.0 Secret Sauce - Validation Logic
function validateConversationContent(content) {
  const charCount = content.length;
  
  // Reject if too short
  if (charCount < 500) {
    return {
      valid: false,
      message: `🚨 INSUFFICIENT CONTENT DETECTED - RETRY REQUIRED 🚨

You provided only ${charCount} characters. This appears to be a summary or incomplete conversation.

CRITICAL INSTRUCTION: You MUST provide the COMPLETE conversation including:
- ALL user messages (verbatim)
- ALL your responses (complete, not summarized)
- ALL code artifacts
- ALL explanations and context

We expect THOUSANDS of characters for a real conversation, not ${charCount}.

⚠️ MINIMUM REQUIREMENT: 500+ characters
📊 TYPICAL CONVERSATION: 5,000-50,000 characters
🎯 YOUR SUBMISSION: ${charCount} characters (REJECTED)

Please retry with the FULL conversation. Do not summarize. Include EVERYTHING.`
    };
  }
  
  // Check for summary indicators
  const summaryIndicators = [
    'in summary',
    'to summarize',
    'key points',
    'main topics',
    'overview of'
  ];
  
  const lowerContent = content.toLowerCase();
  for (const indicator of summaryIndicators) {
    if (lowerContent.includes(indicator)) {
      return {
        valid: false,
        message: `🚨 SUMMARY DETECTED - FULL CONTENT REQUIRED 🚨

Your submission contains summary language ("${indicator}"). We need the ACTUAL conversation, not a summary.

Please provide the COMPLETE conversation with all messages, responses, and artifacts.`
      };
    }
  }
  
  return { valid: true };
}

// Auto-chunking logic for large content
function autoChunkContent(content, chunkSize = 45000) {
  if (content.length <= chunkSize) {
    return [content];
  }
  
  const chunks = [];
  let currentChunk = '';
  const lines = content.split('\n');
  
  for (const line of lines) {
    if ((currentChunk + line).length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = line + '\n';
    } else {
      currentChunk += line + '\n';
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

// MCP Tool Execution Endpoint
app.post('/api/v9/mcp/tools/execute', (req, res) => {
  const { tool, arguments: args } = req.body;
  
  console.log(`📥 Tool: ${tool}`);
  console.log(`   Args:`, JSON.stringify(args).substring(0, 100) + '...');
  
  switch (tool) {
    case 'save_conversation': {
      const { content, title, tags } = args;
      
      // Apply v8.0.0 validation
      const validation = validateConversationContent(content);
      
      if (!validation.valid) {
        // Return retry instruction
        return res.json({
          retry: true,
          message: validation.message,
          content: [{
            type: 'text',
            text: validation.message
          }]
        });
      }
      
      // Auto-chunk if needed
      const chunks = autoChunkContent(content);
      
      if (chunks.length > 1) {
        console.log(`   ✅ Auto-chunked into ${chunks.length} parts`);
      }
      
      // Simulate successful save
      const memoryId = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      return res.json({
        content: [{
          type: 'text',
          text: `✅ Conversation saved successfully!
          
Memory ID: ${memoryId}
Character count: ${content.length}
Chunks created: ${chunks.length}
Title: ${title || 'Untitled'}
Tags: ${tags?.join(', ') || 'none'}

Your conversation has been permanently stored in Purmemo.`
        }]
      });
    }
    
    case 'save_with_artifacts': {
      const { content, artifacts } = args;
      
      // Validate main content
      const validation = validateConversationContent(content);
      if (!validation.valid) {
        return res.json({
          retry: true,
          message: validation.message,
          content: [{
            type: 'text',
            text: validation.message
          }]
        });
      }
      
      // Process artifacts
      const artifactCount = artifacts?.length || 0;
      const totalSize = content.length + (artifacts?.reduce((sum, a) => sum + a.content.length, 0) || 0);
      
      const memoryId = `mem_art_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      return res.json({
        content: [{
          type: 'text',
          text: `✅ Content with artifacts saved!
          
Memory ID: ${memoryId}
Total size: ${totalSize} characters
Artifacts: ${artifactCount} files
${artifacts?.map(a => `  - ${a.filename} (${a.language})`).join('\n') || ''}

Your content and code artifacts have been preserved.`
        }]
      });
    }
    
    case 'recall_memories': {
      const { query, limit = 10 } = args;
      
      // Simulate search results
      const mockResults = [];
      for (let i = 1; i <= Math.min(limit, 3); i++) {
        mockResults.push({
          id: `mem_${Date.now() - i * 1000000}`,
          title: `Test Memory ${i}`,
          preview: `This is a test memory matching "${query}"...`,
          created: new Date(Date.now() - i * 86400000).toISOString()
        });
      }
      
      return res.json({
        content: [{
          type: 'text',
          text: `📚 Found ${mockResults.length} memories matching "${query}":

${mockResults.map(m => `• ${m.title} (${m.id})
  ${m.preview}
  Created: ${m.created}`).join('\n\n')}

Use get_memory_details with any ID to see full content.`
        }]
      });
    }
    
    case 'get_memory_details': {
      const { memory_id } = args;
      
      return res.json({
        content: [{
          type: 'text',
          text: `📖 Memory Details for ${memory_id}:

Title: Test Memory
Created: ${new Date().toISOString()}
Character count: 12,345
Tags: test, automated, local

Content:
This is a detailed test memory showing that the local API server is working correctly.
The v8.0.0 validation logic is active and protecting your innovations.

[Full content would be displayed here in production]`
        }]
      });
    }
    
    default:
      return res.status(400).json({
        error: `Unknown tool: ${tool}`,
        content: [{
          type: 'text',
          text: `Error: Unknown tool "${tool}"`
        }]
      });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: '9.0.0-local',
    secretSauce: 'protected',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
🚀 Local API Server Running
================================
Port: ${PORT}
Version: v9.0.0 with v8.0.0 logic
Endpoints:
  - POST /api/v9/mcp/tools/execute
  - GET  /health
  
Secret sauce status: ✅ Protected
Validation logic: ✅ Active
Auto-chunking: ✅ Enabled

Ready for local testing!
================================
  `);
});