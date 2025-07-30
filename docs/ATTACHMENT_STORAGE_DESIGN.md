# Attachment Storage Design for PUO Memo

## Overview
This document outlines the design for adding file attachment support to PUO Memo, enabling storage of PDFs, images, screenshots, code files, and other documents alongside text memories.

## Storage Options Analysis

### Option 1: Google Cloud Storage (Recommended)
**Pros:**
- Scalable and reliable
- Integrated with existing Google Cloud SQL setup
- Direct URLs for access
- Built-in CDN capabilities
- Supports large files
- Cost-effective for storage

**Cons:**
- Requires GCS bucket setup
- Additional API credentials needed
- Network dependency for all file access

### Option 2: PostgreSQL Binary Storage
**Pros:**
- Single system (no additional infrastructure)
- Transactional consistency
- Easy backup with database

**Cons:**
- Database bloat
- Poor performance for large files
- Limited to ~1GB per file
- Expensive database storage

### Option 3: Local Filesystem
**Pros:**
- Simple implementation
- No external dependencies
- Fast local access

**Cons:**
- Not scalable
- Backup complexity
- No remote access
- MCP server must manage file paths

## Recommended Architecture

### Hybrid Approach: Metadata in PostgreSQL + Files in Google Cloud Storage

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   MCP Client    │────▶│   PUO Memo MCP   │────▶│  PostgreSQL DB  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │                            │
                               │                     ┌──────────────┐
                               └────────────────────▶│ attachments  │
                                                    │    table     │
                                                    └──────────────┘
                               ┌──────────────────┐
                               │  Google Cloud    │
                               │    Storage       │
                               └──────────────────┘
```

## Database Schema

```sql
-- Attachments table
CREATE TABLE IF NOT EXISTS attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id UUID REFERENCES memory_entities(id) ON DELETE CASCADE,
    filename VARCHAR(500) NOT NULL,
    original_filename VARCHAR(500) NOT NULL,
    mime_type VARCHAR(200) NOT NULL,
    file_size BIGINT NOT NULL,
    storage_path TEXT NOT NULL,
    storage_type VARCHAR(50) DEFAULT 'gcs', -- 'gcs', 'local', 'inline'
    
    -- Extracted metadata
    extracted_text TEXT, -- For PDFs, documents
    image_description TEXT, -- For images (from Gemini Vision)
    thumbnail_path TEXT, -- For previews
    
    -- Embeddings for content
    content_embedding vector(768),
    embedding_model VARCHAR(100),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    upload_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'completed', 'failed'
    processing_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_attachments_memory ON attachments(memory_id);
CREATE INDEX idx_attachments_mime ON attachments(mime_type);
CREATE INDEX idx_attachments_status ON attachments(upload_status, processing_status);
```

## File Processing Pipeline

### 1. Upload Flow
```python
async def attach_file(memory_id: str, file_data: bytes, filename: str, mime_type: str):
    # 1. Create attachment record
    attachment_id = create_attachment_record(memory_id, filename, mime_type)
    
    # 2. Upload to GCS
    gcs_path = f"attachments/{memory_id}/{attachment_id}/{filename}"
    upload_to_gcs(file_data, gcs_path)
    
    # 3. Process based on type
    if mime_type.startswith('image/'):
        await process_image(attachment_id, file_data)
    elif mime_type == 'application/pdf':
        await process_pdf(attachment_id, file_data)
    elif mime_type.startswith('text/'):
        await process_text(attachment_id, file_data)
    
    # 4. Update status
    update_attachment_status(attachment_id, 'completed')
```

### 2. Processing by File Type

#### Images (PNG, JPG, etc.)
- Generate thumbnail (200x200)
- Extract description using Gemini Vision
- Generate embedding from description
- Extract EXIF metadata

#### PDFs
- Extract text content
- Generate page thumbnails
- Create embeddings from text
- Extract metadata (author, title, etc.)

#### Text/Code Files
- Store content directly
- Detect programming language
- Generate embeddings
- Syntax highlighting metadata

## MCP Interface Updates

### New Tool: `attach`
```json
{
  "name": "attach",
  "description": "📎 Attach a file to a memory",
  "inputSchema": {
    "type": "object",
    "properties": {
      "memory_id": {
        "type": "string",
        "description": "Memory to attach file to"
      },
      "file_path": {
        "type": "string", 
        "description": "Path to file to attach"
      },
      "description": {
        "type": "string",
        "description": "Optional description of attachment"
      }
    },
    "required": ["memory_id", "file_path"]
  }
}
```

### Updated `memory` Tool
- Add `attachments` parameter (array of file paths)
- Automatically process attachments during memory creation

### Updated `recall` Tool
- Include attachments in search results
- Search attachment content and descriptions

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- [ ] Create attachments table
- [ ] Set up Google Cloud Storage bucket
- [ ] Implement basic upload/download

### Phase 2: File Processing (Week 2)
- [ ] Image processing with thumbnails
- [ ] PDF text extraction
- [ ] Text file handling

### Phase 3: Search Integration (Week 3)
- [ ] Attachment content in semantic search
- [ ] Combined text + attachment search
- [ ] Attachment-based entity extraction

### Phase 4: Advanced Features (Week 4)
- [ ] OCR for images with text
- [ ] Audio transcription
- [ ] Video frame extraction

## Security Considerations

1. **Access Control**
   - Generate signed URLs for GCS access
   - Validate file types and sizes
   - Scan for malware

2. **Privacy**
   - Encrypt sensitive files
   - Respect memory context boundaries
   - Audit file access

3. **Limits**
   - Max file size: 100MB
   - Allowed types: images, PDFs, text, code
   - Rate limiting on uploads

## Configuration

```python
# .env additions
GCS_BUCKET_NAME=puo-memo-attachments
GCS_PROJECT_ID=your-project-id
GCS_CREDENTIALS_PATH=/path/to/service-account.json
MAX_ATTACHMENT_SIZE=104857600  # 100MB
ALLOWED_MIME_TYPES=image/*,application/pdf,text/*
```

## Future Enhancements

1. **Smart Previews**
   - Rich previews for links
   - Code syntax highlighting
   - Document summaries

2. **Collaborative Features**
   - Shared attachments
   - Version control
   - Comments on attachments

3. **AI Enhancement**
   - Auto-tagging from content
   - Similar image search
   - Document clustering