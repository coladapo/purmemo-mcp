#!/usr/bin/env python3
"""
Simple script to create your first API key
"""

import requests
import json
import sys

def create_api_key(admin_secret):
    """Create an API key using the admin endpoint"""
    url = "https://api.puo-memo.com/api/v1/admin/create-api-key"
    
    try:
        response = requests.post(
            url,
            json={"admin_secret": admin_secret},
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            data = response.json()
            print("\n✅ API Key Created Successfully!")
            print("=" * 50)
            print(f"API Key: {data['api_key']}")
            print(f"User ID: {data['user_id']}")
            print("=" * 50)
            print("\n⚠️  IMPORTANT: Save this API key securely!")
            print("It won't be shown again.\n")
            
            # Save to file for convenience
            with open('api_key.txt', 'w') as f:
                f.write(f"API_KEY={data['api_key']}\n")
                f.write(f"USER_ID={data['user_id']}\n")
            print("API key also saved to api_key.txt")
            
        elif response.status_code == 403:
            print("❌ Error: Invalid admin secret")
            print("Make sure you're using the ADMIN_SECRET you set in Render")
        else:
            print(f"❌ Error: {response.status_code}")
            print(response.text)
            
    except Exception as e:
        print(f"❌ Connection error: {e}")
        print("Make sure the API is running at https://api.puo-memo.com")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        admin_secret = sys.argv[1]
    else:
        admin_secret = input("Enter your ADMIN_SECRET: ")
    
    create_api_key(admin_secret)