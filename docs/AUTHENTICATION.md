# Authentication & Multi-tenancy Documentation

## Overview

PUO Memo V3 includes a comprehensive authentication and multi-tenancy system that provides:

- **Multiple authentication methods** (JWT, API Keys, OAuth)
- **Complete tenant isolation** for data privacy
- **Role-based access control** (RBAC)
- **Advanced security features** (MFA ready, password policies, rate limiting)
- **Session management** and audit logging

## Architecture

### Key Components

1. **Users**: Individual accounts with email/password or OAuth
2. **Tenants**: Isolated workspaces (organizations)
3. **Roles**: Permission sets (owner, admin, member, guest)
4. **API Keys**: Long-lived tokens for programmatic access
5. **Sessions**: Web session management

### Database Schema

```
tenants
  ├── users (many-to-one)
  ├── memories (many-to-one)
  ├── api_keys (many-to-one)
  └── settings (JSONB)

users
  ├── tenant_id (FK)
  ├── role (string)
  ├── permissions (via role_permissions)
  └── oauth_connections (one-to-many)

memories
  ├── tenant_id (FK) - ensures isolation
  ├── created_by (FK) - user reference
  └── visibility (private|team|public)
```

## Authentication Methods

### 1. Email/Password Authentication

**Registration**
```bash
POST /api/auth/register
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "full_name": "John Doe",
  "organization_name": "Acme Corp"  // Optional
}
```

**Login**
```bash
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}

Response:
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer",
  "expires_in": 1800
}
```

### 2. API Key Authentication

**Create API Key**
```bash
POST /api/auth/api-keys
Authorization: Bearer {access_token}
{
  "name": "Production API Key",
  "permissions": ["memories.read", "memories.create"],
  "expires_at": "2025-12-31T23:59:59Z"  // Optional
}

Response:
{
  "api_key": "puo_sk_live_...",
  "message": "Save this API key securely. It won't be shown again."
}
```

**Using API Keys**
```bash
GET /api/memories
Authorization: Bearer puo_sk_live_...
```

### 3. OAuth Integration

**Google OAuth**
```bash
# Get OAuth URL
GET /api/auth/oauth/google?redirect_uri=https://app.example.com/callback

# Handle callback
POST /api/auth/oauth/google/callback
{
  "code": "authorization_code",
  "redirect_uri": "https://app.example.com/callback"
}
```

**GitHub OAuth**
```bash
# Similar flow for GitHub
GET /api/auth/oauth/github?redirect_uri=...
POST /api/auth/oauth/github/callback
```

## Password Security

### Requirements

