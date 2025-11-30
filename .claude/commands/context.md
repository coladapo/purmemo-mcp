# Session Startup & Project Context

**Description:** Get comprehensive project context after time away from the project.

**Usage:** `/context`

**When to use:**
- Start of every session
- Returning to project after break
- Need overview of current state

**Example:**
```
User: /context
→ Returns: Project state report with memories, git status, TODOs, build status
```

---

Get up to speed when returning to a project after time away.

## Your Process

Execute the following steps to build a comprehensive "state of the project" report:

### Step 1: Recall Recent Work from Purmemo
Use `mcp__purmemo-local__recall_memories` to search for:
- Recent conversations about this project
- Last implementation session
- Recent decisions and changes
- Open questions or blockers

Search queries to try:
- The project name
- Key components/features being worked on
- "implementation", "progress", "decision"
- Recent dates if known

Use `mcp__purmemo-local__discover_related_conversations` to find:
- Related discussions across different sessions
- Cross-platform conversations (if using ChatGPT, Gemini, etc.)

### Step 2: Check Git Repository Status
Use the Bash tool to gather repository information:

```bash
# Current branch and status
git status

# Recent commits (last 10)
git log --oneline --graph --decorate -10

# Branches (to see feature branches)
git branch -a

# Uncommitted changes (if any)
git diff --stat

# Stashed changes (if any)
git stash list
```

### Step 3: Identify Pending Tasks
Search the codebase for pending work:

Use Grep to find:
- TODO comments: `grep -r "TODO" --include="*.{js,ts,py,go}" -n`
- FIXME comments: `grep -r "FIXME" --include="*.{js,ts,py,go}" -n`
- WIP markers: `grep -r "WIP" --include="*.{js,ts,py,go}" -n`

Check for project management indicators:
- README.md for roadmap or pending items
- CHANGELOG.md for unreleased features
- Project-specific task files (e.g., TODO.md, ROADMAP.md)

### Step 4: Check Current Implementation Status
Assess the project state:

Use the Bash tool for:
```bash
# Check if tests are passing
npm test || pytest || go test || echo "No tests configured"

# Check if project builds
npm run build || make build || echo "No build configured"

# Check dependencies status
npm outdated || pip list --outdated || echo "Dependencies check not available"
```

Use directory exploration:
- Check recently modified files: `find . -type f -mtime -7 -not -path "*/node_modules/*" -not -path "*/.git/*"`
- Understand project structure if unfamiliar

### Step 5: Present "State of the Project" Report

Provide a comprehensive summary organized as:

**📋 PROJECT OVERVIEW**
- Project name and purpose
- Current branch and status
- Last activity date

**🕐 RECENT WORK (from Purmemo)**
- Summary of last 3-5 conversations
- Key decisions made
- Features implemented recently
- Problems solved

**📊 GIT STATUS**
- Current branch
- Uncommitted changes (if any)
- Recent commits (last 5-10)
- Active feature branches
- Stashed work (if any)

**✅ PENDING TASKS**
- TODOs found in codebase
- FIXMEs that need attention
- WIP features
- Roadmap items (if documented)

**🔧 BUILD & TEST STATUS**
- Does project build successfully?
- Are tests passing?
- Any dependency issues?

**🎯 RECOMMENDED NEXT STEPS**
Based on the gathered context:
1. What should be tackled first?
2. Any blockers to address?
3. Any follow-up from last session?

**💡 HELPFUL CONTEXT**
- Relevant documentation to review
- Key files to examine
- Patterns or conventions to remember

## Example Execution:

```
User: "What's the current state of the project?"

Step 1: Recall (Purmemo)
→ Search "purmemo mcp implementation"
→ Find last 3 conversations about MCP integration
→ Discover related: Found cross-platform discussions

Step 2: Git Status
→ git status: On branch main, 2 files modified
→ git log: Last commit 2 days ago "Add intelligent context extraction"
→ git branch: Found feature/wisdom-layer branch

Step 3: Pending Tasks
→ Grep TODO: Found 5 TODOs in /api/routes/
→ Grep FIXME: Found 2 FIXMEs in /utils/
→ Check ROADMAP.md: Phase 17 pending

Step 4: Implementation Status
→ npm test: All tests passing ✓
→ npm run build: Build successful ✓
→ npm outdated: 3 minor updates available

Step 5: Present Report
→ Structured summary with all findings
→ Clear next steps recommended
```

## Smart Features:

**Auto-detect project type:**
- Node.js (package.json)
- Python (requirements.txt, pyproject.toml)
- Go (go.mod)
- Adjust commands accordingly

**Follow project conventions:**
- Check for project-specific docs (CONTRIBUTING.md, ARCHITECTURE.md)
- Look for project management tools (GitHub Projects, Jira links)

**Prioritize findings:**
- Critical: Failing tests, build errors
- High: Recent uncommitted work, blockers mentioned in memories
- Medium: TODO items, dependency updates
- Low: Documentation updates, code cleanup

## Notes

- Run this command at the START of each session when returning to a project
- Saves significant time vs. manually reviewing everything
- Creates shared context if working with team
- Helps prevent duplicate work or forgotten tasks
- Can be run anytime you need to "reset" your mental context
