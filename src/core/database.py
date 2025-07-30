"""
Database connection management for PUO Memo
"""
import asyncpg
from contextlib import asynccontextmanager
import logging
import asyncio

from src.utils.config import get_settings
from src.utils.retry import retry, DATABASE_RETRY_CONFIG, RetryConfig
from src.utils.connection_pool_optimizer import ConnectionPoolOptimizer

logger = logging.getLogger(__name__)


class DatabaseConnection:
    """Manages PostgreSQL connections with connection pooling"""
    
    def __init__(self):
        self.pool = None
        self.optimizer = None
        # Get fresh settings
        settings = get_settings()
        self.config = {
            'host': settings.db_host,
            'port': settings.db_port,
            'database': settings.db_name,
            'user': settings.db_user,
            'password': settings.db_password,
            'min_size': settings.db_pool_min_size,
            'max_size': settings.db_pool_max_size,
            'command_timeout': settings.db_command_timeout,
            # Disable prepared statements for pgbouncer compatibility
            'statement_cache_size': 0
        }
    
    @retry(config=DATABASE_RETRY_CONFIG)
    async def initialize(self):
        """Create connection pool with retry logic"""
        try:
            self.pool = await asyncpg.create_pool(**self.config)
            
            # Initialize pool optimizer
            self.optimizer = ConnectionPoolOptimizer(self.pool)
            await self.optimizer.start_monitoring()
            
            logger.info("✅ Connected to PostgreSQL with optimized connection pool")
            return True
        except Exception as e:
            logger.error(f"Database initialization failed: {e}")
            raise  # Re-raise to trigger retry
    
    async def cleanup(self):
        """Close connection pool"""
        if self.optimizer:
            await self.optimizer.stop_monitoring()
        if self.pool:
            await self.pool.close()
            logger.info("Database connection pool closed")
    
    @asynccontextmanager
    async def get_connection(self):
        """Get a connection from the pool with retry logic"""
        if not self.pool:
            raise RuntimeError("Database pool not initialized")
            
        # Retry acquiring connection from pool
        retry_config = RetryConfig(
            max_attempts=3,
            initial_delay=0.1,
            max_delay=1.0,
            exceptions=(asyncpg.PostgresError, asyncio.TimeoutError)
        )
        
        for attempt in range(retry_config.max_attempts):
            try:
                async with self.pool.acquire() as conn:
                    yield conn
                    return
            except retry_config.exceptions as e:
                if attempt < retry_config.max_attempts - 1:
                    delay = min(
                        retry_config.initial_delay * (retry_config.exponential_base ** attempt),
                        retry_config.max_delay
                    )
                    logger.warning(f"Failed to acquire connection (attempt {attempt + 1}): {e}. Retrying in {delay}s...")
                    await asyncio.sleep(delay)
                else:
                    logger.error(f"Failed to acquire connection after {retry_config.max_attempts} attempts")
                    raise
    
    async def execute(self, query: str, *args):
        """Execute a query that doesn't return results"""
        async with self.get_connection() as conn:
            return await conn.execute(query, *args)
    
    async def fetch(self, query: str, *args):
        """Execute a query and fetch all results"""
        async with self.get_connection() as conn:
            return await conn.fetch(query, *args)
    
    async def fetchval(self, query: str, *args):
        """Execute a query and fetch a single value"""
        async with self.get_connection() as conn:
            return await conn.fetchval(query, *args)
    
    async def fetchrow(self, query: str, *args):
        """Execute a query and fetch a single row"""
        async with self.get_connection() as conn:
            return await conn.fetchrow(query, *args)
    
    async def verify_tables(self):
        """Verify required tables exist"""
        try:
            tables = await self.fetch("""
                SELECT tablename FROM pg_tables 
                WHERE schemaname = 'public' 
                AND tablename IN ('memory_entities', 'project_contexts')
            """)
            
            if len(tables) != 2:
                logger.warning("⚠️ Required database tables missing")
                return False
            
            return True
        except Exception as e:
            logger.error(f"Failed to verify tables: {e}")
            return False
    
    async def get_pool_stats(self) -> dict:
        """Get connection pool statistics"""
        if not self.pool:
            return {"error": "Pool not initialized"}
        
        stats = {
            "size": self.pool.get_size(),
            "idle": self.pool.get_idle_size(),
            "used": self.pool.get_size() - self.pool.get_idle_size(),
            "max_size": self.pool._maxsize,
            "min_size": self.pool._minsize
        }
        
        if self.optimizer:
            stats["optimization_report"] = await self.optimizer.get_optimization_report()
        
        return stats