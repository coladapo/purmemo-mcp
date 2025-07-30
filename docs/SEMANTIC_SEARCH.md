# Semantic Search Documentation

## Overview

PUO Memo now includes powerful semantic search capabilities that go beyond simple keyword matching. Using state-of-the-art vector embeddings, the system can understand the meaning and context of your memories to find relevant information even when exact words don't match.

## Features

### 1. **Multiple Search Types**

- **Keyword Search**: Traditional text matching using PostgreSQL's full-text search
- **Semantic Search**: AI-powered search that understands meaning and context
- **Hybrid Search**: Combines both approaches for best results

### 2. **Multiple Embedding Providers**

Choose from several embedding providers based on your needs:

- **Sentence Transformers** (Default)
  - Local, privacy-preserving
  - No API costs
  - Models: all-MiniLM-L6-v2 (384d), all-mpnet-base-v2 (768d)
  
- **OpenAI**
  - High-quality embeddings
  - Models: text-embedding-3-small (1536d), text-embedding-3-large (3072d)
  - Requires API key

- **Cohere**
  - Multilingual support
  - Models: embed-english-v3.0, embed-multilingual-v3.0
  - Requires API key

### 3. **Smart Features**

- **Automatic Embedding Generation**: Memories are automatically embedded when created
- **Batch Processing**: Efficiently process multiple memories at once
- **Caching**: Embeddings are cached for improved performance
- **Similarity Thresholds**: Filter results by relevance score

## Configuration

### Environment Variables

```bash
# Embedding Configuration
EMBEDDING_PROVIDER=sentence-transformers  # Options: sentence-transformers, openai, cohere
EMBEDDING_MODEL=all-MiniLM-L6-v2         # Model name
EMBEDDING_DIMENSION=384                   # Vector dimension (auto-detected)
EMBEDDING_BATCH_SIZE=32                   # Batch size for processing
ENABLE_EMBEDDING_CACHE=true              # Cache embeddings

# API Keys (if using external providers)
OPENAI_API_KEY=your-openai-key
COHERE_API_KEY=your-cohere-key

# Search Configuration
DEFAULT_SEARCH_TYPE=hybrid               # Default: keyword, semantic, hybrid
MAX_SEARCH_RESULTS=100                   # Maximum results per search
```

### Docker Compose

The system uses PostgreSQL with pgvector extension:

```yaml
postgres:
  image: pgvector/pgvector:pg16
  # ... rest of configuration
```

## API Endpoints

### 1. Create Memory with Embedding

```bash
POST /api/memories
{
  "content": "Your memory content",
  "title": "Optional title",
  "tags": ["tag1", "tag2"],
  "generate_embedding": true  // Default: true
}
```

### 2. Search Memories

```bash
GET /api/memories/search
```

Parameters:
- `query` (required): Search query
- `search_type`: "keyword", "semantic", or "hybrid" (default: hybrid)
- `limit`: Maximum results (default: 10, max: 100)
- `offset`: Pagination offset (default: 0)
- `similarity_threshold`: Minimum similarity score for semantic search (0.0-1.0, default: 0.7)
- `keyword_weight`: Weight for keyword results in hybrid search (default: 0.5)
- `semantic_weight`: Weight for semantic results in hybrid search (default: 0.5)
- `tags`: Filter by tags (array)
- `date_from`, `date_to`: Date range filters

Example:
```bash
curl -X GET "http://localhost:8000/api/memories/search?query=machine%20learning&search_type=hybrid" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### 3. Generate/Regenerate Embeddings

```bash
POST /api/embeddings/generate
{
  "memory_ids": ["id1", "id2", "id3"],
  "regenerate": false  // Set true to regenerate existing embeddings
}
```

### 4. Check Embedding Status

```bash
GET /api/embeddings/status
```

Response:
```json
{
  "total_memories": 1000,
  "with_embeddings": 950,
  "without_embeddings": 50,
  "coverage_percentage": 95.0,
  "embedding_provider": "sentence-transformers",
  "embedding_model": "all-MiniLM-L6-v2",
  "embedding_dimension": 384
}
```

## Search Examples

### 1. Find Related Concepts

```bash
# Query: "artificial intelligence"
# Finds: memories about ML, deep learning, neural networks, etc.
```

### 2. Cross-Language Search (with multilingual models)

```bash
# Query: "cooking" (English)
# Finds: "cocina" (Spanish), "cuisine" (French), etc.
```

### 3. Contextual Understanding

```bash
# Query: "how to fix bugs"
# Finds: debugging, troubleshooting, error handling, etc.
```

## Performance Optimization

### 1. Database Indexes

The system automatically creates optimized indexes:
- HNSW index for vector similarity search
- GiST indexes for text search
- B-tree indexes for filtering

### 2. Caching Strategy

- Embeddings are cached in memory
- Search results are cached in Redis (5 minutes)
- Cache is invalidated on memory updates

### 3. Batch Processing

When importing many memories:
```python
# Good: Batch generate embeddings
POST /api/embeddings/generate
{
  "memory_ids": ["id1", "id2", ..., "id100"]
}

