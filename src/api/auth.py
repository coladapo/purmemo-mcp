#!/usr/bin/env python3
"""
Authentication and Multi-tenancy System
Supports multiple auth methods and tenant isolation
"""

import os
import secrets
import hashlib
import hmac
import time
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass
import json
import re

from fastapi import HTTPException, Request, Depends, Header, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field, validator
import redis.asyncio as redis
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import httpx

# Configuration
@dataclass
class AuthConfig:
    # JWT Configuration
    secret_key: str = os.getenv('JWT_SECRET_KEY', secrets.token_urlsafe(32))
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30
    
    # Password Policy
    min_password_length: int = 12
    require_uppercase: bool = True
    require_lowercase: bool = True
    require_digits: bool = True
    require_special: bool = True
    password_history_count: int = 5
    
    # Security
    max_login_attempts: int = 5
    lockout_duration_minutes: int = 30
    mfa_enabled: bool = True
    
    # OAuth Providers
    google_client_id: str = os.getenv('GOOGLE_CLIENT_ID', '')
    google_client_secret: str = os.getenv('GOOGLE_CLIENT_SECRET', '')
    github_client_id: str = os.getenv('GITHUB_CLIENT_ID', '')
    github_client_secret: str = os.getenv('GITHUB_CLIENT_SECRET', '')
    
    # API Key Settings
    api_key_prefix: str = "puo_"
    api_key_length: int = 32

auth_config = AuthConfig()

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# HTTP Bearer
bearer_scheme = HTTPBearer(auto_error=False)

# Pydantic Models
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=auth_config.min_password_length)
    full_name: str = Field(..., min_length=1, max_length=255)
    organization_name: Optional[str] = Field(None, max_length=255)
    
    @validator('password')
    def validate_password(cls, v):
        """Validate password meets security requirements"""
        if auth_config.require_uppercase and not any(c.isupper() for c in v):
            raise ValueError('Password must contain at least one uppercase letter')
        if auth_config.require_lowercase and not any(c.islower() for c in v):
            raise ValueError('Password must contain at least one lowercase letter')
        if auth_config.require_digits and not any(c.isdigit() for c in v):
            raise ValueError('Password must contain at least one digit')
        if auth_config.require_special and not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError('Password must contain at least one special character')
        return v

class UserLogin(BaseModel):
    email: EmailStr
    password: str
    mfa_code: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int

class User(BaseModel):
    id: str
    email: str
    full_name: str
    is_active: bool
    is_verified: bool
    created_at: datetime
    tenant_id: str
    role: str
    permissions: List[str]

class Tenant(BaseModel):
    id: str
    name: str
    slug: str
    plan: str
    is_active: bool
    created_at: datetime
    settings: Dict[str, Any]

class ApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    permissions: List[str] = Field(default_factory=list)
    expires_at: Optional[datetime] = None

# Utility Functions
def generate_api_key() -> Tuple[str, str]:
    """Generate API key and its hash"""
    raw_key = secrets.token_urlsafe(auth_config.api_key_length)
    api_key = f"{auth_config.api_key_prefix}{raw_key}"
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()
    return api_key, key_hash

def hash_password(password: str) -> str:
    """Hash password using bcrypt"""
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash"""
    return pwd_context.verify(plain_password, hashed_password)

def create_token(data: dict, expires_delta: timedelta) -> str:
    """Create JWT token"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, auth_config.secret_key, algorithm=auth_config.algorithm)

def decode_token(token: str) -> dict:
    """Decode and validate JWT token"""
    try:
        payload = jwt.decode(token, auth_config.secret_key, algorithms=[auth_config.algorithm])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )

