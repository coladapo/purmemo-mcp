# Save Conversation to Purmemo

Save or update the current conversation as a memory in purmemo. Uses a living document pattern — saving the same topic twice updates the existing memory instead of creating a duplicate.

## Your Task

1. **Analyze the conversation** to determine the main topic and project.

2. **Generate a consistent title** using the format:
   `[Project] - [Feature/Topic] - [Type]`
   Examples:
   - `Purmemo - MCP Setup - Implementation`
   - `My App - Auth Bug - Resolution`
   - `Claude Code - Workflow Setup - Configuration`

3. **Call `save_conversation`** with:
   - `title`: The title you generated
   - `conversationContent`: The complete conversation — every user message and assistant response verbatim, all code blocks included. Start with `=== CONVERSATION START ===`
   - `tags`: 3-5 relevant tags

The tool auto-detects if a memory with that title already exists and updates it rather than creating a duplicate.

## Rules
- Include the full conversation, not a summary — minimum 500 characters
- Use the same title each time you save the same topic so updates work correctly
- After saving, confirm with: "Saved to purmemo as: [title]"
