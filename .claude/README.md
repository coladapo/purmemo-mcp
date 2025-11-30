# Purmemo Workflow System

Comprehensive workflow automation for Claude Code powered by MCP tools (Purmemo, Krawlr, Context7, Render, Supabase).

## Overview

This workflow system provides **7 intelligent slash commands** that integrate seamlessly with MCP servers to enhance your development workflow. The system automatically saves context, recalls past decisions, researches best practices, and ensures code quality.

**Total:** 1,538 lines of workflow automation
**Architecture:** Hybrid approach (slash commands + selective skills)
**Integration:** Purmemo (memory), Krawlr (research), Context7 (docs), Render (deployment), Supabase (database)

---

## Quick Start

### First Time Setup

1. **Check your MCP configuration** - Ensure these servers are configured:
   - `purmemo-local` or `purmemo-npm` (memory and conversation saving)
   - `krawlr` (web research with AI)
   - `Context7` (library documentation)
   - `render` (deployment management - optional)
   - `supabase` (database management - optional)

2. **Verify slash commands** - Type `/help` to see all available workflows

3. **Read CLAUDE.md** - Project instructions are automatically loaded at session start

### Your First Session

```bash
# Start every session with context
/context

# Research before implementing
/research implement authentication with Supabase

# Debug with research
/debug TypeError: Cannot read property 'map' of undefined

# Review before committing
/review

# Deploy safely
/deploy to production

# Save your progress
/save
```

---

## Available Workflows

### 🚀 Session & Context Management

#### `/context` - Session Startup & Project State
**When:** Start of every session, returning after break
**Purpose:** Get comprehensive project context
**Output:** Memories + Git status + TODOs + Build/test status + Recommendations

#### `/save` - Intelligent Conversation Saving
**When:** "Save progress", end of session, after milestones
**Purpose:** Save or update conversations (living document pattern)
**Output:** Auto-detects first save vs update, saves to purmemo

---

### 🔍 Research & Planning

#### `/research` - Pre-Implementation Research
**When:** Starting new feature, unfamiliar technology, complex implementation
**Purpose:** Gather context and best practices BEFORE coding
**Output:** Research brief with memories + AI web search + library docs

#### `/decide` - Architecture Decision Records (ADRs)
**When:** Database selection, framework choices, architecture patterns, major refactors
**Purpose:** Make and document architectural decisions
**Output:** Structured ADR with research, options analysis, decision, consequences

---

### 🐛 Debugging & Problem Solving

#### `/debug` - Structured Debugging Workflow
**When:** Encountering bugs, unclear errors, stuck on problem
**Purpose:** Debug with research and context
**Output:** Debug brief with similar past issues + research + solutions + saves fix

---

### ✅ Quality & Deployment

#### `/review` - Pre-Commit Security & Quality Checks
**When:** Before EVERY commit (make it a habit!)
**Purpose:** Comprehensive security and quality review
**Output:** Security scan (SQL injection, XSS, secrets) + Code quality + Tests + Docs + Dependencies + Audit trail

#### `/deploy` - Pre-Deployment Checklist
**When:** Before EVERY production deployment
**Purpose:** Safe deployment to Render/Supabase
**Output:** 12-step checklist (tests, env vars, logs, migrations, build, security, rollback plan, deploy commands, verification) + Deployment record

---

## Workflow Integration

All workflows integrate intelligently with MCP tools:

### Purmemo MCP (Memory & Context)
- **Automatic recall** - Every workflow searches for relevant past conversations
- **Living document pattern** - Same title = update existing memory (no duplicates)
- **Cross-platform discovery** - Find related discussions from ChatGPT, Gemini, etc.
- **Knowledge graph** - Filter by entity, intent, stakeholder, deadline, observations

### Krawlr MCP (Web Research)
- **krawlr_think** - Plans optimal research strategy before searching
- **search_web_ai** - AI-enhanced search (re-ranking, enhanced snippets, can scrape top results)
- **scrape_url** - Get detailed documentation from official sources
- **LinkedIn scraping** - Extract profile data with screenshot method

### Context7 MCP (Library Documentation)
- **resolve-library-id** - Find the right library from name
- **get-library-docs** - Get up-to-date API documentation and examples
- **Current best practices** - Reference latest patterns and approaches

### Render MCP (Deployment)
- **list_services** - View all services
- **list_logs** - Check recent logs for issues
- **list_deploys** - View deployment history
- **update_environment_variables** - Manage env vars

### Supabase MCP (Database)
- **list_migrations** - Review database migrations
- **get_advisors** - Security and performance recommendations
- **get_logs** - Check database logs
- **execute_sql** - Run queries for verification

---

## Best Practices

### Make It a Habit

**Every Session:**
```
/context                    # Get project state
```

**Before Implementation:**
```
/research [task]            # Research best practices
/decide [decision]          # Document architectural decisions
```

**During Development:**
```
/debug [error]             # Debug with context
```

**Before Commit:**
```
/review                    # Security & quality check
```

