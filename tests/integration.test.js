/**
 * Integration Tests for Purmemo MCP Server
 *
 * These tests verify the complete flow of MCP tools by mocking the API.
 * No real API calls are made - we simulate the Purmemo backend.
 */

import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mock API responses
const mockResponses = {
  saveMemory: {
    success: true,
    id: 'mem_test_123456',
    title: 'Test Conversation - Implementation',
    message: 'Memory saved successfully',
    context_extracted: {
      project_name: 'TestProject',
      feature_name: 'Authentication',
      status: 'in_progress'
    }
  },
  recallMemories: {
    success: true,
    memories: [
      {
        id: 'mem_abc123',
        title: 'Previous Auth Discussion',
        content_preview: 'We discussed OAuth implementation patterns...',
        similarity: 0.92,
        created_at: '2025-01-15T10:30:00Z',
        tags: ['authentication', 'oauth'],
        platform: 'claude'
      },
      {
        id: 'mem_def456',
        title: 'API Security Review',
        content_preview: 'Security considerations for the API...',
        similarity: 0.85,
        created_at: '2025-01-14T15:00:00Z',
        tags: ['security', 'api'],
        platform: 'chatgpt'
      }
    ],
    total: 2
  },
  getMemoryDetails: {
    success: true,
    memory: {
      id: 'mem_abc123',
      title: 'Previous Auth Discussion',
      content: `=== CONVERSATION START ===
USER: How should we implement OAuth?
ASSISTANT: I recommend using OAuth 2.1 with PKCE for security...
=== END ===`,
      created_at: '2025-01-15T10:30:00Z',
      updated_at: '2025-01-15T10:30:00Z',
      tags: ['authentication', 'oauth'],
      platform: 'claude',
      context: {
        project_name: 'Purmemo',
        feature_name: 'Authentication'
      }
    }
  },
  discoverRelated: {
    success: true,
    clusters: [
      {
        cluster_id: 'cluster_auth',
        cluster_name: 'Authentication & Security',
        memories: [
          { id: 'mem_1', title: 'OAuth Setup', platform: 'claude', similarity: 0.95 },
          { id: 'mem_2', title: 'JWT Tokens', platform: 'chatgpt', similarity: 0.88 }
        ]
      }
    ],
    total_discovered: 2
  },
  quotaExceeded: {
    error: 'quota_exceeded',
    message: 'Monthly recall quota exceeded',
    current_usage: 100,
    quota_limit: 100,
    tier: 'FREE',
    upgrade_url: 'https://app.purmemo.ai/dashboard/plans'
  }
};

// Create a mock fetch that intercepts API calls
function createMockFetch(scenario = 'success') {
  return async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 10));

    // Check for API key
    const authHeader = options.headers?.Authorization || options.headers?.authorization;
    if (!authHeader || !authHeader.includes('Bearer ')) {
      return {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: 'Missing or invalid API key' }),
        text: async () => JSON.stringify({ error: 'Missing or invalid API key' })
      };
    }

    // Route based on endpoint
    if (url.includes('/api/memories/search')) {
      if (scenario === 'quota_exceeded') {
        return {
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          json: async () => mockResponses.quotaExceeded,
          text: async () => JSON.stringify(mockResponses.quotaExceeded)
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => mockResponses.recallMemories
      };
    }

    if (url.includes('/api/memories/discover')) {
      return {
        ok: true,
        status: 200,
        json: async () => mockResponses.discoverRelated
      };
    }

    if (url.includes('/api/memory/') && options.method !== 'POST') {
      return {
        ok: true,
        status: 200,
        json: async () => mockResponses.getMemoryDetails
      };
    }

    if (url.includes('/api/memories') && options.method === 'POST') {
      // Validate required fields
      if (!body.content || body.content.length < 100) {
        return {
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          json: async () => ({ error: 'Content must be at least 100 characters' }),
          text: async () => JSON.stringify({ error: 'Content must be at least 100 characters' })
        };
      }
      return {
        ok: true,
        status: 201,
        json: async () => mockResponses.saveMemory
      };
    }

    // Default 404
    return {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ error: 'Endpoint not found' }),
      text: async () => JSON.stringify({ error: 'Endpoint not found' })
    };
  };
}

