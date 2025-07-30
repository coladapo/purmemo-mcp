# ChatGPT Integration Setup Guide

## Prerequisites
- PUO Memo MCP server running
- ChatGPT Plus subscription (for Custom GPTs)
- Public URL for the bridge (using ngrok for local development)

## Step 1: Start the Bridge Server

### Local Development:
```bash
cd "/Users/wivak/puo-jects/active/puo memo mcp"
./start_chatgpt_bridge_bg.sh
```

The server will run on http://localhost:8001

## Step 2: Expose to Internet (for development)

Install ngrok if you haven't:
```bash
brew install ngrok
```

Create a public tunnel:
```bash
ngrok http 8001
```

You'll get a URL like: `https://abc123.ngrok.io`

## Step 3: Configure ChatGPT Custom GPT

1. Go to ChatGPT → Explore GPTs → Create a GPT
2. Click "Configure" tab
3. Set these details:

**Name**: PUO Memo Assistant

**Description**: 
Your personal memory assistant that helps you save, search, and organize information across conversations.

**Instructions**:
```
You are PUO Memo Assistant, a helpful AI that manages the user's personal knowledge base. You can:

1. Save memories from conversations
2. Search and recall past information
3. Track entities (people, projects, topics)
4. Attach files and documents

Always confirm when saving memories and provide helpful summaries when searching.
```

**Capabilities**: 
- ✅ Web Browsing (optional)
- ✅ DALL·E Image Generation (optional)
- ✅ Code Interpreter (optional)

## Step 4: Add Actions

Click "Create new action" and paste this schema:

```yaml
openapi: 3.0.0
info:
  title: PUO Memo API
  version: 1.0.0
servers:
  - url: YOUR_NGROK_URL_HERE
paths:
  /memory:
    post:
      summary: Save memory
      operationId: saveMemory
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                content:
                  type: string
                title:
                  type: string
                tags:
                  type: array
                  items:
                    type: string
                dedup_window:
                  type: integer
                  default: 300
                force:
                  type: boolean
                  default: false
              required:
                - content
      responses:
        '200':
          description: Success
  
  /recall:
    post:
      summary: Search memories
      operationId: searchMemories
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                query:
                  type: string
                search_type:
                  type: string
                  enum: [semantic, keyword, entity]
                  default: semantic
                limit:
                  type: integer
                  default: 10
                context:
                  type: string
              required:
                - query
      responses:
        '200':
          description: Success
  
  /entities:
    get:
      summary: List entities
      operationId: getEntities
      parameters:
        - name: entity_type
          in: query
          schema:
            type: string
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
      responses:
        '200':
          description: Success
```

## Step 5: Configure Authentication

1. Authentication Type: **API Key**
2. Auth Type: **Bearer**
3. API Key: `gx3ZaY7QQCkf4NepTeZ4IR2MGejOURiM-ZBgZMaGa44`

## Step 6: Test Your GPT

Try these commands:
- "Save this conversation about Python optimization"
- "What do I know about Sarah Chen?"
- "Show me all my memories about project deadlines"
- "List all people I've mentioned"

## Production Deployment

For production, deploy the bridge to a cloud service:

### Option 1: Render.com (Recommended)
1. Create account at render.com
2. Connect your GitHub repo
3. Create new Web Service
4. Set environment variables from .env
5. Deploy

### Option 2: Railway.app
1. Similar to Render but with easier setup
2. Automatic HTTPS and scaling

### Option 3: Google Cloud Run
1. Containerize with Docker
2. Deploy to Cloud Run
3. Connect to existing Cloud SQL

## Security Notes

- API key is stored securely in ChatGPT
- All communications use HTTPS
- Rate limiting prevents abuse
- Each user should have their own API key

## Troubleshooting

### Bridge not responding:
```bash
# Check logs
tail -f chatgpt_bridge.log

# Restart bridge
pkill -f chatgpt_bridge
./start_chatgpt_bridge_bg.sh
```

### Authentication errors:
- Verify API key matches in .env and ChatGPT
- Check Bearer token format in ChatGPT

### Memory not saving:
- Check deduplication window
- Use force=true to override duplicates