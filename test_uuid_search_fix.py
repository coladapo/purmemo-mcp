#!/usr/bin/env python3
"""
Test script to verify UUID search fix implementation
"""
import asyncio
import sys
import uuid
import re
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

# Import the UUID detection function
from src.core.memory import is_valid_uuid

def test_uuid_detection():
    """Test the UUID validation function"""
    print("🧪 Testing UUID detection...")
    
    # Test valid UUIDs
    valid_uuids = [
        "cc5f666b-bb6e-4193-84aa-1dcc21ffbf9b",
        "550e8400-e29b-41d4-a716-446655440000",
        "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
        "F47AC10B-58CC-4372-A567-0E02B2C3D479"  # uppercase
    ]
    
    # Test invalid UUIDs
    invalid_strings = [
        "not-a-uuid",
        "cc5f666b-bb6e-4193-84aa",  # too short
        "cc5f666b-bb6e-4193-84aa-1dcc21ffbf9bx",  # too long
        "search query with spaces",
        "backend fixes implementation",
        "",
        "123"
    ]
    
    print("✅ Valid UUIDs:")
    for test_uuid in valid_uuids:
        result = is_valid_uuid(test_uuid)
        print(f"  {test_uuid}: {result}")
        assert result, f"Should be valid: {test_uuid}"
    
    print("\n❌ Invalid strings:")
    for test_string in invalid_strings:
        result = is_valid_uuid(test_string)
        print(f"  '{test_string}': {result}")
        assert not result, f"Should be invalid: {test_string}"
    
    print("\n✅ UUID detection test passed!")

async def test_memory_search():
    """Test memory search with UUID vs regular queries"""
    print("\n🔍 Testing memory search behavior...")
    
    # Import database and memory components
    from src.core.database import DatabaseConnection
    from src.core.memory import MemoryStore
    from src.core.ai import AIAssistant
    from src.utils.config import get_settings
    
    try:
        # Initialize components
        db = DatabaseConnection()
        await db.initialize()
        
        ai = AIAssistant()
        memory_store = MemoryStore(db, ai)
        
        # Test with a known memory ID (we'll use the one from the original issue)
        test_uuid = "cc5f666b-bb6e-4193-84aa-1dcc21ffbf9b"
        
        print(f"Testing direct UUID search: {test_uuid}")
        result = await memory_store.search(test_uuid)
        
        print(f"Search result type: {result.get('search_type', 'unknown')}")
        print(f"Results found: {result.get('count', 0)}")
        
        if result.get('count', 0) > 0:
            memory = result['results'][0]
            print(f"Found memory: {memory['title'][:50]}...")
            print("✅ UUID search working!")
        else:
            print("No memory found - testing with regular search")
            
        # Test with regular search query
        print(f"\nTesting regular search: 'backend fixes'")
        regular_result = await memory_store.search("backend fixes")
        print(f"Search result type: {regular_result.get('search_type', 'unknown')}")
        print(f"Results found: {regular_result.get('count', 0)}")
        
        # Test hybrid search with UUID
        print(f"\nTesting hybrid search with UUID: {test_uuid}")
        hybrid_result = await memory_store.hybrid_search(test_uuid)
        print(f"Search result type: {hybrid_result.get('search_type', 'unknown')}")
        print(f"Results found: {hybrid_result.get('count', 0)}")
        
        await db.close()
        print("\n✅ Memory search test completed!")
        
    except Exception as e:
        print(f"\n❌ Memory search test failed: {e}")
        import traceback
        traceback.print_exc()

def main():
    """Run all tests"""
    print("🚀 Testing PUO-MEMO UUID Search Fixes")
    print("=" * 50)
    
    # Test UUID detection
    test_uuid_detection()
    
    # Test memory search
    asyncio.run(test_memory_search())
    
    print("\n" + "=" * 50)
    print("🎉 All tests completed!")

if __name__ == "__main__":
    main()