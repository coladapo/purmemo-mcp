# Architecture Decision Records (ADRs)

**Description:** Make and document architectural decisions with research and structured ADR format.

**Usage:** `/decide [decision to make]`

**When to use:**
- Database selection
- Framework choices
- Architecture patterns
- Major refactors
- Any significant technical decision

**Example:**
```
User: /decide which database to use for production: PostgreSQL vs MongoDB
→ Returns: ADR with options analyzed, research, decision outcome, and saves to purmemo
```

---

Make informed architectural decisions with comprehensive research and documentation.

## Your Process

Execute the following steps when facing significant architectural or design decisions:

### Step 1: Understand the Decision Context
Clarify the decision being made:
- What architectural choice needs to be made?
- What problem are we trying to solve?
- What are the constraints (performance, budget, timeline, team skills)?
- What are the options being considered?
- What are the trade-offs?

Ask clarifying questions if needed to fully understand the decision scope.

### Step 2: Recall Past Architectural Decisions
Use `mcp__purmemo-local__recall_memories` to search for:
- Similar architectural decisions made before
- Patterns and conventions already established in this project
- Lessons learned from past choices
- Previous technology selections and why

Search queries to try:
- "architecture decision"
- "design pattern"
- Specific technologies being considered (e.g., "database choice", "authentication approach")
- The project name + "decision"

Use `mcp__purmemo-local__discover_related_conversations` to find:
- Related decisions across different projects
- Cross-platform discussions about similar choices

Present findings: "Found X past decisions about [topic]..."

### Step 3: Plan Research Strategy
Use `mcp__krawlr__krawlr_think` to:
- Analyze the decision options
- Identify what needs to be researched
- Plan comparison criteria
- Formulate specific search queries for each option

### Step 4: Research Best Practices
Based on the thinking output:

Use `mcp__krawlr__search_web_ai` with depth="advanced" to research:
- Industry best practices for this type of decision
- Case studies of similar choices (successes and failures)
- Expert opinions and comparisons
- Benchmark data and performance comparisons
- Security considerations

Search for each option:
- "[Option A] vs [Option B] comparison"
- "[Option A] production experience"
- "[Option A] pros and cons"
- "When to use [Option A]"

Use `mcp__krawlr__scrape_url` to get detailed information from:
- Official documentation of each option
- Architecture decision records (ADRs) from other teams
- Blog posts from companies that made similar choices

### Step 5: Get Technical Documentation
For each technology option being considered:

Use `mcp__Context7__resolve-library-id` and `mcp__Context7__get-library-docs` to:
- Understand API maturity and stability
- Check community support and maintenance
- Review migration paths and versioning
- Assess learning curve and documentation quality

### Step 6: Document the Decision (ADR Format)

Create an Architecture Decision Record using this format:

**ARCHITECTURE DECISION RECORD**

**Title:** [Short descriptive title]
**Date:** [Current date]
**Status:** [Proposed | Accepted | Deprecated | Superseded]
**Deciders:** [Who is involved in making this decision]

**Context and Problem Statement**
- What is the issue we're addressing?
- What constraints exist?
- What are we trying to optimize for?

**Decision Drivers**
- [Driver 1 - e.g., "Must support high concurrency"]
- [Driver 2 - e.g., "Team has limited experience with option X"]
- [Driver 3 - e.g., "Budget constraints"]

**Options Considered**

**Option 1: [Name]**
- Description: [Brief description]
- Pros:
  - [Pro 1]
  - [Pro 2]
- Cons:
  - [Con 1]
  - [Con 2]
- Research findings: [Key points from web research]
- Past experience: [Findings from purmemo]

**Option 2: [Name]**
- Description: [Brief description]
- Pros:
  - [Pro 1]
  - [Pro 2]
- Cons:
  - [Con 1]
  - [Con 2]
- Research findings: [Key points from web research]
- Past experience: [Findings from purmemo]

[Repeat for each option...]

**Decision Outcome**
**Chosen option:** [Option name]

