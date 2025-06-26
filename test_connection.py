#!/usr/bin/env python3
"""
Test PUO Memo Simple Connection and Operations
"""
import asyncio
import sys
from datetime import datetime
from puo_memo_simple import PuoMemoSimple

async def test_puo_memo():
    """Test basic PUO Memo operations"""
    print("🧪 Testing PUO Memo Simple...")
    print("=" * 50)
    
    # Initialize
    puo = PuoMemoSimple()
    print("1️⃣ Initializing connection...")
    
    try:
        success = await puo.initialize()
        if not success:
            print("❌ Failed to initialize")
            return
        print("✅ Connected to database")
        print(f"✅ AI features: {'Enabled' if puo.ai_enabled else 'Disabled'}")
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return
    
    # Test 1: Create a memory
    print("\n2️⃣ Testing memory creation...")
    try:
        result = await puo.create_memory(
            content="Test memory from PUO Memo Simple",
            title="Test Memory",
            tags=["test", "setup"]
        )
        if "error" not in result:
            memory_id = result["id"]
            print(f"✅ Created memory: {memory_id[:8]}...")
        else:
            print(f"❌ Failed: {result['error']}")
            memory_id = None
    except Exception as e:
        print(f"❌ Error: {e}")
        memory_id = None
    
    # Test 2: Search memories
    print("\n3️⃣ Testing search...")
    try:
        result = await puo.search_memories("test", limit=5)
        if "error" not in result:
            print(f"✅ Found {result['count']} memories")
            for mem in result['results'][:2]:
                print(f"   - {mem['title']}")
        else:
            print(f"❌ Search failed: {result['error']}")
    except Exception as e:
        print(f"❌ Error: {e}")
    
    # Test 3: Ask a question
    print("\n4️⃣ Testing Q&A...")
    try:
        result = await puo.ask_memory("What test memories do I have?")
        if "error" not in result:
            print(f"✅ Question: {result['question']}")
            print(f"   Answer: {result['answer'][:100]}...")
        else:
            print(f"❌ Q&A failed: {result['error']}")
    except Exception as e:
        print(f"❌ Error: {e}")
    
    # Test 4: Get stats
    print("\n5️⃣ Testing statistics...")
    try:
        result = await puo.get_stats()
        if "error" not in result:
            print(f"✅ Total memories: {result['total_memories']}")
            print(f"   Current context: {result['current_context']}")
            print(f"   AI enabled: {result['ai_enabled']}")
        else:
            print(f"❌ Stats failed: {result['error']}")
    except Exception as e:
        print(f"❌ Error: {e}")
    
    # Test 5: List memories
    print("\n6️⃣ Testing list memories...")
    try:
        result = await puo.list_memories(limit=5)
        if "error" not in result:
            print(f"✅ Listed {len(result['memories'])} of {result['total']} memories")
        else:
            print(f"❌ List failed: {result['error']}")
    except Exception as e:
        print(f"❌ Error: {e}")
    
    # Test 6: Update memory (if we created one)
    if memory_id:
        print("\n7️⃣ Testing update...")
        try:
            result = await puo.update_memory(
                memory_id=memory_id,
                title="Updated Test Memory"
            )
            if "error" not in result:
                print("✅ Memory updated")
            else:
                print(f"❌ Update failed: {result['error']}")
        except Exception as e:
            print(f"❌ Error: {e}")
    
    # Test 7: Switch context
    print("\n8️⃣ Testing context switch...")
    try:
        result = await puo.switch_context("test-context")
        if "error" not in result:
            print(f"✅ Switched to context: {result['context']}")
            print(f"   Memories in context: {result['memory_count']}")
        else:
            print(f"❌ Context switch failed: {result['error']}")
    except Exception as e:
        print(f"❌ Error: {e}")
    
    # Cleanup
    await puo.cleanup()
    
    print("\n" + "=" * 50)
    print("✅ All tests completed!")
    print("\nNext steps:")
    print("1. Run the server: python server.py")
    print("2. Add to Claude Desktop config as shown in README.md")
    print("3. Restart Claude Desktop")
    print("4. Try: 'Save a memory: PUO Memo Simple is working!'")

if __name__ == "__main__":
    asyncio.run(test_puo_memo())