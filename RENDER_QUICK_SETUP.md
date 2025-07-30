# Render Quick Setup - Action Items

## 🚨 IMMEDIATE ACTIONS REQUIRED

### 1. Set Environment Variables in Render Dashboard

Go to: https://dashboard.render.com/web/srv-d24gd83uibrs73bu8hng/env

Add these variables:

```bash
# REQUIRED - Generate these values!
JWT_SECRET=<run locally: openssl rand -hex 32>
API_KEY_SALT=<run locally: openssl rand -hex 32>
ADMIN_SECRET=<choose a strong password>

# API Settings
API_VERSION=v1
CORS_ORIGINS=*
ENVIRONMENT=production
LOG_LEVEL=info

# Database - Use Supabase for now
DATABASE_URL=<get from Supabase dashboard>
```

### 2. Get Supabase Database (Free)

1. Go to: https://supabase.com/dashboard
2. Click "New project"
3. Choose free tier
4. After creation, go to Settings → Database
5. Copy the "URI" connection string
6. Replace [YOUR-PASSWORD] with the password you set
7. Paste as DATABASE_URL in Render

### 3. Initialize Database

After deployment succeeds, go to Render Shell:
https://dashboard.render.com/web/srv-d24gd83uibrs73bu8hng/shell

Run:
```bash
python start_api.py
# Wait for "Database tables created successfully!"
# Then Ctrl+C to stop
```

### 4. Create Your First API Key

Using curl or Postman:
```bash
curl -X POST https://api.puo-memo.com/api/v1/admin/create-api-key \
  -H "Content-Type: application/json" \
  -d '{"admin_secret": "YOUR_ADMIN_SECRET"}'
```

Save the returned API key!

### 5. Test It Works

```bash
# Create a memory
curl -X POST https://api.puo-memo.com/api/v1/memories \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "My first production memory!",
    "title": "Hello Render"
  }'

# List memories
curl https://api.puo-memo.com/api/v1/memories \
  -H "X-API-Key: YOUR_API_KEY"
```

## 📊 Monitor Deployment

1. **Build Logs**: https://dashboard.render.com/web/srv-d24gd83uibrs73bu8hng/events
2. **Live Logs**: https://dashboard.render.com/web/srv-d24gd83uibrs73bu8hng/logs
3. **Health Check**: https://api.puo-memo.com/health
4. **API Docs**: https://api.puo-memo.com/docs

## 🎯 Success Indicators

- ✅ Health endpoint returns 200
- ✅ Can create API key
- ✅ Can create and list memories
- ✅ API docs are accessible

## 🔥 Common Issues

1. **502 Bad Gateway**
   - Check if DATABASE_URL is set
   - Look at logs for startup errors

2. **Service spins down**
   - Normal on free tier
   - First request takes 30-50 seconds
   - Consider upgrading to Starter ($7/mo)

3. **Database connection failed**
   - Verify DATABASE_URL format
   - Check Supabase is not paused

## 🚀 Next Steps (After Working)

1. **Upgrade to Starter** ($7/mo)
   - No spin downs
   - Better performance
   - Custom domain included

2. **Add Stripe** (Tomorrow)
   - Get Stripe account
   - Add STRIPE_SECRET_KEY
   - Deploy pricing page

3. **Share It!**
   - Tweet about your launch
   - Post on Indie Hackers
   - Get first users

Remember: You're launching v1, not v100! Ship it and iterate! 🎉