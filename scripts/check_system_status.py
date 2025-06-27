#!/usr/bin/env python3
"""
Check the status of the complete PUO Memo system
"""
import asyncio
import asyncpg
import os
import subprocess
import urllib.request
import json
from dotenv import load_dotenv

# Load environment
load_dotenv()

async def check_system():
    print("🔍 PUO Memo System Status Check")
    print("=" * 50)
    
    # 1. Check MCP Server
    print("\n1️⃣ MCP Server Status:")
    try:
        result = subprocess.run(['ps', 'aux'], capture_output=True, text=True)
        if 'server_ultra_simple.py' in result.stdout:
            print("   ✅ MCP Server is running")
        else:
            print("   ❌ MCP Server is NOT running")
            print("   💡 It will start automatically when Claude Desktop launches")
    except Exception as e:
        print(f"   ⚠️ Could not check MCP server: {e}")
    
    # 2. Check API Server
    print("\n2️⃣ API Server Status (Port 8000):")
    try:
        req = urllib.request.Request('http://localhost:8000/')
        with urllib.request.urlopen(req, timeout=2) as response:
            if response.status == 200:
                data = json.loads(response.read().decode('utf-8'))
                print("   ✅ API Server is running")
                print(f"   📌 Version: {data.get('version', 'unknown')}")
            else:
                print(f"   ❌ API Server returned status: {response.status}")
    except Exception as e:
        print("   ❌ API Server is NOT running")
        print("   💡 Start with: python api_server.py")
    
    # 3. Check Database
    print("\n3️⃣ Database Status:")
    try:
        conn = await asyncpg.connect(
            host=os.getenv('DB_HOST'),
            port=int(os.getenv('DB_PORT', 5432)),
            database=os.getenv('DB_NAME'),
            user=os.getenv('DB_USER'),
            password=os.getenv('DB_PASSWORD')
        )
        
        # Check tables
        tables = await conn.fetch("""
            SELECT tablename FROM pg_tables 
            WHERE schemaname = 'public' 
            AND tablename IN ('memory_entities', 'project_contexts')
        """)
        
        if len(tables) == 2:
            print("   ✅ Database connected")
            print(f"   📌 Host: {os.getenv('DB_HOST')}")
            
            # Count memories
            count = await conn.fetchval("SELECT COUNT(*) FROM memory_entities")
            print(f"   📊 Total memories: {count}")
        else:
            print("   ⚠️ Database connected but tables missing")
            print("   💡 Run: python setup_database.py")
            
        await conn.close()
        
    except Exception as e:
        print("   ❌ Database connection failed")
        print(f"   💡 Error: {e}")
    
    # 4. Check Browser Extension
    print("\n4️⃣ Browser Extension:")
    print("   ℹ️ Check your browser extensions page")
    print("   📌 Should see: MemoryLane - AI Conversation Capture v2.0.0")
    print("   💡 Extension captures from Claude.ai and ChatGPT")
    
    # 5. Summary
    print("\n" + "=" * 50)
    print("📋 Quick Start Commands:")
    print("   1. Start API Server: python api_server.py")
    print("   2. MCP Server: Auto-starts with Claude Desktop")
    print("   3. Extension: Install from memorylane-extension/")
    
    print("\n🔗 Architecture Docs:")
    print("   - ARCHITECTURE_COMPREHENSIVE.md")
    print("   - ARCHITECTURE_DEEP_ANALYSIS.md")

if __name__ == "__main__":
    asyncio.run(check_system())