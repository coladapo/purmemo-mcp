#!/bin/bash

# Deploy Unified OAuth Server to Production
# This script deploys the OAuth 2.1 server with PKCE support

echo "🔐 DEPLOYING UNIFIED OAUTH SERVER"
echo "================================="
echo ""

# Check environment
if [ ! -f ".env" ]; then
    echo "❌ No .env file found"
    echo "Creating from example..."
    
    cat > .env << 'EOF'
# OAuth Server Configuration
JWT_SECRET=your-jwt-secret-here
DATABASE_URL=postgresql://user:pass@host/db
SUPABASE_URL=https://bcmsutoahlxqriealrjb.supabase.co
SUPABASE_ANON_KEY=your-supabase-key

# Client Secrets
CHATGPT_CLIENT_SECRET=your-chatgpt-secret

# Server Configuration
PORT=3000
NODE_ENV=production
EOF
    
    echo "⚠️  Please update .env with actual values"
    exit 1
fi

echo "📦 Installing dependencies..."
npm install express cors jsonwebtoken pg express-rate-limit dotenv

echo ""
echo "🗄️  Setting up database tables..."

# Create SQL migration file
cat > setup-oauth-tables.sql << 'EOF'
-- OAuth Clients Registry
CREATE TABLE IF NOT EXISTS oauth_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id VARCHAR(255) UNIQUE NOT NULL,
  client_secret VARCHAR(255),
  client_name VARCHAR(255) NOT NULL,
  client_type VARCHAR(50) NOT NULL CHECK (client_type IN ('public', 'confidential')),
  redirect_uris TEXT[] NOT NULL,
  allowed_scopes TEXT[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- OAuth Sessions (for PKCE flow)
CREATE TABLE IF NOT EXISTS oauth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(255) UNIQUE NOT NULL,
  client_id VARCHAR(255) NOT NULL,
  code_challenge VARCHAR(255),
  code_challenge_method VARCHAR(10) DEFAULT 'S256',
  state VARCHAR(255),
  scope TEXT,
  redirect_uri TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- OAuth Authorization Codes
CREATE TABLE IF NOT EXISTS oauth_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(255) UNIQUE NOT NULL,
  client_id VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge VARCHAR(255),
  scope TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  used_at TIMESTAMPTZ
);

-- Refresh Tokens with Rotation Support
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(255) UNIQUE NOT NULL,
  user_id UUID NOT NULL,
  client_id VARCHAR(255) NOT NULL,
  scope TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  rotated_from UUID REFERENCES refresh_tokens(id),
  rotated_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_oauth_sessions_expires ON oauth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_codes_expires ON oauth_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- Insert default OAuth clients
INSERT INTO oauth_clients (client_id, client_secret, client_name, client_type, redirect_uris, allowed_scopes)
VALUES 
  ('claude-mcp', NULL, 'Claude MCP', 'public', 
   ARRAY['http://localhost:3456/callback'], 
   ARRAY['memories.read', 'memories.write', 'entities.read']),
  
  ('chatgpt-purmemo', '${CHATGPT_CLIENT_SECRET}', 'ChatGPT Plugin', 'confidential',
   ARRAY['https://chat.openai.com/aip/plugin-purmemo/oauth/callback'],
   ARRAY['memories.read', 'memories.write']),
  
  ('npm-cli', NULL, 'NPM CLI', 'public',
   ARRAY['http://localhost:8080/callback', 'http://localhost:3456/callback'],
   ARRAY['memories.read', 'memories.write', 'api.full']),
  
  ('web-app', NULL, 'Web Application', 'public',
   ARRAY['https://app.purmemo.ai/auth/callback', 'https://app.purmemo.ai/oauth/callback'],
   ARRAY['*']),
  
  ('mobile-app', NULL, 'Mobile App', 'public',
   ARRAY['purmemo://auth/callback'],
   ARRAY['*'])
ON CONFLICT (client_id) DO UPDATE SET
  redirect_uris = EXCLUDED.redirect_uris,
  allowed_scopes = EXCLUDED.allowed_scopes,
  updated_at = NOW();
EOF

echo ""
echo "🚀 Creating deployment package..."

# Create package.json if needed
if [ ! -f "package.json" ]; then
    cat > package.json << 'EOF'
{
  "name": "purmemo-oauth-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node src/auth/unified-oauth-server.js",
    "dev": "node --watch src/auth/unified-oauth-server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "jsonwebtoken": "^9.0.2",
    "pg": "^8.11.3",
    "express-rate-limit": "^7.1.5",
    "dotenv": "^16.3.1"
  }
}
EOF
fi

echo ""
echo "📝 Creating deployment configuration..."

# Create PM2 ecosystem file
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'purmemo-oauth',
    script: './src/auth/unified-oauth-server.js',
    instances: 1,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/oauth-error.log',
    out_file: './logs/oauth-out.log',
    log_file: './logs/oauth-combined.log',
    time: true
  }]
};
EOF

echo ""
echo "🔧 Updating OAuth server for production..."

# Add dotenv loading to the OAuth server
cat > src/auth/unified-oauth-server-prod.js << 'EOF'
/**
 * Production wrapper for Unified OAuth Server
 */

import dotenv from 'dotenv';
dotenv.config();

// Import and start the server
import UnifiedOAuthServer from './unified-oauth-server.js';

const server = new UnifiedOAuthServer({
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET,
  databaseUrl: process.env.DATABASE_URL,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_ANON_KEY
});

server.start();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});
EOF

echo ""
echo "📋 Deployment Checklist:"
echo "========================"
echo ""
echo "1. Database Setup:"
echo "   psql \$DATABASE_URL < setup-oauth-tables.sql"
echo ""
echo "2. Environment Variables (.env):"
echo "   - JWT_SECRET"
echo "   - DATABASE_URL" 
echo "   - SUPABASE_URL"
echo "   - SUPABASE_ANON_KEY"
echo "   - CHATGPT_CLIENT_SECRET"
echo ""
echo "3. Local Testing:"
echo "   npm run dev"
echo ""
echo "4. Production Deployment:"
echo "   pm2 start ecosystem.config.js"
echo ""
echo "5. Nginx Configuration:"
cat << 'NGINX'
server {
    listen 443 ssl http2;
    server_name oauth.purmemo.ai;
    
    ssl_certificate /etc/letsencrypt/live/oauth.purmemo.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/oauth.purmemo.ai/privkey.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

echo ""
echo "6. Frontend Updates Required:"
echo "   - Update OAuth callback handler (see fix-frontend-oauth-callback.js)"
echo "   - Change OAuth endpoints to oauth.purmemo.ai"
echo ""
echo "✅ Deployment script ready!"
echo ""
echo "Run this on your production server to deploy the OAuth service."