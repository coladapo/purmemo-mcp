"""
Connection pooling for external services
Manages HTTP, Redis, and other service connections efficiently
"""

import asyncio
import logging
from typing import Optional, Dict, Any
from contextlib import asynccontextmanager
import aiohttp
import time

logger = logging.getLogger(__name__)

# Try to import Redis
try:
    import redis.asyncio as redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    redis = None  # Define redis as None when not available
    logger.info("Redis not available")


class ConnectionPoolManager:
    """Manages connection pools for all external services"""
    
    def __init__(self):
        self.http_session: Optional[aiohttp.ClientSession] = None
        self.redis_pool: Optional[Any] = None
        self.redis_client: Optional[Any] = None
        self.gemini_session: Optional[aiohttp.ClientSession] = None
        self.gcs_session: Optional[aiohttp.ClientSession] = None
        
        # Connection pool configurations
        self.http_connector = None
        self.gemini_connector = None
        self.gcs_connector = None
        
        # Pool statistics
        self.stats = {
            'http_requests': 0,
            'redis_operations': 0,
            'gemini_calls': 0,
            'gcs_operations': 0
        }
        
    async def initialize(self, config: Optional[Dict[str, Any]] = None):
        """Initialize all connection pools"""
        config = config or {}
        
        # HTTP connection pool for general use
        self.http_connector = aiohttp.TCPConnector(
            limit=100,  # Total connection pool size
            limit_per_host=30,  # Per-host limit
            ttl_dns_cache=300,  # DNS cache TTL
            enable_cleanup_closed=True
        )
        
        self.http_session = aiohttp.ClientSession(
            connector=self.http_connector,
            timeout=aiohttp.ClientTimeout(total=30)
        )
        logger.info("✅ HTTP connection pool initialized")
        
        # Gemini API connection pool
        self.gemini_connector = aiohttp.TCPConnector(
            limit=50,  # Gemini-specific pool
            limit_per_host=50,
            ttl_dns_cache=300
        )
        
        self.gemini_session = aiohttp.ClientSession(
            connector=self.gemini_connector,
            timeout=aiohttp.ClientTimeout(total=60),  # Longer timeout for AI
            headers={
                'User-Agent': 'PUO-Memo/1.0'
            }
        )
        logger.info("✅ Gemini connection pool initialized")
        
        # GCS connection pool
        self.gcs_connector = aiohttp.TCPConnector(
            limit=50,
            limit_per_host=50,
            ttl_dns_cache=300
        )
        
        self.gcs_session = aiohttp.ClientSession(
            connector=self.gcs_connector,
            timeout=aiohttp.ClientTimeout(total=120)  # Longer for file uploads
        )
        logger.info("✅ GCS connection pool initialized")
        
        # Redis connection pool
        if REDIS_AVAILABLE and config.get('redis_url'):
            try:
                self.redis_pool = redis.ConnectionPool.from_url(
                    config['redis_url'],
                    max_connections=50,
                    decode_responses=True
                )
                self.redis_client = redis.Redis(connection_pool=self.redis_pool)
                
                # Test connection
                await self.redis_client.ping()
                logger.info("✅ Redis connection pool initialized")
            except Exception as e:
                logger.warning(f"Redis initialization failed: {e}")
                self.redis_client = None
                
    async def close(self):
        """Close all connection pools"""
        if self.http_session:
            await self.http_session.close()
            
        if self.gemini_session:
            await self.gemini_session.close()
            
        if self.gcs_session:
            await self.gcs_session.close()
            
        if self.redis_client:
            await self.redis_client.close()
            
        # Close connectors
        if self.http_connector:
            await self.http_connector.close()
            
        if self.gemini_connector:
            await self.gemini_connector.close()
            
        if self.gcs_connector:
            await self.gcs_connector.close()
            
        logger.info("All connection pools closed")
        
    @asynccontextmanager
    async def get_http_session(self):
        """Get HTTP session from pool"""
        if not self.http_session:
            raise RuntimeError("HTTP session not initialized")
            
        self.stats['http_requests'] += 1
        yield self.http_session
        
    @asynccontextmanager
    async def get_gemini_session(self):
        """Get Gemini API session from pool"""
        if not self.gemini_session:
            raise RuntimeError("Gemini session not initialized")
            
        self.stats['gemini_calls'] += 1
        yield self.gemini_session
        
    @asynccontextmanager
    async def get_gcs_session(self):
        """Get GCS session from pool"""
        if not self.gcs_session:
            raise RuntimeError("GCS session not initialized")
            
        self.stats['gcs_operations'] += 1
        yield self.gcs_session
        
    def get_redis_client(self) -> Optional[Any]:
        """Get Redis client (already pooled internally)"""
        if self.redis_client:
            self.stats['redis_operations'] += 1
        return self.redis_client
        
    def get_pool_stats(self) -> Dict[str, Any]:
        """Get connection pool statistics"""
        stats = self.stats.copy()
        
        # Add connector stats
        if self.http_connector:
            stats['http_pool'] = {
                'limit': self.http_connector.limit,
                'limit_per_host': self.http_connector.limit_per_host,
                'connections': len(self.http_connector._conns)
            }
            
        if self.gemini_connector:
            stats['gemini_pool'] = {
                'limit': self.gemini_connector.limit,
                'connections': len(self.gemini_connector._conns)
            }
            
        if self.gcs_connector:
            stats['gcs_pool'] = {
                'limit': self.gcs_connector.limit,
                'connections': len(self.gcs_connector._conns)
            }
            
        if self.redis_pool:
            stats['redis_pool'] = {
                'max_connections': self.redis_pool.max_connections,
                'created_connections': self.redis_pool._created_connections,
                'available_connections': len(self.redis_pool._available_connections)
            }
            
        return stats


# Global connection pool manager
connection_pool = ConnectionPoolManager()


# Helper functions for Gemini API calls with pooling
async def gemini_request(url: str, **kwargs) -> aiohttp.ClientResponse:
    """Make a request to Gemini API using connection pool"""
    async with connection_pool.get_gemini_session() as session:
        async with session.request(url=url, **kwargs) as response:
            return await response.json()


# Helper for GCS operations
async def gcs_upload(url: str, data: bytes, headers: Dict[str, str]) -> bool:
    """Upload to GCS using connection pool"""
    async with connection_pool.get_gcs_session() as session:
        async with session.put(url, data=data, headers=headers) as response:
            return response.status == 200