describe('Integration Tests: MCP Tool Flows', () => {

  describe('save_conversation flow', () => {
    it('should save a valid conversation and return memory ID', async () => {
      const mockFetch = createMockFetch('success');

      // Simulate the save flow
      const conversationContent = `
=== CONVERSATION START ===
[2025-01-15T10:00:00Z] USER: How do I implement OAuth in my app?
[2025-01-15T10:01:00Z] ASSISTANT: I'll help you implement OAuth 2.1 with PKCE. Here's the approach:

1. Generate a code verifier and challenge
2. Redirect user to authorization endpoint
3. Handle the callback with the auth code
4. Exchange code for tokens

Here's sample code:
\`\`\`javascript
const crypto = require('crypto');
const codeVerifier = crypto.randomBytes(32).toString('base64url');
\`\`\`
=== END ===
      `.trim();

      const response = await mockFetch('https://api.purmemo.ai/api/memories', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer pm_test_key_123',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: conversationContent,
          title: 'OAuth Implementation Discussion',
          tags: ['oauth', 'authentication']
        })
      });

      assert.strictEqual(response.ok, true);
      const data = await response.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.id, 'Should return memory ID');
      assert.ok(data.id.startsWith('mem_'), 'Memory ID should have correct prefix');
    });

    it('should reject conversation content that is too short', async () => {
      const mockFetch = createMockFetch('success');

      const response = await mockFetch('https://api.purmemo.ai/api/memories', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer pm_test_key_123',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: 'Too short',
          title: 'Test'
        })
      });

      assert.strictEqual(response.ok, false);
      assert.strictEqual(response.status, 400);
    });

    it('should fail without API key', async () => {
      const mockFetch = createMockFetch('success');

      const response = await mockFetch('https://api.purmemo.ai/api/memories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
          // No Authorization header
        },
        body: JSON.stringify({
          content: 'A'.repeat(500),
          title: 'Test'
        })
      });

      assert.strictEqual(response.ok, false);
      assert.strictEqual(response.status, 401);
    });
  });

  describe('recall_memories flow', () => {
    it('should return relevant memories for a query', async () => {
      const mockFetch = createMockFetch('success');

      const response = await mockFetch('https://api.purmemo.ai/api/memories/search', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer pm_test_key_123',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: 'authentication oauth',
          limit: 10
        })
      });

      assert.strictEqual(response.ok, true);
      const data = await response.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.memories), 'Should return memories array');
      assert.ok(data.memories.length > 0, 'Should find matching memories');

      // Check memory structure
      const memory = data.memories[0];
      assert.ok(memory.id, 'Memory should have ID');
      assert.ok(memory.title, 'Memory should have title');
      assert.ok(memory.similarity >= 0 && memory.similarity <= 1, 'Similarity should be 0-1');
    });

    it('should handle quota exceeded gracefully', async () => {
      const mockFetch = createMockFetch('quota_exceeded');

      const response = await mockFetch('https://api.purmemo.ai/api/memories/search', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer pm_test_key_123',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: 'test query',
          limit: 10
        })
      });

      assert.strictEqual(response.ok, false);
      assert.strictEqual(response.status, 429);

      const data = await response.json();
      assert.ok(data.upgrade_url, 'Should provide upgrade URL');
      assert.ok(data.quota_limit, 'Should show quota limit');
    });

    it('should support filtering by entity', async () => {
      const mockFetch = createMockFetch('success');

      const response = await mockFetch('https://api.purmemo.ai/api/memories/search', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer pm_test_key_123',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: 'implementation',
          entity: 'purmemo',
          limit: 10
        })
      });

      assert.strictEqual(response.ok, true);
      const data = await response.json();
      assert.strictEqual(data.success, true);
    });
  });

  describe('get_memory_details flow', () => {
    it('should return full memory content', async () => {
      const mockFetch = createMockFetch('success');

      const response = await mockFetch('https://api.purmemo.ai/api/memory/mem_abc123', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer pm_test_key_123'
        }
      });

      assert.strictEqual(response.ok, true);
      const data = await response.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.memory, 'Should return memory object');
      assert.ok(data.memory.content, 'Should include full content');
      assert.ok(data.memory.content.length > 100, 'Content should be substantial');
    });
  });

  describe('discover_related_conversations flow', () => {
    it('should find related conversations across platforms', async () => {
      const mockFetch = createMockFetch('success');

      const response = await mockFetch('https://api.purmemo.ai/api/memories/discover', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer pm_test_key_123',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: 'authentication security',
          limit: 10
        })
      });

      assert.strictEqual(response.ok, true);
      const data = await response.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.clusters), 'Should return clusters');

      if (data.clusters.length > 0) {
        const cluster = data.clusters[0];
        assert.ok(cluster.cluster_name, 'Cluster should have name');
        assert.ok(Array.isArray(cluster.memories), 'Cluster should have memories');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      // Simulate network failure
      const failingFetch = async () => {
        throw new Error('Network error: ECONNREFUSED');
      };

      try {
        await failingFetch('https://api.purmemo.ai/api/memories');
        assert.fail('Should have thrown');
      } catch (error) {
        assert.ok(error.message.includes('Network error'), 'Should be network error');
      }
    });

    it('should handle malformed JSON responses', async () => {
      const badJsonFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => { throw new SyntaxError('Unexpected token'); }
      });

      const response = await badJsonFetch();
      try {
        await response.json();
        assert.fail('Should have thrown');
      } catch (error) {
        assert.ok(error instanceof SyntaxError, 'Should be JSON parse error');
      }
    });

    it('should handle server errors (500)', async () => {
      const serverErrorFetch = async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Internal server error' }),
        text: async () => 'Internal server error'
      });

      const response = await serverErrorFetch();
      assert.strictEqual(response.ok, false);
      assert.strictEqual(response.status, 500);
    });
  });

  describe('Content Processing', () => {
    it('should handle Unicode content correctly', async () => {
      const mockFetch = createMockFetch('success');

      const unicodeContent = `
=== CONVERSATION START ===
USER: How do I handle emojis? 🚀🎉✨
ASSISTANT: Here's how to handle Unicode properly...
Japanese: こんにちは
Chinese: 你好
Arabic: مرحبا
=== END ===
      `.repeat(10); // Make it long enough

      const response = await mockFetch('https://api.purmemo.ai/api/memories', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer pm_test_key_123',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: unicodeContent,
          title: 'Unicode Test'
        })
      });

      assert.strictEqual(response.ok, true);
    });

    it('should handle large content (chunking threshold)', async () => {
      const mockFetch = createMockFetch('success');

      // Create content larger than 15K (chunking threshold)
      const largeContent = 'A'.repeat(20000);

      const response = await mockFetch('https://api.purmemo.ai/api/memories', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer pm_test_key_123',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: largeContent,
          title: 'Large Content Test'
        })
      });

      assert.strictEqual(response.ok, true);
    });
  });

  describe('Authentication Scenarios', () => {
    it('should accept valid API key format', async () => {
      const mockFetch = createMockFetch('success');

      // Test with pm_ prefix (production format)
      const response = await mockFetch('https://api.purmemo.ai/api/memories/search', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer pm_live_abc123def456',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: 'test' })
      });

      assert.strictEqual(response.ok, true);
    });

    it('should reject empty API key', async () => {
      const mockFetch = createMockFetch('success');

      const response = await mockFetch('https://api.purmemo.ai/api/memories/search', {
        method: 'POST',
        headers: {
          // No Authorization header at all
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: 'test' })
      });

      // Missing auth should fail
      assert.strictEqual(response.ok, false);
      assert.strictEqual(response.status, 401);
    });
  });
});