# Authentication Service
class AuthService:
    def __init__(self, db: AsyncSession, redis_client: redis.Redis):
        self.db = db
        self.redis = redis_client
    
    async def create_user(self, user_data: UserCreate, tenant_id: Optional[str] = None) -> User:
        """Create new user with tenant"""
        # Check if user exists
        result = await self.db.execute(
            text("SELECT id FROM users WHERE email = :email"),
            {"email": user_data.email}
        )
        if result.first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User already exists"
            )
        
        # Create or get tenant
        if not tenant_id:
            if user_data.organization_name:
                tenant_id = await self._create_tenant(user_data.organization_name)
            else:
                # Personal tenant
                tenant_id = await self._create_tenant(f"{user_data.email}'s Workspace")
        
        # Create user
        user_id = str(uuid.uuid4())
        password_hash = hash_password(user_data.password)
        
        await self.db.execute(
            text("""
                INSERT INTO users (
                    id, email, password_hash, full_name, tenant_id, 
                    role, is_active, is_verified, created_at
                )
                VALUES (
                    :id, :email, :password_hash, :full_name, :tenant_id,
                    :role, :is_active, :is_verified, :created_at
                )
            """),
            {
                "id": user_id,
                "email": user_data.email,
                "password_hash": password_hash,
                "full_name": user_data.full_name,
                "tenant_id": tenant_id,
                "role": "member",
                "is_active": True,
                "is_verified": False,
                "created_at": datetime.now(timezone.utc)
            }
        )
        
        # Create verification token
        verification_token = secrets.token_urlsafe(32)
        await self.redis.set(
            f"verification:{verification_token}",
            user_id,
            ex=86400  # 24 hours
        )
        
        await self.db.commit()
        
        # TODO: Send verification email
        
        return await self.get_user(user_id)
    
    async def authenticate_user(self, credentials: UserLogin) -> Tuple[User, TokenResponse]:
        """Authenticate user and return tokens"""
        # Check rate limit
        await self._check_rate_limit(credentials.email)
        
        # Get user
        result = await self.db.execute(
            text("""
                SELECT id, password_hash, is_active, is_verified, mfa_secret, tenant_id
                FROM users
                WHERE email = :email
            """),
            {"email": credentials.email}
        )
        row = result.first()
        
        if not row or not verify_password(credentials.password, row[1]):
            await self._record_failed_attempt(credentials.email)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials"
            )
        
        user_id, _, is_active, is_verified, mfa_secret, tenant_id = row
        
        # Check if user is active
        if not is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is disabled"
            )
        
        # Check MFA if enabled
        if mfa_secret and auth_config.mfa_enabled:
            if not credentials.mfa_code:
                raise HTTPException(
                    status_code=status.HTTP_428_PRECONDITION_REQUIRED,
                    detail="MFA code required"
                )
            # TODO: Verify MFA code
        
        # Clear failed attempts
        await self.redis.delete(f"failed_attempts:{credentials.email}")
        
        # Update last login
        await self.db.execute(
            text("UPDATE users SET last_login = :now WHERE id = :id"),
            {"now": datetime.now(timezone.utc), "id": user_id}
        )
        await self.db.commit()
        
        # Get full user data
        user = await self.get_user(user_id)
        
        # Create tokens
        access_token = create_token(
            {
                "sub": user_id,
                "email": credentials.email,
                "tenant_id": tenant_id,
                "type": "access"
            },
            timedelta(minutes=auth_config.access_token_expire_minutes)
        )
        
        refresh_token = create_token(
            {
                "sub": user_id,
                "type": "refresh"
            },
            timedelta(days=auth_config.refresh_token_expire_days)
        )
        
        # Store refresh token
        await self.redis.set(
            f"refresh_token:{refresh_token}",
            user_id,
            ex=auth_config.refresh_token_expire_days * 86400
        )
        
        return user, TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=auth_config.access_token_expire_minutes * 60
        )
    
    async def get_user(self, user_id: str) -> User:
        """Get user by ID"""
        result = await self.db.execute(
            text("""
                SELECT 
                    u.id, u.email, u.full_name, u.is_active, u.is_verified,
                    u.created_at, u.tenant_id, u.role,
                    COALESCE(
                        ARRAY_AGG(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL),
                        ARRAY[]::text[]
                    ) as permissions
                FROM users u
                LEFT JOIN role_permissions rp ON u.role = rp.role
                LEFT JOIN permissions p ON rp.permission_id = p.id
                WHERE u.id = :user_id
                GROUP BY u.id, u.email, u.full_name, u.is_active, u.is_verified,
                         u.created_at, u.tenant_id, u.role
            """),
            {"user_id": user_id}
        )
        
        row = result.first()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        return User(
            id=row[0],
            email=row[1],
            full_name=row[2],
            is_active=row[3],
            is_verified=row[4],
            created_at=row[5],
            tenant_id=row[6],
            role=row[7],
            permissions=row[8] or []
        )
    
    async def create_api_key(self, user_id: str, key_data: ApiKeyCreate) -> str:
        """Create API key for user"""
        api_key, key_hash = generate_api_key()
        
        await self.db.execute(
            text("""
                INSERT INTO api_keys (
                    id, user_id, key_hash, name, permissions,
                    created_at, expires_at, is_active
                )
                VALUES (
                    :id, :user_id, :key_hash, :name, :permissions,
                    :created_at, :expires_at, :is_active
                )
            """),
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "key_hash": key_hash,
                "name": key_data.name,
                "permissions": json.dumps(key_data.permissions),
                "created_at": datetime.now(timezone.utc),
                "expires_at": key_data.expires_at,
                "is_active": True
            }
        )
        await self.db.commit()
        
        # Return the actual key (only shown once)
        return api_key
    
    async def _create_tenant(self, name: str) -> str:
        """Create new tenant"""
        tenant_id = str(uuid.uuid4())
        slug = re.sub(r'[^a-z0-9-]', '-', name.lower()).strip('-')
        
        # Ensure unique slug
        counter = 1
        original_slug = slug
        while True:
            result = await self.db.execute(
                text("SELECT id FROM tenants WHERE slug = :slug"),
                {"slug": slug}
            )
            if not result.first():
                break
            slug = f"{original_slug}-{counter}"
            counter += 1
        
        await self.db.execute(
            text("""
                INSERT INTO tenants (
                    id, name, slug, plan, is_active, 
                    created_at, settings
                )
                VALUES (
                    :id, :name, :slug, :plan, :is_active,
                    :created_at, :settings
                )
            """),
            {
                "id": tenant_id,
                "name": name,
                "slug": slug,
                "plan": "free",
                "is_active": True,
                "created_at": datetime.now(timezone.utc),
                "settings": json.dumps({
                    "max_memories": 10000,
                    "max_file_size_mb": 10,
                    "features": ["semantic_search", "entity_extraction"]
                })
            }
        )
        
        return tenant_id
    
    async def _check_rate_limit(self, email: str):
        """Check login rate limit"""
        key = f"failed_attempts:{email}"
        attempts = await self.redis.get(key)
        
        if attempts and int(attempts) >= auth_config.max_login_attempts:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many login attempts. Try again in {auth_config.lockout_duration_minutes} minutes"
            )
    
    async def _record_failed_attempt(self, email: str):
        """Record failed login attempt"""
        key = f"failed_attempts:{email}"
        await self.redis.incr(key)
        await self.redis.expire(key, auth_config.lockout_duration_minutes * 60)

