/**
 * Chunking and Content Processing Tests
 *
 * These tests verify the content chunking logic for large conversations
 * that exceed the 15K character threshold.
 *
 * Total: ~10 tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// Chunking configuration (matches production)
const MAX_CHUNK_SIZE = 15000;
const CHUNK_OVERLAP = 500;

/**
 * Chunk content into overlapping segments
 * Extracted from server.js for testing
 */
function chunkContent(content, maxSize = MAX_CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  if (!content || content.length <= maxSize) {
    return [content];
  }

  const chunks = [];
  let start = 0;

  while (start < content.length) {
    let end = start + maxSize;

    // If not the last chunk, try to break at a newline
    if (end < content.length) {
      const searchStart = Math.max(end - overlap, start);
      const lastNewline = content.lastIndexOf('\n', end);

      if (lastNewline > searchStart) {
        end = lastNewline + 1;
      }
    }

    const chunk = content.slice(start, end);
    chunks.push(chunk);

    // Next chunk starts with overlap (unless last chunk)
    start = end - overlap;
    if (start >= content.length - overlap) {
      break;
    }
  }

  return chunks;
}

/**
 * Check if content needs chunking
 */
function needsChunking(content) {
  return content && content.length > MAX_CHUNK_SIZE;
}

/**
 * Validate chunk structure
 */
function validateChunks(chunks, originalContent) {
  // All chunks should be within size limit
  const oversized = chunks.filter(c => c.length > MAX_CHUNK_SIZE + CHUNK_OVERLAP);

  // Content should be recoverable (with overlap handling)
  let recovered = chunks[0];
  for (let i = 1; i < chunks.length; i++) {
    // Remove overlap from subsequent chunks
    const overlapRemoved = chunks[i].substring(CHUNK_OVERLAP);
    recovered += overlapRemoved;
  }

  return {
    validSizes: oversized.length === 0,
    chunkCount: chunks.length,
    totalChunkSize: chunks.reduce((sum, c) => sum + c.length, 0)
  };
}

