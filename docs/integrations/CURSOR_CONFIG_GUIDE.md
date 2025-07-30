# Cursor MCP Configuration Guide

## Overview
Configure Cursor IDE to use PUO Memo MCP for code memory management with all latest features.

## Configuration Location
- **macOS**: `~/Library/Application Support/Cursor/User/globalStorage/cursor-mcp/settings.json`
- **Windows**: `%APPDATA%\Cursor\User\globalStorage\cursor-mcp\settings.json`
- **Linux**: `~/.config/Cursor/User/globalStorage/cursor-mcp/settings.json`

## Complete Configuration

```json
{
  "mcp.servers": {
    "puo-memo-mcp": {
      "command": "python",
      "args": [
        "/Users/wivak/puo-jects/active/puo memo mcp/src/mcp/server.py"
      ],
      "env": {
        "PYTHONPATH": "/Users/wivak/puo-jects/active/puo memo mcp",
        "DB_HOST": "35.235.107.217",
        "DB_PORT": "5432",
        "DB_NAME": "puo_memo",
        "DB_USER": "puo_app_user",
        "DB_PASSWORD": "your_password_here",
        "GEMINI_API_KEY": "your_gemini_api_key_here",
        "GCS_BUCKET_NAME": "puo-memo-attachments",
        "GCS_PROJECT_ID": "puo-studio",
        "DEFAULT_CONTEXT": "cursor",
        "DEDUP_TIME_WINDOW_CURSOR": "900",
        "REDIS_URL": "redis://localhost:6379",
        "ENABLE_BACKGROUND_TASKS": "true",
        "ENABLE_NLP_SEARCH": "true",
        "ENABLE_CODE_ANALYSIS": "true"
      }
    }
  }
}
```

## Setup Script

Use the automated setup script:
```bash
cd "/Users/wivak/puo-jects/active/puo memo mcp"
./setup_cursor_mcp.sh
```

Or manually update configuration:
```bash
python update_cursor_config.py
```

## Available MCP Tools in Cursor

### 1. 💾 memory - Code Snippet Management
```
Save code snippets, implementations, and development notes:
- Automatic language detection
- Code entity extraction (functions, classes, variables)
- 15-minute deduplication window for Cursor
- Version tracking for code evolution
```

### 2. 🔍 recall - Code Search
```
Search your code memories:
- By language: "Python async functions"
- By pattern: "error handling implementations"
- By time: "code from last week"
- By entity: "DatabaseConnection class"
```

### 3. 🧠 entities - Code Intelligence
```
Track code entities and relationships:
- Functions and their dependencies
- Class hierarchies
- Module relationships
- API endpoints
```

### 4. 📎 attach - Documentation Management
```
Attach related files:
- API documentation
- Design diagrams
- Test results
- Performance benchmarks
```

### 5. 📥 import_chat - Development Session Import
```
Import coding sessions:
- Cursor AI chat history
- Code review discussions
- Debugging sessions
- Learning notes
```

### 6. 🔗 find_references - Code Reference Tracking
```
Find code references:
- GitHub repositories
- Stack Overflow links
- Documentation URLs
- TODO/FIXME comments
```

### 7. 🔄 link_conversations - Session Linking
```
Link related coding sessions:
- Bug fix to original implementation
- Refactoring to original code
- Test implementation to feature
```

## Cursor-Specific Features

### Code Analysis
```javascript
// Automatic extraction when saving code
- Function signatures
- Class definitions
- Import statements
- TODO/FIXME comments
- Error patterns
```

### Language Support
```javascript
// Enhanced support for:
- Python, JavaScript, TypeScript
- Java, C++, C#, Go, Rust
- HTML, CSS, SCSS
- JSON, YAML, TOML
- Markdown, SQL
```

### Development Workflow Integration
```javascript
// Contextual awareness:
- Current project detection
- Git branch tracking
- File path preservation
- Workspace settings
```

## Use Cases in Cursor

### 1. Save Implementation Pattern
```
When implementing a new feature:
1. Write the code
2. Use memory tool to save with tags: ["implementation", "feature-x", "python"]
3. Attach design doc or requirements
4. Link to related implementations
```

### 2. Debug Session Memory
```
During debugging:
1. Save the problematic code
2. Document the issue and solution
3. Tag with: ["bug-fix", "debugging", "resolved"]
4. Link to original implementation
```

### 3. Code Review Notes
```
After code review:
1. Save reviewer feedback
2. Attach review comments
3. Create action items for improvements
4. Link to PR/merge request
```

### 4. Learning & Reference
```
When learning new concepts:
1. Save example code
2. Add explanation notes
3. Tag with: ["learning", "reference", "tutorial"]
4. Attach documentation links
```

## Command Palette Integration

If Cursor supports command palette MCP integration:

1. **Save Current File**
   - Command: `PUO Memo: Save Current File`
   - Automatically extracts file content and metadata

2. **Save Selection**
   - Command: `PUO Memo: Save Selection`
   - Saves selected code with context

3. **Search Memories**
   - Command: `PUO Memo: Search`
   - Opens search interface

4. **Show Related**
   - Command: `PUO Memo: Show Related to Current File`
   - Finds memories related to current code

## REST API Alternative

While waiting for full MCP support, use the REST API:

