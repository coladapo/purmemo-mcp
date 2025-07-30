#!/usr/bin/env python3
"""
Authentication API Endpoints
Handles user registration, login, and session management
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, List
import logging

from fastapi import APIRouter, Depends, HTTPException, status, Request, Response, BackgroundTasks
from fastapi.security import OAuth2AuthorizationCodeBearer
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as redis

from auth import (
    AuthService, AuthConfig, User, Tenant,
    UserCreate, UserLogin, TokenResponse, ApiKeyCreate,
    get_current_user, get_current_tenant, require_permission,
    GoogleOAuth, GitHubOAuth, SessionManager,
    auth_config
)

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/auth", tags=["authentication"])

# OAuth2 schemes
google_oauth_scheme = OAuth2AuthorizationCodeBearer(
    authorizationUrl="https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl="https://oauth2.googleapis.com/token",
    auto_error=False
)

github_oauth_scheme = OAuth2AuthorizationCodeBearer(
    authorizationUrl="https://github.com/login/oauth/authorize",
    tokenUrl="https://github.com/login/oauth/access_token",
    auto_error=False
)

# Endpoints
@router.post("/register", response_model=User, status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    """Register a new user"""
    auth_service = AuthService(db, redis_client)
    user = await auth_service.create_user(user_data)
    
    return user

@router.post("/login", response_model=TokenResponse)
async def login(
    credentials: UserLogin,
    response: Response,
    db: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    """Login with email and password"""
    auth_service = AuthService(db, redis_client)
    user, tokens = await auth_service.authenticate_user(credentials)
    
    # Set secure cookie for web clients
    response.set_cookie(
        key="refresh_token",
        value=tokens.refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=auth_config.refresh_token_expire_days * 86400
    )
    
    return tokens

@router.post("/logout")
async def logout(
    response: Response,
    current_user: User = Depends(get_current_user),
    redis_client: redis.Redis = Depends(get_redis)
):
    """Logout current user"""
    # Clear refresh token from Redis
    # Note: In production, you'd also invalidate the JWT token
    
    # Clear cookie
    response.delete_cookie("refresh_token")
    
    return {"message": "Logged out successfully"}

@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    refresh_token: str,
    db: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    """Refresh access token using refresh token"""
    # Verify refresh token
    try:
        payload = decode_token(refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type"
            )
        
        user_id = payload.get("sub")
        
        # Check if refresh token is still valid in Redis
        stored_user_id = await redis_client.get(f"refresh_token:{refresh_token}")
        if not stored_user_id or stored_user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )
        
        # Get user
        auth_service = AuthService(db, redis_client)
        user = await auth_service.get_user(user_id)
        
        # Create new tokens
        access_token = create_token(
            {
                "sub": user_id,
                "email": user.email,
                "tenant_id": user.tenant_id,
                "type": "access"
            },
            timedelta(minutes=auth_config.access_token_expire_minutes)
        )
        
        # Optionally rotate refresh token
        new_refresh_token = create_token(
            {"sub": user_id, "type": "refresh"},
            timedelta(days=auth_config.refresh_token_expire_days)
        )
        
        # Store new refresh token
        await redis_client.set(
            f"refresh_token:{new_refresh_token}",
            user_id,
            ex=auth_config.refresh_token_expire_days * 86400
        )
        
        # Invalidate old refresh token
        await redis_client.delete(f"refresh_token:{refresh_token}")
        
        return TokenResponse(
            access_token=access_token,
            refresh_token=new_refresh_token,
            expires_in=auth_config.access_token_expire_minutes * 60
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )

@router.get("/me", response_model=User)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user)
):
    """Get current user profile"""
    return current_user

@router.put("/me", response_model=User)
async def update_profile(
    full_name: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update current user profile"""
    if full_name:
        await db.execute(
            text("UPDATE users SET full_name = :full_name WHERE id = :id"),
            {"full_name": full_name, "id": current_user.id}
        )
        await db.commit()
        current_user.full_name = full_name
    
    return current_user

