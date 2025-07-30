"""
Unified Memory Bridge - Normalizes contexts across all platforms
"""
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)


class UnifiedMemoryBridge:
    """Normalizes platform-specific contexts to enable cross-platform memory sharing"""
    
    # Map of platform identifiers to their typical contexts
    PLATFORM_CONTEXTS = {
        "chatgpt": "chatgpt",
        "claude": "default", 
        "cursor": "default",
        "api": "api",
        "web": "web"
    }
    
    # Unified context for all platforms
    UNIFIED_CONTEXT = "unified"
    
    @classmethod
    def normalize_context(cls, platform: str, original_context: Optional[str] = None) -> str:
        """
        Normalize any platform-specific context to unified context
        
        Args:
            platform: The platform identifier (chatgpt, claude, cursor, etc.)
            original_context: The original context from the platform (optional)
            
        Returns:
            The unified context string
        """
        # Always return unified context for cross-platform compatibility
        logger.debug(f"Normalizing context for platform={platform}, original={original_context} -> {cls.UNIFIED_CONTEXT}")
        return cls.UNIFIED_CONTEXT
    
    @classmethod
    def get_platform_context(cls, platform: str) -> str:
        """
        Get the original platform-specific context (for backward compatibility)
        
        Args:
            platform: The platform identifier
            
        Returns:
            The platform's typical context
        """
        return cls.PLATFORM_CONTEXTS.get(platform.lower(), "default")
    
    @classmethod
    def should_use_unified(cls, request_headers: Optional[Dict[str, Any]] = None) -> bool:
        """
        Determine if unified context should be used based on request headers or config
        
        Args:
            request_headers: Optional HTTP headers from the request
            
        Returns:
            True if unified context should be used
        """
        # Always use unified context for new implementations
        # Can be made configurable later if needed
        return True
    
    @classmethod
    def migrate_context(cls, old_context: str) -> str:
        """
        Migrate old platform-specific contexts to unified context
        
        Args:
            old_context: The old context string
            
        Returns:
            The unified context string
        """
        if old_context in cls.PLATFORM_CONTEXTS.values():
            logger.info(f"Migrating context {old_context} -> {cls.UNIFIED_CONTEXT}")
            return cls.UNIFIED_CONTEXT
        return old_context