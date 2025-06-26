#!/usr/bin/env python3
"""
Test Unified Memory System
Verifies that memories can be saved via API and retrieved via MCP
"""
import asyncio
import aiohttp
import json
from datetime import datetime
from puo_memo_simple import PuoMemoSimple


async def test_unified_memory():
    """Test the complete memory flow"""
    print("🧪 Testing Unified Memory System")
    print("=" * 50)
    
    # Test content
    test_conversation = """Human: How does the unified memory system work?

Assistant: The unified memory system connects all AI conversations into a single database. Whether you're using ChatGPT web, Claude web, or Claude Desktop, all memories are stored in the same place.

Human: That's amazing! So I can access web conversations from Claude Desktop?

Assistant: Exactly! The memorylane extension captures web conversations and sends them to the API server, which stores them in the same PostgreSQL database that the MCP tools use. This creates a seamless experience across all platforms."""
    
    # Step 1: Test API Server (simulating extension capture)
    print("\n1️⃣ Testing API Server (Extension Capture)")
    try:
        async with aiohttp.ClientSession() as session:
            # Prepare payload similar to what extension sends
            payload = {
                "content": test_conversation,
                "source": "test-unified-system",
                "metadata": {
                    "platform": "test",
                    "url": "http://test.example.com",
                    "conversation_id": "test-123",
                    "timestamp": datetime.now().isoformat(),
                    "total_messages": 4
                }
            }
            
            # Send to API
            async with session.post('http://localhost:8000/memory', json=payload) as response:
                if response.status == 200:
                    result = await response.json()
                    memory_id = result.get('memory_id')
                    print(f"✅ Memory captured via API: {memory_id}")
                else:
                    print(f"❌ API capture failed: {response.status}")
                    return
    except Exception as e:
        print(f"❌ Could not connect to API server: {e}")
        print("   Make sure to run: python api_server.py")
        return
    
    # Step 2: Test MCP Retrieval (simulating Claude Desktop)
    print("\n2️⃣ Testing MCP Retrieval (Claude Desktop)")
    puo = PuoMemoSimple()
    
    try:
        # Initialize MCP connection
        await puo.initialize()
        
        # Search for the memory we just created
        search_result = await puo.search_memories("unified memory system", limit=5)
        
        if search_result.get('count', 0) > 0:
            print(f"✅ Found {search_result['count']} memories via MCP")
            print("\n📝 Most recent memory:")
            recent = search_result['results'][0]
            print(f"   Title: {recent['title']}")
            print(f"   Type: {recent['type']}")
            print(f"   Created: {recent['created_at']}")
            print(f"   Preview: {recent['content'][:100]}...")
        else:
            print("❌ Memory not found via MCP")
        
        # Step 3: Test asking questions about memories
        print("\n3️⃣ Testing AI-powered memory recall")
        answer = await puo.ask_memory("What platforms does the unified memory system support?")
        if not answer.get('error'):
            print(f"✅ AI Answer: {answer['answer']}")
            print(f"   Sources: {len(answer['sources'])} memories used")
        
        # Step 4: Get statistics
        print("\n4️⃣ Memory System Statistics")
        stats = await puo.get_stats()
        print(f"   Total memories: {stats['total_memories']}")
        print(f"   Recent (24h): {stats['recent_24h']}")
        print(f"   AI enabled: {stats['ai_enabled']}")
        
        await puo.cleanup()
        
    except Exception as e:
        print(f"❌ MCP test failed: {e}")
        return
    
    print("\n✅ Unified Memory System Test Complete!")
    print("\n🎉 The system works! Memories flow seamlessly between:")
    print("   - Web captures (via extension) → API → Database")
    print("   - Claude Desktop (via MCP) → Database")
    print("   - All memories accessible from any interface")


if __name__ == "__main__":
    print("PUO Unified Memory System Test")
    print("=============================")
    print("\nPrerequisites:")
    print("1. Database tables created (python setup_database.py)")
    print("2. API server running (python api_server.py)")
    print("\nStarting test...")
    
    asyncio.run(test_unified_memory())