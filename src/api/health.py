"""Health check endpoint for monitoring"""
from typing import Dict, Any
import asyncio
import asyncpg
import redis.asyncio as redis
from datetime import datetime

async def check_database(db_url: str) -> Dict[str, Any]:
    """Check database connectivity"""
    try:
        conn = await asyncpg.connect(db_url)
        version = await conn.fetchval("SELECT version()")
        await conn.close()
        return {
            "status": "healthy",
            "version": version,
            "latency_ms": 0  # Would need timing logic
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }

async def check_redis(redis_url: str) -> Dict[str, Any]:
    """Check Redis connectivity"""
    try:
        r = redis.from_url(redis_url)
        pong = await r.ping()
        await r.close()
        return {
            "status": "healthy" if pong else "unhealthy",
            "latency_ms": 0  # Would need timing logic
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }

async def health_check(db_url: str, redis_url: str) -> Dict[str, Any]:
    """Comprehensive health check"""
    db_check, redis_check = await asyncio.gather(
        check_database(db_url),
        check_redis(redis_url),
        return_exceptions=True
    )
    
    # Handle exceptions from gather
    if isinstance(db_check, Exception):
        db_check = {"status": "unhealthy", "error": str(db_check)}
    if isinstance(redis_check, Exception):
        redis_check = {"status": "unhealthy", "error": str(redis_check)}
    
    overall_status = "healthy"
    if db_check["status"] != "healthy" or redis_check["status"] != "healthy":
        overall_status = "unhealthy"
    
    return {
        "status": overall_status,
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
            "database": db_check,
            "redis": redis_check
        }
    }