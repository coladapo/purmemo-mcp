---
name: purmemo
description: Persistent AI conversation memory. Recall context at session start, save progress at session end. Essential for project continuity across sessions.
metadata:
  short-description: Cross-session memory for Codex
---

# Purmemo Memory Skill

You have access to purmemo MCP tools for persistent memory across sessions.

## Session Start (DO THIS FIRST)

At the START of every session, before addressing the user's request:
1. Call `recall_memories` with the current project name as query
2. Present the top 3-5 results as numbered context
3. Ask if the user wants to load any memory fully

## Session End (DO THIS BEFORE CLOSING)

Before the session ends or when significant milestones are reached:
1. Call `save_conversation` with the COMPLETE conversation content
2. Use title format: `[Project] - [Topic] - [Type]`
3. Include ALL messages verbatim — never summarize
4. Same title = updates existing memory (living document pattern)

## Available MCP Tools

| Tool | What it does |
|------|-------------|
| `save_conversation` | Save complete conversations as living documents |
| `recall_memories` | Search past memories with natural language |
| `get_memory_details` | Retrieve full memory content by ID |
| `discover_related_conversations` | Find related conversations across platforms |
| `get_user_context` | Get your identity profile and recent work context |
| `run_workflow` | Run memory-powered workflows (debug, prd, review, sprint, etc.) |
| `list_workflows` | See all available workflows |
| `share_memory` | Share a memory publicly |
| `recall_public` | Search community memories |

## Workflow Commands

When the user describes structured tasks, use `run_workflow`:
- "debug this" → `run_workflow(workflow="debug", input="...")`
- "write a PRD" → `run_workflow(workflow="prd", input="...")`
- "review this code" → `run_workflow(workflow="review", input="...")`
- "plan this sprint" → `run_workflow(workflow="sprint", input="...")`

## Living Document Pattern

Same title = updates existing memory, not duplicates. Use consistent titles so sessions build on each other over time.
