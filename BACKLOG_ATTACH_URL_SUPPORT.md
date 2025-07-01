# Backlog: Fix Attach Tool URL Support

## 🐛 Issue Identified
The `attach` MCP tool claims to support "File paths or URLs" but only works with local files. URLs fail with "File not found" error.

## 🔍 Investigation Findings

### Current Architecture:
1. **MCP Server**: Tool description says "File paths or URLs" but implementation doesn't handle URLs
2. **AttachmentProcessor.attach_file()**: Only handles local files using `Path(file_path).exists()`
3. **URL Support**: Already exists in memory creation flow but NOT in standalone attach tool

### URL Handling Code Location:
- Working URL logic: `src/core/memory.py` lines 183-203
- URL downloader: `src/utils/url_downloader.py` - `download_url_content()`
- Broken method: `src/core/attachments.py` - `attach_file()` line 125-127

### The Gap:
```python
# Current attach_file() method:
file_path = Path(file_path)
if not file_path.exists():  # This fails for URLs!
    return {"error": "File not found"}
```

## ✅ Solution Plan

Modify `attach_file()` in `src/core/attachments.py` to:

1. **Detect URLs**:
```python
if file_path.startswith(('http://', 'https://')):
    # Handle URL download
```

2. **Download URL to temp file**:
```python
from src.utils.url_downloader import download_url_content
text_content, temp_file, url_metadata = await download_url_content(file_path)
```

3. **Process temp file** (existing logic)

4. **Clean up**:
```python
os.unlink(temp_file)
```

## 📋 Implementation Tasks
- [ ] Add URL detection to attach_file()
- [ ] Import and use download_url_content()
- [ ] Handle URL metadata (source_url, content_type, filename)
- [ ] Add proper error handling for download failures
- [ ] Test with various URL types (images, PDFs, text)
- [ ] Update documentation

## 🎯 Priority: Medium
Users expect URL support based on tool description. This fixes a misleading interface.

---
**Investigation Date**: 2025-06-30
**Estimated Effort**: 2-3 hours
**Files to Modify**: 1 (`src/core/attachments.py`)
**Dependencies**: Existing URL downloader utility