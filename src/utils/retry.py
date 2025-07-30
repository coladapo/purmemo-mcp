"""
Retry logic and resilience utilities for PUO Memo MCP
Provides exponential backoff, circuit breakers, and graceful degradation
"""

import asyncio
import functools
import logging
import time
from typing import TypeVar, Callable, Optional, Union, Type, Tuple, Any
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

T = TypeVar('T')


class CircuitState(Enum):
    CLOSED = "closed"  # Normal operation
    OPEN = "open"      # Failing, reject calls
    HALF_OPEN = "half_open"  # Testing if recovered


@dataclass
class RetryConfig:
    max_attempts: int = 3
    initial_delay: float = 1.0
    max_delay: float = 60.0
    exponential_base: float = 2.0
    jitter: bool = True
    exceptions: Tuple[Type[Exception], ...] = (Exception,)


@dataclass 
class CircuitBreakerConfig:
    failure_threshold: int = 5
    success_threshold: int = 2
    timeout: float = 30.0
    half_open_max_calls: int = 3


class CircuitBreaker:
    """Circuit breaker pattern implementation"""
    
    def __init__(self, config: CircuitBreakerConfig):
        self.config = config
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time: Optional[float] = None
        self.half_open_calls = 0
        
    def call_succeeded(self):
        """Record successful call"""
        self.failure_count = 0
        if self.state == CircuitState.HALF_OPEN:
            self.success_count += 1
            if self.success_count >= self.config.success_threshold:
                self.state = CircuitState.CLOSED
                self.success_count = 0
                self.half_open_calls = 0
                logger.info("Circuit breaker closed after recovery")
                
    def call_failed(self):
        """Record failed call"""
        self.failure_count += 1
        self.success_count = 0
        
        if self.state == CircuitState.HALF_OPEN:
            self.state = CircuitState.OPEN
            self.last_failure_time = time.time()
            logger.warning("Circuit breaker opened after half-open test failed")
        elif self.failure_count >= self.config.failure_threshold:
            self.state = CircuitState.OPEN
            self.last_failure_time = time.time()
            logger.warning(f"Circuit breaker opened after {self.failure_count} failures")
            
    def can_proceed(self) -> bool:
        """Check if call can proceed"""
        if self.state == CircuitState.CLOSED:
            return True
            
        if self.state == CircuitState.OPEN:
            if self.last_failure_time and \
               time.time() - self.last_failure_time > self.config.timeout:
                self.state = CircuitState.HALF_OPEN
                self.half_open_calls = 0
                logger.info("Circuit breaker entering half-open state")
                return True
            return False
            
        # Half-open state
        if self.half_open_calls < self.config.half_open_max_calls:
            self.half_open_calls += 1
            return True
        return False


async def retry_async(
    func: Callable[..., T],
    *args,
    config: Optional[RetryConfig] = None,
    fallback: Optional[Callable[..., T]] = None,
    circuit_breaker: Optional[CircuitBreaker] = None,
    **kwargs
) -> T:
    """
    Retry an async function with exponential backoff
    
    Args:
        func: Async function to retry
        config: Retry configuration
        fallback: Fallback function if all retries fail
        circuit_breaker: Optional circuit breaker
        
    Returns:
        Function result or fallback result
        
    Raises:
        Last exception if all retries fail and no fallback
    """
    config = config or RetryConfig()
    
    last_exception = None
    
    for attempt in range(config.max_attempts):
        # Check circuit breaker
        if circuit_breaker and not circuit_breaker.can_proceed():
            logger.warning(f"Circuit breaker open, skipping {func.__name__}")
            if fallback:
                return await fallback(*args, **kwargs)
            raise Exception("Circuit breaker is open")
            
        try:
            result = await func(*args, **kwargs)
            
            # Success
            if circuit_breaker:
                circuit_breaker.call_succeeded()
                
            return result
            
        except config.exceptions as e:
            last_exception = e
            
            if circuit_breaker:
                circuit_breaker.call_failed()
                
            if attempt < config.max_attempts - 1:
                # Calculate delay with exponential backoff
                delay = min(
                    config.initial_delay * (config.exponential_base ** attempt),
                    config.max_delay
                )
                
                # Add jitter to prevent thundering herd
                if config.jitter:
                    import random
                    delay *= (0.5 + random.random())
                    
                logger.warning(
                    f"Attempt {attempt + 1}/{config.max_attempts} failed for {func.__name__}: {e}. "
                    f"Retrying in {delay:.2f}s..."
                )
                
                await asyncio.sleep(delay)
            else:
                logger.error(
                    f"All {config.max_attempts} attempts failed for {func.__name__}: {e}"
                )
                
    # All retries failed
    if fallback:
        logger.info(f"Using fallback for {func.__name__}")
        return await fallback(*args, **kwargs)
        
    raise last_exception


def retry(config: Optional[RetryConfig] = None):
    """Decorator for adding retry logic to async functions"""
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            return await retry_async(func, *args, config=config, **kwargs)
        return wrapper
    return decorator


def with_circuit_breaker(
    circuit_config: Optional[CircuitBreakerConfig] = None,
    retry_config: Optional[RetryConfig] = None
):
    """Decorator for adding circuit breaker + retry logic"""
    circuit_config = circuit_config or CircuitBreakerConfig()
    breaker = CircuitBreaker(circuit_config)
    
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            return await retry_async(
                func, 
                *args, 
                config=retry_config,
                circuit_breaker=breaker,
                **kwargs
            )
        return wrapper
    return decorator


# Specific retry configurations for different services
GEMINI_RETRY_CONFIG = RetryConfig(
    max_attempts=5,
    initial_delay=2.0,
    max_delay=30.0,
    exceptions=(Exception,)  # Retry on all exceptions for external API
)

DATABASE_RETRY_CONFIG = RetryConfig(
    max_attempts=3,
    initial_delay=0.5,
    max_delay=5.0,
    exceptions=(asyncio.TimeoutError, ConnectionError)
)

GCS_RETRY_CONFIG = RetryConfig(
    max_attempts=4,
    initial_delay=1.0,
    max_delay=10.0,
    exceptions=(Exception,)
)


# Example usage for graceful degradation
async def get_embeddings_with_fallback(text: str, ai_client) -> Optional[list]:
    """Get embeddings with fallback to None if AI service fails"""
    
    async def get_embeddings():
        return await ai_client.generate_embeddings(text)
        
    async def fallback_embeddings(text: str):
        logger.warning("AI service unavailable, using fallback (no embeddings)")
        return None  # Allow operation to continue without embeddings
        
    return await retry_async(
        get_embeddings,
        text,
        config=GEMINI_RETRY_CONFIG,
        fallback=fallback_embeddings
    )