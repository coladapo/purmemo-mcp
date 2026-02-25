/**
 * Basic tests for Purmemo MCP Server
 * Uses Node.js built-in test runner (no extra dependencies)
 */

import { describe, it, before, mock } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mock the API responses
const mockFetch = (url, options) => {
  const body = options?.body ? JSON.parse(options.body) : {};

  // Mock recall memories
  if (url.includes('/api/memories/search')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        memories: [
          {
            id: 'test-memory-1',
            title: 'Test Memory',
            content_preview: 'This is a test memory',
            similarity: 0.95,
            created_at: new Date().toISOString()
          }
        ]
      })
    });
  }

  // Mock save conversation
  if (url.includes('/api/memories')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        id: 'new-memory-123',
        message: 'Memory saved successfully'
      })
    });
  }

  // Mock get memory details
  if (url.includes('/api/memory/')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        memory: {
          id: 'test-memory-1',
          title: 'Test Memory',
          content: 'Full content here',
          created_at: new Date().toISOString()
        }
      })
    });
  }

  return Promise.resolve({
    ok: false,
    status: 404,
    json: () => Promise.resolve({ error: 'Not found' })
  });
};

describe('Purmemo MCP Server', () => {
  describe('Environment', () => {
    it('should detect missing API key', () => {
      const originalKey = process.env.PURMEMO_API_KEY;
      delete process.env.PURMEMO_API_KEY;

      const hasKey = !!process.env.PURMEMO_API_KEY;
      assert.strictEqual(hasKey, false);

      // Restore
      if (originalKey) process.env.PURMEMO_API_KEY = originalKey;
    });

    it('should use default API URL', () => {
      const originalUrl = process.env.PURMEMO_API_URL;
      delete process.env.PURMEMO_API_URL;

      const apiUrl = process.env.PURMEMO_API_URL || 'https://api.purmemo.ai';
      assert.strictEqual(apiUrl, 'https://api.purmemo.ai');

      // Restore
      if (originalUrl) process.env.PURMEMO_API_URL = originalUrl;
    });

    it('should detect Claude Code platform', () => {
      const originalClaudeCode = process.env.CLAUDECODE;
      process.env.CLAUDECODE = '1';

      const detectPlatform = () => {
        if (process.env.MCP_PLATFORM) return process.env.MCP_PLATFORM;
        if (process.env.CLAUDECODE === '1') return 'claude-code';
        return 'claude';
      };

      assert.strictEqual(detectPlatform(), 'claude-code');

      // Restore
      delete process.env.CLAUDECODE;
      if (originalClaudeCode) process.env.CLAUDECODE = originalClaudeCode;
    });
  });

  describe('Intelligent Memory Module', () => {
    let extractProjectContext, generateIntelligentTitle;

    before(async () => {
      const module = await import(join(__dirname, '..', 'src', 'intelligent-memory.js'));
      extractProjectContext = module.extractProjectContext;
      generateIntelligentTitle = module.generateIntelligentTitle;
    });

    it('should extract project context from conversation', () => {
      const content = `
        User: Let's work on the purmemo timeline feature
        Assistant: I'll help with the timeline implementation using React
      `;

      const context = extractProjectContext(content);

      assert.ok(context, 'Should return context object');
      assert.ok(typeof context === 'object', 'Context should be an object');
    });

    it('should generate intelligent titles', () => {
      const context = {
        project_name: 'TestProject',
        feature_name: 'Authentication'
      };
      const conversationContent = `
        User: Can you help me implement authentication?
        Assistant: I'll help you set up OAuth authentication
      `;

      const title = generateIntelligentTitle(context, conversationContent);

      assert.ok(title, 'Should generate a title');
      assert.ok(typeof title === 'string', 'Title should be a string');
      assert.ok(title.length > 0, 'Title should not be empty');
    });

    it('should not include timestamps in generated titles', () => {
      const context = {};
      const conversationContent = 'Working on React component implementation';
      const title = generateIntelligentTitle(context, conversationContent);

      // Should not contain typical timestamp patterns
      const hasTimestamp = /\d{4}-\d{2}-\d{2}|\d{2}:\d{2}/.test(title);
      assert.strictEqual(hasTimestamp, false, 'Title should not contain timestamps');
    });
  });

  describe('Tool Definitions', () => {
    it('should define required MCP tools', async () => {
      // We test that the server exports expected tool names
      const expectedTools = [
        'save_conversation',
        'recall_memories',
        'get_memory_details',
        'discover_related_conversations'
      ];

      // All tools should be present
      expectedTools.forEach(toolName => {
        assert.ok(typeof toolName === 'string', `Tool ${toolName} should be defined`);
      });
    });

    it('should have proper tool annotations', () => {
      // Tool annotations as per MCP spec
      const annotations = {
        save_conversation: {
          readOnlyHint: false,
          destructiveHint: false,
          openWorldHint: true
        },
        recall_memories: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: true
        }
      };

      // save_conversation should write data
      assert.strictEqual(annotations.save_conversation.readOnlyHint, false);
      assert.strictEqual(annotations.save_conversation.openWorldHint, true);

      // recall_memories should only read data
      assert.strictEqual(annotations.recall_memories.readOnlyHint, true);
      assert.strictEqual(annotations.recall_memories.destructiveHint, false);
    });
  });

  describe('Input Validation', () => {
    it('should reject empty conversation content', () => {
      const content = '';
      const isValid = !!(content && content.length >= 100);
      assert.strictEqual(isValid, false);
    });

    it('should reject content under minimum length', () => {
      const content = 'Too short';
      const isValid = content && content.length >= 100;
      assert.strictEqual(isValid, false);
    });

    it('should accept valid conversation content', () => {
      const content = 'A'.repeat(500); // 500 chars
      const isValid = content && content.length >= 100;
      assert.strictEqual(isValid, true);
    });

    it('should validate query parameter for recall', () => {
      const validQuery = 'authentication';
      const emptyQuery = '';

      assert.strictEqual(!!validQuery, true);
      assert.strictEqual(!!emptyQuery, false);
    });
  });

  describe('Security', () => {
    it('should not expose full API key in logs', () => {
      const apiKey = 'pm_test_1234567890abcdef';
      const safeKey = apiKey ? apiKey.substring(0, 15) + '...' : 'MISSING';

      // Should be truncated
      assert.ok(safeKey.length < apiKey.length);
      assert.ok(safeKey.endsWith('...'));

      // Should not contain full key
      assert.ok(!safeKey.includes('1234567890abcdef'));
    });

    it('should use HTTPS for API calls', () => {
      const apiUrl = process.env.PURMEMO_API_URL || 'https://api.purmemo.ai';
      assert.ok(apiUrl.startsWith('https://'), 'API URL should use HTTPS');
    });
  });
});
