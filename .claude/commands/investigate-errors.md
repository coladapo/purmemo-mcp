# Investigate Acknowledged Errors

**IMPORTANT: Use the context file from `/context` first to ensure you have complete project context before investigating errors.**

You are an AI debugging assistant helping to investigate and resolve production errors that have been acknowledged in the admin panel.

## Your Workflow

### Step 1: Fetch Acknowledged Errors
Use the `get_acknowledged_errors` MCP tool to fetch errors waiting for investigation:

```
get_acknowledged_errors(limit=10, level_filter="all", min_occurrences=1)
```

### Step 2: Show Error List
Present the errors to the user and ask which one(s) to investigate:

"Found N acknowledged errors. Which error would you like me to investigate? (Choose by number)"

### Step 3: Research Similar Fixes
For the chosen error, use your existing tools to research:

1. **Check Past Fixes** - Use `recall_memories(query="<error message keywords>")` to find if we've seen similar errors before
2. **Search Best Practices** - Use `search_web_ai(query="<error message> solution")` for official solutions
3. **Get Library Docs** - Use Context7 to get up-to-date API documentation if needed

### Step 4: Investigate Codebase
Use your code exploration tools:

1. Use `grep` to find where the error occurs
2. Use `read` to examine the relevant files
3. Use `bash git log` to check recent changes that might have caused it

### Step 5: Propose Fix
Present your analysis in chat:

```markdown
## ROOT CAUSE
[Your analysis of what caused the error]

## FIX
[What needs to be changed]

Files to change:
- `file_path:line_number` (what to change)

## CONFIDENCE
[0.0-1.0 score] - [Explanation]

## RISK
[low/medium/high] - [Why]

## TEST PLAN
[How to verify the fix works]

## ROLLBACK
[How to roll back if something goes wrong]
```

### Step 6: Wait for Approval
Ask the user: "Should I deploy this fix?"

### Step 7: Execute Fix (When Approved)
1. Use `edit` tool to make code changes
2. Run tests with `bash pytest` or equivalent
3. Commit changes: `bash git add . && git commit -m "Fix: <error message> [AI-Investigated]"`
4. Push to GitHub: `bash git push`
5. Wait for deployment (Render auto-deploys on push)

### Step 8: Save Investigation
Call `save_investigation_result` MCP tool with all investigation details:

```
save_investigation_result({
  incident_id: "<UUID from step 1>",
  root_cause_analysis: "<your analysis>",
  similar_incidents_analyzed: ["<IDs from recall_memories>"],
  research_sources: [{"url": "...", "title": "...", "source": "search_web_ai"}],
  fix_type: "code_change",
  proposed_changes: {"file_path": "what changed"},
  confidence_score: 0.85,
  risk_level: "low",
  test_plan: "<how you tested>",
  rollback_plan: "<how to rollback>",
  deployment_commit_hash: "<git commit hash>",
  deployment_results: {"success": true, "details": "..."}
})
```

### Step 9: Verify Deployment
1. Check deployment status on Render
2. Verify the error is no longer occurring
3. Report back to user: "Fix deployed successfully!"

## Important Notes

- **Never make assumptions** - Always research before proposing a fix
- **Be transparent** - Show all your research and reasoning
- **Ask questions** - If unclear, ask the user for clarification
- **Test thoroughly** - Run all tests before deploying
- **Document everything** - save_investigation_result creates an audit trail for learning

## Example Session

```
User: /investigate-errors