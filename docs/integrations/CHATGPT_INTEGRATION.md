# 🌉 PUO Memo + ChatGPT Integration Guide

## Overview

This guide shows 3 ways to connect PUO Memo to ChatGPT, from simple to advanced.

## Method 1: REST API Bridge (Recommended)

### What it does:
- Translates MCP protocol to REST API that ChatGPT can use
- Runs alongside your MCP server
- Works with ChatGPT Custom GPTs

### Quick Setup:
```bash
# 1. Make the setup script executable
chmod +x setup_chatgpt_bridge.sh

# 2. Run setup (installs dependencies, generates API key)
./setup_chatgpt_bridge.sh

# 3. Start the bridge
./start_chatgpt_bridge.sh
```

### Expose to Internet (for ChatGPT):
```bash
# Option A: Use ngrok (for testing)
ngrok http 8001

# Option B: Deploy to cloud (production)
# - Deploy to Render.com, Railway, or Heroku
# - Use the public URL in ChatGPT configuration
```

## Method 2: Direct Database Access via Supabase

### Architecture:
```
ChatGPT → Supabase Edge Functions → PostgreSQL (your Cloud SQL)
```

### Setup:
1. Create Supabase project
2. Connect to your existing PostgreSQL:
   ```sql
   -- In Supabase SQL editor
   CREATE EXTENSION postgres_fdw;
   
   CREATE SERVER puo_memo_server
   FOREIGN DATA WRAPPER postgres_fdw
   OPTIONS (host '35.235.107.217', dbname 'puo_memo_refactored');
   
   CREATE USER MAPPING FOR current_user
   SERVER puo_memo_server
   OPTIONS (user 'postgres', password 'your-password');
   ```

3. Create Edge Functions:
   ```typescript
   // supabase/functions/puo-memo-search/index.ts
   import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
   import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
   
   serve(async (req) => {
     const { query, search_type = 'hybrid' } = await req.json()
     
     const supabase = createClient(
       Deno.env.get('SUPABASE_URL')!,
       Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
     )
     
     // Search logic here
     const { data, error } = await supabase
       .from('memory_entities')
       .select('*')
       .textSearch('content', query)
       .limit(10)
     
     return new Response(JSON.stringify({ results: data }))
   })
   ```

## Method 3: Browser Extension Bridge

### Concept:
Create a browser extension that ChatGPT can communicate with via postMessage

### Implementation:
```javascript
// Extension content script
window.addEventListener('message', async (event) => {
  if (event.origin !== 'https://chat.openai.com') return;
  
  const { action, data } = event.data;
  
  switch (action) {
    case 'save_memory':
      // Call local MCP server
      const response = await fetch('http://localhost:8000/memory', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      
      window.postMessage({ 
        id: event.data.id, 
        result: await response.json() 
      }, '*');
      break;
  }
});
```

## Method 4: Zapier/Make.com Integration

### Setup:
1. Create Zapier webhook trigger
2. Connect to PUO Memo API bridge
3. Use in ChatGPT with web browsing:
   ```
   "To save this to memory, visit: 
   https://hooks.zapier.com/your-webhook?content={encoded_content}"
   ```

## Comparison Table

| Method | Complexity | Features | Best For |
|--------|------------|----------|----------|
| REST API Bridge | Medium | Full features | Most users |
| Supabase | High | Direct DB access | Advanced users |
| Browser Extension | Medium | Local access | Privacy-focused |
| Zapier | Low | Limited features | Quick setup |

## ChatGPT Custom GPT Configuration

### 1. Create Custom GPT:
- Go to ChatGPT → Explore GPTs → Create
- Name: "PUO Memo Assistant"
- Description: "Access and manage your personal knowledge base"

### 2. Add Actions:
Copy the schema from `src/bridges/chatgpt_custom_gpt.yaml`

### 3. Configure Authentication:
- Type: Bearer
- Token: [Your API key from setup]

### 4. Test Commands:
```
"Save this conversation about Python optimization"
"Search for memories about machine learning"
"Show me all people I've mentioned"
"What projects involve Sarah Chen?"
```

## Security Considerations

1. **API Key**: Keep your `CHATGPT_BRIDGE_API_KEY` secure
2. **Network**: Use HTTPS in production (ngrok provides this)
3. **Data**: Consider what data you expose through the bridge
4. **Rate Limiting**: Add rate limiting for production:
   ```python
   from slowapi import Limiter
   limiter = Limiter(key_func=get_remote_address)
   app.state.limiter = limiter
   
   @app.post("/memory")
   @limiter.limit("10/minute")
   async def create_memory(...):
   ```

## Troubleshooting

### Bridge won't start:
```bash
# Check if port 8001 is in use
lsof -i :8001

# Check logs
tail -f bridge.log
```

### ChatGPT can't connect:
1. Ensure ngrok is running: `ngrok http 8001`
2. Update ChatGPT action URL to ngrok URL
3. Check API key matches

### Memories not saving:
1. Check MCP server is running
2. Verify database connection
3. Check bridge logs for errors

## Advanced Features

### 1. Streaming Responses:
```python
from fastapi.responses import StreamingResponse

@app.post("/stream_search")
async def stream_search(query: str):
    async def generate():
        async for result in memory_store.stream_search(query):
            yield f"data: {json.dumps(result)}\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")
```

### 2. Batch Operations:
```python
@app.post("/batch_memory")
async def batch_create(memories: List[MemoryCreate]):
    results = []
    for memory in memories:
        result = await memory_store.create_with_dedup(...)
        results.append(result)
    return {"created": len(results), "results": results}
```

### 3. Export to ChatGPT:
```python
@app.get("/export_for_chatgpt")
async def export_memories(days: int = 7):
    # Export recent memories in ChatGPT-friendly format
    memories = await memory_store.list_recent(days=days)
    
    formatted = []
    for memory in memories:
        formatted.append({
            "role": "system",
            "content": f"Memory from {memory['created_at']}: {memory['content']}"
        })
    
    return {"memories": formatted}
```

## Next Steps

1. **Start Simple**: Use the REST API bridge with ngrok
2. **Test Locally**: Ensure everything works before deploying
3. **Deploy**: Move to a cloud service for permanent access
4. **Enhance**: Add more features based on your needs

## Support

- Issues: Create an issue in the repo
- Questions: Check the troubleshooting section
- Updates: Pull latest changes regularly

Happy knowledge management with ChatGPT + PUO Memo! 🚀