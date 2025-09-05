# Enhanced Purmemo MCP Server v4.0

## Full Conversation Context Capture

The enhanced server captures complete conversation context including:
- Multiple user prompts within conversations
- Full AI responses
- Project evolution tracking
- Technical decisions and rationale
- Action items and next steps

## Configuration for Claude Desktop

Update your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "purmemo-enhanced": {
      "command": "node",
      "args": ["/Users/wivak/puo-jects/active/purmemo/purmemo-mcp/src/enhanced-server.js"],
      "env": {
        "PURMEMO_API_KEY": "***REMOVED***"
      }
    }
  }
}
```

## Enhanced Tools Available

### 1. `memory_conversation` - Full Conversation Capture
Captures complete exchanges with context preservation:
- User prompts and AI responses
- Key decisions made
- Action items identified
- Requirements discovered
- Technical details
- Evolution of understanding
- Session threading

Example usage in Claude Desktop:
```
Save this conversation about implementing the photo organizer. Include all the technical decisions we made about using RAW file previews and the 6-week timeline.
```

### 2. `memory_code` - Code Solution with Context
Saves code with full problem context:
- Original problem statement (user's ask)
- Complete code solution
- Explanation and usage
- Dependencies and limitations
- Future improvements

### 3. `memory_project_evolution` - Track Project Changes
Tracks how projects evolve over time:
- Original vision vs current vision
- Major pivots and reasons
- Learnings and discoveries
- Timeline updates

### 4. `start_session` / `end_session` - Session Management
Groups related conversations together:
- Start a session to get a session ID
- Use the session ID in all related memories
- End session to save complete summary

### 5. `recall_project` - Project-Specific Search
Find all memories related to a specific project with evolution history.

## How It Captures Multiple Prompts

When MCP is attached to Claude Desktop or Cursor:
1. The tool has access to the full conversation context
2. When you ask to save memory, it can see all previous exchanges
3. The `memory_conversation` tool accepts arrays of conversation segments
4. Each segment captures a user prompt and AI response pair
5. Sessions link multiple conversations together

## Example: Capturing Complex Conversations

```javascript
// When Claude saves a conversation with multiple prompts:
memory_conversation({
  user_prompt: "How do I build a photo organizer that uses narratives?",
  ai_response: "Here's a comprehensive system design...",
  
  // Tracks evolution
  evolution_notes: "User initially wanted date-based, pivoted to story-based after discussing use cases",
  
  // Captures decisions
  key_decisions: [
    "Use embedded JPEG previews from RAW files",
    "Screenshots solve 60-80% of unknown locations",
    "Story-first organization, not date-first"
  ],
  
  // Links to session
  session_id: "abc123",
  previous_memory_id: "mem_xyz789",
  
  // Full exchange history if needed
  full_exchange: [
    { role: "user", content: "Initial question..." },
    { role: "assistant", content: "Initial response..." },
    { role: "user", content: "Follow-up question..." },
    { role: "assistant", content: "Refined solution..." }
  ]
})
```

## Testing the Enhanced Server

1. Install dependencies:
```bash
cd /Users/wivak/puo-jects/active/purmemo/purmemo-mcp
npm install
```

2. Test directly:
```bash
npm run start:enhanced
```

3. Restart Claude Desktop after updating config

4. Test conversation capture:
   - Start a multi-turn conversation
   - Ask Claude to save the full conversation with context
   - Check that all prompts and responses are captured

## Key Improvements Over Basic Server

| Basic Server | Enhanced Server |
|--------------|-----------------|
| Saves summaries | Saves full conversations |
| Single memory per call | Threaded sessions |
| No context preservation | Full context with evolution |
| No project tracking | Project evolution over time |
| Simple tags | Rich metadata and relationships |

## Metadata Captured

Every conversation memory includes:
- `type`: "conversation"
- `conversation_type`: planning/debugging/learning/etc
- `project_name`: Associated project
- `session_id`: For threading
- `has_decisions`: Boolean
- `has_actions`: Boolean
- `has_requirements`: Boolean
- `evolution_tracked`: Boolean
- `user_prompt_hash`: For deduplication
- `timestamp`: When captured

## Next Steps

1. Deploy enhanced server
2. Update Claude Desktop config
3. Test with complex multi-prompt conversations
4. Verify evolution tracking works
5. Check session threading links memories correctly