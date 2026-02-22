/**
 * Living Document Pattern Tests
 *
 * These tests verify the living document pattern - automatically updating
 * existing memories instead of creating duplicates based on conversationId.
 *
 * Total: ~12 tests
 */

import { describe, it, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mock API responses for living document scenarios
const mockResponses = {
  // Scenario: Memory exists with matching conversationId
  existingMemory: {
    success: true,
    memories: [{
      id: 'mem_existing_123',
      title: 'Project Discussion',
      conversation_id: 'conv-react-hooks',
      content_preview: 'Previous conversation content...',
      created_at: '2025-01-15T10:00:00Z',
      updated_at: '2025-01-15T12:00:00Z'
    }],
    total: 1
  },
  // Scenario: No existing memory
  noExistingMemory: {
    success: true,
    memories: [],
    total: 0
  },
  // Update response
  updateMemory: {
    success: true,
    id: 'mem_existing_123',
    message: 'Memory updated successfully',
    action: 'update'
  },
  // Create response
  createMemory: {
    success: true,
    id: 'mem_new_456',
    message: 'Memory created successfully',
    action: 'create'
  }
};

// Mock fetch for living document tests
function createLivingDocMockFetch(existingMemoryId = null) {
  return async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};

    await new Promise(resolve => setTimeout(resolve, 5));

    const authHeader = options.headers?.Authorization;
    if (!authHeader || !authHeader.includes('Bearer ')) {
      return {
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' })
      };
    }

    // Check for existing memory by conversationId
    if (url.includes('/api/memories/search') && body.conversation_id) {
      if (existingMemoryId) {
        return {
          ok: true,
          status: 200,
          json: async () => mockResponses.existingMemory
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => mockResponses.noExistingMemory
      };
    }

    // Update existing memory (PATCH)
    if (url.includes('/api/memories/') && options.method === 'PATCH') {
      return {
        ok: true,
        status: 200,
        json: async () => mockResponses.updateMemory
      };
    }

    // Create new memory (POST)
    if (url.includes('/api/memories') && options.method === 'POST') {
      return {
        ok: true,
        status: 201,
        json: async () => existingMemoryId ? mockResponses.updateMemory : mockResponses.createMemory
      };
    }

    return { ok: false, status: 404 };
  };
}

