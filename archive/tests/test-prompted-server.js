#!/usr/bin/env node
/**
 * Automated MCP Test Suite for Prompted Server
 * Tests all 4 capture tools to verify if prompts force full content
 */

import { spawn } from 'child_process';
import { writeFileSync } from 'fs';

const TEST_CASES = {
  'save_full_conversation': {
    description: 'Test if tool enforces full conversation capture',
    tests: [
      {
        name: 'Minimal input (should fail)',
        input: {
          content: 'save this conversation'
        },
        expectSuccess: false,
        expectMinChars: 1000
      },
      {
        name: 'Full conversation simulation',
        input: {
          content: `USER: Can you help me analyze the competitive landscape for AI memory systems?

ASSISTANT: I'll help you analyze the competitive landscape for AI memory systems. This is a rapidly evolving market with several key players.

## Market Leaders

**Zep.ai** - Leading with 94.8% accuracy in memory benchmarks, they've built a temporal knowledge graph architecture that's particularly impressive. They're Y Combinator-backed and charge $1.25 per 1,000 messages. Their key advantage is the 90% latency reduction they achieve.

**Letta (formerly MemGPT)** - Backed by Google's Jeff Dean with $10M funding at a $70M valuation. They take an academic "LLM Operating System" approach with unprecedented transparency into agent reasoning.

**Mem0** - Has achieved 50,000+ developer adoption and $1M revenue in 2024. They pivoted from EmbedChain and now offer a hybrid datastore combining graph, vector, and key-value stores. Their Pro tier is $249/month.

## Infrastructure Providers

**Pinecone** dominates the vector database market but at premium pricing ($50-500/month minimums). They're the enterprise default for stability.

**LangChain Memory** provides framework-integrated memory but is still in beta, limiting production adoption.

## Market Dynamics

The overall AI market is projected to reach $1.8 trillion by 2030, with memory systems becoming critical infrastructure. Enterprise AI spending averages 3.32% of revenue, with financial services leading at 20%+ of total AI investment.

USER: What about pricing strategies? How should we position ourselves?

ASSISTANT: Based on the competitive analysis, here's the optimal pricing strategy:

## Tiered Pricing Model

**Free Tier**: 10,000-100,000 operations/month
- Essential for developer adoption
- Matches market expectations set by Mem0 and Pinecone

**Pro Tier**: $9-49/month
- Individual developers
- Transparent usage-based pricing
- Similar to successful API products

**Business Tier**: $99-249/month  
- Teams and SMBs
- This gap is underserved in the market
- Position between free and enterprise

**Enterprise**: Custom pricing
- SSO, RBAC integration
- SOC 2, HIPAA compliance  
- Private cloud deployment
- SLAs and dedicated support

## Key Differentiation Points

Your MCP protocol advantage gives you unique positioning:
- Only solution with true cross-platform memory sync
- Reduced vendor lock-in for enterprises
- Native integration with Claude ecosystem

## Batch Processing Discounts

Follow Anthropic's model with 50%+ discounts for batch processing to attract high-volume users.

This positions you competitively while leveraging your unique technical advantages.`,
          title: 'Competitive Analysis Discussion',
          includeArtifacts: true,
          includeSystemMessages: false
        },
        expectSuccess: true,
        expectMinChars: 1000
      }
    ]
  },
  'save_with_context': {
    description: 'Test structured context capture',
    tests: [
      {
        name: 'With conversation history array',
        input: {
          content: 'Summary of our discussion about AI memory systems and pricing',
          conversationHistory: [
            { role: 'user', content: 'What are the main competitors in AI memory?' },
            { role: 'assistant', content: 'The main competitors are Zep.ai, Letta, and Mem0...' },
            { role: 'user', content: 'How should we price our solution?' },
            { role: 'assistant', content: 'I recommend a tiered model from free to enterprise...' }
          ],
          artifacts: [
            '# Competitive Analysis\n\nDetailed market analysis document with pricing tiers...'
          ],
          metadata: {
            messageCount: 4,
            totalCharacters: 2500,
            hasCodeBlocks: false,
            hasArtifacts: true
          }
        },
        expectSuccess: true
      }
    ]
  },
  'capture_everything': {
    description: 'Test validation enforcement',
    tests: [
      {
        name: 'Without validation (should fail)',
        input: {
          fullTranscript: 'This is too short'
        },
        expectSuccess: false,
        expectError: 'VALIDATION FAILED'
      },
      {
        name: 'Under 1000 chars (should fail)',
        input: {
          fullTranscript: 'This is a test transcript that is definitely under 1000 characters',
          validation: {
            confirmFullCapture: true,
            totalCharacterCount: 67
          }
        },
        expectSuccess: false,
        expectError: 'minimum: 1000'
      },
      {
        name: 'Complete capture with validation',
        input: {
          fullTranscript: `=== CONVERSATION START ===
[2025-01-05 10:00:00] USER: I need help understanding the AI memory systems market. Can you provide a comprehensive analysis?

[2025-01-05 10:00:15] ASSISTANT: I'll provide you with a comprehensive analysis of the AI memory systems market. This is a rapidly evolving space with significant growth potential.

## Market Overview

The AI memory systems market has exploded to $110 billion in 2024, with projections reaching $1.25 trillion by 2034. This represents one of the fastest-growing segments in the AI infrastructure space.

## Key Players and Their Positioning

### Technical Performance Leaders

**Zep.ai** - Currently the technical leader with 94.8% accuracy in memory benchmarks. They've achieved 90% latency reduction through their temporal knowledge graph architecture using the Graphiti framework. Y Combinator-backed, they charge $1.25 per 1,000 messages, positioning themselves as the developer-friendly choice.

**Letta (formerly MemGPT)** - Takes an academic approach with their "LLM Operating System" concept. Backed by Google's Jeff Dean with $10M funding at $70M valuation. They provide unprecedented transparency into agent reasoning, appealing to enterprises requiring auditability.

**Mem0** - Successfully pivoted from a RAG framework to comprehensive memory platform. 50,000+ developer adoption, $1M revenue in 2024. Their hybrid datastore (graph + vector + key-value) delivers 26% better accuracy than OpenAI Memory.

### Infrastructure Providers

**Pinecone** - Dominates vector database market with production-grade reliability. Premium pricing ($50-500/month minimums) but remains the enterprise default.

**LangChain Memory** - Framework-integrated but still beta, limiting production adoption.

[2025-01-05 10:02:00] USER: This is really helpful. What about pricing strategies and market gaps?

[2025-01-05 10:02:30] ASSISTANT: Let me break down the pricing strategies and identify key market gaps for you.

## Pricing Patterns in the Market

### Successful Pricing Models

The market has converged on consistent patterns:
- **Free Tiers**: 10,000-100,000 API calls/month
- **Usage-Based**: $0.014/hour to $1.25/1,000 messages  
- **Enterprise**: 5-10x premium with custom negotiations

### Recommended Pricing Strategy

**Free Tier**: 10,000-100,000 operations/month
**Pro**: $9-49/month (individual developers)
**Business**: $99-249/month (teams/SMB)
**Enterprise**: Custom (SSO, compliance, SLAs)

## Critical Market Gaps

### Underserved Segments
1. **SMB Market**: The $99-299/month tier is notably underserved
2. **Vertical-Specific**: Healthcare, legal, financial with compliance features  
3. **Educational/Research**: Academic pricing for future advocates

### Feature Gaps
- No true cross-platform memory synchronization
- Limited privacy-preserving local-first options
- Poor memory lifecycle management
- Lack of no-code integration options

This represents significant opportunity for differentiation.

=== ARTIFACTS ===
None created in this conversation

=== CODE BLOCKS ===
None in this conversation

=== END ===`,
          validation: {
            confirmFullCapture: true,
            totalCharacterCount: 2847
          },
          separateArtifacts: {
            artifacts: [],
            codeBlocks: []
          }
        },
        expectSuccess: true
      }
    ]
  },
  'recall': {
    description: 'Test memory search',
    tests: [
      {
        name: 'Search for test memories',
        input: {
          query: 'competitive analysis',
          limit: 5
        },
        expectSuccess: true
      }
    ]
  }
};

