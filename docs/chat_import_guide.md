# PUO Memo Chat Import Guide

## Overview

The enhanced PUO Memo system now supports importing conversations from Claude, ChatGPT, and other AI assistants. This guide explains how to use the new chat import features.

## New Features

### 1. Import Chat Tool

Import conversations from various AI platforms:

```json
{
  "tool": "import_chat",
  "arguments": {
    "file_path": "/path/to/export.json",
    "project_tag": "my-project",
    "extract_entities": true,
    "extract_actions": true,
    "merge_strategy": "smart"
  }
}
```

Supported formats:
- Claude JSON exports
- ChatGPT HTML exports
- Claude/AI markdown conversations
- Generic JSON with messages array

### 2. Find References Tool

Search for action items, external references, and links:

```json
{
  "tool": "find_references",
  "arguments": {
    "reference_type": "action_item",
    "status": "pending",
    "limit": 20
  }
}
```

Reference types:
- `action_item` - TODOs, tasks, and follow-ups
- `github` - GitHub repository references
- `url` - General web links
- `slack_user` - Slack user mentions
- `conversation` - Cross-conversation references
- `all` - All types

### 3. Link Conversations Tool

Create relationships between related conversations:

```json
{
  "tool": "link_conversations",
  "arguments": {
    "source_conversation_id": "conv_123",
    "target_conversation_id": "conv_456",
    "link_type": "continuation",
    "context": "Follow-up discussion from yesterday"
  }
}
```

Link types:
- `continuation` - Direct continuation
- `reference` - Mentions or references
- `related` - Topically related
- `followup` - Follow-up discussion

## Database Schema Enhancements

### New Tables

1. **conversation_metadata** - Stores conversation-level information
2. **action_items** - Extracted TODOs and tasks
3. **external_references** - URLs, GitHub links, Slack mentions
4. **conversation_links** - Relationships between conversations

### Enhanced memory_entities

Added columns:
- `source_platform` - Where the conversation originated
- `conversation_id` - Groups messages by conversation
- `message_role` - User/assistant/system
- `has_action_items` - Quick filter for actionable content
- `referenced_conversations` - Array of related conversation IDs

## Setup Instructions

1. Run the database migration:
```bash
python scripts/enable_chat_import.py
```

2. Verify the setup:
```bash
# Check that new tables exist
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "\dt"
```

## Usage Examples

### Import a Claude Conversation

```python
# Using the MCP tool
result = await mcp.call_tool("import_chat", {
    "file_path": "claude_export_2024.json",
    "project_tag": "puo-memo-dev"
})
```

### Find Pending Tasks

```python
# Find all pending action items
tasks = await mcp.call_tool("find_references", {
    "reference_type": "action_item",
    "status": "pending"
})
```

### Link Related Chats

```python
# Link two conversations
link = await mcp.call_tool("link_conversations", {
    "source_conversation_id": "claude_123",
    "target_conversation_id": "claude_456",
    "link_type": "continuation"
})
```

## Context Extraction Features

The import system automatically extracts:

1. **Action Items**
   - TODO/TASK/ACTION patterns
   - Checkbox items `- [ ]`
   - FOLLOWUP directives

2. **Project References**
   - "working on X project"
   - "for project Y"
   - #project-tags

3. **External References**
   - GitHub URLs with issue/PR detection
   - General web links
   - Slack user mentions

4. **Cross-Conversation References**
   - "as we discussed yesterday"
   - "in our previous chat"
   - "continuing our conversation"

## Best Practices

1. **Use Project Tags** - Always specify a project_tag when importing to organize conversations

2. **Review Action Items** - After import, use find_references to review extracted action items

3. **Link Related Conversations** - Manually link conversations that reference each other

4. **Merge Strategy**
   - `smart` - Intelligently merge similar content
   - `skip` - Skip if duplicate found  
   - `force` - Always create new entry

## Troubleshooting

If import fails:
1. Check file format is supported
2. Verify file path is accessible
3. Ensure database has been migrated
4. Check logs for specific errors

For large imports:
- Consider breaking into smaller files
- Monitor database storage usage
- Use `extract_entities: false` for faster initial import