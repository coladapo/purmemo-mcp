# ChatGPT Integration Quick Start

## 1. Start the Services

```bash
# Terminal 1: Start the bridge
cd "/Users/wivak/puo-jects/active/puo memo mcp"
./start_chatgpt_bridge_bg.sh

# Terminal 2: Start ngrok
./start_ngrok.sh
```

## 2. Get Your ngrok URL

After starting ngrok, you'll see something like:
```
Forwarding: https://abc123def456.ngrok.io -> http://localhost:8001
```

Copy the HTTPS URL (e.g., `https://abc123def456.ngrok.io`)

## 3. Create Custom GPT

1. Go to: https://chat.openai.com/gpts/editor
2. Click "Create a GPT"
3. Go to "Configure" tab

### Basic Settings:
- **Name**: PUO Memo Assistant
- **Description**: Your personal memory assistant that saves, searches, and organizes information across all your conversations.

### Instructions:
```
You are PUO Memo Assistant, integrated with the user's personal knowledge base. Your capabilities:

1. **Save Memories**: When users share important information, offer to save it
2. **Search Knowledge**: Help users recall past conversations and information
3. **Track Entities**: Monitor people, projects, and topics mentioned
4. **Manage Attachments**: Handle documents and files

Always:
- Confirm before saving memories
- Provide context when retrieving information
- Suggest relevant tags
- Use deduplication to avoid duplicates
```

## 4. Add Actions

1. Click "Create new action"
2. Import Schema: Copy contents from `chatgpt_openapi_schema.yaml`
3. Update the server URL to your ngrok URL
4. Authentication:
   - Type: **API Key**
   - Auth Type: **Bearer**
   - API Key: `gx3ZaY7QQCkf4NepTeZ4IR2MGejOURiM-ZBgZMaGa44`

## 5. Test Commands

Try these in your Custom GPT:

### Save a Memory:
"Save this: I'm working on a Python project that uses FastAPI and PostgreSQL for a personal knowledge management system."

### Search Memories:
"What do I know about FastAPI?"
"Show me all my Python projects"
"Find memories about PostgreSQL"

### List Entities:
"Who have I mentioned recently?"
"What projects am I tracking?"
"Show me all technology topics"

### Advanced:
"Save this conversation about ChatGPT integration with tags: integration, chatgpt, api"
"Search for memories from the last week about Python"
"What entities are related to my PUO Memo project?"

## 6. Monitor Usage

```bash
# Check bridge status
./monitor_chatgpt_bridge.sh

# View logs
tail -f chatgpt_bridge.log

# Test API directly
./test_chatgpt_bridge.sh
```

## Troubleshooting

### ngrok URL expired:
- Restart ngrok: `./start_ngrok.sh`
- Update URL in ChatGPT Custom GPT settings

### Authentication errors:
- Verify API key in Custom GPT matches .env file
- Check "Bearer" is selected as auth type

### Bridge not responding:
- Check if bridge is running: `lsof -i:8001`
- Restart: `./start_chatgpt_bridge_bg.sh`

## Pro Tips

1. **Deduplication**: Default 5-minute window prevents duplicate saves
2. **Force Save**: Add "force save" to override deduplication
3. **Context**: Memories are tagged with "chatgpt" context automatically
4. **Smart Merge**: Duplicate content is intelligently merged

## Next Steps

1. **Production**: Deploy bridge to Render.com for permanent URL
2. **Custom Domain**: Use your own domain instead of ngrok
3. **Multiple Users**: Create separate API keys per user
4. **Webhooks**: Get notified of new memories in other apps