# OAuth Providers
class OAuthProvider:
    """Base OAuth provider"""
    
    def __init__(self, client_id: str, client_secret: str):
        self.client_id = client_id
        self.client_secret = client_secret
    
    async def get_user_info(self, access_token: str) -> dict:
        """Get user info from OAuth provider"""
        raise NotImplementedError

class GoogleOAuth(OAuthProvider):
    """Google OAuth provider"""
    
    async def get_user_info(self, access_token: str) -> dict:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            response.raise_for_status()
            return response.json()

class GitHubOAuth(OAuthProvider):
    """GitHub OAuth provider"""
    
    async def get_user_info(self, access_token: str) -> dict:
        async with httpx.AsyncClient() as client:
            # Get user info
            response = await client.get(
                "https://api.github.com/user",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            response.raise_for_status()
            user_data = response.json()
            
            # Get primary email
            response = await client.get(
                "https://api.github.com/user/emails",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            response.raise_for_status()
            emails = response.json()
            
            primary_email = next(
                (email["email"] for email in emails if email["primary"]),
                user_data.get("email")
            )
            
            return {
                "id": str(user_data["id"]),
                "email": primary_email,
                "name": user_data.get("name", user_data["login"]),
                "picture": user_data.get("avatar_url")
            }

# Dependency injection
async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)
) -> User:
    """Get current authenticated user from JWT or API key"""
    
    # Check JWT token first
    if credentials and credentials.scheme == "Bearer":
        token = credentials.credentials
        
        # Check if it's an API key
        if token.startswith(auth_config.api_key_prefix):
            return await _get_user_from_api_key(token, db)
        
        # Otherwise, it's a JWT token
        payload = decode_token(token)
        
        if payload.get("type") != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type"
            )
        
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
        
        # Get user from database
        auth_service = AuthService(db, redis_client)
        return await auth_service.get_user(user_id)
    
    # No valid credentials
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated"
    )

