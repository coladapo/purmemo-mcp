"""
PUO Memo Python SDK
Official Python client for PUO Memo API
"""

from typing import List, Optional, Dict, Any, Union
from datetime import datetime
import os
import time
import json
import logging
from urllib.parse import urlencode

import httpx
from pydantic import BaseModel, Field, ValidationError

__version__ = "1.0.0"
__author__ = "PUO Memo Team"

logger = logging.getLogger(__name__)


class PuoMemoError(Exception):
    """Base exception for PUO Memo SDK"""
    pass


class AuthenticationError(PuoMemoError):
    """Authentication failed"""
    pass


class RateLimitError(PuoMemoError):
    """Rate limit exceeded"""
    def __init__(self, message: str, retry_after: Optional[int] = None):
        super().__init__(message)
        self.retry_after = retry_after


class ValidationError(PuoMemoError):
    """Input validation failed"""
    pass


class Memory(BaseModel):
    """Memory model"""
    id: Optional[str] = None
    content: str
    title: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    visibility: str = "private"
    has_embedding: Optional[bool] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by: Optional[str] = None
    tenant_id: Optional[str] = None


class SearchResult(BaseModel):
    """Search result model"""
    results: List[Memory]
    total: int
    search_type: str
    query: str
    limit: int
    offset: int


