# Workflow System Help

Display comprehensive help for all available workflow commands in the Purmemo project.

## Available Workflows

### 🚀 Session & Context Management

**`/context`** - Session Startup & Project State
- **Purpose:** Get comprehensive project context after time away
- **When to use:** Start of every session, returning to project after break
- **What it does:** Recalls memories → Git status → Pending TODOs → Build/test status → Comprehensive report
- **Example:** `/context`

**`/save`** - Intelligent Conversation Saving
- **Purpose:** Save or update conversations using living document pattern
- **When to use:** "Save progress", end of session, after milestones
- **What it does:** Auto-detects first save vs update, extracts project context, chunks if needed
- **Example:** `/save` (auto-generates intelligent title)

---

### 🔍 Research & Planning

**`/research`** - Pre-Implementation Research
- **Purpose:** Gather context and best practices BEFORE coding
- **When to use:** Starting new feature, unfamiliar technology, complex implementation
- **What it does:** Recalls memories → Plans with krawlr_think → Searches with AI → Gets library docs → Research brief
- **Example:** `/research implement authentication with Supabase`

**`/decide`** - Architecture Decision Records (ADRs)
- **Purpose:** Make and document architectural decisions with research
- **When to use:** Database selection, framework choices, architecture patterns, major refactors
- **What it does:** Recalls past decisions → Researches options → Creates ADR → Saves to purmemo
- **Example:** `/decide which database to use for production: PostgreSQL vs MongoDB`

---

### 🐛 Debugging & Problem Solving

**`/debug`** - Structured Debugging Workflow
- **Purpose:** Debug errors with research and context
- **When to use:** Encountering bugs, unclear error messages, stuck on problem
- **What it does:** Recalls similar issues → Plans with krawlr_think → Researches solutions → Gets docs → Debug brief → Documents fix
- **Example:** `/debug TypeError: Cannot read property 'map' of undefined in Timeline component`

---

### ✅ Quality & Deployment

**`/review`** - Pre-Commit Security & Quality Checks
- **Purpose:** Comprehensive security and quality review before committing
- **When to use:** Before every commit (make it a habit!)
- **What it does:** Security scan (SQL injection, XSS, secrets) → Code quality → Tests → Documentation → Dependencies → Review report → Saves audit trail
- **Example:** `/review`

**`/deploy`** - Pre-Deployment Checklist
- **Purpose:** Safe deployment to Render/Supabase with comprehensive checks
- **When to use:** Before every production deployment
- **What it does:** Tests → Env vars → Logs → DB migrations → Build → Security → Rollback plan → Deploy → Verify → Document
- **Example:** `/deploy to production`

---

## Quick Start Guide

### New Session
```
/context                    # Get project state
/research [task]            # Research before implementing
```

### During Development
```
/debug [error]             # Debug with context
/decide [decision]         # Make architectural decision
```

### Before Commit/Deploy
```
/review                    # Security & quality check
/deploy                    # Safe production deployment
/save                      # Save progress
```

---

## Workflow Integration

All workflows integrate with:
- **Purmemo MCP** - Memory recall and saving
- **Krawlr MCP** - Web research with AI (search_web_ai, krawlr_think)
- **Context7 MCP** - Library documentation
- **Render MCP** - Service management, logs
- **Supabase MCP** - Database, migrations, advisors

See `CLAUDE.md` for detailed workflow instructions and best practices.

---

## Tips

💡 **Make it a habit:** Use `/context` every session, `/review` before commits, `/deploy` before production
💡 **Save often:** Use `/save` to build knowledge base of your work
💡 **Research first:** Use `/research` and `/decide` to avoid unnecessary debugging
💡 **Document bugs:** `/debug` automatically saves solutions for future reference

---

**Total Workflows:** 7 commands, 1,538 lines of workflow automation
**Documentation:** See `.claude/README.md` and `CLAUDE.md`
