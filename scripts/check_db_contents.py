#!/usr/bin/env python3
"""Check database contents - show recent memories"""
import asyncio
import asyncpg
import os
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

async def check_database():
    # Connect to database
    conn = await asyncpg.connect(
        host=os.getenv('DB_HOST'),
        port=int(os.getenv('DB_PORT', 5432)),
        database=os.getenv('DB_NAME'),
        user=os.getenv('DB_USER'),
        password=os.getenv('DB_PASSWORD')
    )
    
    try:
        # Get the most recent memories
        print("=== Most Recent Memories ===\n")
        
        # Get last 5 memories with full details
        recent_memories = await conn.fetch("""
            SELECT id, title, content, memory_type, tags, project_context, 
                   created_at, updated_at
            FROM memory_entities
            ORDER BY created_at DESC
            LIMIT 5
        """)
        
        if not recent_memories:
            print("No memories found in the database.")
            return
            
        # Show the most recent memory in detail
        latest = recent_memories[0]
        print(f"🔹 LATEST MEMORY (Created: {latest['created_at']})")
        print(f"   ID: {latest['id']}")
        print(f"   Title: {latest['title']}")
        print(f"   Type: {latest['memory_type']}")
        print(f"   Tags: {latest['tags']}")
        print(f"   Context: {latest['project_context']}")
        print(f"   Updated: {latest['updated_at']}")
        print(f"   Content Preview: {latest['content'][:200]}{'...' if len(latest['content']) > 200 else ''}")
        print()
        
        # Show summary of other recent memories
        if len(recent_memories) > 1:
            print("📋 Other Recent Memories:")
            for mem in recent_memories[1:]:
                print(f"   • {mem['title']} ({mem['memory_type']}) - {mem['created_at'].strftime('%Y-%m-%d %H:%M')}")
        
        # Get total count and statistics
        print("\n=== Database Statistics ===")
        
        # Total memories
        total_count = await conn.fetchval("SELECT COUNT(*) FROM memory_entities")
        print(f"Total memories: {total_count}")
        
        # Memories by type
        type_counts = await conn.fetch("""
            SELECT memory_type, COUNT(*) as count
            FROM memory_entities
            GROUP BY memory_type
            ORDER BY count DESC
        """)
        
        if type_counts:
            print("\nMemories by type:")
            for row in type_counts:
                print(f"   • {row['memory_type']}: {row['count']}")
        
        # Memories by context
        context_counts = await conn.fetch("""
            SELECT project_context, COUNT(*) as count
            FROM memory_entities
            GROUP BY project_context
            ORDER BY count DESC
            LIMIT 5
        """)
        
        if context_counts:
            print("\nTop project contexts:")
            for row in context_counts:
                print(f"   • {row['project_context']}: {row['count']} memories")
        
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(check_database())