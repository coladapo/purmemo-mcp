"""
Error tracking and monitoring with Sentry integration
"""
import os
import logging
from typing import Optional, Dict, Any
from functools import wraps
import asyncio

import sentry_sdk
from sentry_sdk import capture_exception, capture_message, set_tag, set_user, set_context
from sentry_sdk.integrations.logging import LoggingIntegration
from sentry_sdk.integrations.aiohttp import AioHttpIntegration
from sentry_sdk.integrations.asyncio import AsyncioIntegration

from src.utils.config import get_settings

logger = logging.getLogger(__name__)


class ErrorTracker:
    """Centralized error tracking with Sentry"""
    
    def __init__(self):
        self.enabled = False
        self.settings = get_settings()
        self._initialize_sentry()
    
    def _initialize_sentry(self):
        """Initialize Sentry SDK if DSN is configured"""
        sentry_dsn = os.getenv('SENTRY_DSN', '')
        
        if not sentry_dsn:
            logger.info("Sentry DSN not configured, error tracking disabled")
            return
        
        try:
            # Configure Sentry
            sentry_sdk.init(
                dsn=sentry_dsn,
                environment=os.getenv('ENVIRONMENT', 'development'),
                release=os.getenv('APP_VERSION', 'unknown'),
                
                # Performance monitoring
                traces_sample_rate=float(os.getenv('SENTRY_TRACES_SAMPLE_RATE', '0.1')),
                profiles_sample_rate=float(os.getenv('SENTRY_PROFILES_SAMPLE_RATE', '0.1')),
                
                # Integrations
                integrations=[
                    LoggingIntegration(
                        level=logging.INFO,
                        event_level=logging.ERROR
                    ),
                    AioHttpIntegration(),
                    AsyncioIntegration()
                ],
                
                # Options
                attach_stacktrace=True,
                send_default_pii=False,  # Don't send personally identifiable information
                
                # Before send hook for filtering
                before_send=self._before_send,
                
                # Ignore certain errors
                ignore_errors=[
                    KeyboardInterrupt,
                    SystemExit,
                    GeneratorExit
                ]
            )
            
            self.enabled = True
            logger.info("✅ Sentry error tracking initialized")
            
            # Set global tags
            set_tag("app", "puo-memo")
            set_tag("component", "backend")
            
        except Exception as e:
            logger.error(f"Failed to initialize Sentry: {e}")
    
    def _before_send(self, event: Dict[str, Any], hint: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Filter events before sending to Sentry"""
        # Don't send events in development unless explicitly enabled
        if os.getenv('ENVIRONMENT', 'development') == 'development':
            if not os.getenv('SENTRY_FORCE_SEND', '').lower() == 'true':
                return None
        
        # Filter out sensitive data
        if 'request' in event:
            request = event['request']
            # Remove authorization headers
            if 'headers' in request:
                request['headers'] = {
                    k: v for k, v in request['headers'].items()
                    if k.lower() not in ['authorization', 'x-api-key', 'cookie']
                }
            
            # Remove password fields from data
            if 'data' in request:
                request['data'] = self._filter_sensitive_data(request['data'])
        
        # Add custom context
        event['contexts']['app'] = {
            'cache_enabled': self.settings.cache_enabled,
            'db_pool_size': self.settings.db_pool_max_size,
            'rate_limit': self.settings.rate_limit_per_minute
        }
        
        return event
    
    def _filter_sensitive_data(self, data: Any) -> Any:
        """Recursively filter sensitive data"""
        if isinstance(data, dict):
            return {
                k: '[FILTERED]' if any(s in k.lower() for s in ['password', 'token', 'key', 'secret']) else self._filter_sensitive_data(v)
                for k, v in data.items()
            }
        elif isinstance(data, list):
            return [self._filter_sensitive_data(item) for item in data]
        return data
    
    def set_user_context(self, user_id: Optional[str] = None, 
                        email: Optional[str] = None,
                        username: Optional[str] = None):
        """Set user context for error tracking"""
        if self.enabled:
            set_user({
                "id": user_id,
                "email": email,
                "username": username
            })
    
    def set_context(self, name: str, context: Dict[str, Any]):
        """Set additional context for error tracking"""
        if self.enabled:
            set_context(name, context)
    
    def capture_exception(self, error: Exception, extra: Optional[Dict[str, Any]] = None):
        """Capture an exception with optional extra data"""
        if self.enabled:
            with sentry_sdk.push_scope() as scope:
                if extra:
                    for key, value in extra.items():
                        scope.set_extra(key, value)
                capture_exception(error)
        else:
            # Log locally if Sentry is not enabled
            logger.error(f"Exception captured: {error}", exc_info=True, extra=extra)
    
    def capture_message(self, message: str, level: str = "info", extra: Optional[Dict[str, Any]] = None):
        """Capture a message with optional extra data"""
        if self.enabled:
            with sentry_sdk.push_scope() as scope:
                if extra:
                    for key, value in extra.items():
                        scope.set_extra(key, value)
                capture_message(message, level=level)
        else:
            # Log locally if Sentry is not enabled
            log_func = getattr(logger, level, logger.info)
            log_func(f"Message captured: {message}", extra=extra)
    
    def track_performance(self, operation_name: str):
        """Decorator to track performance of operations"""
        def decorator(func):
            @wraps(func)
            async def async_wrapper(*args, **kwargs):
                if self.enabled:
                    with sentry_sdk.start_transaction(op=operation_name, name=func.__name__):
                        try:
                            result = await func(*args, **kwargs)
                            return result
                        except Exception as e:
                            sentry_sdk.set_tag("operation.status", "error")
                            raise
                else:
                    return await func(*args, **kwargs)
            
            @wraps(func)
            def sync_wrapper(*args, **kwargs):
                if self.enabled:
                    with sentry_sdk.start_transaction(op=operation_name, name=func.__name__):
                        try:
                            result = func(*args, **kwargs)
                            return result
                        except Exception as e:
                            sentry_sdk.set_tag("operation.status", "error")
                            raise
                else:
                    return func(*args, **kwargs)
            
            return async_wrapper if asyncio.iscoroutinefunction(func) else sync_wrapper
        return decorator
    
    def add_breadcrumb(self, message: str, category: str = "custom", 
                      level: str = "info", data: Optional[Dict[str, Any]] = None):
        """Add a breadcrumb for debugging"""
        if self.enabled:
            sentry_sdk.add_breadcrumb(
                message=message,
                category=category,
                level=level,
                data=data or {}
            )


# Global error tracker instance
error_tracker = ErrorTracker()


# Convenience functions
def track_exception(error: Exception, **extra):
    """Track an exception with extra context"""
    error_tracker.capture_exception(error, extra)


def track_message(message: str, level: str = "info", **extra):
    """Track a message with extra context"""
    error_tracker.capture_message(message, level, extra)


def track_user(user_id: Optional[str] = None, email: Optional[str] = None, username: Optional[str] = None):
    """Set user context for tracking"""
    error_tracker.set_user_context(user_id, email, username)


# Decorator for automatic error tracking
def with_error_tracking(operation: str = "operation"):
    """Decorator to automatically track errors in functions"""
    def decorator(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            try:
                error_tracker.add_breadcrumb(
                    f"Starting {operation}: {func.__name__}",
                    category=operation
                )
                result = await func(*args, **kwargs)
                error_tracker.add_breadcrumb(
                    f"Completed {operation}: {func.__name__}",
                    category=operation
                )
                return result
            except Exception as e:
                error_tracker.capture_exception(e, extra={
                    "operation": operation,
                    "function": func.__name__,
                    "args": str(args)[:200],  # Truncate for safety
                    "kwargs": str(kwargs)[:200]
                })
                raise
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            try:
                error_tracker.add_breadcrumb(
                    f"Starting {operation}: {func.__name__}",
                    category=operation
                )
                result = func(*args, **kwargs)
                error_tracker.add_breadcrumb(
                    f"Completed {operation}: {func.__name__}",
                    category=operation
                )
                return result
            except Exception as e:
                error_tracker.capture_exception(e, extra={
                    "operation": operation,
                    "function": func.__name__,
                    "args": str(args)[:200],
                    "kwargs": str(kwargs)[:200]
                })
                raise
        
        return async_wrapper if asyncio.iscoroutinefunction(func) else sync_wrapper
    return decorator