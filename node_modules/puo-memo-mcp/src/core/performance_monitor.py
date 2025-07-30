"""
Performance monitoring integration for PUO Memo
"""
import time
import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional, Callable
from functools import wraps
from collections import defaultdict

from src.utils.config import get_settings
from src.core.cache import cache_manager

logger = logging.getLogger(__name__)


class PerformanceMonitor:
    """Monitor and track performance metrics"""
    
    def __init__(self):
        self.metrics = defaultdict(lambda: {
            'count': 0,
            'total_time': 0,
            'min_time': float('inf'),
            'max_time': 0,
            'errors': 0,
            'last_error': None
        })
        self.config = get_settings()
        self._start_time = time.time()
        
    def track_operation(self, operation_name: str):
        """Decorator to track operation performance"""
        def decorator(func):
            @wraps(func)
            async def async_wrapper(*args, **kwargs):
                start_time = time.time()
                error = None
                
                try:
                    result = await func(*args, **kwargs)
                    return result
                except Exception as e:
                    error = str(e)
                    raise
                finally:
                    elapsed = time.time() - start_time
                    self._record_metric(operation_name, elapsed, error)
                    
            @wraps(func)
            def sync_wrapper(*args, **kwargs):
                start_time = time.time()
                error = None
                
                try:
                    result = func(*args, **kwargs)
                    return result
                except Exception as e:
                    error = str(e)
                    raise
                finally:
                    elapsed = time.time() - start_time
                    self._record_metric(operation_name, elapsed, error)
                    
            return async_wrapper if asyncio.iscoroutinefunction(func) else sync_wrapper
        return decorator
    
    def _record_metric(self, operation: str, elapsed: float, error: Optional[str] = None):
        """Record a metric for an operation"""
        metric = self.metrics[operation]
        metric['count'] += 1
        metric['total_time'] += elapsed
        metric['min_time'] = min(metric['min_time'], elapsed)
        metric['max_time'] = max(metric['max_time'], elapsed)
        
        if error:
            metric['errors'] += 1
            metric['last_error'] = {
                'error': error,
                'timestamp': datetime.now(timezone.utc).isoformat()
            }
        
        # Log slow operations
        if elapsed > 1.0:
            logger.warning(f"Slow operation: {operation} took {elapsed:.2f}s")
        
        # Log high error rates
        if metric['count'] > 10 and metric['errors'] / metric['count'] > 0.1:
            logger.error(f"High error rate for {operation}: {metric['errors']}/{metric['count']}")
    
    async def get_metrics(self) -> Dict[str, Any]:
        """Get current performance metrics"""
        uptime = time.time() - self._start_time
        
        # Calculate averages and rates
        summary = {}
        for operation, metric in self.metrics.items():
            if metric['count'] > 0:
                summary[operation] = {
                    'count': metric['count'],
                    'average_time': metric['total_time'] / metric['count'],
                    'min_time': metric['min_time'],
                    'max_time': metric['max_time'],
                    'error_rate': metric['errors'] / metric['count'],
                    'errors': metric['errors'],
                    'last_error': metric['last_error']
                }
        
        # Get cache metrics if available
        cache_stats = {}
        if self.config.cache_enabled:
            cache_stats = await cache_manager.get_stats()
        
        # Get system metrics
        system_stats = {
            'uptime_seconds': uptime,
            'uptime_hours': uptime / 3600,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
        
        return {
            'operations': summary,
            'cache': cache_stats,
            'system': system_stats
        }
    
    async def get_health_status(self) -> Dict[str, Any]:
        """Get health status based on metrics"""
        metrics = await self.get_metrics()
        
        health_issues = []
        status = 'healthy'
        
        # Check for high error rates
        for op, data in metrics['operations'].items():
            if data['error_rate'] > 0.2:
                health_issues.append(f"High error rate for {op}: {data['error_rate']:.1%}")
                status = 'degraded'
            
            if data['average_time'] > 2.0:
                health_issues.append(f"Slow operation {op}: avg {data['average_time']:.2f}s")
                if status == 'healthy':
                    status = 'warning'
        
        # Check cache health
        if self.config.cache_enabled and 'cache' in metrics:
            cache_data = metrics['cache']
            if cache_data.get('hit_rate', 0) < 0.5:
                health_issues.append(f"Low cache hit rate: {cache_data.get('hit_rate', 0):.1%}")
                if status == 'healthy':
                    status = 'warning'
        
        return {
            'status': status,
            'issues': health_issues,
            'metrics': metrics
        }
    
    def create_middleware(self):
        """Create middleware for web servers"""
        async def performance_middleware(request, handler):
            operation = f"{request.method} {request.path}"
            start_time = time.time()
            error = None
            
            try:
                response = await handler(request)
                return response
            except Exception as e:
                error = str(e)
                raise
            finally:
                elapsed = time.time() - start_time
                self._record_metric(operation, elapsed, error)
        
        return performance_middleware


# Global performance monitor instance
performance_monitor = PerformanceMonitor()