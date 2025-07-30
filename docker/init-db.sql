-- Initialize PostgreSQL extensions and schema for PUO Memo
-- Includes pgvector for semantic search

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For text search
CREATE EXTENSION IF NOT EXISTS "vector";   -- For semantic search

-- Create updated memories table with vector column
CREATE TABLE IF NOT EXISTS memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    title VARCHAR(255),
    tags JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    embedding vector(384),  -- Default dimension, will be updated based on model
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes for performance
    INDEX idx_memories_user_id (user_id),
    INDEX idx_memories_created_at (created_at),
    INDEX idx_memories_tags_gin (tags) USING gin,
    INDEX idx_memories_metadata_gin (metadata) USING gin
);

-- Create GiST index for text search
CREATE INDEX idx_memories_content_trgm ON memories 
USING gist (content gist_trgm_ops);

CREATE INDEX idx_memories_title_trgm ON memories 
USING gist (title gist_trgm_ops);

-- Create HNSW index for vector similarity search (more accurate than IVFFlat)
CREATE INDEX idx_memories_embedding_hnsw ON memories 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
CREATE TRIGGER update_memories_updated_at 
BEFORE UPDATE ON memories 
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Create entities table for entity extraction
CREATE TABLE IF NOT EXISTS entities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    first_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    mention_count INTEGER DEFAULT 1,
    
    -- Indexes
    INDEX idx_entities_user_id (user_id),
    INDEX idx_entities_name_type (name, type),
    INDEX idx_entities_type (type),
    UNIQUE (user_id, name, type)
);

-- Create memory_entities junction table
CREATE TABLE IF NOT EXISTS memory_entities (
    memory_id UUID REFERENCES memories(id) ON DELETE CASCADE,
    entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
    relevance_score FLOAT DEFAULT 1.0,
    
    PRIMARY KEY (memory_id, entity_id),
    INDEX idx_memory_entities_entity (entity_id)
);

-- Create api_keys table for authentication
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL UNIQUE,
    key_hash VARCHAR(64) NOT NULL,
    name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    
    INDEX idx_api_keys_key_hash (key_hash)
);

-- Create search_logs table for analytics
CREATE TABLE IF NOT EXISTS search_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL,
    query TEXT NOT NULL,
    search_type VARCHAR(50) NOT NULL, -- 'keyword', 'semantic', 'hybrid'
    result_count INTEGER,
    execution_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_search_logs_user_id (user_id),
    INDEX idx_search_logs_created_at (created_at)
);

-- Helper function for hybrid search
CREATE OR REPLACE FUNCTION hybrid_search(
    p_user_id VARCHAR(255),
    p_query TEXT,
    p_query_embedding vector,
    p_limit INTEGER DEFAULT 10,
    p_keyword_weight FLOAT DEFAULT 0.5,
    p_semantic_weight FLOAT DEFAULT 0.5
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    title VARCHAR(255),
    tags JSONB,
    created_at TIMESTAMP WITH TIME ZONE,
    keyword_score FLOAT,
    semantic_score FLOAT,
    combined_score FLOAT
) AS $$
BEGIN
    RETURN QUERY
    WITH keyword_results AS (
        -- Full-text search with ranking
        SELECT 
            m.id,
            m.content,
            m.title,
            m.tags,
            m.created_at,
            m.embedding,
            -- Calculate keyword relevance score
            GREATEST(
                similarity(m.content, p_query),
                similarity(COALESCE(m.title, ''), p_query)
            ) AS keyword_score
        FROM memories m
        WHERE m.user_id = p_user_id
        AND (
            m.content % p_query  -- Trigram similarity
            OR COALESCE(m.title, '') % p_query
        )
        ORDER BY keyword_score DESC
        LIMIT p_limit * 2  -- Get more candidates for reranking
    ),
    semantic_results AS (
        -- Vector similarity search
        SELECT 
            m.id,
            m.content,
            m.title,
            m.tags,
            m.created_at,
            1 - (m.embedding <=> p_query_embedding) AS semantic_score  -- Cosine similarity
        FROM memories m
        WHERE m.user_id = p_user_id
        AND m.embedding IS NOT NULL
        ORDER BY m.embedding <=> p_query_embedding  -- Cosine distance
        LIMIT p_limit * 2
    ),
    combined AS (
        -- Combine and score results
        SELECT DISTINCT
            COALESCE(k.id, s.id) AS id,
            COALESCE(k.content, s.content) AS content,
            COALESCE(k.title, s.title) AS title,
            COALESCE(k.tags, s.tags) AS tags,
            COALESCE(k.created_at, s.created_at) AS created_at,
            COALESCE(k.keyword_score, 0) AS keyword_score,
            COALESCE(s.semantic_score, 0) AS semantic_score,
            (p_keyword_weight * COALESCE(k.keyword_score, 0) + 
             p_semantic_weight * COALESCE(s.semantic_score, 0)) AS combined_score
        FROM keyword_results k
        FULL OUTER JOIN semantic_results s ON k.id = s.id
    )
    SELECT * FROM combined
    ORDER BY combined_score DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to update embedding dimension
CREATE OR REPLACE FUNCTION update_embedding_dimension(new_dimension INTEGER)
RETURNS void AS $$
BEGIN
    -- Drop existing index
    DROP INDEX IF EXISTS idx_memories_embedding_hnsw;
    
    -- Alter column type
    EXECUTE format('ALTER TABLE memories ALTER COLUMN embedding TYPE vector(%s)', new_dimension);
    
    -- Recreate index
    CREATE INDEX idx_memories_embedding_hnsw ON memories 
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
END;
$$ LANGUAGE plpgsql;