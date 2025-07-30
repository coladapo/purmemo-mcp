"""
Smart Chunker - Intelligent text splitting with semantic boundaries
"""
from typing import List, Tuple, Optional, Dict, Any
import re
import logging

try:
    import tiktoken
    TIKTOKEN_AVAILABLE = True
except ImportError:
    TIKTOKEN_AVAILABLE = False
    logging.warning("tiktoken not available - using character-based chunking")

logger = logging.getLogger(__name__)


class SmartChunker:
    """Intelligently chunks text while preserving semantic boundaries"""
    
    # Delimiter hierarchy for splitting (from most to least preferred)
    DELIMITERS = [
        "\n\n\n",  # Multiple blank lines (major sections)
        "\n\n",    # Paragraph breaks
        "\n",      # Line breaks
        ". ",      # Sentence ends
        "! ",      # Exclamation ends
        "? ",      # Question ends
        "; ",      # Semicolons
        ", ",      # Commas
        " "        # Words
    ]
    
    def __init__(self, encoding_name: str = "cl100k_base"):
        if TIKTOKEN_AVAILABLE:
            self.encoding = tiktoken.get_encoding(encoding_name)
        else:
            self.encoding = None
        
    def count_tokens(self, text: str) -> int:
        """Count tokens in text"""
        if self.encoding:
            return len(self.encoding.encode(text))
        else:
            # Fallback: estimate ~4 chars per token
            return len(text) // 4
    
    def split_by_delimiter(self, text: str, delimiter: str) -> List[str]:
        """Split text by delimiter and return non-empty chunks"""
        chunks = text.split(delimiter)
        # Filter out empty chunks but preserve the delimiter context
        return [chunk for chunk in chunks if chunk.strip()]
    
    def find_split_point(self, text: str, max_tokens: int) -> Tuple[str, str]:
        """
        Find optimal split point in text that respects token limit and semantic boundaries
        
        Returns:
            Tuple of (first_part, remaining_part)
        """
        # If text fits within limit, return as is
        if self.count_tokens(text) <= max_tokens:
            return text, ""
            
        # Try each delimiter in order of preference
        for delimiter in self.DELIMITERS:
            chunks = self.split_by_delimiter(text, delimiter)
            
            if len(chunks) <= 1:
                continue
                
            # Try to find a split point that respects the token limit
            accumulated = ""
            for i, chunk in enumerate(chunks):
                # Check if adding this chunk would exceed limit
                test_text = accumulated + (delimiter if accumulated else "") + chunk
                if self.count_tokens(test_text) > max_tokens:
                    if accumulated:
                        # Return what we have so far
                        remaining = delimiter.join(chunks[i:])
                        return accumulated, remaining
                    else:
                        # Single chunk is too large, try next delimiter
                        break
                accumulated = test_text
                
        # If no good split found, fall back to hard truncation
        if self.encoding:
            tokens = self.encoding.encode(text)
            truncated_tokens = tokens[:max_tokens]
            remaining_tokens = tokens[max_tokens:]
            
            first_part = self.encoding.decode(truncated_tokens)
            remaining_part = self.encoding.decode(remaining_tokens) if remaining_tokens else ""
        else:
            # Character-based fallback
            char_limit = max_tokens * 4  # Approximate
            first_part = text[:char_limit]
            remaining_part = text[char_limit:]
        
        return first_part, remaining_part
    
    def chunk_text(self, text: str, max_tokens: int, overlap_tokens: int = 50) -> List[Dict[str, Any]]:
        """
        Chunk text into smaller pieces respecting token limits and semantic boundaries
        
        Args:
            text: The text to chunk
            max_tokens: Maximum tokens per chunk
            overlap_tokens: Number of tokens to overlap between chunks for context
            
        Returns:
            List of chunk dictionaries with text and metadata
        """
        chunks = []
        remaining = text
        chunk_index = 0
        previous_overlap = ""
        
        while remaining:
            # Add overlap from previous chunk if available
            current_text = previous_overlap + remaining if previous_overlap else remaining
            
            # Find split point
            chunk_text, remaining = self.find_split_point(current_text, max_tokens)
            
            # Create chunk metadata
            chunk = {
                "index": chunk_index,
                "text": chunk_text,
                "tokens": self.count_tokens(chunk_text),
                "has_more": bool(remaining)
            }
            chunks.append(chunk)
            
            # Prepare overlap for next chunk (if there is one)
            if remaining:
                # Extract last N tokens for overlap
                overlap_text = self._extract_overlap(chunk_text, overlap_tokens)
                previous_overlap = overlap_text + " ... " if overlap_text else ""
            
            chunk_index += 1
            
        # Add total chunks count to each chunk
        for chunk in chunks:
            chunk["total_chunks"] = len(chunks)
            
        return chunks
    
    def _extract_overlap(self, text: str, overlap_tokens: int) -> str:
        """Extract the last N tokens from text for overlap"""
        if self.encoding:
            tokens = self.encoding.encode(text)
            if len(tokens) <= overlap_tokens:
                return text
                
            overlap_tokens_list = tokens[-overlap_tokens:]
            return self.encoding.decode(overlap_tokens_list)
        else:
            # Character-based fallback
            char_overlap = overlap_tokens * 4  # Approximate
            if len(text) <= char_overlap:
                return text
            return text[-char_overlap:]
    
    def chunk_for_embedding(self, text: str, max_tokens: int = 512, 
                           stride_tokens: int = 256) -> List[str]:
        """
        Chunk text specifically for embedding models with stride/overlap
        
        Args:
            text: Text to chunk
            max_tokens: Maximum tokens per chunk (default 512 for most embedding models)
            stride_tokens: Number of tokens to advance for each chunk (creates overlap)
            
        Returns:
            List of text chunks suitable for embedding
        """
        if self.encoding:
            tokens = self.encoding.encode(text)
            chunks = []
            
            start = 0
            while start < len(tokens):
                end = min(start + max_tokens, len(tokens))
                chunk_tokens = tokens[start:end]
                chunk_text = self.encoding.decode(chunk_tokens)
                chunks.append(chunk_text)
                
                # Move forward by stride amount
                start += stride_tokens
                
                # If we're near the end, make sure we get the last bit
                if start < len(tokens) and start + max_tokens >= len(tokens):
                    start = len(tokens) - max_tokens
                    
            return chunks
        else:
            # Character-based fallback
            char_max = max_tokens * 4
            char_stride = stride_tokens * 4
            chunks = []
            
            start = 0
            while start < len(text):
                end = min(start + char_max, len(text))
                chunk_text = text[start:end]
                chunks.append(chunk_text)
                
                start += char_stride
                
                if start < len(text) and start + char_max >= len(text):
                    start = len(text) - char_max
                    
            return chunks
    
    def create_hierarchical_chunks(self, text: str, levels: List[int] = None) -> Dict[str, List[Dict]]:
        """
        Create hierarchical chunks at different granularity levels
        
        Args:
            text: Text to chunk
            levels: List of token limits for each level (default: [500, 2000, 8000])
            
        Returns:
            Dict mapping level names to chunk lists
        """
        if levels is None:
            levels = [500, 2000, 8000]  # Fine, medium, coarse
            
        hierarchical_chunks = {}
        
        for i, max_tokens in enumerate(levels):
            level_name = f"level_{i}_{'fine' if i == 0 else 'medium' if i == 1 else 'coarse'}"
            chunks = self.chunk_text(text, max_tokens)
            hierarchical_chunks[level_name] = chunks
            
        return hierarchical_chunks