@router.post("/change-password")
async def change_password(
    current_password: str,
    new_password: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Change password for current user"""
    # Verify current password
    result = await db.execute(
        text("SELECT password_hash FROM users WHERE id = :id"),
        {"id": current_user.id}
    )
    row = result.first()
    
    if not row or not verify_password(current_password, row[0]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect"
        )
    
    # Validate new password
    try:
        UserCreate(
            email=current_user.email,
            password=new_password,
            full_name=current_user.full_name
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    
    # Check password history
    if auth_config.password_history_count > 0:
        history_result = await db.execute(
            text("""
                SELECT password_hash FROM password_history
                WHERE user_id = :user_id
                ORDER BY created_at DESC
                LIMIT :limit
            """),
            {"user_id": current_user.id, "limit": auth_config.password_history_count}
        )
        
        for row in history_result:
            if verify_password(new_password, row[0]):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Password has been used recently. Please choose a different password."
                )
    
    # Update password
    new_password_hash = hash_password(new_password)
    await db.execute(
        text("UPDATE users SET password_hash = :password_hash WHERE id = :id"),
        {"password_hash": new_password_hash, "id": current_user.id}
    )
    
    # Add to password history
    await db.execute(
        text("""
            INSERT INTO password_history (user_id, password_hash)
            VALUES (:user_id, :password_hash)
        """),
        {"user_id": current_user.id, "password_hash": new_password_hash}
    )
    
    await db.commit()
    
    return {"message": "Password changed successfully"}

# API Key Management
@router.post("/api-keys", response_model=dict)
async def create_api_key(
    key_data: ApiKeyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    """Create a new API key"""
    auth_service = AuthService(db, redis_client)
    api_key = await auth_service.create_api_key(current_user.id, key_data)
    
    return {
        "api_key": api_key,
        "message": "Save this API key securely. It won't be shown again."
    }

@router.get("/api-keys", response_model=List[dict])
async def list_api_keys(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List user's API keys"""
    result = await db.execute(
        text("""
            SELECT id, name, permissions, created_at, last_used, expires_at, is_active
            FROM api_keys
            WHERE user_id = :user_id
            ORDER BY created_at DESC
        """),
        {"user_id": current_user.id}
    )
    
    keys = []
    for row in result:
        keys.append({
            "id": str(row[0]),
            "name": row[1],
            "permissions": json.loads(row[2]) if row[2] else [],
            "created_at": row[3].isoformat(),
            "last_used": row[4].isoformat() if row[4] else None,
            "expires_at": row[5].isoformat() if row[5] else None,
            "is_active": row[6]
        })
    
    return keys

@router.delete("/api-keys/{key_id}")
async def revoke_api_key(
    key_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Revoke an API key"""
    result = await db.execute(
        text("""
            UPDATE api_keys 
            SET is_active = false 
            WHERE id = :key_id AND user_id = :user_id
        """),
        {"key_id": key_id, "user_id": current_user.id}
    )
    
    if result.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found"
        )
    
    await db.commit()
    
    return {"message": "API key revoked"}

# OAuth endpoints
@router.get("/oauth/google")
async def google_oauth_url(
    redirect_uri: str,
    state: Optional[str] = None
):
    """Get Google OAuth URL"""
    params = {
        "client_id": auth_config.google_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent"
    }
    
    if state:
        params["state"] = state
    
    from urllib.parse import urlencode
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    
    return {"auth_url": auth_url}

@router.post("/oauth/google/callback", response_model=TokenResponse)
async def google_oauth_callback(
    code: str,
    redirect_uri: str,
    db: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    """Handle Google OAuth callback"""
    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": auth_config.google_client_id,
                "client_secret": auth_config.google_client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code"
            }
        )
        
        if response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to exchange code for token"
            )
        
        token_data = response.json()
    
    # Get user info
    google_oauth = GoogleOAuth(
        auth_config.google_client_id,
        auth_config.google_client_secret
    )
    user_info = await google_oauth.get_user_info(token_data["access_token"])
    
    # Find or create user
    result = await db.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": user_info["email"]}
    )
    row = result.first()
    
    auth_service = AuthService(db, redis_client)
    
    if row:
        # Existing user
        user = await auth_service.get_user(row[0])
    else:
        # Create new user
        user = await auth_service.create_user(
            UserCreate(
                email=user_info["email"],
                password=secrets.token_urlsafe(32),  # Random password
                full_name=user_info.get("name", user_info["email"])
            )
        )
        
        # Mark as verified since it's OAuth
        await db.execute(
            text("UPDATE users SET is_verified = true WHERE id = :id"),
            {"id": user.id}
        )
        await db.commit()
    
    # Store OAuth connection
    await db.execute(
        text("""
            INSERT INTO oauth_connections (
                user_id, provider, provider_user_id, 
                access_token, refresh_token, expires_at
            )
            VALUES (:user_id, :provider, :provider_user_id, 
                    :access_token, :refresh_token, :expires_at)
            ON CONFLICT (provider, provider_user_id) 
            DO UPDATE SET 
                access_token = EXCLUDED.access_token,
                refresh_token = EXCLUDED.refresh_token,
                expires_at = EXCLUDED.expires_at,
                updated_at = CURRENT_TIMESTAMP
        """),
        {
            "user_id": user.id,
            "provider": "google",
            "provider_user_id": user_info["id"],
            "access_token": token_data["access_token"],
            "refresh_token": token_data.get("refresh_token"),
            "expires_at": datetime.now(timezone.utc) + timedelta(seconds=token_data["expires_in"])
        }
    )
    await db.commit()
    
    # Create tokens
    access_token = create_token(
        {
            "sub": user.id,
            "email": user.email,
            "tenant_id": user.tenant_id,
            "type": "access"
        },
        timedelta(minutes=auth_config.access_token_expire_minutes)
    )
    
    refresh_token = create_token(
        {"sub": user.id, "type": "refresh"},
        timedelta(days=auth_config.refresh_token_expire_days)
    )
    
    # Store refresh token
    await redis_client.set(
        f"refresh_token:{refresh_token}",
        user.id,
        ex=auth_config.refresh_token_expire_days * 86400
    )
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=auth_config.access_token_expire_minutes * 60
    )

# Tenant Management
@router.get("/tenant", response_model=Tenant)
async def get_current_tenant_info(
    current_tenant: Tenant = Depends(get_current_tenant)
):
    """Get current tenant information"""
    return current_tenant

@router.get("/tenant/users", response_model=List[dict])
async def list_tenant_users(
    current_user: User = Depends(require_permission("users.read")),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
):
    """List users in current tenant"""
    result = await db.execute(
        text("""
            SELECT id, email, full_name, role, is_active, created_at, last_login
            FROM users
            WHERE tenant_id = :tenant_id
            ORDER BY created_at DESC
        """),
        {"tenant_id": current_tenant.id}
    )
    
    users = []
    for row in result:
        users.append({
            "id": str(row[0]),
            "email": row[1],
            "full_name": row[2],
            "role": row[3],
            "is_active": row[4],
            "created_at": row[5].isoformat(),
            "last_login": row[6].isoformat() if row[6] else None
        })
    
    return users

@router.post("/tenant/invite")
async def invite_user(
    email: EmailStr,
    role: str = "member",
    current_user: User = Depends(require_permission("users.manage")),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """Invite a user to the tenant"""
    # Check if user already exists in tenant
    result = await db.execute(
        text("""
            SELECT id FROM users 
            WHERE email = :email AND tenant_id = :tenant_id
        """),
        {"email": email, "tenant_id": current_tenant.id}
    )
    
    if result.first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User already exists in this tenant"
        )
    
    # Create invitation
    invitation_token = secrets.token_urlsafe(32)
    
    await db.execute(
        text("""
            INSERT INTO invitations (
                tenant_id, email, role, invited_by, token, expires_at
            )
            VALUES (
                :tenant_id, :email, :role, :invited_by, :token, :expires_at
            )
        """),
        {
            "tenant_id": current_tenant.id,
            "email": email,
            "role": role,
            "invited_by": current_user.id,
            "token": invitation_token,
            "expires_at": datetime.now(timezone.utc) + timedelta(days=7)
        }
    )
    await db.commit()
    
    # TODO: Send invitation email
    # background_tasks.add_task(send_invitation_email, email, invitation_token)
    
    return {
        "message": "Invitation sent",
        "invitation_link": f"/invite/{invitation_token}"
    }

# Session Management
@router.get("/sessions", response_model=List[dict])
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List active sessions for current user"""
    result = await db.execute(
        text("""
            SELECT id, ip_address, user_agent, created_at, expires_at
            FROM user_sessions
            WHERE user_id = :user_id AND expires_at > CURRENT_TIMESTAMP
            ORDER BY created_at DESC
        """),
        {"user_id": current_user.id}
    )
    
    sessions = []
    for row in result:
        sessions.append({
            "id": str(row[0]),
            "ip_address": str(row[1]) if row[1] else None,
            "user_agent": row[2],
            "created_at": row[3].isoformat(),
            "expires_at": row[4].isoformat()
        })
    
    return sessions

@router.delete("/sessions/{session_id}")
async def revoke_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Revoke a specific session"""
    result = await db.execute(
        text("""
            DELETE FROM user_sessions
            WHERE id = :session_id AND user_id = :user_id
        """),
        {"session_id": session_id, "user_id": current_user.id}
    )
    
    if result.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    await db.commit()
    
    return {"message": "Session revoked"}

# Verification
@router.post("/verify/{token}")
async def verify_email(
    token: str,
    db: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    """Verify email address"""
    # Get user ID from Redis
    user_id = await redis_client.get(f"verification:{token}")
    
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token"
        )
    
    # Update user
    await db.execute(
        text("UPDATE users SET is_verified = true WHERE id = :id"),
        {"id": user_id}
    )
    await db.commit()
    
    # Delete token
    await redis_client.delete(f"verification:{token}")
    
    return {"message": "Email verified successfully"}

# Password Reset
@router.post("/forgot-password")
async def forgot_password(
    email: EmailStr,
    db: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """Request password reset"""
    # Check if user exists
    result = await db.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": email}
    )
    row = result.first()
    
    if row:
        # Create reset token
        reset_token = secrets.token_urlsafe(32)
        await redis_client.set(
            f"password_reset:{reset_token}",
            row[0],
            ex=3600  # 1 hour
        )
        
        # TODO: Send reset email
        # background_tasks.add_task(send_reset_email, email, reset_token)
    
    # Always return success to prevent email enumeration
    return {"message": "If the email exists, a reset link has been sent"}

@router.post("/reset-password")
async def reset_password(
    token: str,
    new_password: str,
    db: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    """Reset password with token"""
    # Get user ID from Redis
    user_id = await redis_client.get(f"password_reset:{token}")
    
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )
    
    # Validate password
    try:
        # Mock user for validation
        UserCreate(
            email="test@example.com",
            password=new_password,
            full_name="Test"
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    
    # Update password
    password_hash = hash_password(new_password)
    await db.execute(
        text("UPDATE users SET password_hash = :password_hash WHERE id = :id"),
        {"password_hash": password_hash, "id": user_id}
    )
    
    # Add to password history
    await db.execute(
        text("""
            INSERT INTO password_history (user_id, password_hash)
            VALUES (:user_id, :password_hash)
        """),
        {"user_id": user_id, "password_hash": password_hash}
    )
    
    await db.commit()
    
    # Delete reset token
    await redis_client.delete(f"password_reset:{token}")
    
    return {"message": "Password reset successfully"}

# Import missing dependencies
from sqlalchemy import text
from auth import (
    create_token, decode_token, hash_password, verify_password,
    get_db, get_redis
)
import secrets
import json
import httpx