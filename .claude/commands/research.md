# Pre-Implementation Research Workflow

**Description:** Gather context and best practices BEFORE coding to minimize debugging.

**Usage:** `/research [task or technology to research]`

**When to use:**
- Starting new feature implementation
- Working with unfamiliar technology
- Complex implementation requiring guidance

**Example:**
```
User: /research implement authentication with Supabase
→ Returns: Research brief with past context, best practices, library docs, implementation approach
```

---

Execute the comprehensive research workflow before implementation:

1. **Recall Past Context**: Use `mcp__purmemo-local__recall_memories` to search for related conversations, decisions, and learnings about the current task.

2. **Plan Research Strategy**: Use `mcp__krawlr__krawlr_think` to analyze the task and plan the optimal research approach.

3. **Execute Web Research**: Use `mcp__krawlr__search_web_ai` with depth="advanced" for AI-enhanced search results. Fall back to `search_web` only if needed.

4. **Scrape Documentation**: Use `mcp__krawlr__scrape_url` to get detailed official documentation when needed.

5. **Get Library Docs**: If libraries are involved, use `mcp__Context7__resolve-library-id` and `mcp__Context7__get-library-docs` for up-to-date API documentation.

6. **Present Research Brief**: Provide a comprehensive summary with:
   - Past context from purmemo
   - Best practices from research
   - Library documentation and examples
   - Recommended implementation approach
   - Potential pitfalls to avoid

Execute all steps and present findings before beginning implementation.
