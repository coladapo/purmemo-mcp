# Load Session Context from Purmemo

Load your identity profile and recent work context at the start of a session. Combines your cognitive identity (who you are, what you do) with recent relevant memories (what you've been working on).

## Your Task

Run these two calls in parallel:

1. **`get_user_context`** — loads identity profile (role, expertise, domain) and current session context (active project, focus area)

2. **`recall_memories(query="recent work")`** — surfaces the most recent conversations across all topics

Then present a brief, natural context summary:

```
Here's your context:

**You**: [role] working in [domain] — [expertise tags]
**Current focus**: [project] → [focus area] (from session context)

**Recent work**:
- [Memory title] ([date]) — [one line summary]
- [Memory title] ([date]) — [one line summary]
- [Memory title] ([date]) — [one line summary]

Ready to continue. What are we working on?
```

## Rules
- Keep it concise — this is a briefing, not a report
- If `get_user_context` returns empty identity, skip that section silently
- If no recent memories exist, just say "No recent memories found — this may be your first session"
- Never say "I called get_user_context" — just present the context naturally
