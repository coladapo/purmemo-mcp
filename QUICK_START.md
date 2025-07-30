# Quick Start Guide - Create Your First API Key

## Step 1: Create API Key

You need to make a POST request to your API with your ADMIN_SECRET (the password you set in Render).

### Option A: Using curl (easiest)

```bash
curl -X POST https://api.puo-memo.com/api/v1/admin/create-api-key \
  -H "Content-Type: application/json" \
  -d '{"admin_secret": "YOUR_ADMIN_SECRET_HERE"}'
```

Replace `YOUR_ADMIN_SECRET_HERE` with the actual password you set in Render.

### Option B: Using the Swagger UI (visual)

1. Go to https://api.puo-memo.com/docs
2. Find the `/api/v1/admin/create-api-key` endpoint
3. Click "Try it out"
4. Enter your admin_secret in the request body
5. Click "Execute"

### Option C: Using Python

```bash
python3 create_api_key.py YOUR_ADMIN_SECRET_HERE
```

## Step 2: Save Your API Key

The response will look like:
```json
{
  "api_key": "puo_xxxxxxxxxxxxxxxxxxxxx",
  "user_id": "some-uuid",
  "message": "Save this API key - it won't be shown again!"
}
```

**IMPORTANT**: Copy the `api_key` value immediately! You won't be able to see it again.

## Step 3: Test Your API

Once you have your API key, test it:

```bash
# List your memories
curl https://api.puo-memo.com/api/v1/memories \
  -H "X-API-Key: YOUR_API_KEY_HERE"
```

## What's your ADMIN_SECRET?

Your ADMIN_SECRET is the password you entered in the Render dashboard when setting up environment variables. You added it along with DATABASE_URL and API_KEY_SALT.

If you forgot it, you can:
1. Go to Render dashboard
2. Click on your service
3. Go to Environment tab
4. Look for ADMIN_SECRET value