class TokenResponse(BaseModel):
    """Token response model"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class User(BaseModel):
    """User model"""
    id: str
    email: str
    full_name: str
    is_active: bool
    is_verified: bool
    created_at: datetime
    tenant_id: str
    role: str
    permissions: List[str]


class PuoMemoClient:
    """
    PUO Memo API Client
    
    Example:
        ```python
        from puomemo import PuoMemoClient
        
        # Using API key
        client = PuoMemoClient(api_key="puo_sk_...")
        
        # Using email/password
        client = PuoMemoClient()
        client.login("user@example.com", "password")
        
        # Create memory
        memory = client.create_memory(
            content="Important information",
            tags=["work", "project"]
        )
        
        # Search memories
        results = client.search("project updates")
        ```
    """
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 30.0,
        max_retries: int = 3,
        retry_delay: float = 1.0
    ):
        """
        Initialize PUO Memo client
        
        Args:
            api_key: API key for authentication
            base_url: API base URL (defaults to environment variable)
            timeout: Request timeout in seconds
            max_retries: Maximum number of retry attempts
            retry_delay: Initial delay between retries (exponential backoff)
        """
        self.api_key = api_key or os.getenv("PUO_MEMO_API_KEY")
        self.base_url = (base_url or os.getenv("PUO_MEMO_API_URL", "https://api.puomemo.com")).rstrip("/")
        self.timeout = timeout
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        
        self._access_token: Optional[str] = None
        self._refresh_token: Optional[str] = None
        self._token_expires_at: Optional[float] = None
        
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=timeout,
            headers={"User-Agent": f"puomemo-python/{__version__}"}
        )
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
    
    async def close(self):
        """Close the HTTP client"""
        await self._client.aclose()
    
    def _get_auth_headers(self) -> Dict[str, str]:
        """Get authentication headers"""
        if self._access_token and self._token_expires_at:
            # Check if token is expired
            if time.time() >= self._token_expires_at - 60:  # Refresh 1 minute before expiry
                # Token expired, need to refresh
                raise AuthenticationError("Access token expired. Please refresh.")
            return {"Authorization": f"Bearer {self._access_token}"}
        elif self.api_key:
            return {"Authorization": f"Bearer {self.api_key}"}
        else:
            raise AuthenticationError("No authentication credentials provided")
    
    async def _request(
        self,
        method: str,
        path: str,
        **kwargs
    ) -> httpx.Response:
        """Make an authenticated request with retry logic"""
        headers = kwargs.pop("headers", {})
        
        # Add auth headers
        try:
            headers.update(self._get_auth_headers())
        except AuthenticationError:
            if self._refresh_token:
                await self.refresh_token()
                headers.update(self._get_auth_headers())
            else:
                raise
        
        # Retry logic
        last_error = None
        for attempt in range(self.max_retries):
            try:
                response = await self._client.request(
                    method,
                    path,
                    headers=headers,
                    **kwargs
                )
                
                # Check for rate limiting
                if response.status_code == 429:
                    retry_after = int(response.headers.get("Retry-After", 60))
                    raise RateLimitError(
                        f"Rate limit exceeded. Retry after {retry_after} seconds.",
                        retry_after=retry_after
                    )
                
                # Check for auth errors
                if response.status_code == 401:
                    raise AuthenticationError("Authentication failed")
                
                # Raise for other errors
                response.raise_for_status()
                
                return response
                
            except (httpx.TimeoutException, httpx.ConnectError) as e:
                last_error = e
                if attempt < self.max_retries - 1:
                    delay = self.retry_delay * (2 ** attempt)  # Exponential backoff
                    logger.warning(f"Request failed, retrying in {delay}s: {e}")
                    await asyncio.sleep(delay)
                else:
                    raise PuoMemoError(f"Request failed after {self.max_retries} attempts: {e}")
        
        raise last_error
    
    # Authentication methods
    async def login(self, email: str, password: str) -> User:
        """
        Login with email and password
        
        Args:
            email: User email
            password: User password
            
        Returns:
            User object
        """
        response = await self._client.post(
            "/api/auth/login",
            json={"email": email, "password": password}
        )
        
        if response.status_code != 200:
            raise AuthenticationError(f"Login failed: {response.text}")
        
        data = response.json()
        token_response = TokenResponse(**data)
        
        # Store tokens
        self._access_token = token_response.access_token
        self._refresh_token = token_response.refresh_token
        self._token_expires_at = time.time() + token_response.expires_in
        
        # Get user info
        return await self.get_current_user()
    
    async def register(
        self,
        email: str,
        password: str,
        full_name: str,
        organization_name: Optional[str] = None
    ) -> User:
        """
        Register a new user
        
        Args:
            email: User email
            password: User password (min 12 chars)
            full_name: User's full name
            organization_name: Optional organization name
            
        Returns:
            User object
        """
        response = await self._client.post(
            "/api/auth/register",
            json={
                "email": email,
                "password": password,
                "full_name": full_name,
                "organization_name": organization_name
            }
        )
        
        if response.status_code != 201:
            raise PuoMemoError(f"Registration failed: {response.text}")
        
        return User(**response.json())
    
    async def refresh_token(self) -> TokenResponse:
        """Refresh access token"""
        if not self._refresh_token:
            raise AuthenticationError("No refresh token available")
        
        response = await self._client.post(
            "/api/auth/refresh",
            json={"refresh_token": self._refresh_token}
        )
        
        if response.status_code != 200:
            raise AuthenticationError(f"Token refresh failed: {response.text}")
        
        data = response.json()
        token_response = TokenResponse(**data)
        
        # Update tokens
        self._access_token = token_response.access_token
        self._refresh_token = token_response.refresh_token
        self._token_expires_at = time.time() + token_response.expires_in
        
        return token_response
    
    async def logout(self):
        """Logout and clear tokens"""
        try:
            await self._request("POST", "/api/auth/logout")
        except:
            pass  # Ignore logout errors
        
        # Clear tokens
        self._access_token = None
        self._refresh_token = None
        self._token_expires_at = None
    
    async def get_current_user(self) -> User:
        """Get current user information"""
        response = await self._request("GET", "/api/auth/me")
        return User(**response.json())
    
    # Memory operations
    async def create_memory(
        self,
        content: str,
        title: Optional[str] = None,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        visibility: str = "private",
        generate_embedding: bool = True
    ) -> Memory:
        """
        Create a new memory
        
        Args:
            content: Memory content
            title: Optional title
            tags: Optional tags
            metadata: Optional metadata
            visibility: Visibility level (private, team, public)
            generate_embedding: Whether to generate embedding
            
        Returns:
            Created memory
        """
        data = {
            "content": content,
            "visibility": visibility,
            "generate_embedding": generate_embedding
        }
        
        if title:
            data["title"] = title
        if tags:
            data["tags"] = tags
        if metadata:
            data["metadata"] = metadata
        
        response = await self._request("POST", "/api/memories", json=data)
        return Memory(**response.json())
    
    async def get_memory(self, memory_id: str) -> Memory:
        """Get a specific memory by ID"""
        response = await self._request("GET", f"/api/memories/{memory_id}")
        return Memory(**response.json())
    
    async def update_memory(
        self,
        memory_id: str,
        content: Optional[str] = None,
        title: Optional[str] = None,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        visibility: Optional[str] = None,
        regenerate_embedding: bool = False
    ) -> Memory:
        """Update an existing memory"""
        data = {"regenerate_embedding": regenerate_embedding}
        
        if content is not None:
            data["content"] = content
        if title is not None:
            data["title"] = title
        if tags is not None:
            data["tags"] = tags
        if metadata is not None:
            data["metadata"] = metadata
        if visibility is not None:
            data["visibility"] = visibility
        
        response = await self._request("PUT", f"/api/memories/{memory_id}", json=data)
        return Memory(**response.json())
    
    async def delete_memory(self, memory_id: str):
        """Delete a memory"""
        await self._request("DELETE", f"/api/memories/{memory_id}")
    
    async def list_memories(
        self,
        limit: int = 10,
        offset: int = 0,
        tags: Optional[List[str]] = None,
        visibility: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        List memories
        
        Args:
            limit: Number of results to return
            offset: Offset for pagination
            tags: Filter by tags
            visibility: Filter by visibility
            
        Returns:
            Dictionary with memories and total count
        """
        params = {
            "limit": limit,
            "offset": offset
        }
        
        if tags:
            params["tags"] = tags
        if visibility:
            params["visibility"] = visibility
        
        response = await self._request("GET", "/api/memories", params=params)
        return response.json()
    
    async def search(
        self,
        query: str,
        search_type: str = "hybrid",
        limit: int = 10,
        offset: int = 0,
        tags: Optional[List[str]] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        visibility: Optional[List[str]] = None,
        similarity_threshold: float = 0.7,
        keyword_weight: float = 0.5,
        semantic_weight: float = 0.5
    ) -> SearchResult:
        """
        Search memories
        
        Args:
            query: Search query
            search_type: Type of search (keyword, semantic, hybrid)
            limit: Maximum results
            offset: Offset for pagination
            tags: Filter by tags
            date_from: Filter by start date
            date_to: Filter by end date
            visibility: Filter by visibility
            similarity_threshold: Minimum similarity score
            keyword_weight: Weight for keyword results (hybrid search)
            semantic_weight: Weight for semantic results (hybrid search)
            
        Returns:
            Search results
        """
        params = {
            "query": query,
            "search_type": search_type,
            "limit": limit,
            "offset": offset,
            "similarity_threshold": similarity_threshold,
            "keyword_weight": keyword_weight,
            "semantic_weight": semantic_weight
        }
        
        if tags:
            params["tags"] = tags
        if date_from:
            params["date_from"] = date_from.isoformat()
        if date_to:
            params["date_to"] = date_to.isoformat()
        if visibility:
            params["visibility"] = visibility
        
        response = await self._request("GET", "/api/memories/search", params=params)
        return SearchResult(**response.json())
    
    # API Key management
    async def create_api_key(
        self,
        name: str,
        permissions: Optional[List[str]] = None,
        expires_at: Optional[datetime] = None
    ) -> str:
        """
        Create a new API key
        
        Args:
            name: Key name
            permissions: Optional permissions list
            expires_at: Optional expiration date
            
        Returns:
            API key (only shown once)
        """
        data = {"name": name}
        
        if permissions:
            data["permissions"] = permissions
        if expires_at:
            data["expires_at"] = expires_at.isoformat()
        
        response = await self._request("POST", "/api/auth/api-keys", json=data)
        return response.json()["api_key"]
    
    async def list_api_keys(self) -> List[Dict[str, Any]]:
        """List all API keys"""
        response = await self._request("GET", "/api/auth/api-keys")
        return response.json()
    
    async def revoke_api_key(self, key_id: str):
        """Revoke an API key"""
        await self._request("DELETE", f"/api/auth/api-keys/{key_id}")
    
    # Statistics
    async def get_stats(self) -> Dict[str, Any]:
        """Get user statistics"""
        response = await self._request("GET", "/api/stats")
        return response.json()


