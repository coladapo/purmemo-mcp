# Vector Embeddings Setup Guide for PUO Memo

This guide explains how to enable and use vector embeddings with semantic search in your PUO Memo system.

## 🚀 Overview

Vector embeddings enable semantic search - finding memories based on meaning rather than just keywords. For example:
- Search "Python web framework" finds memories about Django and Flask
- Search "meeting with Sarah" finds "Sarah meeting" regardless of word order
- Search "React state management" finds memories about useState hooks

## 📋 Prerequisites

1. **Google Cloud SQL PostgreSQL** instance with pgvector extension available
2. **Gemini API Key** in your `.env` file for embedding generation
3. **Python environment** with all dependencies installed

## 🛠 Setup Instructions

### Step 1: Enable pgvector Extension

Run the migration script to enable pgvector and add the embedding column:

```bash
python scripts/enable_vectors.py
```

This script will:
- ✅ Create the pgvector extension if not exists
- ✅ Add `embedding` column (768 dimensions for Gemini)
- ✅ Add `embedding_model` column to track the model used
- ✅ Create an index for fast similarity search
- ✅ Show statistics about memories needing embeddings

### Step 2: Generate Embeddings for Existing Memories

If you have existing memories, generate embeddings for them:

```bash
# Generate embeddings with default batch size (10)
python scripts/batch_embed_existing.py

# Or with custom batch size
python scripts/batch_embed_existing.py --batch-size 20

# Just check current status
python scripts/batch_embed_existing.py --verify-only
```

The script shows:
- Progress percentage and ETA
- Processing rate (memories/second)
- Failed embeddings (if any)
- Final statistics

### Step 3: Test Vector Functionality

Run the comprehensive test suite:

```bash
python tests/test_vectors.py
```

This tests:
- ✅ pgvector extension is enabled
- ✅ New memories get embeddings automatically
- ✅ Semantic search finds related concepts
- ✅ Performance is under 100ms
- ✅ Edge cases are handled properly
- ✅ Hybrid search works correctly

### Step 4: Use Vector Search in MCP

The MCP server now supports three search types:

1. **Keyword Search** (original LIKE-based search):
   ```
   recall: query="Python" search_type="keyword"
   ```

2. **Semantic Search** (vector similarity):
   ```
   recall: query="Python web framework" search_type="semantic"
   ```

3. **Hybrid Search** (default - tries semantic first, falls back to keyword):
   ```
   recall: query="React hooks"
   # or explicitly:
   recall: query="React hooks" search_type="hybrid"
   ```

## 🔧 Configuration

### Environment Variables

Add to your `.env` file:
```bash
# Required for embeddings
GEMINI_API_KEY=your-gemini-api-key-here
```

### Embedding Model

Currently uses Gemini's `text-embedding-004` model:
- 768-dimensional embeddings
- Optimized for semantic similarity
- Supports both document and query embeddings

## 📊 Performance Considerations

1. **Embedding Generation**
   - Happens asynchronously during memory creation
   - Adds ~100-200ms to creation time
   - Failures don't block memory creation

2. **Search Performance**
   - Semantic search: typically under 100ms
   - Uses IVFFlat index for scalability
   - Falls back to keyword search on errors

3. **Storage**
   - Each embedding uses ~3KB (768 floats × 4 bytes)
   - 1000 memories = ~3MB additional storage

## 🚨 Troubleshooting

### "pgvector extension not found"
- Ensure pgvector is installed on your Cloud SQL instance
- May need to enable it through Google Cloud Console

### "Embedding generation failed"
- Check GEMINI_API_KEY is set correctly
- Verify Gemini API quotas/limits
- Check network connectivity

### "Semantic search returns no results"
- Ensure memories have embeddings (run batch_embed_existing.py)
- Try lowering similarity threshold
- Check if query is too different from stored content

### "Search is slow"
- Check if vector index exists
- Consider adjusting IVFFlat lists parameter
- Monitor database performance

## 🎯 Best Practices

1. **Always run tests** after setup to verify everything works
2. **Monitor embedding generation** in logs during memory creation
3. **Use hybrid search** as default for best results
4. **Batch process** existing memories during low-usage periods
5. **Keep similarity threshold** at 0.7 for balanced results

## 📈 What's Next?

With vectors enabled, you can:
- Build more intelligent memory retrieval
- Create topic clusters using similarity
- Find related memories automatically
- Improve search relevance significantly

The system gracefully handles cases where:
- Gemini API is unavailable (falls back to keyword search)
- Embeddings fail to generate (saves memory without embedding)
- Vector operations fail (uses traditional search)

This ensures your memory system always works, with or without vectors!