# Example Prompts for PUO Memo ChatGPT

## Memory Creation

### Basic Save
"Save this: I met with Sarah Chen today about the API redesign project. She suggested using GraphQL instead of REST for better performance."

### With Tags
"Please save this information with tags [meeting, api, architecture]: We decided to use Redis for caching user sessions with a 24-hour TTL."

### Structured Information
"Save this project update:
- Project: PUO Memo
- Status: ChatGPT integration complete
- Next steps: Deploy to production
- Deadline: End of month"

### Force Save (Override Deduplication)
"Force save this even if similar exists: The ChatGPT bridge is now working with full authentication."

## Memory Search

### Semantic Search
"What do I know about Sarah Chen?"
"Find everything related to API design decisions"
"Show me memories about Redis or caching"

### Entity-Based Search
"List all people I've mentioned in my memories"
"What projects am I tracking?"
"Show me all locations I've referenced"

### Time-Based Search
"What did I save yesterday about Python?"
"Show me memories from last week"
"Find recent conversations about ChatGPT"

### Filtered Search
"Search for Python memories tagged with 'optimization'"
"Find all task-type memories about deployment"
"Show me conversation memories mentioning Sarah"

## Knowledge Graph

### Entity Relationships
"How is Sarah Chen related to my projects?"
"What technologies are associated with PUO Memo?"
"Show me the connection between Redis and my API project"

### Entity Timeline
"When did I first mention GraphQL?"
"Show me the history of the API redesign project"
"Track mentions of Sarah Chen over time"

## Complex Queries

### Multi-Step Operations
"Search for all memories about authentication, then save a summary of the findings"

### Analysis Requests
"Analyze my memories about Python and identify common topics"
"What are the main themes in my project-related memories?"

### Cross-Reference
"Find memories that mention both Sarah Chen and API design"
"Show me tasks related to the technologies I've been learning"

## Conversation Starters

### Daily Review
"What did I work on yesterday?"
"Show me pending tasks from my memories"
"Summarize this week's project updates"

### Project Status
"What's the status of all my active projects?"
"Find all deadlines mentioned in my memories"
"Show me blockers or issues I've recorded"

### Learning & Reference
"What have I learned about FastAPI?"
"Find code snippets I've saved"
"Show me all technical decisions I've documented"

## Advanced Features

### Deduplication Testing
"Save this: Working on ChatGPT integration today"
(Wait 2 minutes)
"Save this: Still working on ChatGPT integration" 
(Should detect as duplicate)

### Batch Operations
"Save these as separate memories:
1. Completed user authentication module
2. Started working on file upload feature
3. Need to review Sarah's GraphQL proposal"

### Context Switching
"Find all memories from the 'work' context"
"Save this in the 'personal' context: Planning vacation to Japan in Spring"

## Best Practices

1. **Be Specific**: "Save meeting notes with Sarah Chen about Q4 planning" is better than "Save this meeting"

2. **Use Natural Language**: The assistant understands context, so speak naturally

3. **Leverage Tags**: Always suggest relevant tags for better organization

4. **Review Regularly**: "What are my main insights from this week?" helps consolidate learning

5. **Connect Information**: "How does this relate to what I learned about PostgreSQL last month?"