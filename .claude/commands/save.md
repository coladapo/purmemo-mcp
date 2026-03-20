# Intelligent Conversation Saving

**Description:** Save or update conversations using living document pattern (auto-detects first save vs update).

**Usage:** `/save [optional: custom title]`

**When to use:**
- User says "save progress"
- End of session with meaningful work
- After significant milestones (feature complete, bug fixed, decision made)

**Example:**
```
User: /save
→ Auto-generates: "Purmemo - Timeline View - Implementation"
→ Updates existing memory if title was used before, or creates new one
```

---

Intelligently save or update the current conversation using purmemo.

## How It Works:

The system automatically detects whether this is a FIRST SAVE or an UPDATE:

**LIVING DOCUMENT PATTERN:**
- Same conversation topic = UPDATES existing memory (not duplicate)
- Auto-generates conversation_id from title
- Example: "Purmemo - Timeline View" saved 3 times = ONE memory updated 3 times

**YOUR TASK:**

1. **Analyze the conversation** to determine:
   - What is the main project/topic being discussed?
   - Is this a NEW conversation or continuation of previous work?
   - What are the key accomplishments/decisions?

2. **Generate intelligent title**:
   - Format: `[Project] - [Component/Feature] - [Type]`
   - Examples:
     - "Purmemo - MCP Integration - Implementation"
     - "Claude.md Setup - Workflow Configuration"
     - "Debug - Authentication Flow - Resolution"
   - Use consistent titles so updates work properly

3. **Call save_conversation** with:
   - `conversationContent`: Session notes (key decisions, accomplishments, code changes, learnings)
   - `title`: The intelligent title you generated
   - `tags`: Relevant tags (e.g., ["purmemo", "mcp", "setup"])
   - `conversationId`: OPTIONAL - only provide if you want explicit control (otherwise auto-generated from title)
   - `mode`: **"append"** — adds new content below existing content instead of replacing it

4. **Important rules**:
   - Include MINIMUM 500 characters (should be thousands)
   - **ALWAYS pass `mode: "append"`** — this grows the memory over time instead of overwriting it
   - Use format: `=== SESSION TITLE ===` then key content
   - If continuing same topic, use SAME title to trigger append to existing memory
   - Each save adds to the memory — nothing is ever lost

The tool automatically:
- Detects if memory exists with that conversation_id
- **APPENDS** new content below existing content (with timestamp separator)
- Re-generates embedding on the full combined content (all saves searchable)
- Extracts project context, progress indicators, relationships
- Chunks large conversations (>15K chars) automatically
- Generates smart metadata and tags

**Example Execution:**

User: "Save progress"
→ You analyze: Working on CLAUDE.md workflow setup
→ Generate title: "Purmemo - Claude.md Workflow - Setup"
→ Call save_conversation with complete conversation
→ System checks: Does "purmemo-claude-md-workflow-setup" exist?
   - Yes → UPDATE that memory
   - No → CREATE new memory with that id

Next time user says "Save progress" on same topic:
→ You use SAME title
→ System UPDATES the existing memory (living document!)
