# Structured Debugging Workflow

**Description:** Debug errors with research, context recall, and automatic solution documentation.

**Usage:** `/debug [error message or description]`

**When to use:**
- Encountering bugs or errors
- Unclear error messages
- Stuck on a problem

**Example:**
```
User: /debug TypeError: Cannot read property 'map' of undefined in Timeline component
→ Returns: Debug brief with similar past issues, research, solutions, and saves fix for future reference
```

---

Execute the comprehensive debug workflow to solve issues efficiently.

## Your Process

Execute the following steps in order when encountering bugs or errors:

### Step 1: Understand the Error
Gather information about the issue:
- What is the exact error message or unexpected behavior?
- When does it occur (consistently, intermittently, specific conditions)?
- What was the user trying to accomplish?
- What are the relevant stack traces, logs, or error codes?

### Step 2: Recall Similar Past Issues
Use `mcp__purmemo-local__recall_memories` to search for:
- Similar error messages or stack traces
- Related bugs solved before
- Common patterns for this type of issue
- Previous solutions that worked

Search queries to try:
- The exact error message
- The technology/library name + "error" or "bug"
- The component/feature where error occurs

Present findings: "Found X similar issues in memory..."

### Step 3: Plan Debug Strategy with krawlr_think
Use `mcp__krawlr__krawlr_think` to:
- Analyze the error and identify potential root causes
- Plan what needs to be researched
- Identify which resources to check (docs, Stack Overflow, GitHub issues)
- Formulate specific search queries for the error

### Step 4: Research Error with krawlr
Based on the thinking output:
- Use `mcp__krawlr__search_web_ai` with depth="advanced" to find solutions
  - Search for: exact error message
  - Search for: library/framework + version + error type
  - Search for: known issues in GitHub/Stack Overflow
- If search_web_ai fails, fall back to `mcp__krawlr__search_web`
- Use `mcp__krawlr__scrape_url` to get detailed information from:
  - Official documentation
  - GitHub issue threads
  - Stack Overflow answers

### Step 5: Check Library Documentation
If the error involves specific libraries:
- Use `mcp__Context7__resolve-library-id` to find the library
- Use `mcp__Context7__get-library-docs` to get:
  - Correct API usage
  - Known issues and workarounds
  - Migration guides (if version-related)
  - Common pitfalls

### Step 6: Present Debug Brief
Provide a structured analysis:

**ERROR ANALYSIS:**
- Root cause identified
- Why it's happening

**PAST CONTEXT:**
- Similar issues we've solved before
- What worked previously

**RESEARCH FINDINGS:**
- Solutions found online
- Official documentation guidance
- Community recommendations

**RECOMMENDED FIX:**
- Step-by-step solution approach
- Code changes needed
- Testing strategy

**PREVENTION:**
- How to avoid this in the future
- Patterns to watch for

### Step 7: Document the Solution
After implementing the fix, save it to purmemo:
- Use `/save` command with title format: `Debug - [Component] - [Error Type] - Resolution`
- Example: "Debug - Authentication Flow - JWT Expiry - Resolution"
- Include:
  - Original error message
  - Root cause analysis
  - Solution implemented
  - Testing performed
  - Lessons learned

This creates a searchable knowledge base of solutions for future debugging!

## Example Workflow:

```
User: "Getting 'TypeError: Cannot read property 'map' of undefined' in UserList component"

Step 1: Understand
→ Error occurs when rendering UserList
→ Suggests data is undefined when expected to be an array

Step 2: Recall
→ Search purmemo for "cannot read property map"
→ Find 2 similar past issues with async data loading

Step 3: Plan (krawlr_think)
→ Likely async timing issue
→ Need to check data loading state
→ Should research React data fetching patterns

Step 4: Research (krawlr)
→ search_web_ai: "react cannot read property map of undefined"
→ Find common patterns: missing null checks, async timing

Step 5: Check Docs (Context7)
→ resolve-library-id: "react"
→ get-library-docs: React hooks, useEffect patterns

Step 6: Present Brief
→ Root cause: UserList renders before data loads
→ Solution: Add null check or loading state
→ Recommended: use optional chaining and default empty array

Step 7: After fix works
→ /save with title "Debug - UserList Component - Undefined Map - Resolution"
→ Memory saved for future reference
```

## Notes

- Always search memories FIRST - we may have solved this before
- Use krawlr_think to plan before searching - better queries = better results
- Document ALL solutions - builds team knowledge base
- If stuck after research, that's when you ask clarifying questions