- Minimum 12 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one digit
- At least one special character (!@#$%^&*(),.?":{}|<>)

### Password Features

- **Password History**: Prevents reusing last 5 passwords
- **Change Password**: Requires current password verification
- **Password Reset**: Secure token-based reset flow
- **Account Lockout**: After 5 failed attempts (30 minutes)

## Token Management

### Access Tokens (JWT)

- Short-lived (30 minutes default)
- Contains user ID, email, tenant ID
- Used for API requests
- Cannot be revoked (use short expiry)

### Refresh Tokens

- Long-lived (30 days default)
- Stored in Redis
- Can be revoked
- Used to get new access tokens

**Refresh Token Flow**
```bash
POST /api/auth/refresh
{
  "refresh_token": "eyJ..."
}
```

## Multi-tenancy

### Tenant Isolation

All data is automatically isolated by tenant:

1. **Row-Level Security (RLS)**: PostgreSQL policies enforce isolation
2. **Tenant Context**: Set automatically from JWT/API key
3. **Query Filtering**: All queries filtered by tenant_id

### Tenant Management

**Get Tenant Info**
```bash
GET /api/auth/tenant
Authorization: Bearer {token}

Response:
{
  "id": "uuid",
  "name": "Acme Corp",
  "slug": "acme-corp",
  "plan": "pro",
  "settings": {
    "max_memories": 50000,
    "max_file_size_mb": 25,
    "features": ["semantic_search", "entity_extraction", "api_access"]
  }
}
```

### Inviting Users

**Send Invitation**
```bash
POST /api/auth/tenant/invite
Authorization: Bearer {token}
{
  "email": "newuser@example.com",
  "role": "member"
}
```

**Accept Invitation**
```bash
POST /api/auth/invite/{token}/accept
{
  "password": "SecurePass123!",
  "full_name": "New User"
}
```

## Roles and Permissions

### Default Roles

1. **Owner**
   - All permissions
   - Billing management
   - Cannot be removed

2. **Admin**
   - User management
   - All memory operations
   - Settings management

3. **Member**
   - Create, read, update, delete own memories
   - Read team memories
   - Basic operations

4. **Guest**
   - Read-only access
   - Limited to public/team content

### Permission System

```python
# Require specific permission
@router.get("/admin/users")
async def list_users(
    current_user: User = Depends(require_permission("users.read"))
):
    # Only users with 'users.read' permission can access
```

### Available Permissions

- `memories.create` - Create new memories
- `memories.read` - Read memories
- `memories.update` - Update memories
- `memories.delete` - Delete memories
- `memories.manage` - Manage all memories
- `users.read` - View user list
- `users.manage` - Manage users
- `tenants.manage` - Manage tenant settings
- `billing.manage` - Manage billing

## Memory Visibility

### Visibility Levels

1. **Private**: Only visible to creator
2. **Team**: Visible to all tenant members
3. **Public**: Visible to everyone (future: public API)

### Access Rules

```sql
-- User can see memory if:
visibility = 'public' OR
(visibility = 'team' AND same_tenant) OR
(visibility = 'private' AND is_creator)
```

## Session Management

### List Active Sessions
```bash
GET /api/auth/sessions
Authorization: Bearer {token}

Response:
[
  {
    "id": "session_id",
    "ip_address": "192.168.1.1",
    "user_agent": "Mozilla/5.0...",
    "created_at": "2024-01-15T10:00:00Z",
    "expires_at": "2024-01-15T11:00:00Z"
  }
]
```

### Revoke Session
```bash
DELETE /api/auth/sessions/{session_id}
Authorization: Bearer {token}
```

## Security Features

### Rate Limiting

- **Default**: 100 requests per minute per user
- **Configurable** via environment variables
- **Redis-based** tracking
- **Graceful degradation** if Redis unavailable

### Account Security

- **Email Verification**: Required for new accounts
- **Two-Factor Authentication**: MFA ready (TOTP)
- **Login Anomaly Detection**: Track unusual patterns
- **Audit Logging**: All security events logged

### API Security

- **CORS Configuration**: Whitelist allowed origins
- **HTTPS Only**: Enforce in production
- **Security Headers**: CSP, HSTS, X-Frame-Options
- **Request Validation**: Strict input validation

## Best Practices

### For Users

1. **Use Strong Passwords**: Follow password requirements
2. **Enable MFA**: When available
3. **Rotate API Keys**: Regularly update keys
4. **Monitor Sessions**: Check active sessions
5. **Use OAuth**: When possible for SSO

### For Developers

1. **Token Storage**:
   - Never store tokens in localStorage
   - Use httpOnly cookies for refresh tokens
   - Store access tokens in memory

2. **API Key Management**:
   - Use environment variables
   - Rotate keys regularly
   - Use minimal permissions
   - Monitor usage

3. **Error Handling**:
   - Don't expose internal errors
   - Log security events
   - Handle token expiry gracefully

## Troubleshooting

### Common Issues

**"Invalid token"**
- Token expired - refresh it
- Token malformed - check format
- Wrong token type - use access token

**"Rate limit exceeded"**
- Wait for window to reset (60s)
- Reduce request frequency
- Use batch operations

**"Tenant not found"**
- User not associated with tenant
- Tenant deactivated
- Database connection issue

**"Permission denied"**
- Insufficient role permissions
- Resource doesn't belong to tenant
- Visibility restrictions

### Debug Headers

In development, these headers help debugging:
```
X-Tenant-ID: Current tenant ID
X-User-ID: Current user ID
X-Rate-Limit-Remaining: Requests remaining
X-Rate-Limit-Reset: Reset timestamp
```

## Migration Guide

### From V2 to V3

1. **Add tenant_id to memories**:
   ```sql
   ALTER TABLE memories ADD COLUMN tenant_id UUID;
   UPDATE memories SET tenant_id = (SELECT id FROM tenants LIMIT 1);
   ALTER TABLE memories ALTER COLUMN tenant_id SET NOT NULL;
   ```

2. **Create default tenant**:
   ```sql
   INSERT INTO tenants (name, slug, plan) 
   VALUES ('Default', 'default', 'free');
   ```

3. **Migrate users**:
   ```sql
   UPDATE users SET tenant_id = (SELECT id FROM tenants LIMIT 1);
   ```

4. **Update API keys**:
   - Regenerate all API keys
   - Update client applications
   - Add tenant context

## Configuration

### Environment Variables

```bash
# JWT Configuration
JWT_SECRET_KEY=your-secret-key
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30
JWT_REFRESH_TOKEN_EXPIRE_DAYS=30

# Password Policy
MIN_PASSWORD_LENGTH=12
PASSWORD_HISTORY_COUNT=5
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=30

# OAuth Providers
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-secret

# Rate Limiting
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=60

# Security
ALLOWED_ORIGINS=https://app.puomemo.com,http://localhost:3000
ENABLE_MFA=true
```

## Monitoring

### Key Metrics

- `puomemo_auth_attempts_total` - Login attempts
- `puomemo_auth_failures_total` - Failed logins
- `puomemo_active_sessions` - Current sessions
- `puomemo_api_keys_created_total` - API keys created
- `puomemo_tenant_operations_total` - Per-tenant activity

### Audit Events

All security events are logged:
- User registration
- Login/logout
- Password changes
- Permission changes
- API key operations
- Failed authentication
- Rate limit violations