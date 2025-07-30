"""
URL content downloader for PUO Memo MCP
Handles downloading and processing web content for attachments
"""

import aiohttp
import asyncio
import logging
import tempfile
import os
from typing import Optional, Dict, Any, Tuple
from urllib.parse import urlparse, unquote
import mimetypes
from pathlib import Path

from src.utils.retry import retry, RetryConfig

logger = logging.getLogger(__name__)

# Retry configuration for URL downloads
URL_RETRY_CONFIG = RetryConfig(
    max_attempts=3,
    initial_delay=1.0,
    max_delay=10.0,
    exceptions=(aiohttp.ClientError, asyncio.TimeoutError)
)

# Maximum file size for downloads (50MB)
MAX_DOWNLOAD_SIZE = 50 * 1024 * 1024

# Allowed content types
ALLOWED_CONTENT_TYPES = {
    'text/html',
    'text/plain',
    'text/markdown',
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/json',
    'application/xml',
    'text/xml',
}


class URLDownloader:
    """Downloads and processes content from URLs"""
    
    def __init__(self, timeout: int = 30, use_pool: bool = True):
        self.timeout = aiohttp.ClientTimeout(total=timeout)
        self.session: Optional[aiohttp.ClientSession] = None
        self.use_pool = use_pool
        
        # Import connection pool if available
        if use_pool:
            try:
                from src.utils.connection_pool import connection_pool
                self.pool = connection_pool
            except ImportError:
                self.use_pool = False
                self.pool = None
        
    async def __aenter__(self):
        """Async context manager entry"""
        # Always ensure we have a session
        await self.ensure_session()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.session and not self.use_pool:
            await self.session.close()
            self.session = None
            
    async def ensure_session(self):
        """Ensure session exists for standalone usage"""
        if not self.use_pool and not self.session:
            self.session = aiohttp.ClientSession(timeout=self.timeout)
            
    @retry(config=URL_RETRY_CONFIG)
    async def download_url(self, url: str) -> Tuple[str, Dict[str, Any]]:
        """
        Download content from URL and save to temporary file
        
        Args:
            url: URL to download from
            
        Returns:
            Tuple of (temp_file_path, metadata)
            
        Raises:
            ValueError: If URL is invalid or content type not allowed
            aiohttp.ClientError: If download fails
        """
        # Validate URL
        parsed = urlparse(url)
        if not parsed.scheme or not parsed.netloc:
            raise ValueError(f"Invalid URL: {url}")
            
        logger.info(f"Downloading content from: {url}")
        
        # Use connection pool if available
        if self.use_pool and self.pool and hasattr(self.pool, 'get_http_session'):
            try:
                async with self.pool.get_http_session() as session:
                    async with session.get(url) as response:
                        return await self._process_response(response, parsed)
            except Exception as e:
                logger.warning(f"Connection pool failed, falling back to direct session: {e}")
                # Fall through to direct session
        
        # Use direct session
        await self.ensure_session()
        if not self.session:
            raise RuntimeError("HTTP session not initialized")
        async with self.session.get(url) as response:
            return await self._process_response(response, parsed)
                
    async def _process_response(self, response: aiohttp.ClientResponse, parsed_url) -> Tuple[str, Dict[str, Any]]:
        """Process the response and download content"""
        # Check response status
        response.raise_for_status()
        
        # Get content type and validate
        content_type = response.headers.get('Content-Type', '').split(';')[0].strip()
        if content_type and content_type not in ALLOWED_CONTENT_TYPES:
            # Check if it's a generic type that might be allowed
            if not any(content_type.startswith(allowed) for allowed in ['text/', 'image/', 'application/']):
                raise ValueError(f"Content type not allowed: {content_type}")
                
        # Check content length
        content_length = response.headers.get('Content-Length')
        if content_length and int(content_length) > MAX_DOWNLOAD_SIZE:
            raise ValueError(f"File too large: {int(content_length)} bytes (max: {MAX_DOWNLOAD_SIZE})")
            
        # Determine filename from URL or headers
        filename = self._get_filename_from_response(response, parsed_url)
        
        # Create temporary file
        suffix = Path(filename).suffix or self._get_extension_from_content_type(content_type)
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
            temp_path = tmp_file.name
            
            # Download with size limit
            downloaded = 0
            async for chunk in response.content.iter_chunked(8192):
                downloaded += len(chunk)
                if downloaded > MAX_DOWNLOAD_SIZE:
                    os.unlink(temp_path)
                    raise ValueError(f"Download exceeded maximum size of {MAX_DOWNLOAD_SIZE} bytes")
                tmp_file.write(chunk)
                
        logger.info(f"Downloaded {downloaded} bytes to {temp_path}")
        
        # Prepare metadata
        metadata = {
            'url': str(response.url),  # Use actual URL after redirects
            'content_type': content_type,
            'filename': filename,
            'size': downloaded,
            'headers': dict(response.headers),
            'status_code': response.status,
        }
        
        return temp_path, metadata
            
    def _get_filename_from_response(self, response: aiohttp.ClientResponse, parsed_url) -> str:
        """Extract filename from response headers or URL"""
        # Try Content-Disposition header
        content_disposition = response.headers.get('Content-Disposition', '')
        if 'filename=' in content_disposition:
            # Extract filename from header
            parts = content_disposition.split('filename=')
            if len(parts) > 1:
                filename = parts[1].strip('"\'')
                if filename:
                    return filename
                    
        # Fall back to URL path
        path = unquote(parsed_url.path)
        if path and path != '/':
            filename = os.path.basename(path)
            if filename:
                return filename
                
        # Generate default filename
        return f"download_{parsed_url.netloc.replace('.', '_')}"
        
    def _get_extension_from_content_type(self, content_type: str) -> str:
        """Get file extension from content type"""
        if not content_type:
            return '.txt'
            
        # Use mimetypes to get extension
        ext = mimetypes.guess_extension(content_type)
        if ext:
            return ext
            
        # Fallback mappings
        type_to_ext = {
            'text/html': '.html',
            'text/plain': '.txt',
            'text/markdown': '.md',
            'application/pdf': '.pdf',
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'application/json': '.json',
            'application/xml': '.xml',
        }
        
        return type_to_ext.get(content_type, '.txt')
        
    async def download_and_extract_text(self, url: str) -> Tuple[str, str, Dict[str, Any]]:
        """
        Download URL and extract text content
        
        Args:
            url: URL to download from
            
        Returns:
            Tuple of (text_content, temp_file_path, metadata)
        """
        temp_path, metadata = await self.download_url(url)
        
        try:
            # Extract text based on content type
            content_type = metadata.get('content_type', '')
            
            if content_type.startswith('text/'):
                # Read text file
                with open(temp_path, 'r', encoding='utf-8', errors='ignore') as f:
                    text_content = f.read()
                    
            elif content_type == 'application/json':
                # Read JSON as text
                with open(temp_path, 'r', encoding='utf-8') as f:
                    import json
                    data = json.load(f)
                    text_content = json.dumps(data, indent=2)
                    
            elif content_type == 'application/pdf':
                # For PDFs, we'll need vision analysis
                text_content = f"[PDF Document: {metadata['filename']} - Requires vision analysis for text extraction]"
                
            elif content_type.startswith('image/'):
                # For images, we'll need vision analysis
                text_content = f"[Image: {metadata['filename']} - Requires vision analysis for content extraction]"
                
            else:
                # Unknown type, try to read as text
                try:
                    with open(temp_path, 'r', encoding='utf-8', errors='ignore') as f:
                        text_content = f.read()
                except:
                    text_content = f"[Binary file: {metadata['filename']} - Content not extractable as text]"
                    
            return text_content, temp_path, metadata
            
        except Exception as e:
            # Clean up temp file on error
            if os.path.exists(temp_path):
                os.unlink(temp_path)
            raise


# Convenience function for one-off downloads
async def download_url_content(url: str) -> Tuple[str, str, Dict[str, Any]]:
    """
    Download URL content and extract text
    
    Args:
        url: URL to download
        
    Returns:
        Tuple of (text_content, temp_file_path, metadata)
    """
    async with URLDownloader() as downloader:
        return await downloader.download_and_extract_text(url)