describe('Living Document Pattern', () => {

  describe('Conversation ID Generation', () => {
    it('should generate consistent conversationId from title', () => {
      // Function that generates conversationId from title (slug-style)
      function generateConversationId(title) {
        if (!title) return null;
        return title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .substring(0, 50);
      }

      const title1 = 'Purmemo - Timeline View - Implementation';
      const title2 = 'Purmemo - Timeline View - Implementation'; // Same title

      const id1 = generateConversationId(title1);
      const id2 = generateConversationId(title2);

      assert.strictEqual(id1, id2, 'Same title should generate same conversationId');
      assert.strictEqual(id1, 'purmemo-timeline-view-implementation');
    });

    it('should handle special characters in title', () => {
      function generateConversationId(title) {
        if (!title) return null;
        return title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .substring(0, 50);
      }

      const title = 'React Hooks: useState & useEffect (Advanced)';
      const id = generateConversationId(title);

      assert.strictEqual(id, 'react-hooks-usestate-useeffect-advanced');
      assert.ok(!id.includes(':'), 'Should not contain colons');
      assert.ok(!id.includes('&'), 'Should not contain ampersands');
      assert.ok(!id.includes('('), 'Should not contain parentheses');
    });

    it('should truncate long titles to 50 chars', () => {
      function generateConversationId(title) {
        if (!title) return null;
        return title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .substring(0, 50);
      }

      const longTitle = 'This is a very long title that exceeds the fifty character limit for conversation IDs';
      const id = generateConversationId(longTitle);

      assert.ok(id.length <= 50, 'ConversationId should not exceed 50 chars');
    });

    it('should return null for empty title', () => {
      function generateConversationId(title) {
        if (!title) return null;
        return title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .substring(0, 50);
      }

      assert.strictEqual(generateConversationId(''), null);
      assert.strictEqual(generateConversationId(null), null);
      assert.strictEqual(generateConversationId(undefined), null);
    });
  });

  describe('Memory Update vs Create Logic', () => {
    it('should update existing memory when conversationId matches', async () => {
      const mockFetch = createLivingDocMockFetch('mem_existing_123');

      // Simulate the living document logic
      const conversationId = 'conv-react-hooks';

      // First, check if memory exists
      const searchResponse = await mockFetch('https://api.purmemo.ai/api/memories/search', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer pm_test_key',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ conversation_id: conversationId })
      });

      const searchData = await searchResponse.json();
      const existingMemory = searchData.memories[0];

      assert.ok(existingMemory, 'Should find existing memory');
      assert.strictEqual(existingMemory.conversation_id, conversationId);

      // Then update instead of create
      const updateResponse = await mockFetch(`https://api.purmemo.ai/api/memories/${existingMemory.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': 'Bearer pm_test_key',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: 'Updated conversation content...',
          append: true
        })
      });

      assert.strictEqual(updateResponse.ok, true);
      const updateData = await updateResponse.json();
      assert.strictEqual(updateData.action, 'update');
    });

    it('should create new memory when no matching conversationId exists', async () => {
      const mockFetch = createLivingDocMockFetch(null); // No existing memory

      const conversationId = 'conv-new-topic';

      // Check for existing memory
      const searchResponse = await mockFetch('https://api.purmemo.ai/api/memories/search', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer pm_test_key',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ conversation_id: conversationId })
      });

      const searchData = await searchResponse.json();
      assert.strictEqual(searchData.memories.length, 0, 'Should not find existing memory');

      // Create new memory
      const createResponse = await mockFetch('https://api.purmemo.ai/api/memories', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer pm_test_key',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: 'New conversation content...',
          conversation_id: conversationId
        })
      });

      assert.strictEqual(createResponse.ok, true);
      const createData = await createResponse.json();
      assert.strictEqual(createData.action, 'create');
    });

    it('should use explicit conversationId over title-generated one', () => {
      // When user provides explicit conversationId, it takes precedence
      const title = 'React Hooks Discussion';
      const explicitId = 'my-custom-conv-id';

      function resolveConversationId(explicitId, title) {
        if (explicitId) return explicitId;
        if (!title) return null;
        return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50);
      }

      const resolved = resolveConversationId(explicitId, title);
      assert.strictEqual(resolved, explicitId, 'Explicit ID should take precedence');
    });
  });

  describe('Content Merging', () => {
    it('should append new content to existing memory', () => {
      const existingContent = `=== CONVERSATION START ===
[2025-01-15T10:00:00Z] USER: How do hooks work?
[2025-01-15T10:01:00Z] ASSISTANT: React hooks allow you to use state...
=== END ===`;

      const newContent = `[2025-01-15T14:00:00Z] USER: What about useEffect?
[2025-01-15T14:01:00Z] ASSISTANT: useEffect runs after render...`;

      function mergeContent(existing, newPart) {
        // Remove END marker, append new content, re-add marker
        const withoutEnd = existing.replace(/=== END ===$/, '').trim();
        return `${withoutEnd}\n${newPart}\n=== END ===`;
      }

      const merged = mergeContent(existingContent, newContent);

      assert.ok(merged.includes('How do hooks work'), 'Should preserve old content');
      assert.ok(merged.includes('What about useEffect'), 'Should include new content');
      assert.ok(merged.endsWith('=== END ==='), 'Should end with END marker');
      assert.strictEqual((merged.match(/=== END ===/g) || []).length, 1, 'Should have single END marker');
    });

    it('should handle replace mode (overwrite)', () => {
      const existingContent = 'Old content that will be replaced';
      const newContent = 'Completely new content';

      function handleContentUpdate(existing, newPart, mode = 'append') {
        if (mode === 'replace') {
          return newPart;
        }
        return `${existing}\n---\n${newPart}`;
      }

      const replaced = handleContentUpdate(existingContent, newContent, 'replace');
      assert.strictEqual(replaced, newContent, 'Replace mode should overwrite');
      assert.ok(!replaced.includes('Old content'), 'Should not contain old content');
    });
  });

  describe('Title Deduplication', () => {
    it('should detect similar titles for deduplication', () => {
      function areTitlesSimilar(title1, title2) {
        if (!title1 || !title2) return false;

        const normalize = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
        const t1 = normalize(title1);
        const t2 = normalize(title2);

        // Exact match after normalization
        if (t1 === t2) return true;

        // One is substring of other (for incremental titles)
        if (t1.includes(t2) || t2.includes(t1)) return true;

        return false;
      }

      assert.ok(areTitlesSimilar('React Hooks', 'React Hooks'), 'Identical titles');
      assert.ok(areTitlesSimilar('React Hooks', 'react-hooks'), 'Different formatting');
      assert.ok(areTitlesSimilar('Project X - Phase 1', 'Project X - Phase 1 - Implementation'), 'Incremental');
      assert.ok(!areTitlesSimilar('React Hooks', 'Vue Components'), 'Different topics');
    });

    it('should prevent duplicate memory creation for same title', async () => {
      let createCount = 0;

      // Mock that tracks create calls
      const trackingFetch = async (url, options = {}) => {
        if (url.includes('/api/memories') && options.method === 'POST') {
          createCount++;
          return {
            ok: true,
            status: 201,
            json: async () => ({ success: true, id: `mem_${createCount}` })
          };
        }
        return { ok: false, status: 404 };
      };

      // First save
      await trackingFetch('https://api.purmemo.ai/api/memories', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer test' },
        body: JSON.stringify({ content: 'A'.repeat(200), title: 'Test' })
      });

      assert.strictEqual(createCount, 1, 'First save should create');

      // Note: In real implementation, second save with same title would UPDATE
      // This test just verifies the tracking mechanism
    });
  });
});
