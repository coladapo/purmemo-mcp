"""
Rich text formatting support for PUO Memo
Handles Markdown, HTML, and special formatting
"""
import re
import html
import json
from typing import Dict, Any, Optional, List
import logging

logger = logging.getLogger(__name__)

try:
    import markdown
    from markdown.extensions import tables, fenced_code, codehilite
    MARKDOWN_AVAILABLE = True
except ImportError:
    MARKDOWN_AVAILABLE = False
    logger.info("Markdown library not available - rich text features limited")

try:
    from pygments import highlight
    from pygments.lexers import get_lexer_by_name, guess_lexer
    from pygments.formatters import HtmlFormatter
    PYGMENTS_AVAILABLE = True
except ImportError:
    PYGMENTS_AVAILABLE = False
    logger.info("Pygments not available - syntax highlighting disabled")


class RichTextProcessor:
    """Process and render rich text content"""
    
    def __init__(self):
        self.md = None
        if MARKDOWN_AVAILABLE:
            # Configure markdown with useful extensions
            self.md = markdown.Markdown(extensions=[
                'tables',
                'fenced_code',
                'nl2br',  # Convert newlines to <br>
                'sane_lists',
                'footnotes',
                'admonition',  # For notes, warnings, etc.
                'toc',  # Table of contents
                'meta',  # Metadata support
            ])
    
    def process_memory_content(self, content: str, format_type: str = 'auto') -> Dict[str, Any]:
        """
        Process memory content with rich formatting
        
        Args:
            content: Raw content
            format_type: 'auto', 'markdown', 'html', 'plain'
            
        Returns:
            Dict with processed content and metadata
        """
        if format_type == 'auto':
            format_type = self._detect_format(content)
        
        result = {
            'original': content,
            'format': format_type,
            'processed': content,
            'metadata': {},
            'has_code': False,
            'has_links': False,
            'has_tables': False,
            'has_images': False
        }
        
        if format_type == 'markdown':
            result.update(self._process_markdown(content))
        elif format_type == 'html':
            result.update(self._process_html(content))
        else:
            result.update(self._process_plain(content))
        
        return result
    
    def _detect_format(self, content: str) -> str:
        """Detect content format"""
        # Check for HTML tags
        if re.search(r'<[^>]+>', content):
            return 'html'
        
        # Check for Markdown indicators
        markdown_patterns = [
            r'^#{1,6}\s',  # Headers
            r'\[.*\]\(.*\)',  # Links
            r'```[\s\S]*```',  # Code blocks
            r'\*\*.*\*\*',  # Bold
            r'\|.*\|.*\|',  # Tables
            r'^\s*[-*+]\s',  # Lists
        ]
        
        for pattern in markdown_patterns:
            if re.search(pattern, content, re.MULTILINE):
                return 'markdown'
        
        return 'plain'
    
    def _process_markdown(self, content: str) -> Dict[str, Any]:
        """Process Markdown content"""
        result = {}
        
        if not self.md:
            return {'processed': content}
        
        # Extract code blocks for special handling
        code_blocks = []
        def extract_code(match):
            code_blocks.append(match.group(0))
            return f"<!--CODE_BLOCK_{len(code_blocks)-1}-->"
        
        content_with_placeholders = re.sub(
            r'```[\s\S]*?```',
            extract_code,
            content
        )
        
        # Convert to HTML
        html_content = self.md.convert(content_with_placeholders)
        
        # Process code blocks with syntax highlighting
        if PYGMENTS_AVAILABLE and code_blocks:
            for i, code_block in enumerate(code_blocks):
                highlighted = self._highlight_code_block(code_block)
                html_content = html_content.replace(
                    f"<!--CODE_BLOCK_{i}-->",
                    highlighted
                )
            result['has_code'] = True
        
        # Restore code blocks without highlighting if Pygments not available
        elif code_blocks:
            for i, code_block in enumerate(code_blocks):
                html_content = html_content.replace(
                    f"<!--CODE_BLOCK_{i}-->",
                    f"<pre><code>{html.escape(code_block)}</code></pre>"
                )
            result['has_code'] = True
        
        # Extract metadata
        result['processed'] = html_content
        result['has_links'] = bool(re.search(r'<a\s+href=', html_content))
        result['has_tables'] = bool(re.search(r'<table', html_content))
        result['has_images'] = bool(re.search(r'<img', html_content))
        
        # Extract all links for preview generation
        links = re.findall(r'href=["\'](https?://[^"\']+)["\']', html_content)
        if links:
            result['links'] = list(set(links))
        
        # Extract headers for TOC
        headers = re.findall(r'<h([1-6])[^>]*>(.*?)</h\1>', html_content)
        if headers:
            result['headers'] = [(int(level), text) for level, text in headers]
        
        return result
    
    def _highlight_code_block(self, code_block: str) -> str:
        """Highlight code block with Pygments"""
        # Extract language and code
        match = re.match(r'```(\w+)?\n([\s\S]*?)```', code_block)
        if not match:
            return f"<pre><code>{html.escape(code_block)}</code></pre>"
        
        language = match.group(1) or 'text'
        code = match.group(2)
        
        try:
            if language == 'text':
                lexer = guess_lexer(code)
            else:
                lexer = get_lexer_by_name(language)
            
            formatter = HtmlFormatter(
                style='monokai',
                noclasses=True,
                cssclass='highlight'
            )
            
            highlighted = highlight(code, lexer, formatter)
            return f'<div class="code-block lang-{language}">{highlighted}</div>'
            
        except Exception as e:
            logger.debug(f"Code highlighting failed: {e}")
            return f"<pre><code class='language-{language}'>{html.escape(code)}</code></pre>"
    
    def _process_html(self, content: str) -> Dict[str, Any]:
        """Process HTML content"""
        # Basic sanitization (in production, use a proper HTML sanitizer)
        result = {
            'processed': content,
            'has_links': bool(re.search(r'<a\s+href=', content)),
            'has_tables': bool(re.search(r'<table', content)),
            'has_images': bool(re.search(r'<img', content)),
            'has_code': bool(re.search(r'<code', content))
        }
        
        # Extract links
        links = re.findall(r'href=["\'](https?://[^"\']+)["\']', content)
        if links:
            result['links'] = list(set(links))
        
        return result
    
    def _process_plain(self, content: str) -> Dict[str, Any]:
        """Process plain text content"""
        # Auto-linkify URLs
        url_pattern = r'(https?://[^\s]+)'
        processed = re.sub(url_pattern, r'<a href="\1">\1</a>', content)
        
        # Convert newlines to <br> for better display
        processed = processed.replace('\n', '<br>\n')
        
        # Detect code-like content
        has_code = bool(re.search(r'```|def\s+\w+|function\s+\w+|class\s+\w+', content))
        
        result = {
            'processed': f"<p>{processed}</p>",
            'has_code': has_code,
            'has_links': bool(re.search(url_pattern, content))
        }
        
        # Extract URLs
        urls = re.findall(url_pattern, content)
        if urls:
            result['links'] = list(set(urls))
        
        return result
    
    def extract_snippets(self, content: str, max_length: int = 200) -> List[str]:
        """Extract meaningful snippets from content"""
        # Remove HTML tags
        text = re.sub(r'<[^>]+>', '', content)
        
        # Split into sentences
        sentences = re.split(r'[.!?]+', text)
        
        snippets = []
        current_snippet = ""
        
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue
                
            if len(current_snippet) + len(sentence) < max_length:
                current_snippet += sentence + ". "
            else:
                if current_snippet:
                    snippets.append(current_snippet.strip())
                current_snippet = sentence + ". "
        
        if current_snippet:
            snippets.append(current_snippet.strip())
        
        return snippets[:5]  # Return top 5 snippets
    
    def render_for_display(self, content: str, format_type: str = 'auto',
                          theme: str = 'default') -> str:
        """
        Render content for display with proper styling
        """
        processed = self.process_memory_content(content, format_type)
        
        # Wrap in container with theme
        styles = self._get_theme_styles(theme)
        
        html = f"""
        <div class="puo-memo-content {theme}-theme">
            <style>{styles}</style>
            {processed['processed']}
        </div>
        """
        
        return html
    
    def _get_theme_styles(self, theme: str) -> str:
        """Get CSS styles for theme"""
        if theme == 'dark':
            return """
            .puo-memo-content {
                color: #e0e0e0;
                background: #1a1a1a;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            .puo-memo-content code {
                background: #2a2a2a;
                color: #f8f8f2;
                padding: 2px 4px;
                border-radius: 3px;
            }
            .puo-memo-content a {
                color: #6db3f2;
            }
            .puo-memo-content table {
                border-collapse: collapse;
                margin: 1em 0;
            }
            .puo-memo-content th, .puo-memo-content td {
                border: 1px solid #444;
                padding: 8px;
            }
            """
        else:
            return """
            .puo-memo-content {
                color: #333;
                background: #fff;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            .puo-memo-content code {
                background: #f5f5f5;
                color: #d14;
                padding: 2px 4px;
                border-radius: 3px;
            }
            .puo-memo-content a {
                color: #0066cc;
            }
            .puo-memo-content table {
                border-collapse: collapse;
                margin: 1em 0;
            }
            .puo-memo-content th, .puo-memo-content td {
                border: 1px solid #ddd;
                padding: 8px;
            }
            """