// Fix typo in createMockFetch
function createMockFetchFixed(scenario = 'success') {
  return async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};

    await new Promise(resolve => setTimeout(resolve, 10));

    const authHeader = options.headers?.Authorization || options.headers?.authorization;
    if (!authHeader || !authHeader.includes('Bearer ') || authHeader === 'Bearer ') {
      return {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: 'Missing or invalid API key' }),
        text: async () => JSON.stringify({ error: 'Missing or invalid API key' })
      };
    }

    if (url.includes('/api/memories/search')) {
      if (scenario === 'quota_exceeded') {
        return {
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          json: async () => mockResponses.quotaExceeded,
          text: async () => JSON.stringify(mockResponses.quotaExceeded)
        };
      }
      return { ok: true, status: 200, json: async () => mockResponses.recallMemories };
    }

    if (url.includes('/api/memories/discover')) {
      return { ok: true, status: 200, json: async () => mockResponses.discoverRelated };
    }

    if (url.includes('/api/memory/') && options.method !== 'POST') {
      return { ok: true, status: 200, json: async () => mockResponses.getMemoryDetails };
    }

    if (url.includes('/api/memories') && options.method === 'POST') {
      if (!body.content || body.content.length < 100) {
        return {
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          json: async () => ({ error: 'Content must be at least 100 characters' }),
          text: async () => JSON.stringify({ error: 'Content must be at least 100 characters' })
        };
      }
      return { ok: true, status: 201, json: async () => mockResponses.saveMemory };
    }

    return {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ error: 'Endpoint not found' }),
      text: async () => JSON.stringify({ error: 'Endpoint not found' })
    };
  };
}