class MCPTestRunner {
  constructor() {
    this.results = [];
    this.serverProcess = null;
  }

  async runTests() {
    console.log('🧪 Starting Automated MCP Test Suite\n');
    console.log('Server: prompted-server.js');
    console.log('Testing: Prompt effectiveness for forcing full capture\n');
    console.log('='.repeat(60));

    // Start server
    await this.startServer();

    // Run tests for each tool
    for (const [toolName, toolConfig] of Object.entries(TEST_CASES)) {
      console.log(`\n📋 Testing: ${toolName}`);
      console.log(`   ${toolConfig.description}`);
      console.log('   ' + '-'.repeat(56));

      for (const test of toolConfig.tests) {
        await this.runSingleTest(toolName, test);
        await this.delay(200);
      }
    }

    // Generate report
    this.generateReport();

    // Cleanup
    this.cleanup();
  }

  async startServer() {
    console.log('\n🚀 Starting MCP server...');
    
    this.serverProcess = spawn('node', ['src/prompted-server.js'], {
      env: {
        ...process.env,
        PURMEMO_API_KEY: '***REMOVED***'
      }
    });

    this.serverProcess.stderr.on('data', (data) => {
      if (data.toString().includes('error')) {
        console.error('Server error:', data.toString());
      }
    });

    // Wait for server to initialize
    await this.delay(1000);
    console.log('✓ Server started\n');
  }

  async runSingleTest(toolName, test) {
    const startTime = Date.now();
    
    console.log(`\n   🔬 ${test.name}`);
    
    try {
      // Send request to server
      const request = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: test.input
        },
        id: Math.random().toString(36).substring(7)
      };