# Synchronous wrapper
class PuoMemo:
    """
    Synchronous wrapper for PuoMemoClient
    
    Example:
        ```python
        from puomemo import PuoMemo
        
        # Using API key
        client = PuoMemo(api_key="puo_sk_...")
        
        # Create memory
        memory = client.create_memory("Important information")
        
        # Search
        results = client.search("important")
        ```
    """
    
    def __init__(self, *args, **kwargs):
        self._client = PuoMemoClient(*args, **kwargs)
        self._loop = asyncio.new_event_loop()
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
    
    def close(self):
        """Close the client"""
        self._loop.run_until_complete(self._client.close())
        self._loop.close()
    
    def _run(self, coro):
        """Run async coroutine"""
        return self._loop.run_until_complete(coro)
    
    def login(self, email: str, password: str) -> User:
        return self._run(self._client.login(email, password))
    
    def register(self, email: str, password: str, full_name: str, organization_name: Optional[str] = None) -> User:
        return self._run(self._client.register(email, password, full_name, organization_name))
    
    def create_memory(self, *args, **kwargs) -> Memory:
        return self._run(self._client.create_memory(*args, **kwargs))
    
    def get_memory(self, memory_id: str) -> Memory:
        return self._run(self._client.get_memory(memory_id))
    
    def update_memory(self, memory_id: str, **kwargs) -> Memory:
        return self._run(self._client.update_memory(memory_id, **kwargs))
    
    def delete_memory(self, memory_id: str):
        return self._run(self._client.delete_memory(memory_id))
    
    def list_memories(self, **kwargs) -> Dict[str, Any]:
        return self._run(self._client.list_memories(**kwargs))
    
    def search(self, query: str, **kwargs) -> SearchResult:
        return self._run(self._client.search(query, **kwargs))
    
    def create_api_key(self, name: str, **kwargs) -> str:
        return self._run(self._client.create_api_key(name, **kwargs))
    
    def list_api_keys(self) -> List[Dict[str, Any]]:
        return self._run(self._client.list_api_keys())
    
    def revoke_api_key(self, key_id: str):
        return self._run(self._client.revoke_api_key(key_id))
    
    def get_stats(self) -> Dict[str, Any]:
        return self._run(self._client.get_stats())


# Export main classes
__all__ = [
    "PuoMemoClient",
    "PuoMemo",
    "Memory",
    "SearchResult",
    "User",
    "PuoMemoError",
    "AuthenticationError",
    "RateLimitError",
    "ValidationError"
]