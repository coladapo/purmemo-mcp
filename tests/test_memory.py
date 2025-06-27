#!/usr/bin/env python3
"""
Basic tests for memory operations
"""
import asyncio
import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.core.database import DatabaseConnection
from src.core.memory import MemoryStore


async def test_memory_operations():
    """Test basic memory CRUD operations"""
    print("🧪 Testing Memory Operations")
    print("=" * 50)
    
    # Initialize database connection
    db = DatabaseConnection()
    if not await db.initialize():
        print("❌ Failed to initialize database")
        return False
    
    # Create memory store
    memory = MemoryStore(db)
    
    try:
        # Test 1: Create memory
        print("\n1️⃣ Testing memory creation...")
        result = await memory.create(
            content="This is a test memory",
            title="Test Memory",
            tags=["test", "example"]
        )
        
        if "error" in result:
            print(f"❌ Create failed: {result['error']}")
            return False
        
        memory_id = result['id']
        print(f"✅ Created memory with ID: {memory_id}")
        
        # Test 2: Search memory
        print("\n2️⃣ Testing memory search...")
        search_result = await memory.search("test")
        
        if "error" in search_result:
            print(f"❌ Search failed: {search_result['error']}")
            return False
        
        if search_result['count'] == 0:
            print("❌ Search returned no results")
            return False
        
        print(f"✅ Found {search_result['count']} memories")
        
        # Test 3: Update memory
        print("\n3️⃣ Testing memory update...")
        update_result = await memory.update(
            memory_id=memory_id,
            content="This is an updated test memory",
            title="Updated Test Memory"
        )
        
        if "error" in update_result:
            print(f"❌ Update failed: {update_result['error']}")
            return False
        
        print("✅ Memory updated successfully")
        
        # Test 4: List memories
        print("\n4️⃣ Testing memory listing...")
        list_result = await memory.list(limit=5)
        
        if "error" in list_result:
            print(f"❌ List failed: {list_result['error']}")
            return False
        
        print(f"✅ Listed {len(list_result['memories'])} memories")
        
        # Test 5: Delete memory
        print("\n5️⃣ Testing memory deletion...")
        delete_result = await memory.delete(memory_id)
        
        if "error" in delete_result:
            print(f"❌ Delete failed: {delete_result['error']}")
            return False
        
        print("✅ Memory deleted successfully")
        
        print("\n" + "=" * 50)
        print("✅ All tests passed!")
        return True
        
    except Exception as e:
        print(f"❌ Test failed with error: {e}")
        return False
    
    finally:
        await db.cleanup()


async def test_database_connection():
    """Test database connection and table verification"""
    print("\n🧪 Testing Database Connection")
    print("=" * 50)
    
    db = DatabaseConnection()
    
    try:
        # Test connection
        print("\n1️⃣ Testing database connection...")
        if not await db.initialize():
            print("❌ Failed to initialize database")
            return False
        
        print("✅ Database connected successfully")
        
        # Test table verification
        print("\n2️⃣ Testing table verification...")
        if not await db.verify_tables():
            print("⚠️  Required tables missing")
            print("💡 Run: python setup_database.py")
        else:
            print("✅ All required tables exist")
        
        # Test query execution
        print("\n3️⃣ Testing query execution...")
        result = await db.fetchval("SELECT COUNT(*) FROM memory_entities")
        print(f"✅ Found {result} memories in database")
        
        return True
        
    except Exception as e:
        print(f"❌ Test failed with error: {e}")
        return False
    
    finally:
        await db.cleanup()


async def main():
    """Run all tests"""
    print("🚀 PUO Memo Test Suite")
    print("=" * 70)
    
    # Test database connection first
    if not await test_database_connection():
        print("\n❌ Database tests failed - skipping memory tests")
        return
    
    # Test memory operations
    await test_memory_operations()


if __name__ == "__main__":
    asyncio.run(main())