#!/bin/bash

# Create your first API key
echo "Creating your first API key..."

# You'll need to replace 'your-admin-secret' with the actual ADMIN_SECRET you set
curl -X POST https://api.puo-memo.com/api/v1/admin/create-api-key \
  -H "Content-Type: application/json" \
  -d '{"admin_secret": "your-admin-secret"}' \
  | python3 -m json.tool

echo ""
echo "Save the API key above - it won't be shown again!"