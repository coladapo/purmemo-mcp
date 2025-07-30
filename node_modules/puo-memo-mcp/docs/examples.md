# Examples

This guide provides practical examples of using PUO Memo MCP in various scenarios.

## Basic Usage

### Saving a Simple Memory

```python
# In Claude or another MCP client
"Remember that the project deadline is next Friday, March 15th"
```

PUO Memo will automatically:
- Extract the date reference
- Tag it appropriately
- Create a searchable memory

### Searching Memories

```python
# Natural language search
"What deadlines do I have coming up?"

# Specific search
"Show me all memories about the API redesign project"
```

## Advanced Usage

### Meeting Notes with Action Items

```python
# Save comprehensive meeting notes
"""
Remember: Product Planning Meeting - March 8, 2024

Attendees: @Sarah Chen, @Mike Johnson, @Lisa Park

Key Decisions:
- Launch date moved to April 15th
- Budget approved for $50k
- Sarah to lead the marketing campaign

Action Items:
TODO: Create project timeline by March 12 (@Mike)
TODO: Set up kickoff meeting with design team (@Lisa)
TODO: Draft press release by March 20 (@Sarah)

Next meeting: March 22 at 2pm
"""
```

PUO Memo will:
- Extract all attendees as entities
- Identify and track TODO items
- Create timeline entries
- Link related conversations

### Importing Chat History

```python
# Import a Claude conversation
import_chat(
    file_path="/downloads/claude_conversation_20240308.json",
    project_tag="ai-assistant-development"
)
```

### Creating a Knowledge Base

```python
# Document technical information
"""
Remember: API Authentication Flow

Our API uses OAuth 2.0 with the following endpoints:
- Authorization: https://api.example.com/oauth/authorize
- Token: https://api.example.com/oauth/token

Client credentials are stored in environment variables:
- CLIENT_ID: Retrieved from dashboard
- CLIENT_SECRET: Keep secure, rotate quarterly

Implementation example: See auth_flow.py in the codebase
Related: RFC 6749, OAuth 2.0 specification
"""

# Attach relevant files
attach(
    memory_id="<generated-id>",
    file_paths=["./docs/auth_flow.py", "./docs/oauth_diagram.png"]
)
```

## Real-World Scenarios

### Project Management

```python
# Track project status
"""
Remember: Project Alpha Status Update - Week 10

Progress:
✅ Backend API complete (100%)
🔄 Frontend implementation (75%)
⏳ Testing phase (not started)

Blockers:
- Waiting for security review approval
- Need clarification on error handling requirements

Team velocity: 23 story points completed
Burn rate: On track

@John Smith is investigating performance issues
@Emma Wilson submitted PR #234 for review
"""
```

### Research Notes

```python
# Save research findings
"""
Remember: LLM Fine-tuning Research

Paper: "Efficient Fine-tuning of Large Language Models" (2024)
Authors: Chen et al., Stanford University
Link: https://arxiv.org/example

Key findings:
1. LoRA reduces training time by 70%
2. Performance comparable to full fine-tuning
3. Memory requirements: 4x less than traditional methods

Our implementation ideas:
- Use LoRA for customer support bot
- Expected training time: 2 hours on A100
- Dataset size needed: ~10k examples

Related papers to review:
- "Parameter-Efficient Transfer Learning" (2023)
- "Adapter-based Fine-tuning" (2023)
"""
```

### Customer Feedback Tracking

```python
# Log customer interactions
"""
Remember: Customer Call - ACME Corp

Date: March 8, 2024
Customer: ACME Corp (@Jennifer Liu)
Account Value: $125k ARR

Issues Discussed:
1. Performance degradation during peak hours
   - Happening since last Tuesday
   - Affects their dashboard loading times
   - TODO: Check logs for March 5-7

2. Feature Request: Bulk export functionality
   - Need to export 10k+ records
   - Current limit is 1k
   - TODO: Add to product roadmap

3. Renewal Discussion:
   - Current contract expires June 30
   - Interested in enterprise features
   - TODO: Schedule renewal meeting for April

Customer Sentiment: Satisfied but concerned about performance
Next Steps: Follow up by March 12 with performance analysis
"""
```

## Integration Examples

### With CI/CD Pipelines

```python
# Document deployment information
"""
Remember: Production Deployment - v2.3.4

Deployment Details:
- Version: 2.3.4
- Branch: release/2.3.4
- Commit: abc123def456
- Deployed by: @DevOps Bot
- Time: 2024-03-08 15:30 UTC

Changes:
- Fixed memory leak in worker process
- Added rate limiting to API endpoints
- Updated dependencies for security patches

Rollback plan: Revert to v2.3.3 if error rate > 1%
Monitoring: Check dashboard at https://monitoring.example.com
"""
```

### With Documentation

```python
# Create living documentation
"""
Remember: API Endpoint Documentation

POST /api/v1/memories
Creates a new memory entry

Request Body:
{
  "content": "string (required)",
  "title": "string (optional)",
  "tags": ["array", "of", "strings"],
  "metadata": {
    "custom": "fields"
  }
}

Response: 201 Created
{
  "id": "uuid",
  "created_at": "timestamp",
  "status": "success"
}

Error Codes:
- 400: Invalid request body
- 401: Authentication required
- 429: Rate limit exceeded

Example: See create_memory_example.py
"""
```

## Tips and Tricks

### Effective Tagging

```python
# Use hierarchical tags
tags = ["project/alpha", "project/alpha/frontend", "bug/critical"]

# Use consistent naming
tags = ["meeting-notes", "q1-2024", "product-team"]
```

### Memory Corrections

```python
# If you need to correct information
correction(
    memory_id="<id>",
    correction="The meeting is at 3pm EST, not PST",
    reason="Timezone was incorrect"
)
```

### Bulk Operations

```python
# Import multiple files at once
for file in ["chat1.json", "chat2.json", "chat3.json"]:
    import_chat(
        file_path=f"/imports/{file}",
        project_tag="historical-data"
    )
```

### Search Strategies

```python
# Keyword search for exact matches
recall(query="API_KEY", search_type="keyword")

# Semantic search for concepts
recall(query="authentication problems", search_type="semantic")

# Hybrid for best results
recall(query="oauth implementation issues", search_type="hybrid")

# Entity-based search
entities(entity_name="Sarah Chen", depth=2)
```

## Common Patterns

### Daily Standup

```python
"""
Remember: Daily Standup - March 8

Yesterday:
- Completed user authentication module
- Reviewed PR #456

Today:
- Start working on payment integration
- Meeting with design team at 2pm

Blockers:
- Waiting for API credentials from payment provider
"""
```

### Code Review Notes

```python
"""
Remember: Code Review - PR #789

Repository: frontend-app
Author: @Mike Johnson
Review: March 8, 2024

Findings:
✅ Good test coverage
⚠️ Missing error handling in API calls
❌ Console.log statements need removal

Suggestions:
1. Add try-catch blocks around API calls
2. Use proper logging library instead of console
3. Consider adding loading states

TODO: Author to address feedback by March 10
"""
```

## Next Steps

- [API Reference](./api-reference.md) - Complete tool documentation
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions
- [Configuration](./configuration.md) - Advanced configuration options