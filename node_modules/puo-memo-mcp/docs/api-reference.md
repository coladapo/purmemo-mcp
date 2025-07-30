# API Reference

This document describes all available tools and their parameters in PUO Memo MCP.

## Available Tools

### memory

Create or update a memory with intelligent deduplication and organization.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| content | string | Yes | The content to remember |
| title | string | No | Optional title for the memory |
| tags | array | No | Tags for categorization |
| memory_id | string | No | ID to update existing memory |
| force | boolean | No | Skip duplicate check (default: false) |
| dedup_window | integer | No | Seconds to check for duplicates (default: 300) |
| merge_strategy | string | No | How to merge duplicates: 'smart', 'append', 'replace' |
| attachments | array | No | File paths or URLs to attach |

**Example:**

```json
{
  "tool": "memory",
  "arguments": {
    "content": "Meeting with team at 3pm tomorrow to discuss Q4 goals",
    "title": "Team Meeting",
    "tags": ["meetings", "planning", "q4"]
  }
}
```

### recall

Search and retrieve memories using various search strategies.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | No | Search query (empty for recent memories) |
| search_type | string | No | 'keyword', 'semantic', 'hybrid', 'entity', 'nlp' |
| limit | integer | No | Results per page (default: 10) |
| offset | integer | No | Pagination offset (default: 0) |
| model | string | No | AI model for adaptive content delivery |

**Example:**

```json
{
  "tool": "recall",
  "arguments": {
    "query": "team meetings about Q4",
    "search_type": "hybrid",
    "limit": 5
  }
}
```

### entities

List entities or explore the knowledge graph.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| entity_name | string | No | Get graph for specific entity |
| entity_type | string | No | Filter by type: person, organization, location, etc. |
| depth | integer | No | Graph traversal depth (default: 2) |

**Example:**

```json
{
  "tool": "entities",
  "arguments": {
    "entity_type": "person",
    "depth": 3
  }
}
```

### attach

Attach files to an existing memory.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| memory_id | string | Yes | Memory ID to attach files to |
| file_paths | array | Yes | Array of file paths or URLs |
| descriptions | array | No | Optional descriptions for each file |

**Example:**

```json
{
  "tool": "attach",
  "arguments": {
    "memory_id": "550e8400-e29b-41d4-a716-446655440000",
    "file_paths": ["/path/to/document.pdf", "https://example.com/image.png"],
    "descriptions": ["Project proposal", "Architecture diagram"]
  }
}
```

### import_chat

Import conversations from AI assistants.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| file_path | string | Yes | Path to chat export file |
| extract_entities | boolean | No | Extract entities using AI (default: true) |
| extract_actions | boolean | No | Extract TODO items (default: true) |
| merge_strategy | string | No | 'smart', 'skip', 'force' |
| project_tag | string | No | Project to associate with import |

**Example:**

```json
{
  "tool": "import_chat",
  "arguments": {
    "file_path": "/downloads/claude_conversation.json",
    "project_tag": "ai-research"
  }
}
```

### find_references

Find external references, action items, and cross-conversation links.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| reference_type | string | No | 'github', 'url', 'slack_user', 'action_item', 'conversation', 'all' |
| conversation_id | string | No | Filter by specific conversation |
| status | string | No | For action items: 'pending', 'completed', 'all' |
| limit | integer | No | Maximum results (default: 20) |

**Example:**

```json
{
  "tool": "find_references",
  "arguments": {
    "reference_type": "action_item",
    "status": "pending"
  }
}
```

### link_conversations

Link related conversations together.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| source_conversation_id | string | Yes | Source conversation ID |
| target_conversation_id | string | Yes | Target conversation ID |
| link_type | string | No | 'continuation', 'reference', 'related', 'followup' |
| context | string | No | Optional context about the relationship |

**Example:**

```json
{
  "tool": "link_conversations",
  "arguments": {
    "source_conversation_id": "conv-123",
    "target_conversation_id": "conv-456",
    "link_type": "continuation",
    "context": "Follow-up discussion after the initial planning"
  }
}
```

### correction

Add a correction to an existing memory.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| memory_id | string | Yes | ID of memory to correct |
| correction | string | Yes | The corrected content |
| reason | string | No | Reason for the correction |

**Example:**

```json
{
  "tool": "correction",
  "arguments": {
    "memory_id": "mem-789",
    "correction": "The meeting is at 4pm, not 3pm",
    "reason": "Time was changed after initial scheduling"
  }
}
```

## Response Formats

### Success Response

```json
{
  "status": "success",
  "data": {
    // Tool-specific response data
  },
  "metadata": {
    "timestamp": "2025-07-30T12:00:00Z",
    "version": "1.0.0"
  }
}
```

### Error Response

```json
{
  "status": "error",
  "error": {
    "code": "INVALID_PARAMETER",
    "message": "Missing required parameter: content",
    "details": {
      // Additional error context
    }
  }
}
```

## Error Codes

| Code | Description |
|------|-------------|
| AUTH_FAILED | Invalid or missing API key |
| INVALID_PARAMETER | Missing or invalid parameter |
| NOT_FOUND | Resource not found |
| RATE_LIMIT | Rate limit exceeded |
| SERVER_ERROR | Internal server error |

## Rate Limits

- **Default**: 100 requests per minute
- **Bulk operations**: 10 requests per minute
- **File uploads**: 20 MB per file, 100 MB total per hour

## Best Practices

1. **Use deduplication**: Let the system merge similar memories automatically
2. **Tag consistently**: Use consistent tag names for better organization
3. **Batch operations**: Use bulk imports for large datasets
4. **Entity extraction**: Enable for better knowledge graph building
5. **Error handling**: Always handle potential errors gracefully

## Examples

### Creating a Memory with Attachments

```javascript
const result = await mcp.use_tool("memory", {
  content: "Design review meeting notes",
  title: "Q4 Design Review",
  tags: ["design", "review", "q4"],
  attachments: ["/path/to/notes.pdf", "/path/to/mockups.png"]
});
```

### Searching with Semantic Understanding

```javascript
const results = await mcp.use_tool("recall", {
  query: "What were the main points from our design discussions?",
  search_type: "semantic",
  limit: 10
});
```

### Building a Knowledge Graph

```javascript
// Get all people mentioned
const people = await mcp.use_tool("entities", {
  entity_type: "person"
});

// Get connections for a specific person
const connections = await mcp.use_tool("entities", {
  entity_name: "John Smith",
  depth: 3
});
```

## Next Steps

- [View Examples](./examples.md)
- [Troubleshooting Guide](./troubleshooting.md)
- [GitHub Repository](https://github.com/coladapo/puo-memo-mcp)