**Rationale:**
- [Why this option was chosen]
- [How it addresses the decision drivers]
- [What trade-offs we're accepting]
- [What alternatives we rejected and why]

**Consequences**
- Positive:
  - [Expected benefit 1]
  - [Expected benefit 2]
- Negative:
  - [Accepted limitation 1]
  - [Accepted limitation 2]
- Risks:
  - [Risk 1 and mitigation]
  - [Risk 2 and mitigation]

**Implementation Plan**
1. [First step]
2. [Second step]
3. [Validation/testing approach]

**Review Date:** [When to revisit this decision]

**References**
- [Link to research 1]
- [Link to documentation]
- [Link to similar decision in purmemo]

### Step 7: Save the Decision to Purmemo

Use `/save` command with:
- **Title format:** `ADR - [Project] - [Decision Topic] - [Date]`
- **Examples:**
  - "ADR - Purmemo - Database Selection - 2025-11-13"
  - "ADR - Frontend - State Management - 2025-11-13"
  - "ADR - API - Authentication Strategy - 2025-11-13"
- **Tags:** ["architecture-decision", "adr", project-name, technology-tags]
- **Content:** The complete ADR document formatted above

This creates a searchable knowledge base of all architectural decisions!

### Step 8: Present Decision Summary

After saving, provide the user with:

**📋 DECISION SUMMARY**
- Decision made: [Brief statement]
- Chosen approach: [Option selected]
- Key rationale: [Top 3 reasons]
- Next steps: [Implementation plan summary]
- ADR saved to purmemo for future reference

## Example Execution:

```
User: "Should we use PostgreSQL or MongoDB for the user data?"

Step 1: Understand
→ Decision: Database choice for user data
→ Constraints: Need ACID, team knows SQL, scaling to 1M users
→ Options: PostgreSQL vs MongoDB

Step 2: Recall Past Decisions
→ Search purmemo: "database decision"
→ Found: Previous project used PostgreSQL for relational data
→ Found: MongoDB used for analytics data with flexible schema

Step 3: Plan Research (krawlr_think)
→ Need to compare: ACID compliance, scaling, query patterns
→ Search: "PostgreSQL vs MongoDB user data"
→ Focus on: Relational needs, transaction support

Step 4: Research Best Practices
→ search_web_ai: "PostgreSQL vs MongoDB 2025 comparison"
→ Found: PostgreSQL better for structured relational data
→ Found: MongoDB better for document/flexible schemas
→ scrape_url: Official docs for both

Step 5: Check Documentation
→ Context7: PostgreSQL docs (JSONB support, scaling)
→ Context7: MongoDB docs (transactions, sharding)

Step 6: Document ADR
→ Create full Architecture Decision Record
→ Option 1: PostgreSQL (structured, ACID, team expertise)
→ Option 2: MongoDB (flexible, horizontal scaling)
→ Decision: PostgreSQL (user data is relational, ACID needed)
→ Rationale: Strong relational needs, team SQL expertise

Step 7: Save to Purmemo
→ /save with title "ADR - Project - Database Selection - 2025-11-13"
→ Tags: ["architecture-decision", "adr", "database", "postgresql"]
→ Complete ADR saved

Step 8: Present Summary
→ Decision: PostgreSQL for user data
→ Key reasons: Relational integrity, ACID, team expertise
→ Next: Set up PostgreSQL schema, migration plan
```

## Decision Categories to Document:

**Technology Selections:**
- Database choices
- Framework selections
- Library/package decisions
- Cloud provider choices

**Architecture Patterns:**
- Microservices vs Monolith
- Event-driven vs Request/Response
- State management approaches
- API design patterns (REST, GraphQL, gRPC)

**Design Patterns:**
- Authentication/Authorization strategies
- Caching strategies
- Error handling approaches
- Testing strategies

**Infrastructure:**
- Deployment approaches
- CI/CD pipeline choices
- Monitoring/observability solutions
- Scaling strategies

## Best Practices:

1. **Be thorough but timely** - Don't over-research, but don't rush
2. **Consider reversibility** - Can we change this decision later?
3. **Document trade-offs** - Be honest about what we're giving up
4. **Set review dates** - When should we revisit this?
5. **Include everyone** - Who needs to be involved in this decision?
6. **Think long-term** - How will this scale? What's the maintenance burden?

## Notes

- Use this for SIGNIFICANT decisions, not every small choice
- Good candidates: Technology changes, architectural patterns, major refactors
- Bad candidates: Variable names, file structure, minor refactoring
- The act of documenting often clarifies the right choice
- Future you (and your team) will thank you for the documentation
- ADRs become invaluable onboarding material for new team members
