# Architecture

This document describes the architecture of purmemo-mcp, an MCP server for cross-platform AI conversation memory.

## Overview

```
+------------------+     +------------------+     +------------------+
|  Claude Desktop  |     |     Cursor       |     |    Windsurf      |
|    (MCP Host)    |     |    (MCP Host)    |     |    (MCP Host)    |
+--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |
         +------------------------+------------------------+
                                  |
                        +---------v---------+
                        |   purmemo-mcp     |
                        |   (MCP Server)    |
                        +---------+---------+
                                  |
                        +---------v---------+
                        |   Purmemo API     |
                        |  api.purmemo.ai   |
                        +-------------------+
```

## Components

### 1. MCP Server (`src/server.js`)

The main entry point that implements the Model Context Protocol.

**Responsibilities:**
- Tool registration and handling
- Request/response formatting
- API communication
- Error handling and user-friendly messages

**Key Functions:**
- `makeApiCall()` - Authenticated API requests
- `handleSaveConversation()` - Save memory flow
- `handleRecallMemories()` - Search memories
- `handleGetMemoryDetails()` - Fetch full memory content
- `handleDiscoverRelated()` - Cross-platform discovery

### 2. Intelligent Memory (`src/intelligent-memory.js`)

Handles smart content processing and context extraction.

**Features:**
- Project context detection
- Smart title generation (no timestamps!)
- Progress tracking extraction
- Relationship mapping

**Key Functions:**
- `extractProjectContext()` - Detect project/component/feature
- `generateIntelligentTitle()` - Create meaningful titles
- `extractProgressIndicators()` - Identify work status
- `extractRelationships()` - Map dependencies

### 3. Authentication (`src/auth/`)

Supports two authentication methods:

**API Key (Recommended):**
```
PURMEMO_API_KEY=pm_your_key_here
```

**OAuth 2.1 + PKCE:**
- `oauth-manager.js` - OAuth flow handler
- `token-store.js` - Secure token storage

### 4. Setup Wizard (`src/setup.js`)

Interactive CLI for configuration.

```bash
npx purmemo-mcp-setup    # Run setup wizard
npx purmemo-mcp status   # Check configuration
npx purmemo-mcp logout   # Clear credentials
```

## Data Flow

### Saving a Conversation

```
1. User says "save this conversation"
2. Claude captures full conversation content
3. purmemo-mcp receives save_conversation call
   |
   +-> Extract project context (project, component, feature)
   +-> Generate intelligent title
   +-> Extract progress indicators
   +-> Determine if chunking needed (>15K chars)
   |
4. API call to POST /api/memories
5. Return success with memory ID
```

### Recalling Memories

```
1. User asks about previous discussions
2. Claude calls recall_memories with query
   |
   +-> API call to POST /api/memories/search
   +-> Semantic search across all platforms
   +-> Filter by entity/intent/stakeholder (optional)
   |
3. Return ranked results with similarity scores
```

### Cross-Platform Discovery

```
1. User wants related conversations
2. Claude calls discover_related_conversations
   |
   +-> Search across all saved memories
   +-> Group by semantic clusters
   +-> Include platform badges (ChatGPT, Claude, Gemini)
   |
3. Return clustered results showing cross-platform connections
```

## MCP Tools

| Tool | Purpose | Read-Only |
|------|---------|-----------|
| `save_conversation` | Save complete conversation | No |
| `recall_memories` | Search saved memories | Yes |
| `get_memory_details` | Fetch full memory content | Yes |
| `discover_related_conversations` | Find related across platforms | Yes |

## Content Processing

### Chunking Strategy

Large conversations (>15K chars) are automatically chunked:

```
Original Content (50K chars)
    |
    +-> Chunk 1 (0-20K) - linked
    +-> Chunk 2 (20K-40K) - linked
    +-> Chunk 3 (40K-50K) - linked
```

Chunks are linked via `conversationId` for seamless retrieval.

### Unicode Handling

The `sanitizeUnicode()` function prevents JSON encoding errors:
- Removes unpaired surrogates
- Cleans control characters
- Handles emoji and international text

## Error Handling

### Quota Management

Free tier users have monthly recall limits:
```
429 Response -> User-friendly message with:
  - Current usage
  - Quota limit
  - Reset date
  - Upgrade URL
```

### API Errors

All errors are transformed into actionable messages:
- Network errors: Retry suggestions
- Auth errors: Re-authentication prompts
- Server errors: Support contact info

## Security

- All API calls use HTTPS
- API keys never logged in full
- OAuth uses PKCE (no client secrets)
- Tokens stored in platform keychain when available
- `execFile` used instead of `exec` to prevent command injection

## Configuration

### Environment Variables

| Variable | Required | Default |
|----------|----------|---------|
| `PURMEMO_API_KEY` | Yes* | - |
| `PURMEMO_API_URL` | No | `https://api.purmemo.ai` |
| `MCP_PLATFORM` | No | Auto-detected |

*Required unless using OAuth

### Platform Detection

Auto-detects platform from environment:
- `CLAUDECODE=1` -> Claude Code
- Default -> Claude Desktop

Can override with `MCP_PLATFORM` env var.

## Testing

```bash
npm test                  # Run all tests
npm test -- --watch       # Watch mode
```

### Test Structure

- `tests/server.test.js` - Unit tests
- `tests/integration.test.js` - Integration tests with mocked API

## Directory Structure

```
purmemo-mcp/
├── src/
│   ├── server.js           # Main MCP server
│   ├── intelligent-memory.js # Smart content processing
│   ├── setup.js            # Setup wizard
│   ├── index.js            # Package entry
│   └── auth/
│       ├── oauth-manager.js  # OAuth flow
│       └── token-store.js    # Token storage
├── tests/
│   ├── server.test.js      # Unit tests
│   └── integration.test.js # Integration tests
├── .github/
│   └── workflows/
│       ├── test.yml        # CI tests
│       └── publish.yml     # npm publishing
├── ARCHITECTURE.md         # This file
├── CONTRIBUTING.md         # Contribution guide
├── SECURITY.md             # Security policy
└── README.md               # User documentation
```
