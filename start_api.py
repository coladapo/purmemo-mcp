#!/usr/bin/env python3
"""
Start script for PUO Memo API on Render
Handles database initialization and starts the API server
"""

import os
import sys
import asyncio
import asyncpg
import uvicorn
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent))

async def init_database():
    """Initialize database with tables if needed"""
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        print("ERROR: DATABASE_URL not set!")
        return False
    
    try:
        # Connect to database
        conn = await asyncpg.connect(database_url)
        
        # Check if memories table exists
        exists = await conn.fetchval("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'memories'
            );
        """)
        
        if not exists:
            print("Creating database tables...")
            
            # Create tables
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS memories (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    content TEXT NOT NULL,
                    title TEXT,
                    tags TEXT[] DEFAULT '{}',
                    visibility TEXT DEFAULT 'private',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    created_by UUID,
                    tenant_id UUID
                );
                
                CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_memories_tenant_id ON memories(tenant_id);
                CREATE INDEX IF NOT EXISTS idx_memories_tags ON memories USING GIN(tags);
            """)
            
            # Create API keys table
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS api_keys (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    key_hash TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    permissions JSONB DEFAULT '["memory:create", "memory:read"]',
                    tenant_id UUID,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    last_used_at TIMESTAMP WITH TIME ZONE,
                    is_active BOOLEAN DEFAULT true
                );
                
                CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
            """)
            
            print("Database tables created successfully!")
        else:
            print("Database tables already exist")
        
        await conn.close()
        return True
        
    except Exception as e:
        print(f"Database initialization error: {e}")
        return False

def main():
    """Main entry point"""
    # Initialize database
    if not asyncio.run(init_database()):
        print("Failed to initialize database!")
        sys.exit(1)
    
    # Import and run the API
    from src.api.render_api import app
    
    # Get configuration from environment
    host = os.getenv('HOST', '0.0.0.0')
    port = int(os.getenv('PORT', 8000))
    
    print(f"Starting PUO Memo API on {host}:{port}")
    
    # Run the server
    uvicorn.run(
        "src.api.render_api:app",
        host=host,
        port=port,
        reload=False,
        access_log=True
    )

if __name__ == "__main__":
    main()