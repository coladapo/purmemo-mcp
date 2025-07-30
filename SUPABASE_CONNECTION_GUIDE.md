# Supabase Connection Guide for Render

## Your Existing Supabase Database

You already have a Supabase project with 11 memories! Let's connect it to Render.

**Project**: puo memo  
**Project ID**: bcmsutoahlxqriealrjb  
**Region**: us-west-1  

## Get Your Connection String

1. Go to: https://supabase.com/dashboard/project/bcmsutoahlxqriealrjb/settings/database

2. Look for "Connection string" section

3. Choose "URI" tab

4. You'll see something like:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.bcmsutoahlxqriealrjb.supabase.co:5432/postgres
   ```

5. Replace `[YOUR-PASSWORD]` with your actual database password

6. For better compatibility with Render, add `?pgbouncer=true&connection_limit=1`:
   ```
   postgresql://postgres:YOUR_ACTUAL_PASSWORD@db.bcmsutoahlxqriealrjb.supabase.co:5432/postgres?pgbouncer=true&connection_limit=1
   ```

## Set in Render Dashboard

1. Go to: https://dashboard.render.com/web/srv-d24gd83uibrs73bu8hng/env

2. Add these environment variables:

```bash
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.bcmsutoahlxqriealrjb.supabase.co:5432/postgres?pgbouncer=true&connection_limit=1

JWT_SECRET=<generate with: openssl rand -hex 32>
API_KEY_SALT=<generate with: openssl rand -hex 32>
ADMIN_SECRET=<choose a strong password>

API_VERSION=v1
CORS_ORIGINS=*
ENVIRONMENT=production
LOG_LEVEL=info
```

## Your Database Schema

Good news! Your existing database already has:
- ✅ `memories` table with 11 memories
- ✅ `api_keys` table for authentication
- ✅ `users` table for user management
- ✅ Proper indexes and constraints
- ✅ pgvector extension for embeddings

No database initialization needed!

## Quick Test After Deploy

Once deployed, test the health endpoint:
```bash
curl https://api.puo-memo.com/health
```

Should return:
```json
{
  "status": "healthy",
  "database": "healthy",
  "version": "1.0.0",
  "timestamp": "2025-01-30T..."
}
```

## Create Your First API Key

```bash
curl -X POST https://api.puo-memo.com/api/v1/admin/create-api-key \
  -H "Content-Type: application/json" \
  -d '{"admin_secret": "YOUR_ADMIN_SECRET"}'
```

This will return an API key to access your 11 existing memories!

## Access Your Existing Memories

```bash
curl https://api.puo-memo.com/api/v1/memories \
  -H "X-API-Key: YOUR_API_KEY"
```

You should see your 11 memories from Supabase! 🎉