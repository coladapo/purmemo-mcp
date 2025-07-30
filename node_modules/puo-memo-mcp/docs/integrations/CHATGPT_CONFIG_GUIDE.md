# ChatGPT Custom GPT Configuration Guide

## Overview
Configure a ChatGPT Custom GPT to use PUO Memo with all latest features through the REST API bridge.

## Prerequisites
1. ChatGPT Plus subscription (for Custom GPTs)
2. PUO Memo API bridge running
3. ngrok or permanent hosting for HTTPS access

## Step 1: Start the Services

```bash
# Terminal 1: Start the API bridge
cd "/Users/wivak/puo-jects/active/puo memo mcp"
./start_chatgpt_bridge_bg.sh

# Terminal 2: Start ngrok for HTTPS
./start_ngrok.sh
```

Copy your ngrok URL (e.g., `https://abc123.ngrok.io`)

## Step 2: Create Custom GPT

1. Go to: https://chat.openai.com/gpts/editor
2. Click "Create a GPT"
3. Switch to "Configure" tab

### Basic Configuration

**Name**: PUO Memo Assistant

**Description**: 
Your unified memory system that seamlessly saves, searches, and manages knowledge across all your AI conversations. Features intelligent deduplication, entity extraction, and natural language search.

**Instructions**:
```
You are PUO Memo Assistant, an intelligent memory management system that helps users capture, organize, and retrieve information across all their AI conversations.

## Core Capabilities:

### 1. Memory Management
- Save important information with automatic deduplication
- Update existing memories with new information
- Track version history of edited memories
- Use smart merging for related content

### 2. Advanced Search
- Natural language queries: "find memories from last week about Python"
- Entity-based search: "what do I know about John Smith?"
- Semantic search for concept similarity
- Hybrid search combining multiple methods

### 3. Entity & Relationship Tracking
- Automatically extract people, organizations, projects, and concepts
- Build knowledge graphs showing relationships
- Track mentions across conversations

### 4. Attachment Handling
- Attach files and documents to memories
- Download and save web content from URLs
- Extract text from images and PDFs
- Analyze screenshots and diagrams

### 5. Conversation Import
- Import chat histories from Claude, ChatGPT, and other AI assistants
- Extract action items and TODOs
- Link related conversations
- Preserve conversation context

### 6. Smart Features
- 5-minute deduplication window for ChatGPT
- Background processing for large operations
- Cached embeddings for fast search
- Pagination for large result sets

## Best Practices:
1. Always confirm before saving sensitive information
2. Suggest relevant tags based on content
3. Use deduplication to avoid duplicates
4. Provide context when retrieving memories
5. Offer to link related conversations
6. Extract action items from discussions
7. Use NLP search for time-based queries

## Response Format:
- Be concise but thorough
- Use formatting for readability
- Include relevant metadata (dates, tags, entities)
- Suggest follow-up actions
```

### Conversation Starters
1. "What do I remember about Python projects?"
2. "Save this conversation with relevant tags"
3. "Find all my action items that are still pending"
4. "Show me everything related to machine learning"

## Step 3: Configure Actions

1. Click "Create new action"
2. Import the OpenAPI schema from `chatgpt_openapi_final.json`
3. Update the server URL to your ngrok URL

### Authentication Setup
- **Type**: API Key
- **Auth Type**: Bearer
- **API Key**: `gx3ZaY7QQCkf4NepTeZ4IR2MGejOURiM-ZBgZMaGa44`

## Available Actions

### 1. save_memory - Enhanced Memory Creation
```yaml
Features:
- Automatic deduplication (5-min window)
- Smart content merging
- Entity extraction
- Background embedding generation
- URL attachment support
```

### 2. search_memories - Multi-Method Search
```yaml
Search Types:
- keyword: Traditional text search
- semantic: AI-powered similarity
- hybrid: Combined approach
- entity: Search by entities
- nlp: Natural language queries
```

### 3. list_entities - Knowledge Graph Access
```yaml
Entity Types:
- person, organization, location
- event, project, technology
- concept, document, other
```

### 4. get_entity_graph - Relationship Explorer
```yaml
Features:
- Multi-depth traversal
- Relationship types
- Memory associations
```

### 5. add_attachment - File Management
```yaml
Supports:
- Local file paths
- URL downloads
- Automatic text extraction
- Vision analysis
```

### 6. import_conversation - Chat Import
```yaml
Formats:
- Claude exports
- ChatGPT history
- Generic AI chats
Features:
- Entity extraction
- Action item detection
```

### 7. find_references - Reference Discovery
```yaml
Types:
- github: Repository mentions
- url: Web links
- slack_user: @mentions
- action_item: TODOs
```

### 8. link_conversations - Conversation Relationships
```yaml
Link Types:
- continuation
- reference
- related
- followup
```

## Example Interactions