### Save Code Snippet
```bash
curl -X POST http://localhost:8001/memory \
  -H "Authorization: Bearer gx3ZaY7QQCkf4NepTeZ4IR2MGejOURiM-ZBgZMaGa44" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "def async_retry(max_attempts=3):\n    ...",
    "title": "Async Retry Decorator",
    "tags": ["python", "async", "decorator", "retry", "cursor"],
    "context": "cursor",
    "metadata": {
      "language": "python",
      "file_path": "src/utils/retry.py",
      "project": "puo-memo"
    }
  }'
```

### Search Code
```bash
curl -X POST http://localhost:8001/search \
  -H "Authorization: Bearer gx3ZaY7QQCkf4NepTeZ4IR2MGejOURiM-ZBgZMaGa44" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "retry decorator",
    "search_type": "hybrid",
    "filters": {
      "tags": ["python"],
      "context": "cursor"
    }
  }'
```

## Testing Your Setup

### 1. Basic Connection Test
```python
# Test if MCP server starts
python -m src.mcp.server
```

### 2. Save Test Memory
```
Use memory tool to save:
"Test code snippet from Cursor
def hello_world():
    return 'Hello from Cursor MCP!'"
```

### 3. Search Test
```
Use recall tool with:
- query: "hello_world"
- search_type: "keyword"
```

### 4. Entity Extraction Test
```
Save a class definition and check if entities are extracted:
"class UserAuthentication:
    def __init__(self, db_connection):
        self.db = db_connection
    
    def authenticate(self, username, password):
        # Authentication logic here
        pass"
```

## Troubleshooting

### MCP Not Available in Cursor
1. Check Cursor version (need latest)
2. Look for MCP support in Cursor settings
3. Verify configuration file location
4. Check Cursor developer docs

### Server Won't Start
```bash
# Check Python path
which python

# Verify dependencies
pip list | grep mcp

# Test imports
python -c "from mcp.server import Server"

# Check logs
tail -f ~/.cursor/logs/main.log
```

### Connection Issues
```bash
# Test database connection
python -c "from src.core.database import DatabaseConnection; import asyncio; asyncio.run(DatabaseConnection().initialize())"

# Check Redis
redis-cli ping

# Verify environment
python -c "from src.utils.config import Config; print(Config().__dict__)"
```

## Performance Optimization

### For Large Codebases
1. **Use pagination**: Limit search results
2. **Tag strategically**: Improve search precision
3. **Archive old memories**: Keep active set manageable
4. **Use entity search**: Faster than full-text for known entities

### Background Processing
```javascript
// Async operations for:
- Embedding generation
- Entity extraction  
- File attachment processing
- Code analysis
```

## Integration Ideas

### 1. Git Hooks
```bash
#!/bin/bash
# .git/hooks/pre-commit
# Save commit changes to PUO Memo

FILES=$(git diff --cached --name-only)
COMMIT_MSG=$(git log -1 --pretty=%B)

# Save to PUO Memo via API
curl -X POST http://localhost:8001/memory \
  -H "Authorization: Bearer $PUO_API_KEY" \
  -d "{
    \"content\": \"Git commit: $COMMIT_MSG\nFiles: $FILES\",
    \"tags\": [\"git\", \"commit\", \"cursor\"],
    \"context\": \"cursor\"
  }"
```

### 2. Build Integration
```javascript
// webpack.config.js or similar
class PUOMemoPlugin {
  apply(compiler) {
    compiler.hooks.done.tap('PUOMemoPlugin', (stats) => {
      // Save build results to PUO Memo
      saveBuildResults(stats);
    });
  }
}
```

### 3. Test Results
```python
# pytest plugin
def pytest_terminal_summary(terminalreporter):
    """Save test results to PUO Memo"""
    results = {
        'passed': len(terminalreporter.stats.get('passed', [])),
        'failed': len(terminalreporter.stats.get('failed', [])),
        'duration': terminalreporter._sessionstarttime
    }
    save_to_puo_memo(results, tags=['test-results', 'pytest'])
```

## Best Practices

1. **Consistent Tagging**
   - Language tags: `python`, `javascript`, etc.
   - Type tags: `function`, `class`, `algorithm`
   - Status tags: `working`, `needs-review`, `deprecated`

2. **Meaningful Titles**
   - Include function/class names
   - Mention the problem solved
   - Add version if iterating

3. **Context Preservation**
   - Include imports in snippets
   - Note dependencies
   - Mention environment requirements

4. **Regular Cleanup**
   - Archive outdated implementations
   - Update tags as code evolves
   - Remove duplicate entries

5. **Cross-Reference**
   - Link related implementations
   - Connect bugs to fixes
   - Reference documentation

## Future Enhancements

1. **Cursor Extension**
   - Native UI for memory management
   - Inline search results
   - Quick save shortcuts

2. **Code Intelligence**
   - AST-based analysis
   - Dependency graphs
   - Security pattern detection

3. **Team Features**
   - Shared code memories
   - Review annotations
   - Knowledge base building

## Status Dashboard

- ✅ MCP Server configured
- ✅ All features implemented
- ✅ Database connected
- ✅ Background tasks enabled
- ⏳ Waiting for Cursor MCP support
- ✅ REST API alternative available

The configuration is ready! Once Cursor enables MCP support, your code memory system will be automatically available.