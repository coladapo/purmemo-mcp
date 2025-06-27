#!/usr/bin/env python3
"""
Setup database tables for PUO Memo Simple
"""
import asyncio
import asyncpg
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

async def create_tables():
    """Create necessary tables for PUO Memo"""
    print("🚀 Setting up PUO Memo database...")
    
    # Connect to database
    conn = await asyncpg.connect(
        host=os.getenv('DB_HOST'),
        port=int(os.getenv('DB_PORT', 5432)),
        user=os.getenv('DB_USER'),
        password=os.getenv('DB_PASSWORD'),
        database=os.getenv('DB_NAME')
    )
    
    try:
        # Create memory_entities table
        print("📝 Creating memory_entities table...")
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS memory_entities (
                id UUID PRIMARY KEY,
                content TEXT NOT NULL,
                title VARCHAR(500),
                memory_type VARCHAR(100) DEFAULT 'general',
                tags TEXT[] DEFAULT '{}',
                metadata JSONB DEFAULT '{}',
                quality_score INTEGER DEFAULT 0,
                access_count INTEGER DEFAULT 0,
                last_accessed TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                project_context VARCHAR(200) DEFAULT 'default',
                related_memories UUID[],
                context JSONB DEFAULT '{}'
            )
        ''')
        print("✅ Created memory_entities table")
        
        # Create indexes
        print("🔍 Creating indexes...")
        await conn.execute('''
            CREATE INDEX IF NOT EXISTS idx_memory_created_at ON memory_entities(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_memory_type ON memory_entities(memory_type);
            CREATE INDEX IF NOT EXISTS idx_memory_tags ON memory_entities USING GIN(tags);
            CREATE INDEX IF NOT EXISTS idx_memory_project ON memory_entities(project_context);
            CREATE INDEX IF NOT EXISTS idx_memory_content ON memory_entities USING GIN(to_tsvector('english', content));
        ''')
        print("✅ Created indexes")
        
        # Create project contexts table
        print("📁 Creating project_contexts table...")
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS project_contexts (
                id UUID PRIMARY KEY,
                name VARCHAR(200) UNIQUE NOT NULL,
                description TEXT,
                metadata JSONB DEFAULT '{}',
                is_active BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        print("✅ Created project_contexts table")
        
        # Create default context
        await conn.execute('''
            INSERT INTO project_contexts (id, name, description)
            VALUES (gen_random_uuid(), 'default', 'Default project context')
            ON CONFLICT (name) DO NOTHING
        ''')
        print("✅ Created default context")
        
        # Verify tables
        tables = await conn.fetch("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('memory_entities', 'project_contexts')
        """)
        
        print(f"\n📊 Database setup complete!")
        print(f"Tables created: {', '.join([t['table_name'] for t in tables])}")
        
        # Get connection info
        print(f"\n🔗 Connection successful to:")
        print(f"   Host: {os.getenv('DB_HOST')}")
        print(f"   Database: {os.getenv('DB_NAME')}")
        print(f"   User: {os.getenv('DB_USER')}")
        
    except Exception as e:
        print(f"❌ Error creating tables: {e}")
        raise
    finally:
        await conn.close()

async def verify_connection():
    """Verify database connection and tables"""
    print("\n🔍 Verifying database setup...")
    
    try:
        conn = await asyncpg.connect(
            host=os.getenv('DB_HOST'),
            port=int(os.getenv('DB_PORT', 5432)),
            user=os.getenv('DB_USER'),
            password=os.getenv('DB_PASSWORD'),
            database=os.getenv('DB_NAME')
        )
        
        # Count memories
        count = await conn.fetchval("SELECT COUNT(*) FROM memory_entities")
        print(f"✅ Found {count} existing memories")
        
        # Count contexts
        contexts = await conn.fetchval("SELECT COUNT(*) FROM project_contexts")
        print(f"✅ Found {contexts} project contexts")
        
        await conn.close()
        print("\n✅ Database is ready for use!")
        
    except Exception as e:
        print(f"❌ Verification failed: {e}")
        raise

if __name__ == "__main__":
    print("PUO Memo Database Setup")
    print("=" * 50)
    
    asyncio.run(create_tables())
    asyncio.run(verify_connection())