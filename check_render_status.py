#!/usr/bin/env python3
"""
Check the status of PUO Memo deployment on Render
"""

import requests
import json
import sys
from datetime import datetime

API_BASE_URL = "https://api.puo-memo.com"

def check_health():
    """Check if the API is healthy"""
    try:
        response = requests.get(f"{API_BASE_URL}/health", timeout=10)
        if response.status_code == 200:
            data = response.json()
            print("✅ API Health Check: PASSED")
            print(f"   Status: {data.get('status', 'unknown')}")
            print(f"   Database: {data.get('database', 'unknown')}")
            print(f"   Version: {data.get('version', 'unknown')}")
            return True
        else:
            print(f"❌ API Health Check: FAILED (Status: {response.status_code})")
            return False
    except Exception as e:
        print(f"❌ API Health Check: ERROR - {str(e)}")
        return False

def check_api_docs():
    """Check if API documentation is available"""
    try:
        response = requests.get(f"{API_BASE_URL}/docs", timeout=10)
        if response.status_code == 200:
            print("✅ API Documentation: AVAILABLE")
            print(f"   URL: {API_BASE_URL}/docs")
            return True
        else:
            print(f"⚠️  API Documentation: Not Available (Status: {response.status_code})")
            return False
    except Exception as e:
        print(f"❌ API Documentation: ERROR - {str(e)}")
        return False

def check_websocket_status():
    """Check WebSocket endpoint status"""
    try:
        response = requests.get(f"{API_BASE_URL}/api/v4/ws/status", timeout=10)
        if response.status_code == 200:
            data = response.json()
            print("✅ WebSocket Status: AVAILABLE")
            print(f"   Active connections: {data.get('total_connections', 0)}")
            return True
        else:
            print(f"⚠️  WebSocket Status: Not Available (Status: {response.status_code})")
            return False
    except Exception as e:
        print(f"⚠️  WebSocket Status: Not configured yet")
        return False

def test_memory_endpoint():
    """Test if memory endpoint is accessible (will fail without auth)"""
    try:
        response = requests.get(f"{API_BASE_URL}/api/v4/memories", timeout=10)
        if response.status_code == 401:
            print("✅ Memory Endpoint: PROTECTED (requires authentication)")
            return True
        elif response.status_code == 200:
            print("⚠️  Memory Endpoint: PUBLIC (should require authentication)")
            return False
        else:
            print(f"❌ Memory Endpoint: ERROR (Status: {response.status_code})")
            return False
    except Exception as e:
        print(f"❌ Memory Endpoint: ERROR - {str(e)}")
        return False

def main():
    print(f"\n🔍 PUO Memo Render Status Check")
    print(f"   API URL: {API_BASE_URL}")
    print(f"   Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 50)
    
    checks = [
        check_health(),
        check_api_docs(),
        check_websocket_status(),
        test_memory_endpoint()
    ]
    
    passed = sum(checks)
    total = len(checks)
    
    print("=" * 50)
    print(f"\n📊 Summary: {passed}/{total} checks passed")
    
    if passed == total:
        print("✅ All systems operational!")
    elif passed > 0:
        print("⚠️  Some systems need attention")
    else:
        print("❌ Service appears to be down")
    
    print("\n📝 Next Steps:")
    print("1. Set environment variables in Render dashboard")
    print("2. Initialize database with migrations")
    print("3. Create first API key")
    print("4. Test memory creation")
    print(f"\nDashboard: https://dashboard.render.com/web/srv-d24gd83uibrs73bu8hng")

if __name__ == "__main__":
    main()