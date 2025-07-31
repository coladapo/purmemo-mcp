#!/usr/bin/env python3
"""
Start script for PUO Memo API v5 with Unified Memory Search
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

async def verify_database_tables():
    """Verify both memories and memory_entities tables exist"""
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        print("ERROR: DATABASE_URL not set!")
        return False
    
    try:
        # Connect to database
        conn = await asyncpg.connect(database_url)
        
        # Check if memories table exists
        memories_exists = await conn.fetchval("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'memories'
            );
        """)
        
        # Check if memory_entities table exists
        entities_exists = await conn.fetchval("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'memory_entities'
            );
        """)
        
        print(f"✅ Database verification:")
        print(f"   memories table: {'exists' if memories_exists else 'NOT FOUND'}")
        print(f"   memory_entities table: {'exists' if entities_exists else 'NOT FOUND'}")
        
        if memories_exists and entities_exists:
            # Get counts
            memories_count = await conn.fetchval("SELECT COUNT(*) FROM memories")
            entities_count = await conn.fetchval("SELECT COUNT(*) FROM memory_entities")
            
            print(f"\n📊 Current data:")
            print(f"   memories table: {memories_count} records")
            print(f"   memory_entities table: {entities_count} records")
            
            # Check for June 2024/2025 memories
            june_count = await conn.fetchval("""
                SELECT COUNT(*) FROM memory_entities
                WHERE created_at >= '2025-06-01' AND created_at < '2025-08-01'
            """)
            
            if june_count > 0:
                print(f"   June 2024 memories (as 2025): {june_count} records")
        
        await conn.close()
        return memories_exists and entities_exists
        
    except Exception as e:
        print(f"Database verification error: {e}")
        return False

def main():
    """Main entry point"""
    print("=" * 60)
    print("PUO Memo API v5 - Unified Memory Search")
    print("=" * 60)
    
    # Verify database tables
    if not asyncio.run(verify_database_tables()):
        print("\n❌ Database verification failed!")
        print("   Ensure both 'memories' and 'memory_entities' tables exist")
        sys.exit(1)
    
    print("\n✅ Database verified - starting API v5...")
    
    # Import and run the unified API
    from src.api.production_api_v5 import app
    
    # Get configuration from environment
    host = os.getenv('HOST', '0.0.0.0')
    port = int(os.getenv('PORT', 8000))
    
    # Log API version and features
    print(f"\n🚀 Starting PUO Memo API v5 on {host}:{port}")
    print("\n📋 Features enabled:")
    print("   • Unified memory search (memories + memory_entities)")
    print("   • June 2024 memories accessible")
    print("   • Full v3/v4 backward compatibility")
    print("   • WebSocket real-time sync")
    print("   • Multi-tenant support")
    print("\n🔍 New v5 endpoints:")
    print("   • GET  /api/v5/memories/search - Unified search")
    print("   • GET  /api/v5/memories - List all from both tables")
    print("   • GET  /api/v5/memories/{id} - Get from either table")
    print("   • GET  /api/v5/stats - Statistics across both tables")
    
    # Run the server
    uvicorn.run(
        "src.api.production_api_v5:app",
        host=host,
        port=port,
        reload=False,
        access_log=True,
        log_level="info"
    )

if __name__ == "__main__":
    main()