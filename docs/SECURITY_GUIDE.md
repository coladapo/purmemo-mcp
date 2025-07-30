# PUO Memo Security Guide

## Overview

This guide covers the security features implemented in PUO Memo MCP to protect your data and ensure authorized access only.

## Quick Start

### 1. Initial Setup

```bash
# Run the migration script to set up security
cd /path/to/puo-memo-mcp
python3 scripts/migrate_to_secure.py

# This will:
# - Create .env from .env.example
# - Generate secure JWT secret and API key
# - Create secure startup scripts
```

### 2. Environment Variables

Essential security configuration in `.env`:

```env
# Authentication
JWT_SECRET_KEY=your-very-long-random-secret-key-minimum-32-chars
JWT_ALGORITHM=HS256
JWT_EXPIRATION_HOURS=24
API_KEY=puo_your-secure-api-key-here

# Security
ALLOWED_ORIGINS=http://localhost:3000,https://your-domain.com
RATE_LIMIT_PER_MINUTE=100
```

### 3. Start Secure Servers

```bash
# Option 1: Use the generated startup script
./start_secure.sh

# Option 2: Start individually
python3 src/api/secure_server.py    # API server
python3 src/mcp/secure_server.py    # MCP server
```

## Authentication Methods

### 1. API Key Authentication

Simple and secure for server-to-server communication.

```bash
# Using curl
curl http://localhost:8000/memories \
  -H "X-API-Key: YOUR_API_KEY"

# Using JavaScript
fetch('http://localhost:8000/memories', {
  headers: {
    'X-API-Key': 'YOUR_API_KEY'
  }
})
```

### 2. JWT Token Authentication

Best for web applications with user sessions.

```bash
# Step 1: Login to get JWT token
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"api_key": "YOUR_API_KEY"}'

# Response:
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "token_type": "bearer",
  "expires_in": 86400
}

# Step 2: Use JWT token for requests
curl http://localhost:8000/memories \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Claude Desktop Configuration

Update your Claude Desktop config to use the secure MCP server:

```json
{
  "mcpServers": {
    "puo-memo": {
      "command": "/path/to/venv/bin/python3",
      "args": [
        "-u",
        "/path/to/puo-memo-mcp/src/mcp/secure_server.py"
      ],
      "env": {
        "PATH": "/path/to/venv/bin:/usr/bin:/bin",
        "PYTHONPATH": "/path/to/puo-memo-mcp",
        "API_KEY": "your-api-key-here"
      }
    }
  }
}
```

**Note**: For MCP over stdio, authentication is handled at the environment level since the protocol doesn't support headers.

## Browser Extension Integration

Update your browser extension to include authentication:

```javascript
// In your extension's API client
const API_KEY = 'your-api-key'; // Store securely in extension settings

async function saveMemory(content) {
  const response = await fetch('http://localhost:8000/memory', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY
    },
    body: JSON.stringify({
      content: content,
      source: 'browser',
      metadata: {
        url: window.location.href,
        title: document.title
      }
    })
  });
  
  if (response.status === 401) {
    console.error('Authentication failed - check API key');
  }
  
  return response.json();
}
```

## Security Features

### 1. Authentication & Authorization
- ✅ JWT token authentication for web clients
- ✅ API key authentication for services
- ✅ Request signing and validation
- ✅ Token expiration and refresh

### 2. Input Validation
- ✅ Content size limits (50KB max)
- ✅ Query parameter validation
- ✅ SQL injection prevention (parameterized queries)
- ✅ Path traversal protection

### 3. Rate Limiting
- ✅ Configurable rate limits per IP
- ✅ Default: 100 requests per minute
- ✅ Automatic 429 responses when exceeded

### 4. CORS Configuration
- ✅ Restrictive CORS policy
- ✅ Only allowed origins can make requests
- ✅ Credentials required for cross-origin requests

### 5. Security Headers
- ✅ X-Content-Type-Options: nosniff
- ✅ X-Frame-Options: DENY
- ✅ X-XSS-Protection: 1; mode=block
- ✅ Referrer-Policy: strict-origin-when-cross-origin

### 6. Logging & Auditing
- ✅ Authentication attempts logged
- ✅ Failed requests logged with IP
- ✅ Sensitive data excluded from logs

## Best Practices

### 1. Credential Management
- **Never** commit `.env` to version control
- Use strong, unique API keys (32+ characters)
- Rotate keys periodically (every 90 days)
- Use different keys for different environments

### 2. HTTPS in Production
```nginx
# Nginx configuration for HTTPS
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 3. Environment-Specific Configuration
```bash
# Development
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080
RATE_LIMIT_PER_MINUTE=1000

# Production
ALLOWED_ORIGINS=https://your-domain.com,https://app.your-domain.com
RATE_LIMIT_PER_MINUTE=100
```

### 4. Monitoring
- Monitor authentication failures
- Track rate limit violations
- Alert on suspicious patterns
- Regular security audits

## Troubleshooting

### Common Issues

#### 1. "Authentication required" error
- Check API key is set in `.env`
- Verify API key is included in request headers
- Ensure `.env` is loaded (restart server)

#### 2. "Invalid API key" error
- Verify API key matches `.env` exactly
- Check for extra spaces or quotes
- Regenerate key if needed

#### 3. CORS errors
- Add origin to `ALLOWED_ORIGINS` in `.env`
- Restart server after changes
- Check browser console for specific origin

#### 4. Rate limit exceeded
- Implement request batching
- Add caching on client side
- Increase `RATE_LIMIT_PER_MINUTE` if needed

### Debug Mode

Enable detailed logging:

```env
LOG_LEVEL=DEBUG
ENABLE_REQUEST_LOGGING=true
```

Check logs:
```bash
# API server logs
tail -f logs/api-server.log

# MCP server logs (to stderr)
python3 src/mcp/secure_server.py 2>&1 | tee mcp-debug.log
```

## Migration from Unsecured Setup

1. **Backup your data**
   ```bash
   pg_dump your_database > backup.sql
   ```

2. **Run migration script**
   ```bash
   python3 scripts/migrate_to_secure.py
   ```

3. **Update all integrations**
   - Browser extension settings
   - Claude Desktop config
   - Any API clients

4. **Test thoroughly**
   - Verify all tools work
   - Check authentication flow
   - Test rate limiting

5. **Remove old insecure files**
   - Delete hardcoded credential files
   - Remove old server scripts
   - Clean up test files with secrets

## Security Checklist

Before going to production:

- [ ] Strong JWT secret key (32+ chars)
- [ ] Unique API keys generated
- [ ] HTTPS configured
- [ ] CORS restricted to your domains
- [ ] Rate limiting enabled
- [ ] Logging configured
- [ ] Credentials in `.env` only
- [ ] `.env` in `.gitignore`
- [ ] Regular backup strategy
- [ ] Monitoring/alerting setup
- [ ] Security headers verified
- [ ] Input validation tested
- [ ] SQL injection tests passed
- [ ] Authentication required on all endpoints

## Additional Resources

- [OWASP Security Guidelines](https://owasp.org/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [API Security Checklist](https://github.com/shieldfy/API-Security-Checklist)

## Support

For security issues or questions:
1. **Do not** post security vulnerabilities publicly
2. Review the security documentation
3. Test in a safe environment first
4. Follow responsible disclosure practices