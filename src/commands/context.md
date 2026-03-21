Get full context on what you've been working on.

## What to do

Run these in parallel to build a "state of work" report:

### 1. Recall recent memories
Call `mcp__purmemo-local__recall_memories` with:
- `query`: the current project name (from the working directory)
- `limit`: 5
- `has_observations`: true

### 2. Check git status
Run `git status` and `git log --oneline -10` to see recent work and uncommitted changes.

### 3. Scan for TODOs
Run `grep -r "TODO\|FIXME\|HACK\|XXX" --include="*.ts" --include="*.js" --include="*.tsx" --include="*.py" -n . 2>/dev/null | head -20`

### 4. Present the report

```
## Project Context: [project name]

### Recent Purmemo Memories
1. [Title] — [1-line summary]
2. ...

### Git Status
- Branch: [branch]
- [X uncommitted changes / clean]
- Recent commits:
  - [hash] [message]
  - ...

### Open TODOs
- [file:line] [TODO text]
- ...

### Recommended Next Steps
Based on the above, here's what seems most important:
1. [suggestion]
2. [suggestion]
```
