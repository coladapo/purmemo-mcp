"""
Database connection management for PUO Memo
"""
import asyncpg
from contextlib import asynccontextmanager
import logging

from src.utils.config import settings

logger = logging.getLogger(__name__)


class DatabaseConnection:
    """Manages PostgreSQL connections with connection pooling"""
    
    def __init__(self):
        self.pool = None
        self.config = {
            'host': settings.db_host,
            'port': settings.db_port,
            'database': settings.db_name,
            'user': settings.db_user,
            'password': settings.db_password,
            'min_size': settings.db_pool_min_size,
            'max_size': settings.db_pool_max_size,
            'command_timeout': settings.db_command_timeout
        }
    
    async def initialize(self):
        """Create connection pool"""
        try:
            self.pool = await asyncpg.create_pool(**self.config)
            logger.info("✅ Connected to PostgreSQL with connection pool")
            return True
        except Exception as e:
            logger.error(f"Database initialization failed: {e}")
            return False
    
    async def cleanup(self):
        """Close connection pool"""
        if self.pool:
            await self.pool.close()
            logger.info("Database connection pool closed")
    
    @asynccontextmanager
    async def get_connection(self):
        """Get a connection from the pool"""
        async with self.pool.acquire() as conn:
            yield conn
    
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