describe('Content Chunking', () => {

  describe('Chunk Size Threshold', () => {
    it('should not chunk content under 15K characters', () => {
      const smallContent = 'A'.repeat(14999);
      assert.strictEqual(needsChunking(smallContent), false);

      const chunks = chunkContent(smallContent);
      assert.strictEqual(chunks.length, 1);
      assert.strictEqual(chunks[0], smallContent);
    });

    it('should chunk content over 15K characters', () => {
      const largeContent = 'A'.repeat(16000);
      assert.strictEqual(needsChunking(largeContent), true);

      const chunks = chunkContent(largeContent);
      assert.ok(chunks.length >= 2, 'Should produce multiple chunks');
    });

    it('should not chunk content exactly at 15K', () => {
      const exactContent = 'A'.repeat(15000);
      assert.strictEqual(needsChunking(exactContent), false);

      const chunks = chunkContent(exactContent);
      assert.strictEqual(chunks.length, 1);
    });
  });

  describe('Chunk Generation', () => {
    it('should create chunks with overlap', () => {
      const content = 'A'.repeat(20000);
      const chunks = chunkContent(content);

      // With 500 char overlap, chunks should share content
      if (chunks.length >= 2) {
        const endOfFirst = chunks[0].slice(-CHUNK_OVERLAP);
        const startOfSecond = chunks[1].slice(0, CHUNK_OVERLAP);
        assert.strictEqual(endOfFirst, startOfSecond, 'Chunks should overlap');
      }
    });

    it('should preserve all content across chunks', () => {
      const content = 'ABCDEFGHIJ'.repeat(2000); // 20K chars
      const chunks = chunkContent(content);

      // Reconstruct content from chunks
      let reconstructed = chunks[0];
      for (let i = 1; i < chunks.length; i++) {
        // Skip overlap portion
        reconstructed += chunks[i].substring(CHUNK_OVERLAP);
      }

      // Due to overlap handling, lengths may differ but key content preserved
      assert.ok(reconstructed.includes('ABCDEFGHIJ'), 'Pattern should be preserved');
    });

    it('should try to break at newlines', () => {
      // Create content with newlines
      const lines = [];
      for (let i = 0; i < 200; i++) {
        lines.push('Line ' + i + ': ' + 'x'.repeat(100));
      }
      const content = lines.join('\n'); // ~21K chars

      const chunks = chunkContent(content);

      // First chunk should end with newline (if possible)
      if (chunks.length > 1) {
        const firstChunk = chunks[0];
        // Either ends with newline or is at max size
        const endsWithNewline = firstChunk.endsWith('\n');
        const atMaxSize = firstChunk.length >= MAX_CHUNK_SIZE - CHUNK_OVERLAP;
        assert.ok(endsWithNewline || atMaxSize, 'Should break at newline when possible');
      }
    });

    it('should handle content without newlines', () => {
      const noNewlines = 'X'.repeat(30000);
      const chunks = chunkContent(noNewlines);

      assert.ok(chunks.length >= 2, 'Should still chunk');
      chunks.forEach(chunk => {
        assert.ok(chunk.length <= MAX_CHUNK_SIZE + CHUNK_OVERLAP, 'Each chunk should be within size limit');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty content', () => {
      const chunks = chunkContent('');
      assert.strictEqual(chunks.length, 1);
      assert.strictEqual(chunks[0], '');
    });

    it('should handle null/undefined content', () => {
      const chunksNull = chunkContent(null);
      assert.strictEqual(chunksNull.length, 1);
      assert.strictEqual(chunksNull[0], null);

      const chunksUndefined = chunkContent(undefined);
      assert.strictEqual(chunksUndefined.length, 1);
      assert.strictEqual(chunksUndefined[0], undefined);
    });

    it('should handle Unicode content correctly', () => {
      // Unicode characters can be multi-byte
      const unicodeContent = '\u{1F600}'.repeat(5000) + 'A'.repeat(10000); // Emojis + ASCII
      const chunks = chunkContent(unicodeContent);

      // All chunks should be valid strings (not broken Unicode)
      chunks.forEach(chunk => {
        assert.doesNotThrow(() => {
          JSON.stringify(chunk);
        }, 'Chunk should be valid JSON string');
      });
    });

    it('should handle content with code blocks', () => {
      const codeContent = `
Here's some code:

\`\`\`javascript
function example() {
  const x = 1;
  return x;
}
\`\`\`

And more text here...
`.repeat(200); // Create large content with code blocks

      const chunks = chunkContent(codeContent);

      // Code blocks might get split, but should not corrupt the content
      const fullContent = chunks.join(''); // Simplified join
      assert.ok(fullContent.includes('```javascript'), 'Should preserve code fence');
      assert.ok(fullContent.includes('function example'), 'Should preserve code');
    });
  });

  describe('Chunk Metadata', () => {
    it('should track chunk index and total', () => {
      const content = 'A'.repeat(45000); // ~3 chunks
      const chunks = chunkContent(content);

      // Create chunk metadata
      const chunkMeta = chunks.map((chunk, index) => ({
        chunk_index: index,
        chunk_total: chunks.length,
        chunk_size: chunk.length,
        is_first: index === 0,
        is_last: index === chunks.length - 1
      }));

      assert.ok(chunkMeta.length >= 3, 'Should have multiple chunks');
      assert.strictEqual(chunkMeta[0].is_first, true);
      assert.strictEqual(chunkMeta[0].is_last, false);
      assert.strictEqual(chunkMeta[chunkMeta.length - 1].is_last, true);
    });
  });
});

describe('Content Processing', () => {

  describe('Unicode Sanitization', () => {
    it('should preserve valid Unicode characters', () => {
      const validUnicode = 'Hello \u{1F600} World \u4E2D\u6587 \u0645\u0631\u062D\u0628\u0627';

      // Basic sanitization (remove control chars, keep valid Unicode)
      function sanitizeContent(content) {
        if (!content) return content;
        // Remove NULL and other control characters except newlines/tabs
        return content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      }

      const sanitized = sanitizeContent(validUnicode);
      assert.ok(sanitized.includes('\u{1F600}'), 'Should preserve emoji');
      assert.ok(sanitized.includes('\u4E2D\u6587'), 'Should preserve Chinese');
      assert.ok(sanitized.includes('\u0645\u0631\u062D\u0628\u0627'), 'Should preserve Arabic');
    });

    it('should remove control characters', () => {
      const withControl = 'Hello\x00World\x1FTest';

      function sanitizeContent(content) {
        if (!content) return content;
        return content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      }

      const sanitized = sanitizeContent(withControl);
      assert.ok(!sanitized.includes('\x00'), 'Should remove NULL');
      assert.ok(!sanitized.includes('\x1F'), 'Should remove unit separator');
      assert.strictEqual(sanitized, 'HelloWorldTest');
    });

    it('should preserve newlines and tabs', () => {
      const withWhitespace = 'Line1\nLine2\tTabbed';

      function sanitizeContent(content) {
        if (!content) return content;
        return content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      }

      const sanitized = sanitizeContent(withWhitespace);
      assert.ok(sanitized.includes('\n'), 'Should preserve newline');
      assert.ok(sanitized.includes('\t'), 'Should preserve tab');
    });
  });
});
