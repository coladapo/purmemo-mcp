#!/usr/bin/env node
/**
 * Save complete development context to Purmemo
 */

import { spawn } from 'child_process';

const completeContext = `=== COMPLETE PURMEMO MCP DEVELOPMENT CONTEXT ===

## PROJECT TIMELINE & EVOLUTION

### Initial Problem (Start of Session)
USER: "Fix Purmemo MCP to capture full conversation context with all details, not just summaries"
- Issue: MCP was only capturing summaries of conversations
- Goal: Capture complete context including all prompts, responses, artifacts, code

### Phase 1: Understanding the Architecture
- Discovered MCP servers are isolated processes
- They only see what Claude explicitly sends via tool calls
- Cannot access conversation history directly
- Led to realization: Must prompt Claude to send complete content

### Phase 2: Server Evolution Journey

1. **Original server.js** - Basic 5 tools (memory, recall, entities, etc.)
   - Status: Working but only captured summaries

2. **Enhanced-server.js** - 8 specialized tools
   - USER: "so why have both some tools might already be obsolete"
   - Problem: Too many tools, Claude wouldn't know which to use

3. **Smart-server.js** - Consolidated to 3 tools with auto-extraction
   - USER insight: "if we are capturing everything wouldn't everything like code, pdf etc be attached?"
   - Solution: Auto-extract code blocks, URLs, file paths
   - Result: Cleaner but still summary issue

4. **Prompted-server.js** - Aggressive prompting approach
   - Added validation (rejects <1000 chars)
   - Embedded instructions in tool descriptions
   - Partial success but hit size limits

5. **Chunked-server.js** - Solved size limitation
   - Discovery: Claude truncates at ~17-21K chars
   - Solution: Multi-part capture with session linking
   - Verified: 100K chars → 99.9% efficiency

6. **Ultimate-server.js** - FINAL COMPREHENSIVE SOLUTION
   - Combines all learnings
   - Auto-routes based on content size
   - 71% test pass rate with brutal honesty verification

### Phase 3: Key Technical Discoveries

**Size Limitations Found:**
- API accepts: 100K characters ✓
- Claude sends: ~17-21K max (THE BOTTLENECK)
- Node.js buffers: 64KB
- Solution: Auto-chunking for >15K content

**Validation Insights:**
- Can enforce minimum content requirements
- Can reject summaries and demand full content
- Cannot force Claude beyond its limits
- Must use intelligent prompting

### Phase 4: Testing & Verification

**Test Files Created:**
- test-mcp-inspector.js - Automated tool testing
- test-chunked.js - Verify chunking works
- test-size-limits.js - Find exact limitations
- test-ultimate.js - Brutal honesty verification

**Verification Results:**
- Single capture: 100% efficiency
- Auto-chunked (35K): 100% preserved
- Manual chunked (100K): 99.9% preserved
- All saves verified against actual API

### Phase 5: Production Deployment

**Claude Desktop Testing:**
- Updated config multiple times
- Tested with real conversations
- Successfully captured 11,545 char conversation with privacy policy
- Verified artifacts preserved completely

### Critical User Feedback Moments

1. "be brutally honest no fake codes and verify what's ACTUALLY working vs what's just printing success messages"
   - Led to API verification in all tests

2. "its not necessarily about the size > the goal is always to capture complete context"
   - Shifted focus from size to completeness

3. "why cant it capture all Claude reported 95,384 characters"
   - Led to discovering Claude's tool call generation limit

4. "if we are capturing everything wouldn't everything like code, pdf etc be attached?"
   - Key insight that led to smart extraction

### Files & Locations

**Production Servers:**
- /src/ultimate-server.js - USE THIS ONE
- /src/chunked-server.js - Chunking logic reference
- /src/prompted-server.js - Prompting strategies
- /src/smart-server.js - Extraction patterns
- /src/server.js - Original (backup)

**Test Suites:**
- /test-ultimate.js - Main verification
- /test-chunked.js - Chunking tests
- /test-size-limits.js - Limit investigation

**Documentation:**
- /COMPREHENSIVE_SOLUTION.md - Full architecture
- ~/Desktop/PURMEMO_ULTIMATE_TEST_GUIDE.md - User testing guide
- ~/Desktop/PurMemo_Privacy_Policy_Implementation.md - Privacy work

### Solution Architecture

**Ultimate Server Capabilities:**
1. save_conversation - Primary tool, handles everything
2. save_with_artifacts - Specialized for code/documents
3. recall_memories - Search with chunked support
4. get_memory_details - Full retrieval with linking

**How It Works:**
\`\`\`
User says "save this" 
  → Validate content (reject if <100 chars)
  → Extract metadata (code, URLs, artifacts)
  → Decide routing:
    → <15K: Single save
    → >15K: Auto-chunk with session
  → Save to API
  → Verify actual save
  → Return confirmation
\`\`\`

### Achievements Summary

✅ **Solved 95K→21K Problem** - Auto-chunking preserves everything
✅ **Artifact Preservation** - Full code/documents saved
✅ **Content Validation** - Rejects summaries
✅ **Simple UX** - One tool does everything
✅ **API Verified** - No fake success messages

### Privacy Policy Work

Created comprehensive privacy policy including:
- Data collection and usage policies
- Security measures (encryption, hashing)
- User rights (CCPA compliant)
- Third-party integrations
- Successfully saved as 11,545 char artifact

### Current Status

**Working:**
- Ultimate server deployed in Claude Desktop
- Capturing complete conversations with artifacts
- Auto-chunking for large content
- Full API verification

**Next Steps:**
- Deploy privacy policy to website
- Set up privacy@purmemo.ai email
- Legal review of policy
- Continue monitoring capture performance

=== END COMPLETE CONTEXT ===`;

async function saveCompleteContext() {
  console.log('📝 Saving complete development context to Purmemo...\n');
  
  const server = spawn('node', ['src/ultimate-server.js'], {
    env: {
      ...process.env,
      PURMEMO_API_KEY: '***REMOVED***'
    }
  });

  const request = {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'save_conversation',
      arguments: {
        conversationContent: completeContext,
        title: 'Complete Purmemo MCP Development Journey - Full Context',
        tags: ['purmemo-mcp', 'development-complete', 'ultimate-server', 'full-history'],
        priority: 'high'
      }
    },
    id: 'save_complete'
  };

  return new Promise((resolve, reject) => {
    let responseData = '';
    let errorData = '';
    
    server.stdout.on('data', (data) => {
      responseData += data.toString();
    });
    
    server.stderr.on('data', (data) => {
      errorData += data.toString();
    });
    
    // Send request
    server.stdin.write(JSON.stringify(request) + '\n');
    
    // Process response after delay
    setTimeout(() => {
      server.kill();
      
      // Parse response
      const lines = responseData.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('{')) {
          try {
            const response = JSON.parse(line);
            if (response.id === 'save_complete') {
              const text = response.result?.content?.[0]?.text || 'No response';
              console.log(text);
              
              // Extract memory ID if present
              const idMatch = text.match(/Memory ID: ([a-f0-9-]+)/);
              if (idMatch) {
                console.log(`\n✅ Complete context saved successfully!`);
                console.log(`📚 Memory ID: ${idMatch[1]}`);
                console.log(`📏 Context size: ${completeContext.length} characters`);
              }
              
              resolve();
              return;
            }
          } catch (e) {
            // Continue checking other lines
          }
        }
      }
      
      console.log('⚠️ No valid response received');
      if (errorData) {
        console.log('Errors:', errorData);
      }
      resolve();
    }, 3000);
  });
}

// Run the save
saveCompleteContext().catch(console.error);