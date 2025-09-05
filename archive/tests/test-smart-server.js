#!/usr/bin/env node
/**
 * Comprehensive Test Suite for Smart Purmemo MCP Server
 * Tests all features including auto-extraction and edge cases
 */

import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';
import { writeFileSync } from 'fs';

const TEST_API_KEY = '***REMOVED***';

// Color helpers
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  gray: (text) => `\x1b[90m${text}\x1b[0m`
};

// Test report structure
const testReport = {
  server: 'smart-server.js',
  timestamp: new Date().toISOString(),
  tests: [],
  summary: {
    total: 0,
    passed: 0,
    failed: 0
  }
};

// Comprehensive test cases
const testCases = [
  // BASIC FUNCTIONALITY
  {
    name: 'List Tools',
    request: {
      jsonrpc: '2.0',
      method: 'tools/list',
      id: 1
    },
    validate: (response) => {
      return response.result?.tools?.length === 3 &&
             response.result.tools.some(t => t.name === 'memory') &&
             response.result.tools.some(t => t.name === 'recall') &&
             response.result.tools.some(t => t.name === 'update_context');
    }
  },
  
  // SIMPLE MEMORY TESTS
  {
    name: 'Simple Memory Save',
    request: {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'memory',
        arguments: {
          content: 'Test memory from automated test',
          title: 'Test Memory',
          tags: ['test']
        }
      },
      id: 2
    },
    validate: (response) => {
      const text = response.result?.content?.[0]?.text || '';
      return text.includes('✅') && text.includes('saved');
    }
  },
  
  // AUTO-EXTRACTION TESTS
  {
    name: 'Auto-Extract Code Blocks',
    request: {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'memory',
        arguments: {
          content: `Save this conversation about testing:
          
Here's a test function:
\`\`\`javascript
function testMCP() {
  console.log('Testing MCP');
  return true;
}
\`\`\`

And another snippet:
\`\`\`python
def test_mcp():
    print("Testing MCP")
    return True
\`\`\``
        }
      },
      id: 3
    },
    validate: (response) => {
      const text = response.result?.content?.[0]?.text || '';
      return text.includes('saved') && text.includes('code');
    }
  },
  
  {
    name: 'Auto-Extract File Paths',
    request: {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'memory',
        arguments: {
          content: `We modified these files:
- /src/server.js
- /src/enhanced-server.js
- ~/projects/purmemo/package.json
- ./test-file.md

The main config is in /etc/config.yml`
        }
      },
      id: 4
    },
    validate: (response) => {
      const text = response.result?.content?.[0]?.text || '';
      return text.includes('saved');
    }
  },
  
  {
    name: 'Auto-Extract URLs',
    request: {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'memory',
        arguments: {
          content: `Check these resources:
- Documentation: https://docs.purmemo.ai/api
- GitHub repo: https://github.com/purmemo/mcp
- API endpoint: https://api.purmemo.ai/v5/memories`
        }
      },
      id: 5
    },
    validate: (response) => {
      const text = response.result?.content?.[0]?.text || '';
      return text.includes('saved');
    }
  },
  
  {
    name: 'Full Conversation Capture',
    request: {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'memory',
        arguments: {
          content: `Save this conversation:

User: How do I test the MCP server?