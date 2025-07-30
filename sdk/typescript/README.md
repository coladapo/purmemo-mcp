# PUO Memo TypeScript/JavaScript SDK

Official TypeScript/JavaScript SDK for the PUO Memo API.

## Installation

```bash
npm install @puomemo/sdk
# or
yarn add @puomemo/sdk
# or
pnpm add @puomemo/sdk
```

## Quick Start

```typescript
import { PuoMemo } from '@puomemo/sdk';

// Initialize client with API key
const client = new PuoMemo({ apiKey: 'puo_sk_...' });

// Create a memory
const memory = await client.createMemory({
  content: 'Important meeting notes from today\'s standup',
  title: 'Daily Standup',
  tags: ['meetings', 'daily', 'team']
});

// Search memories
const results = await client.search({
  query: 'standup meetings'
});

for (const memory of results.results) {
  console.log(`${memory.title}: ${memory.content.substring(0, 100)}...`);
}

// Update a memory
const updated = await client.updateMemory(memory.id!, {
  tags: ['meetings', 'daily', 'team', 'archived']
});

// Delete a memory
await client.deleteMemory(memory.id!);
```

## Authentication

### API Key Authentication

```typescript
const client = new PuoMemo({ apiKey: 'puo_sk_...' });
```

### Email/Password Authentication

```typescript
const client = new PuoMemo();
const user = await client.login('user@example.com', 'password');
```

### Environment Variables

The SDK can read configuration from environment variables:

```bash
export PUO_MEMO_API_KEY="puo_sk_..."
export PUO_MEMO_API_URL="https://api.puomemo.com"
```

Then initialize without parameters:

```typescript
const client = new PuoMemo();
```

## Memory Operations

### Create Memory

```typescript
const memory = await client.createMemory({
  content: 'Memory content',
  title: 'Optional title',
  tags: ['tag1', 'tag2'],
  metadata: { key: 'value' },
  visibility: 'private', // or 'team', 'public'
  generateEmbedding: true // for semantic search
});
```

### List Memories

```typescript
// List recent memories
const { memories, total } = await client.listMemories({
  limit: 20,
  offset: 0
});

// Filter by tags
const filtered = await client.listMemories({
  tags: ['important', 'work']
});

// Filter by visibility
const teamMemories = await client.listMemories({
  visibility: ['team']
});
```

### Search Memories

```typescript
// Hybrid search (default)
const results = await client.search({
  query: 'machine learning'
});

// Keyword-only search
const keywordResults = await client.search({
  query: 'exact phrase',
  searchType: 'keyword'
});

// Semantic search
const semanticResults = await client.search({
  query: 'AI and neural networks',
  searchType: 'semantic'
});

// Advanced search
const advancedResults = await client.search({
  query: 'project updates',
  searchType: 'hybrid',
  tags: ['project', 'updates'],
  dateFrom: new Date('2024-01-01'),
  dateTo: new Date('2024-12-31'),
  similarityThreshold: 0.8,
  keywordWeight: 0.3,
  semanticWeight: 0.7
});
```

## API Key Management

```typescript
// Create API key
const apiKey = await client.createApiKey({
  name: 'Production Key',
  permissions: ['memories.read', 'memories.create'],
  expiresAt: new Date('2025-12-31')
});

// List API keys
const keys = await client.listApiKeys();
for (const key of keys) {
  console.log(`${key.name}: ${key.created_at}`);
}

// Revoke API key
await client.revokeApiKey(keyId);
```

## Error Handling

```typescript
import { 
  PuoMemoError, 
  AuthenticationError, 
  RateLimitError, 
  ValidationError 
} from '@puomemo/sdk';

try {
  const memory = await client.createMemory({ content: 'Content' });
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Authentication failed. Check your credentials.');
  } else if (error instanceof RateLimitError) {
    console.error(`Rate limit hit. Retry after ${error.retryAfter} seconds.`);
  } else if (error instanceof ValidationError) {
    console.error('Input validation failed:', error.message);
  } else if (error instanceof PuoMemoError) {
    console.error('API error:', error.message);
  }
}
```

## Configuration

```typescript
const client = new PuoMemo({
  apiKey: 'puo_sk_...',
  baseUrl: 'https://api.puomemo.com', // or self-hosted URL
  timeout: 30000, // request timeout in milliseconds
  maxRetries: 3, // retry failed requests
  retryDelay: 1000, // initial retry delay (exponential backoff)
  onTokenRefresh: (tokens) => {
    // Called when tokens are refreshed
    // Store tokens securely for session persistence
    localStorage.setItem('puo_refresh_token', tokens.refresh_token);
  }
});
```

## TypeScript Support

The SDK is written in TypeScript and provides full type definitions:

