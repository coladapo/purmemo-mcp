"""
Connection pool optimization for database and Redis
"""
import asyncio
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timedelta

import asyncpg
from src.utils.config import get_settings

logger = logging.getLogger(__name__)


class ConnectionPoolOptimizer:
    """Dynamically optimize connection pool settings based on usage patterns"""
    
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool
        self.config = get_settings()
        self.metrics = {
            'connections_used': [],
            'wait_times': [],
            'timeouts': 0,
            'last_adjustment': datetime.now()
        }
        self._monitoring = False
        
    async def start_monitoring(self):
        """Start monitoring pool usage"""
        if self._monitoring:
            return
            
        self._monitoring = True
        asyncio.create_task(self._monitor_loop())
        logger.info("🔍 Connection pool monitoring started")
        
    async def stop_monitoring(self):
        """Stop monitoring"""
        self._monitoring = False
        
    async def _monitor_loop(self):
        """Monitor pool metrics and adjust settings"""
        while self._monitoring:
            try:
                # Collect metrics
                pool_size = self.pool.get_size()
                idle_size = self.pool.get_idle_size()
                used_connections = pool_size - idle_size
                
                self.metrics['connections_used'].append({
                    'timestamp': datetime.now(),
                    'used': used_connections,
                    'total': pool_size,
                    'idle': idle_size
                })
                
                # Keep only recent metrics (last hour)
                cutoff = datetime.now() - timedelta(hours=1)
                self.metrics['connections_used'] = [
                    m for m in self.metrics['connections_used'] 
                    if m['timestamp'] > cutoff
                ]
                
                # Check if we need to adjust pool size
                await self._check_and_adjust_pool()
                
                # Sleep for monitoring interval
                await asyncio.sleep(30)  # Check every 30 seconds
                
            except Exception as e:
                logger.error(f"Pool monitoring error: {e}")
                await asyncio.sleep(60)  # Back off on error
                
    async def _check_and_adjust_pool(self):
        """Check metrics and adjust pool size if needed"""
        if len(self.metrics['connections_used']) < 10:
            return  # Not enough data
            
        # Calculate average usage
        recent_metrics = self.metrics['connections_used'][-20:]  # Last 10 minutes
        avg_used = sum(m['used'] for m in recent_metrics) / len(recent_metrics)
        max_used = max(m['used'] for m in recent_metrics)
        current_max = self.pool._maxsize
        current_min = self.pool._minsize
        
        # Check if we should adjust
        time_since_adjustment = datetime.now() - self.metrics['last_adjustment']
        if time_since_adjustment < timedelta(minutes=5):
            return  # Don't adjust too frequently
            
        # Increase pool size if consistently high usage
        if avg_used > current_max * 0.8:
            new_max = min(current_max + 5, 50)  # Cap at 50
            new_min = min(current_min + 2, new_max - 5)
            
            if new_max > current_max:
                logger.info(f"📈 Increasing pool size: {current_max} -> {new_max}")
                await self._resize_pool(new_min, new_max)
                
        # Decrease pool size if consistently low usage
        elif max_used < current_max * 0.3 and current_max > 10:
            new_max = max(10, current_max - 5)
            new_min = max(5, new_max - 5)
            
            logger.info(f"📉 Decreasing pool size: {current_max} -> {new_max}")
            await self._resize_pool(new_min, new_max)
            
    async def _resize_pool(self, new_min: int, new_max: int):
        """Resize the connection pool"""
        try:
            # Note: asyncpg doesn't support dynamic pool resizing
            # This would require recreating the pool in a real implementation
            # For now, just log the recommendation
            logger.info(f"Recommended pool size: min={new_min}, max={new_max}")
            self.metrics['last_adjustment'] = datetime.now()
            
        except Exception as e:
            logger.error(f"Failed to resize pool: {e}")
            
    async def get_optimization_report(self) -> Dict[str, Any]:
        """Get optimization recommendations"""
        if len(self.metrics['connections_used']) < 10:
            return {
                'status': 'insufficient_data',
                'message': 'Not enough data for recommendations'
            }
            
        recent_metrics = self.metrics['connections_used'][-60:]  # Last 30 minutes
        avg_used = sum(m['used'] for m in recent_metrics) / len(recent_metrics)
        max_used = max(m['used'] for m in recent_metrics)
        current_max = self.pool._maxsize
        
        recommendations = []
        
        if avg_used > current_max * 0.8:
            recommendations.append({
                'type': 'increase_pool_size',
                'reason': f'High average usage: {avg_used:.1f}/{current_max}',
                'suggested_max': min(current_max + 10, 50)
            })
            
        if max_used == current_max:
            recommendations.append({
                'type': 'possible_connection_exhaustion',
                'reason': 'Pool reached maximum capacity',
                'suggested_action': 'Monitor for connection timeouts'
            })
            
        if avg_used < current_max * 0.2 and current_max > 10:
            recommendations.append({
                'type': 'decrease_pool_size',
                'reason': f'Low average usage: {avg_used:.1f}/{current_max}',
                'suggested_max': max(10, int(avg_used * 2))
            })
            
        return {
            'current_settings': {
                'min_size': self.pool._minsize,
                'max_size': self.pool._maxsize,
                'current_size': self.pool.get_size(),
                'idle_connections': self.pool.get_idle_size()
            },
            'usage_stats': {
                'average_used': avg_used,
                'max_used': max_used,
                'utilization': avg_used / current_max if current_max > 0 else 0
            },
            'recommendations': recommendations,
            'monitoring_duration': len(self.metrics['connections_used']) * 30  # seconds
        }


class RedisPoolOptimizer:
    """Optimize Redis connection pool settings"""
    
    def __init__(self, redis_client):
        self.redis = redis_client
        self.metrics = {
            'command_times': [],
            'pool_stats': [],
            'slow_commands': []
        }
        
    async def analyze_usage(self) -> Dict[str, Any]:
        """Analyze Redis usage patterns"""
        try:
            # Get Redis info
            info = await self.redis.info()
            
            # Get connection pool stats
            pool = self.redis.connection_pool
            pool_stats = {
                'created_connections': pool.created_connections,
                'available_connections': len(pool._available_connections),
                'in_use_connections': len(pool._in_use_connections),
                'max_connections': pool.max_connections
            }
            
            # Analyze command stats
            cmd_stats = info.get('commandstats', {})
            slow_commands = [
                cmd for cmd, stats in cmd_stats.items()
                if stats.get('usec_per_call', 0) > 1000  # > 1ms
            ]
            
            recommendations = []
            
            # Check connection pool usage
            usage_ratio = pool_stats['in_use_connections'] / pool_stats['max_connections']
            if usage_ratio > 0.8:
                recommendations.append({
                    'type': 'increase_redis_pool',
                    'reason': f'High connection usage: {usage_ratio:.1%}',
                    'suggested_max': pool_stats['max_connections'] + 10
                })
                
            # Check for slow commands
            if slow_commands:
                recommendations.append({
                    'type': 'optimize_slow_commands',
                    'commands': slow_commands,
                    'suggestion': 'Consider caching or optimizing these operations'
                })
                
            return {
                'pool_stats': pool_stats,
                'usage_ratio': usage_ratio,
                'slow_commands': slow_commands,
                'recommendations': recommendations,
                'memory_usage': info.get('used_memory_human', 'unknown')
            }
            
        except Exception as e:
            logger.error(f"Redis analysis error: {e}")
            return {'error': str(e)}