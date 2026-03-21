Save this conversation to purmemo as a living document.

## What to do

Call `save_conversation` with the COMPLETE conversation content. Follow these rules exactly:

### Title
Generate a descriptive title in the format: `[Project] - [Topic] - [Type]`
Examples: "Auth - JWT Refresh Bug - Fix", "Frontend - Dark Mode - Implementation", "API - Rate Limiting - Design"

Same title = updates existing memory (living document pattern). Use consistent titles.

### Content
Include EVERYTHING verbatim — never summarize:
- Every user message exactly as written
- Every assistant response completely
- All code blocks with full syntax
- All file paths, URLs, and references

Format:
```
=== CONVERSATION START ===
USER: [complete message]
ASSISTANT: [complete response]
...
=== END ===
```

Minimum 500 characters. Real conversations should be thousands.

### Tags
Add 3-5 relevant tags: `["project-name", "feature", "type"]`

### Important
- Use `mcp__purmemo-local__save_conversation` (not npm or claude_ai variants)
- If you've saved this conversation before with the same title, it UPDATES (not duplicates)
- Never send just a summary — include the full conversation