**Before Deploy:**
```
/deploy                    # Safe production deployment
```

**After Milestones:**
```
/save                      # Save progress
```

### Living Document Pattern

The `/save` command uses intelligent **living document** pattern:

- **Same title = UPDATE** - Don't create duplicates
- **Auto-generates conversation_id** - From title (e.g., "MCP Tools" → "mcp-tools")
- **Example:** Saving "Purmemo - Timeline View" 3 times = ONE memory updated 3 times
- **To force new memory:** Change title or use different conversationId

### Research-First Development

**Problem:** Debugging unnecessary issues due to missing best practices
**Solution:** Use `/research` BEFORE implementing

```
# ❌ Don't do this
Start coding → Hit errors → Debug for hours

# ✅ Do this instead
/research implement authentication
→ Get best practices
→ Implement correctly first time
```

### Security-First Commits

**Problem:** Security vulnerabilities slip into production
**Solution:** Use `/review` BEFORE every commit

The review workflow scans for:
- SQL injection vulnerabilities
- XSS (Cross-Site Scripting)
- Hardcoded secrets and API keys
- Command injection risks
- Authentication issues
- Code quality and best practices

---

## File Structure

```
.claude/
├── README.md                  # This file (workflow documentation)
├── commands/                  # Slash commands (project-specific)
│   ├── help.md               # Display all workflows
│   ├── context.md            # Session startup (174 lines)
│   ├── research.md           # Pre-implementation research (20 lines)
│   ├── save.md               # Conversation saving (60 lines)
│   ├── debug.md              # Debugging workflow (135 lines)
│   ├── decide.md             # Architecture decisions (266 lines)
│   ├── review.md             # Pre-commit review (357 lines)
│   └── deploy.md             # Pre-deployment checklist (526 lines)
└── skills/                    # Skills (cross-project - optional)
    └── (future: reusable workflow components)

CLAUDE.md                      # Project instructions (orchestration)
ROADMAP.md                     # Future development plans
```

---

## Architecture Decision

**Decision:** Hybrid Approach (Slash Commands + Selective Skills)
**ADR:** See `purmemo-workflow-system-architecture-adr` memory
**Date:** 2025-11-13

**Why Hybrid?**
- ✅ **Discoverability** - Slash commands visible in UI
- ✅ **Project Context** - Full access to files, git, environment
- ✅ **Reusability** - Extract common patterns to skills when needed
- ✅ **Progressive Enhancement** - Start simple, evolve as needed

**Implementation:**
1. **Primary:** All workflows as slash commands (project-specific)
2. **Secondary:** Extract reusable patterns to skills (optional)
3. **Orchestration:** CLAUDE.md guides when to use what

---

## Development Roadmap

See `ROADMAP.md` for detailed Phase 3 & 4 implementation plans.

**Phase 1:** ✅ Complete - All 7 workflows implemented as slash commands

**Phase 2:** 🔄 In Progress - Discoverability features
- [x] Create `/help` command
- [x] Add usage examples to all commands
- [x] Create this README

**Phase 3:** Optional - Extract high-value skills
- [ ] Identify cross-project patterns
- [ ] Create skills for reusable components
- [ ] Update slash commands to invoke skills

**Phase 4:** Optional - Reference repository
- [ ] Canonical workflow versions
- [ ] Update/sync process documentation
- [ ] Easy copy-paste or git clone setup

---

## Tips & Tricks

💡 **Context is king** - `/context` gives you full project state in seconds
💡 **Research first, debug less** - `/research` saves hours of debugging
💡 **Document decisions** - `/decide` creates valuable ADRs for your team
💡 **Security by default** - `/review` catches vulnerabilities early
💡 **Deploy with confidence** - `/deploy` ensures safe production releases
💡 **Build knowledge base** - `/save` creates searchable memory across sessions

---

## Troubleshooting

### "MCP server not found"
**Solution:** Check your Claude Code MCP configuration. Ensure purmemo, krawlr, and Context7 are properly installed.

### "Command not recognized"
**Solution:** Ensure `.claude/commands/*.md` files exist. Type `/help` to verify available commands.

### "Living document not updating"
**Solution:** Use the EXACT same title when saving. The system auto-generates conversation_id from title.

### "No research results"
**Solution:** Check internet connection. Krawlr MCP requires web access for searches.

---

## Contributing

This workflow system is part of the Purmemo project. To improve workflows:

1. Test changes locally in `.claude/commands/`
2. Update this README if adding new workflows
3. Document architectural decisions with `/decide`
4. Save improvements to purmemo for future reference

---

## Resources

- **CLAUDE.md** - Project-specific instructions (auto-loaded)
- **Purmemo MCP** - Memory and conversation management
- **Krawlr MCP** - AI-powered web research
- **Context7 MCP** - Library documentation
- **Render MCP** - Deployment management
- **Supabase MCP** - Database management

---

**Last Updated:** 2025-11-13
**Version:** 2.0 (Phase 2 - Discoverability Features)
**Total Workflow Lines:** 1,538
