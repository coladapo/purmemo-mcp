# Recall from Purmemo

Search your purmemo memories for past conversations relevant to a topic.

## Your Task

1. **Identify the search topic** from the user's message or current conversation context.
   - If the user typed `/recall authentication bug`, search for "authentication bug"
   - If no topic was given, ask: "What would you like me to search for?"

2. **Call `recall_memories`** with the topic as the query.

3. **Present results clearly**:
   - List each memory with its title, date, and a 1-2 sentence summary of what was covered
   - If a result looks highly relevant, call `get_memory_details` to get the full content
   - If nothing relevant found, say so — don't invent results

4. **Offer next steps**:
   - "Want me to load the full details of any of these?"
   - "Should I use this context for what we're working on now?"

## Example

User: `/recall docker setup`
→ Call `recall_memories(query="docker setup")`
→ "Found 2 relevant memories:
   1. **My App - Docker Setup - Configuration** (Jan 15) — Set up docker-compose with postgres and redis, resolved port conflict on 5432.
   2. **Dev Environment - Docker Networking - Debug** (Dec 3) — Fixed container DNS resolution issue between services."