### Saving with Intelligence
```
User: "I just learned about a new Python library called FastAPI for building REST APIs"
Assistant: I'll save this information about FastAPI to your memory system.

[Calls save_memory with:
- content: "FastAPI is a Python library for building REST APIs"
- tags: ["python", "fastapi", "api", "web-development"]
- auto-extracted entities: FastAPI (technology), Python (technology)]

✅ Saved! I've also identified FastAPI as a new technology in your knowledge graph.
```

### Natural Language Search
```
User: "What did I learn about Python last week?"
Assistant: I'll search for Python-related memories from last week.

[Calls search_memories with:
- search_type: "nlp"
- query: "Python memories from last week"]

Found 3 memories:
1. **FastAPI REST API Development** (3 days ago)
2. **Python async/await patterns** (5 days ago)  
3. **pytest testing strategies** (6 days ago)
```

### Managing Action Items
```
User: "TODO: Review the FastAPI documentation and create a sample project"
Assistant: I'll save this as an action item.

[Calls save_memory with action item extraction]

✅ Action item saved and tracked! Would you like me to:
1. Set a due date for this task?
2. Link it to your FastAPI learning memory?
3. Find related resources in your memories?
```

### Conversation Import
```
User: "Import my Claude conversation about machine learning from yesterday"
Assistant: I'll import that conversation for you.

[Calls import_conversation with:
- file_path: provided path
- extract_entities: true
- extract_actions: true]

✅ Imported successfully!
- 12 memories created
- 8 entities extracted (3 people, 2 projects, 3 concepts)
- 2 action items found
- Linked to 3 existing conversations
```

## Advanced Features

### Deduplication Settings
```javascript
// Per-source time windows
DEDUP_TIME_WINDOW_CHATGPT: 300  // 5 minutes
DEDUP_TIME_WINDOW_CLAUDE: 600   // 10 minutes
DEDUP_TIME_WINDOW_CURSOR: 900   // 15 minutes
DEDUP_SIMILARITY_THRESHOLD: 0.9 // 90% similarity
```

### Performance Features
- **Redis Caching**: Fast repeated searches
- **Connection Pooling**: Efficient API usage
- **Background Tasks**: Non-blocking operations
- **Pagination**: Handle large result sets

### Search Capabilities
- **Temporal Parsing**: "yesterday", "last week", "past month"
- **Entity Recognition**: Names, projects, technologies
- **Intent Detection**: Questions, statements, commands
- **Smart Filtering**: Combine multiple criteria

## Testing Your Setup

### Quick Test Suite
```
1. Save a test memory:
   "Save: Testing ChatGPT integration with all features"

2. Test NLP search:
   "Find memories from today"

3. Check entities:
   "Show all people I've mentioned"

4. Test attachments:
   "Attach https://example.com to my test memory"

5. Find action items:
   "Show my pending TODOs"
```

### Verification Checklist
- [ ] Memory creation works with deduplication
- [ ] All search types return results
- [ ] Entity extraction identifies people/projects
- [ ] Attachments download and process
- [ ] Action items are tracked
- [ ] Conversations can be linked

## Troubleshooting

### Common Issues

1. **"Server Error" on actions**
   - Check if API bridge is running: `lsof -i:8001`
   - Verify ngrok is active and URL is current
   - Check logs: `tail -f chatgpt_bridge.log`

2. **Authentication failures**
   - Confirm API key matches `.env` file
   - Ensure "Bearer" auth type is selected
   - Verify Authorization header format

3. **Deduplication not working**
   - Check time window settings
   - Verify similarity threshold
   - Look for force_save parameter usage

4. **Slow searches**
   - Ensure Redis is running: `redis-cli ping`
   - Check if embeddings are cached
   - Verify connection pooling is active

### Debug Commands
```bash
# Check service status
./monitor_chatgpt_bridge.sh

# Test API directly
curl http://localhost:8001/health

# View real-time logs
tail -f chatgpt_bridge.log

# Test specific endpoint
./test_chatgpt_bridge.sh
```

## Production Deployment

### Option 1: Render.com
1. Deploy bridge as web service
2. Set environment variables
3. Use provided URL in Custom GPT

### Option 2: Cloud Run
1. Containerize the bridge
2. Deploy to Google Cloud Run
3. Configure custom domain

### Option 3: Dedicated Server
1. Deploy to VPS/dedicated server
2. Set up nginx reverse proxy
3. Configure SSL certificate

## Best Practices

1. **Privacy**: Inform users about memory storage
2. **Consent**: Ask before saving sensitive information
3. **Organization**: Suggest appropriate tags
4. **Cleanup**: Offer to remove outdated memories
5. **Linking**: Connect related information
6. **Search**: Use appropriate search method for query type
7. **Feedback**: Report successful operations clearly

## Next Steps

1. **Test all features** thoroughly
2. **Import existing conversations**
3. **Set up production hosting**
4. **Create usage documentation**
5. **Configure backup strategy**
6. **Monitor usage patterns**