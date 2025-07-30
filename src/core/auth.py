"""
Authentication and authorization module for PUO Memo
Provides JWT authentication for API and API key validation for MCP
"""
import jwt
import bcrypt
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from functools import wraps
import logging

from fastapi import HTTPException, Security, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, APIKeyHeader
from passlib.context import CryptContext

from src.utils.config import get_settings

logger = logging.getLogger(__name__)

# Security schemes
security_bearer = HTTPBearer()
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

# Password context for hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class AuthManager:
    """Manages authentication and authorization"""
    
    def __init__(self):
        self.settings = get_settings()
        self._validate_config()
    
    def _validate_config(self):
        """Validate authentication configuration"""
        if not self.settings.jwt_secret_key:
            logger.warning("JWT_SECRET_KEY not configured - authentication disabled")
        elif len(self.settings.jwt_secret_key) < 32:
            logger.warning("JWT_SECRET_KEY should be at least 32 characters for security")
    
    def generate_jwt_token(self, user_id: str, metadata: Optional[Dict[str, Any]] = None) -> str:
        """Generate a JWT token for a user"""
        if not self.settings.jwt_secret_key:
            raise ValueError("JWT_SECRET_KEY not configured")
        
        payload = {
            "sub": user_id,
            "exp": datetime.now(timezone.utc) + timedelta(hours=self.settings.jwt_expiration_hours),
            "iat": datetime.now(timezone.utc),
            "jti": secrets.token_urlsafe(16),  # Unique token ID
        }
        
        if metadata:
            payload.update(metadata)
        
        return jwt.encode(payload, self.settings.jwt_secret_key, algorithm=self.settings.jwt_algorithm)
    
    def verify_jwt_token(self, token: str) -> Dict[str, Any]:
        """Verify and decode a JWT token"""
        if not self.settings.jwt_secret_key:
            raise ValueError("JWT_SECRET_KEY not configured")
        
        try:
            payload = jwt.decode(
                token, 
                self.settings.jwt_secret_key, 
                algorithms=[self.settings.jwt_algorithm]
            )
            return payload
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except jwt.InvalidTokenError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
                headers={"WWW-Authenticate": "Bearer"},
            )
    
    def verify_api_key(self, api_key: str) -> bool:
        """Verify an API key"""
        if not self.settings.api_key:
            logger.warning("API_KEY not configured - API key validation disabled")
            return True
        
        return secrets.compare_digest(api_key, self.settings.api_key)
    
    def hash_password(self, password: str) -> str:
        """Hash a password using bcrypt"""
        return pwd_context.hash(password)
    
    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify a password against a hash"""
        return pwd_context.verify(plain_password, hashed_password)
    
    def generate_api_key(self) -> str:
        """Generate a secure API key"""
        return f"puo_{secrets.token_urlsafe(32)}"


# Create singleton instance
auth_manager = AuthManager()


# FastAPI Dependencies
async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security_bearer)) -> Dict[str, Any]:
    """FastAPI dependency to get current user from JWT token"""
    token = credentials.credentials
    return auth_manager.verify_jwt_token(token)


async def verify_api_key_dep(api_key: Optional[str] = Security(api_key_header)) -> bool:
    """FastAPI dependency to verify API key"""
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key required",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    
    if not auth_manager.verify_api_key(api_key):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid API key",
        )
    
    return True


# Optional authentication dependency
async def get_current_user_optional(
    authorization: Optional[HTTPAuthorizationCredentials] = Security(HTTPBearer(auto_error=False))
) -> Optional[Dict[str, Any]]:
    """Optional authentication - returns None if no valid token"""
    if not authorization:
        return None
    
    try:
        return auth_manager.verify_jwt_token(authorization.credentials)
    except HTTPException:
        return None


# Decorator for regular functions
def require_auth(func):
    """Decorator to require authentication for a function"""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        # This is a simplified version - in practice, you'd extract the token from the request
        # For now, this serves as a placeholder
        return await func(*args, **kwargs)
    return wrapper