async def _get_user_from_api_key(api_key: str, db: AsyncSession) -> User:
    """Get user from API key"""
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()
    
    result = await db.execute(
        text("""
            SELECT user_id, expires_at, is_active
            FROM api_keys
            WHERE key_hash = :key_hash
        """),
        {"key_hash": key_hash}
    )
    row = result.first()
    
    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key"
        )
    
    user_id, expires_at, is_active = row
    
    if not is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key is disabled"
        )
    
    if expires_at and expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key has expired"
        )
    
    # Update last used
    await db.execute(
        text("UPDATE api_keys SET last_used = :now WHERE key_hash = :key_hash"),
        {"now": datetime.now(timezone.utc), "key_hash": key_hash}
    )
    await db.commit()
    
    # Get user
    auth_service = AuthService(db, None)
    return await auth_service.get_user(user_id)

# Permission checks
def require_permission(permission: str):
    """Decorator to require specific permission"""
    async def permission_checker(current_user: User = Depends(get_current_user)):
        if permission not in current_user.permissions and "admin" not in current_user.permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission required: {permission}"
            )
        return current_user
    return permission_checker

# Tenant isolation
async def get_current_tenant(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Tenant:
    """Get current tenant from user"""
    result = await db.execute(
        text("""
            SELECT id, name, slug, plan, is_active, created_at, settings
            FROM tenants
            WHERE id = :tenant_id
        """),
        {"tenant_id": current_user.tenant_id}
    )
    
    row = result.first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found"
        )
    
    return Tenant(
        id=row[0],
        name=row[1],
        slug=row[2],
        plan=row[3],
        is_active=row[4],
        created_at=row[5],
        settings=json.loads(row[6]) if row[6] else {}
    )

# Multi-tenancy query filter
def tenant_filter(query: str, tenant_id: str) -> str:
    """Add tenant filter to SQL query"""
    # Simple implementation - in production, use proper SQL parsing
    if "WHERE" in query.upper():
        return query.replace("WHERE", f"WHERE tenant_id = '{tenant_id}' AND")
    else:
        return f"{query} WHERE tenant_id = '{tenant_id}'"

# Session management
class SessionManager:
    """Manage user sessions"""
    
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
    
    async def create_session(self, user_id: str, metadata: dict) -> str:
        """Create new session"""
        session_id = secrets.token_urlsafe(32)
        session_data = {
            "user_id": user_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "metadata": metadata
        }
        
        await self.redis.set(
            f"session:{session_id}",
            json.dumps(session_data),
            ex=3600  # 1 hour
        )
        
        return session_id
    
    async def get_session(self, session_id: str) -> Optional[dict]:
        """Get session data"""
        data = await self.redis.get(f"session:{session_id}")
        return json.loads(data) if data else None
    
    async def extend_session(self, session_id: str, seconds: int = 3600):
        """Extend session expiry"""
        await self.redis.expire(f"session:{session_id}", seconds)
    
    async def destroy_session(self, session_id: str):
        """Destroy session"""
        await self.redis.delete(f"session:{session_id}")

import uuid  # Add this import at the top