# Avoid: Individual generation
for memory_id in memory_ids:
    POST /api/memories/{memory_id}/embed  # Don't do this
```

## Best Practices

### 1. Memory Content

- **Be Descriptive**: More context helps semantic search
- **Use Natural Language**: Write as you would explain to someone
- **Include Keywords**: Still helpful for hybrid search

### 2. Search Queries

- **Natural Questions**: "What did I learn about Python?"
- **Conceptual Queries**: "programming best practices"
- **Exploratory**: "similar to my notes on machine learning"

### 3. Choosing Search Types

- **Keyword**: When you know exact terms or phrases
- **Semantic**: For conceptual or exploratory searches
- **Hybrid**: Best for most use cases (default)

## Migration Guide

### Existing Memories

To add embeddings to existing memories:

```python
# 1. Check current status
GET /api/embeddings/status

# 2. Generate embeddings for memories without them
POST /api/embeddings/generate
{
  "memory_ids": [],  # Empty = all memories without embeddings
  "regenerate": false
}

# 3. Monitor progress
GET /api/embeddings/status
```

### Changing Embedding Models

When switching providers or models:

1. Update environment variables
2. Restart the API service
3. Regenerate all embeddings:

```bash
POST /api/embeddings/generate
{
  "memory_ids": [],  # All memories
  "regenerate": true  # Force regeneration
}
```

## Troubleshooting

### Common Issues

1. **Slow Search Performance**
   - Check if embeddings are generated: `GET /api/embeddings/status`
   - Verify HNSW index exists in PostgreSQL
   - Consider reducing `limit` parameter

2. **Poor Search Results**
   - Try different `search_type` options
   - Adjust `similarity_threshold` (lower = more results)
   - Check if embedding model suits your content language

3. **High Memory Usage**
   - Reduce `EMBEDDING_BATCH_SIZE`
   - Disable embedding cache if needed
   - Use smaller embedding models

### Monitoring

Check Prometheus metrics:
- `puomemo_embedding_generation_seconds`: Embedding generation time
- `puomemo_searches_total`: Search requests by type
- `puomemo_cache_hits_total`: Cache effectiveness

## Advanced Usage

### Custom Similarity Functions

The system uses cosine similarity by default. For custom metrics:

```sql
-- Example: Euclidean distance
CREATE INDEX idx_memories_embedding_l2 ON memories 
USING hnsw (embedding vector_l2_ops);

-- Query using L2 distance
SELECT * FROM memories 
ORDER BY embedding <-> '[...]'::vector
LIMIT 10;
```

### Multilingual Support

For multilingual content:
1. Use multilingual models (e.g., Cohere's embed-multilingual-v3.0)
2. Set appropriate environment variables
3. Test with content in multiple languages

### Integration with LLMs

Semantic search results can be used as context for LLMs:

```python
# 1. Search for relevant memories
results = search_memories(query="user's question about Python")

# 2. Use as context for LLM
context = "\n".join([r["content"] for r in results[:5]])
llm_prompt = f"Based on these notes:\n{context}\n\nAnswer: {user_question}"
```

## Security Considerations

1. **API Keys**: Store securely, use environment variables
2. **Rate Limiting**: Embedding generation is resource-intensive
3. **Data Privacy**: Consider local models for sensitive data
4. **Access Control**: Embeddings inherit memory permissions

## Future Enhancements

Planned improvements:
- [ ] Real-time embedding updates
- [ ] Custom embedding fine-tuning
- [ ] Clustering and visualization
- [ ] Semantic deduplication
- [ ] Multi-modal embeddings (text + images)