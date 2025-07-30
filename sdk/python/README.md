# PUO Memo Python SDK

Official Python SDK for the PUO Memo API.

## Installation

```bash
pip install puomemo
```

## Quick Start

```python
from puomemo import PuoMemo

# Initialize client with API key
client = PuoMemo(api_key="puo_sk_...")

# Create a memory
memory = client.create_memory(
    content="Important meeting notes from today's standup",
    title="Daily Standup",
    tags=["meetings", "daily", "team"]
)

# Search memories
results = client.search("standup meetings")
for memory in results.results:
    print(f"{memory.title}: {memory.content[:100]}...")

# Update a memory
updated = client.update_memory(
    memory.id,
    tags=["meetings", "daily", "team", "archived"]
)

# Delete a memory
client.delete_memory(memory.id)
```

## Authentication

### API Key Authentication

```python
client = PuoMemo(api_key="puo_sk_...")
```

### Email/Password Authentication

```python
client = PuoMemo()
user = client.login("user@example.com", "password")
```

## Async Support

The SDK provides both synchronous and asynchronous interfaces:

```python
import asyncio
from puomemo import PuoMemoClient

async def main():
    async with PuoMemoClient(api_key="puo_sk_...") as client:
        # Create memory asynchronously
        memory = await client.create_memory("Async memory content")
        
        # Search asynchronously
        results = await client.search("async")
        
asyncio.run(main())
```

## Memory Operations

### Create Memory

```python
memory = client.create_memory(
    content="Memory content",
    title="Optional title",
    tags=["tag1", "tag2"],
    metadata={"key": "value"},
    visibility="private",  # or "team", "public"
    generate_embedding=True  # for semantic search
)
```

### List Memories

```python
# List recent memories
memories = client.list_memories(limit=20, offset=0)

# Filter by tags
memories = client.list_memories(tags=["important", "work"])

# Filter by visibility
memories = client.list_memories(visibility=["private", "team"])
```

### Search Memories

```python
# Hybrid search (default)
results = client.search("machine learning")

# Keyword-only search
results = client.search("exact phrase", search_type="keyword")

# Semantic search
results = client.search("AI and neural networks", search_type="semantic")

# Advanced search options
results = client.search(
    "project updates",
    search_type="hybrid",
    tags=["project", "updates"],
    date_from=datetime(2024, 1, 1),
    date_to=datetime(2024, 12, 31),
    similarity_threshold=0.8,
    keyword_weight=0.3,
    semantic_weight=0.7
)
```

## API Key Management

```python
# Create API key
api_key = client.create_api_key(
    name="Production Key",
    permissions=["memories.read", "memories.create"],
    expires_at=datetime(2025, 12, 31)
)

# List API keys
keys = client.list_api_keys()
for key in keys:
    print(f"{key['name']}: {key['created_at']}")

# Revoke API key
client.revoke_api_key(key_id)
```

## Error Handling

```python
from puomemo import PuoMemoError, AuthenticationError, RateLimitError

try:
    memory = client.create_memory("Content")
except AuthenticationError:
    print("Authentication failed. Check your credentials.")
except RateLimitError as e:
    print(f"Rate limit hit. Retry after {e.retry_after} seconds.")
except PuoMemoError as e:
    print(f"API error: {e}")
```

## Configuration

```python
client = PuoMemo(
    api_key="puo_sk_...",
    base_url="https://api.puomemo.com",  # or self-hosted URL
    timeout=30.0,  # request timeout in seconds
    max_retries=3,  # retry failed requests
    retry_delay=1.0  # initial retry delay (exponential backoff)
)
```

## Environment Variables

The SDK can read configuration from environment variables:

```bash
export PUO_MEMO_API_KEY="puo_sk_..."
export PUO_MEMO_API_URL="https://api.puomemo.com"
```

Then initialize without parameters:

```python
client = PuoMemo()
```

## Statistics

```python
# Get usage statistics
stats = client.get_stats()
print(f"Total memories: {stats['total_memories']}")
print(f"Memories with embeddings: {stats['memories_with_embeddings']}")
print(f"Storage used: {stats['storage_used_mb']} MB")
```

## Advanced Features

### Batch Operations

```python
# Create multiple memories
memories = []
for i in range(10):
    memory = client.create_memory(f"Memory {i}")
    memories.append(memory)

# Process in parallel with async
async def create_many():
    async with PuoMemoClient(api_key="...") as client:
        tasks = [
            client.create_memory(f"Memory {i}")
            for i in range(100)
        ]
        return await asyncio.gather(*tasks)
```

### Custom Metadata

```python
memory = client.create_memory(
    content="Meeting notes",
    metadata={
        "meeting_id": "123",
        "attendees": ["Alice", "Bob"],
        "duration_minutes": 30,
        "action_items": [
            {"task": "Review proposal", "assignee": "Alice"},
            {"task": "Update timeline", "assignee": "Bob"}
        ]
    }
)
```

### Pagination

```python
# Paginate through all memories
offset = 0
limit = 50
all_memories = []

while True:
    batch = client.list_memories(limit=limit, offset=offset)
    all_memories.extend(batch['memories'])
    
    if len(batch['memories']) < limit:
        break
        
    offset += limit
```

## Testing

```python
# Set up test environment
import os
os.environ['PUO_MEMO_API_URL'] = 'http://localhost:8000'
os.environ['PUO_MEMO_API_KEY'] = 'test-key'

# Run tests
import pytest
pytest.main(['-v'])
```

## Contributing

See [CONTRIBUTING.md](https://github.com/puomemo/python-sdk/blob/main/CONTRIBUTING.md) for development setup and guidelines.

## License

MIT License - see [LICENSE](https://github.com/puomemo/python-sdk/blob/main/LICENSE) for details.