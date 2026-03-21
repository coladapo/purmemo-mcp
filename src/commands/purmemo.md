Run a purmemo workflow. These are memory-powered processes that automatically load your past context and guide you through structured tasks.

## How to use

The user's input after `/purmemo` tells you which workflow to run.

### If no input (just "/purmemo")
Call `mcp__purmemo-local__list_workflows` and present the available workflows:
```
Available purmemo workflows:

Product:     prd, roadmap, story, design, feedback
Strategy:    ceo, growth, intel
Engineering: debug, review, deploy, incident
Business:    metrics
Operations:  sprint
Content:     copy

Usage: /purmemo [workflow] [describe what you need]
Example: /purmemo debug users can't log in after password reset
```

### If input provided
Parse the first word as the workflow name. Pass the rest as input.

Examples:
- `/purmemo debug users can't log in` → `run_workflow(workflow="debug", input="users can't log in")`
- `/purmemo prd add team sharing` → `run_workflow(workflow="prd", input="add team sharing")`
- `/purmemo growth` → `run_workflow(workflow="growth", input="")`
- `/purmemo help me plan this sprint` → `run_workflow(workflow="sprint", input="help me plan this sprint")`

### If the first word doesn't match a workflow
Pass the entire input to `run_workflow` without specifying a workflow — it has an intent classifier that auto-routes:
- `/purmemo I need to write copy for our launch email` → auto-routes to `copy` workflow
- `/purmemo what's our competitive moat?` → auto-routes to `ceo` workflow

### Tool to use
Always use `mcp__purmemo-local__run_workflow` (not npm or claude_ai variants).

### What happens
The workflow engine automatically:
1. Loads your purmemo identity (who you are, what you're building)
2. Recalls relevant memories for this task
3. Shows which memories are powering the response (transparency)
4. Guides you through a structured process with numbered steps
