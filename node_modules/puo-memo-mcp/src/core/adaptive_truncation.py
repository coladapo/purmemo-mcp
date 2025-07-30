"""
Adaptive Truncation - Model-aware content delivery system
"""
from typing import Dict, List, Optional, Tuple, Any
import logging

try:
    import tiktoken
    TIKTOKEN_AVAILABLE = True
except ImportError:
    TIKTOKEN_AVAILABLE = False
    logging.warning("tiktoken not available - using character-based truncation")

logger = logging.getLogger(__name__)


class AdaptiveTruncation:
    """Provides model-specific content truncation and optimization"""
    
    # Model token limits (conservative estimates leaving room for prompts)
    MODEL_LIMITS = {
        # OpenAI models
        "gpt-4": 6000,  # 8K total, reserve 2K for prompts
        "gpt-4-32k": 30000,  # 32K total
        "gpt-4-turbo": 120000,  # 128K total  
        "gpt-4o": 120000,  # 128K total
        "gpt-4o-mini": 120000,  # 128K total
        "gpt-3.5-turbo": 14000,  # 16K total
        "gpt-3.5-turbo-16k": 14000,  # 16K total
        
        # Anthropic models
        "claude-3-opus": 180000,  # 200K total
        "claude-3-sonnet": 180000,  # 200K total
        "claude-3-haiku": 180000,  # 200K total
        "claude-2.1": 180000,  # 200K total
        "claude-2": 90000,  # 100K total
        "claude-instant": 90000,  # 100K total
        
        # Default for unknown models
        "default": 4000
    }
    
    # Encoding names for different model families
    ENCODING_NAMES = {
        "gpt-4": "cl100k_base",
        "gpt-3.5": "cl100k_base",
        "claude": "cl100k_base",  # Use same encoding for compatibility
        "default": "cl100k_base"
    }
    
    def __init__(self):
        self._encodings = {}
        self.tiktoken_available = TIKTOKEN_AVAILABLE
        
    def _get_encoding(self, model: str):
        """Get or create tiktoken encoding for a model"""
        if not TIKTOKEN_AVAILABLE:
            return None
            
        model_family = self._get_model_family(model)
        encoding_name = self.ENCODING_NAMES.get(model_family, self.ENCODING_NAMES["default"])
        
        if encoding_name not in self._encodings:
            self._encodings[encoding_name] = tiktoken.get_encoding(encoding_name)
            
        return self._encodings[encoding_name]
    
    def _get_model_family(self, model: str) -> str:
        """Determine model family from model name"""
        model_lower = model.lower()
        if "gpt-4" in model_lower:
            return "gpt-4"
        elif "gpt-3.5" in model_lower:
            return "gpt-3.5"
        elif "claude" in model_lower:
            return "claude"
        return "default"
    
    def get_model_limit(self, model: str) -> int:
        """Get token limit for a specific model"""
        # Check exact match first
        if model in self.MODEL_LIMITS:
            return self.MODEL_LIMITS[model]
            
        # Check partial matches
        model_lower = model.lower()
        for key, limit in self.MODEL_LIMITS.items():
            if key in model_lower:
                return limit
                
        # Return default
        return self.MODEL_LIMITS["default"]
    
    def count_tokens(self, text: str, model: str = "default") -> int:
        """Count tokens in text for a specific model"""
        encoding = self._get_encoding(model)
        if encoding:
            return len(encoding.encode(text))
        else:
            # Fallback: estimate ~4 chars per token
            return len(text) // 4
    
    def should_truncate(self, content: str, model: str) -> bool:
        """Determine if content needs truncation for the model"""
        limit = self.get_model_limit(model)
        token_count = self.count_tokens(content, model)
        return token_count > limit
    
    def get_truncation_strategy(self, model: str) -> str:
        """Determine truncation strategy based on model capacity"""
        limit = self.get_model_limit(model)
        
        if limit >= 50000:  # High-capacity models
            return "full"  # Return full content
        elif limit >= 10000:  # Medium-capacity models  
            return "smart_chunk"  # Use intelligent chunking
        else:  # Low-capacity models
            return "summary"  # Return summary + key chunks
    
    def truncate_to_limit(self, content: str, model: str, preserve_end: bool = False) -> str:
        """
        Truncate content to fit within model's token limit
        
        Args:
            content: The content to truncate
            model: The model name
            preserve_end: If True, preserve the end of content instead of beginning
            
        Returns:
            Truncated content that fits within the model's limit
        """
        limit = self.get_model_limit(model)
        encoding = self._get_encoding(model)
        
        if encoding:
            tokens = encoding.encode(content)
            if len(tokens) <= limit:
                return content
                
            if preserve_end:
                truncated_tokens = tokens[-limit:]
            else:
                truncated_tokens = tokens[:limit]
                
            return encoding.decode(truncated_tokens)
        else:
            # Character-based fallback
            char_limit = limit * 4  # Approximate
            if len(content) <= char_limit:
                return content
                
            if preserve_end:
                return content[-char_limit:]
            else:
                return content[:char_limit]
    
    def prepare_content_for_model(self, content: str, model: str, 
                                  include_full: bool = False) -> Dict[str, Any]:
        """
        Prepare content optimally for a specific model
        
        Args:
            content: The full content
            model: The target model
            include_full: Force include full content if requested
            
        Returns:
            Dict with prepared content and metadata
        """
        token_count = self.count_tokens(content, model)
        limit = self.get_model_limit(model)
        strategy = self.get_truncation_strategy(model)
        
        result = {
            "model": model,
            "token_count": token_count,
            "token_limit": limit,
            "strategy": strategy,
            "truncated": False,
            "chunk_info": {
                "current": 1,
                "total": 1,
                "has_more": False
            }
        }
        
        # If full content requested and fits, return it
        if include_full or strategy == "full" or token_count <= limit:
            result["content"] = content
            result["content_length"] = len(content)
            return result
            
        # Apply truncation based on strategy
        if strategy == "summary":
            # For low-capacity models, return first part as summary
            result["content"] = self.truncate_to_limit(content, model)
            result["truncated"] = True
            result["content_length"] = len(content)
            result["summary"] = True
            result["chunk_info"]["has_more"] = True
            result["chunk_info"]["total"] = 2  # Indicate more chunks available
            
        elif strategy == "smart_chunk":
            # For medium-capacity models, return intelligently truncated content
            result["content"] = self.truncate_to_limit(content, model)
            result["truncated"] = True
            result["content_length"] = len(content)
            result["chunk_info"]["has_more"] = True
            # Calculate approximate number of chunks
            total_chunks = (self.count_tokens(content, model) + limit - 1) // limit
            result["chunk_info"]["total"] = total_chunks
            
        return result