      const response = await this.sendRequest(request);
      const elapsed = Date.now() - startTime;
      
      // Validate response
      const success = this.validateResponse(response, test);
      
      const result = {
        tool: toolName,
        test: test.name,
        success,
        elapsed,
        request: test.input,
        response: response?.result || response?.error
      };

      this.results.push(result);

      // Display result
      if (success) {
        console.log(`      ✅ PASS (${elapsed}ms)`);
        if (response?.result?.content?.[0]?.text) {
          const text = response.result.content[0].text;
          if (text.includes('characters')) {
            const match = text.match(/(\d+) characters/);
            if (match) {
              console.log(`      📏 Captured: ${match[1]} characters`);
            }
          }
        }
      } else {
        console.log(`      ❌ FAIL (${elapsed}ms)`);
        if (test.expectSuccess === false) {
          console.log(`      ✓ Failed as expected (validation working)`);
        } else {
          console.log(`      ⚠️ Unexpected failure`);
        }
      }

    } catch (error) {
      console.log(`      ❌ ERROR: ${error.message}`);
      this.results.push({
        tool: toolName,
        test: test.name,
        success: false,
        error: error.message
      });
    }
  }

  async sendRequest(request) {
    return new Promise((resolve) => {
      const responseHandler = (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.trim().startsWith('{')) {
            try {
              const response = JSON.parse(line);
              if (response.id === request.id) {
                this.serverProcess.stdout.removeListener('data', responseHandler);
                resolve(response);
                return;
              }
            } catch (e) {
              // Continue if JSON parse fails
            }
          }
        }
      };

      this.serverProcess.stdout.on('data', responseHandler);
      this.serverProcess.stdin.write(JSON.stringify(request) + '\n');

      // Timeout after 3 seconds
      setTimeout(() => {
        this.serverProcess.stdout.removeListener('data', responseHandler);
        resolve({ error: 'Timeout' });
      }, 3000);
    });
  }

  validateResponse(response, test) {
    if (test.expectSuccess === false) {
      // Should fail
      return response?.error || 
             (response?.result?.content?.[0]?.text?.includes('FAIL')) ||
             (response?.result?.content?.[0]?.text?.includes('INCOMPLETE')) ||
             (response?.result?.content?.[0]?.text?.includes('REJECTED'));
    }

    if (test.expectMinChars) {
      const text = response?.result?.content?.[0]?.text || '';
      if (text.includes('characters')) {
        const match = text.match(/(\d+) characters/);
        if (match) {
          return parseInt(match[1]) >= test.expectMinChars;
        }
      }
    }

    return response?.result && !response?.error;
  }

  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST REPORT\n');

    const toolStats = {};
    
    for (const result of this.results) {
      if (!toolStats[result.tool]) {
        toolStats[result.tool] = { pass: 0, fail: 0, total: 0 };
      }
      toolStats[result.tool].total++;
      if (result.success) {
        toolStats[result.tool].pass++;
      } else {
        toolStats[result.tool].fail++;
      }
    }

    // Summary
    console.log('Summary by Tool:');
    for (const [tool, stats] of Object.entries(toolStats)) {
      const passRate = ((stats.pass / stats.total) * 100).toFixed(0);
      console.log(`  ${tool}: ${stats.pass}/${stats.total} passed (${passRate}%)`);
    }

    // Key Findings
    console.log('\n🔍 Key Findings:\n');
    
    const validationTests = this.results.filter(r => 
      r.test.includes('should fail') || r.test.includes('validation')
    );
    
    const validationWorking = validationTests.every(t => t.success);
    
    if (validationWorking) {
      console.log('✅ Validation enforcement IS working');
      console.log('   - Tools correctly reject incomplete captures');
      console.log('   - Minimum character requirements enforced');
    } else {
      console.log('❌ Validation enforcement NOT working properly');
    }

    const fullCaptureTests = this.results.filter(r => 
      r.test.includes('Full conversation') || r.test.includes('Complete capture')
    );

    const captureWorking = fullCaptureTests.some(t => t.success);

    if (captureWorking) {
      console.log('\n✅ Full capture CAN work when proper content provided');
    } else {
      console.log('\n⚠️ Full capture may have issues');
    }

    // Save report
    const report = {
      timestamp: new Date().toISOString(),
      server: 'prompted-server.js',
      results: this.results,
      statistics: toolStats,
      findings: {
        validationWorking,
        captureWorking,
        totalTests: this.results.length,
        passedTests: this.results.filter(r => r.success).length
      }
    };

    writeFileSync('test-report.json', JSON.stringify(report, null, 2));
    console.log('\n📁 Full report saved to test-report.json');
  }

  cleanup() {
    if (this.serverProcess) {
      console.log('\n🧹 Cleaning up...');
      this.serverProcess.kill();
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run tests
const runner = new MCPTestRunner();
runner.runTests().catch(console.error);