```typescript
import type { 
  Memory, 
  SearchResult, 
  User, 
  CreateMemoryParams,
  SearchParams 
} from '@puomemo/sdk';

// All methods are fully typed
const memory: Memory = await client.createMemory({
  content: 'TypeScript example',
  tags: ['typescript']
});

// IDE autocomplete and type checking
const searchParams: SearchParams = {
  query: 'typescript',
  searchType: 'hybrid',
  limit: 10
};
```

## Browser Usage

The SDK works in both Node.js and browser environments:

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://unpkg.com/@puomemo/sdk"></script>
</head>
<body>
  <script>
    const client = new PuoMemo.PuoMemo({ apiKey: 'puo_sk_...' });
    
    async function createMemory() {
      const memory = await client.createMemory({
        content: 'Browser example'
      });
      console.log('Created:', memory);
    }
    
    createMemory();
  </script>
</body>
</html>
```

## React Example

```tsx
import React, { useState, useEffect } from 'react';
import { PuoMemo, Memory } from '@puomemo/sdk';

const client = new PuoMemo({ apiKey: 'puo_sk_...' });

function MemoryList() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMemories() {
      try {
        const { memories } = await client.listMemories({ limit: 10 });
        setMemories(memories);
      } catch (error) {
        console.error('Failed to load memories:', error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchMemories();
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <ul>
      {memories.map(memory => (
        <li key={memory.id}>
          <h3>{memory.title || 'Untitled'}</h3>
          <p>{memory.content}</p>
        </li>
      ))}
    </ul>
  );
}
```

## Next.js Example

```typescript
// pages/api/memories.ts
import { PuoMemo } from '@puomemo/sdk';
import type { NextApiRequest, NextApiResponse } from 'next';

const client = new PuoMemo({ apiKey: process.env.PUO_MEMO_API_KEY });

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'GET') {
    try {
      const results = await client.search({
        query: req.query.q as string || ''
      });
      res.status(200).json(results);
    } catch (error) {
      res.status(500).json({ error: 'Failed to search memories' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
```

## Statistics

```typescript
// Get usage statistics
const stats = await client.getStats();
console.log(`Total memories: ${stats.total_memories}`);
console.log(`Memories with embeddings: ${stats.memories_with_embeddings}`);
console.log(`Storage used: ${stats.storage_used_mb} MB`);
```

## Advanced Features

### Batch Operations

```typescript
// Create multiple memories in parallel
const memories = await Promise.all([
  client.createMemory({ content: 'Memory 1' }),
  client.createMemory({ content: 'Memory 2' }),
  client.createMemory({ content: 'Memory 3' })
]);

// Process search results
const results = await client.search({ query: 'important' });
const updatedMemories = await Promise.all(
  results.results.map(memory => 
    client.updateMemory(memory.id!, { tags: [...(memory.tags || []), 'processed'] })
  )
);
```

### Custom Metadata

```typescript
const memory = await client.createMemory({
  content: 'Meeting notes',
  metadata: {
    meeting_id: '123',
    attendees: ['Alice', 'Bob'],
    duration_minutes: 30,
    action_items: [
      { task: 'Review proposal', assignee: 'Alice' },
      { task: 'Update timeline', assignee: 'Bob' }
    ]
  }
});
```

### Pagination

```typescript
async function getAllMemories() {
  const memories: Memory[] = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const { memories: batch, total } = await client.listMemories({
      limit,
      offset
    });
    
    memories.push(...batch);
    
    if (memories.length >= total) {
      break;
    }
    
    offset += limit;
  }
  
  return memories;
}
```

### Token Persistence

```typescript
// Store tokens for session persistence
const client = new PuoMemo({
  onTokenRefresh: (tokens) => {
    localStorage.setItem('puo_access_token', tokens.access_token);
    localStorage.setItem('puo_refresh_token', tokens.refresh_token);
    localStorage.setItem('puo_token_expires', 
      (Date.now() + tokens.expires_in * 1000).toString()
    );
  }
});

// Restore session on page load
const refreshToken = localStorage.getItem('puo_refresh_token');
if (refreshToken) {
  // Manually set tokens (you'll need to extend the client for this)
  // Or just call refreshAccessToken() to get new tokens
}
```

## Testing

```typescript
// Mock the client for testing
import { PuoMemo } from '@puomemo/sdk';

jest.mock('@puomemo/sdk');

const mockClient = PuoMemo as jest.MockedClass<typeof PuoMemo>;

beforeEach(() => {
  mockClient.mockClear();
});

test('creates memory', async () => {
  const mockMemory = { id: '123', content: 'Test' };
  mockClient.prototype.createMemory.mockResolvedValue(mockMemory);
  
  const client = new PuoMemo({ apiKey: 'test' });
  const memory = await client.createMemory({ content: 'Test' });
  
  expect(memory).toEqual(mockMemory);
});
```

## Contributing

See [CONTRIBUTING.md](https://github.com/puomemo/typescript-sdk/blob/main/CONTRIBUTING.md) for development setup and guidelines.

## License

MIT License - see [LICENSE](https://github.com/puomemo/typescript-sdk/blob/main/LICENSE) for details.