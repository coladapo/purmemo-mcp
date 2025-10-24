# Changelog

All notable changes to purmemo-mcp will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [9.1.0] - 2025-10-24

### Added
- 🌍 **Universal Platform Support**: Dynamic platform detection via `MCP_PLATFORM` environment variable
- 📘 Multi-platform configuration examples in README (Claude, Cursor, ChatGPT, Windsurf, Zed)
- 🧪 Platform detection test script (`test-platform-detection.js`)
- 📚 Comprehensive platform support documentation

### Changed
- 🔧 Platform detection now uses `process.env.MCP_PLATFORM` instead of hardcoded `'claude'`
- 📝 Updated README with collapsible platform-specific configuration sections
- 🏷️ Added keywords for better npm discoverability: cursor, chatgpt, windsurf, zed, universal, model-context-protocol
- 📦 Package description now emphasizes universal MCP compatibility

### Fixed
- ❌ **CRITICAL**: Fixed platform mis-tagging when using purmemo-mcp in non-Claude platforms
  - Previously: All platforms tagged as `platform=claude` in database
  - Now: Each platform correctly tagged (cursor, chatgpt, etc.)
- 💾 Living document pattern now works correctly across all platforms

### Technical Details

**Breaking Change**: None - defaults to `'claude'` when `MCP_PLATFORM` not set
**Migration**: Existing Claude Desktop users don't need to change anything
**New Users**: Must set `MCP_PLATFORM` env var for non-Claude platforms

**Supported Platforms**:
- ✅ Claude Desktop (macOS, Windows, Linux)
- ✅ Cursor IDE (macOS, Windows)
- 🟡 ChatGPT Web (requires remote deployment - coming soon)
- ✅ Windsurf IDE (macOS, Windows)
- ✅ Zed Editor (macOS, Linux)

**Database Impact**:
```sql
-- Before (all platforms):
INSERT INTO memories (platform, ...) VALUES ('claude', ...);

-- After (with MCP_PLATFORM=cursor):
INSERT INTO memories (platform, ...) VALUES ('cursor', ...);
```

### References
- MCP Specification: https://modelcontextprotocol.io
- Issue: Universal MCP support requested by community
- Research: https://cursor.com/docs/context/mcp
- Research: https://platform.openai.com/docs/guides/developer-mode

## [9.0.1] - 2025-10-XX

### Fixed
- Various bug fixes and improvements

## [9.0.0] - 2025-10-XX

### Added
- Initial v9.0 release with enhanced conversation capture
- Support for 100K+ character conversations
- Automatic chunking for large content
- Artifact and code block preservation
- Session management for multi-part saves

---

## Migration Guide: 9.0.1 → 9.1.0

### For Claude Desktop Users (No Action Required)

Your existing configuration will continue to work:

```json
{
  "mcpServers": {
    "purmemo": {
      "command": "npx",
      "args": ["-y", "purmemo-mcp"],
      "env": {
        "PURMEMO_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

**Recommended**: Add `MCP_PLATFORM` for explicitness:

```json
{
  "mcpServers": {
    "purmemo": {
      "command": "npx",
      "args": ["-y", "purmemo-mcp"],
      "env": {
        "PURMEMO_API_KEY": "your-api-key-here",
        "MCP_PLATFORM": "claude"  // ← Add this
      }
    }
  }
}
```

### For Cursor/Other Platform Users (Action Required)

**Before** (v9.0.1 - mis-tagged as claude):
```json
{
  "mcpServers": {
    "purmemo": {
      "command": "npx",
      "args": ["-y", "purmemo-mcp"],
      "env": {
        "PURMEMO_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

**After** (v9.1.0 - correctly tagged):
```json
{
  "mcpServers": {
    "purmemo": {
      "command": "npx",
      "args": ["-y", "purmemo-mcp"],
      "env": {
        "PURMEMO_API_KEY": "your-api-key-here",
        "MCP_PLATFORM": "cursor"  // ← Add this
      }
    }
  }
}
```

### Testing Your Configuration

Run the platform detection test:

```bash
cd /path/to/purmemo-mcp
node test-platform-detection.js
```

You should see:
```
✅ MCP_PLATFORM=claude          → Detected: "claude"
✅ MCP_PLATFORM=cursor          → Detected: "cursor"
✅ MCP_PLATFORM=chatgpt         → Detected: "chatgpt"
...
```

### Verifying Database Tags

Check your memories have correct platform tags:

```sql
SELECT platform, COUNT(*) as count
FROM v1_mvp.memories
WHERE user_id = 'your-user-id'
GROUP BY platform;
```

Expected results after migration:
```
platform  | count
----------|------
claude    | 150
cursor    | 45
chatgpt   | 12
```

---

[9.1.0]: https://github.com/coladapo/purmemo-mcp/compare/v9.0.1...v9.1.0
[9.0.1]: https://github.com/coladapo/purmemo-mcp/compare/v9.0.0...v9.0.1
[9.0.0]: https://github.com/coladapo/purmemo-mcp/releases/tag/v9.0.0
