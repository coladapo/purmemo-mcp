# Changelog

All notable changes to the pūrmemo MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [12.0.1] - 2025-11-25

### Fixed
- Corrected Remote MCP config format in documentation
- Added Connectors UI instructions for Claude.ai integration

## [12.0.0] - 2025-11-24

### Added
- **Tool Annotations**: Full MCP tool annotations with `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`
- **Human-readable titles**: All tools now have user-friendly display titles
- **Security improvements**: Enhanced input validation and error handling
- **CI/CD**: GitHub Actions workflow for automated npm publishing
- **Tests**: Comprehensive test suite for MCP directory submission

### Changed
- Upgraded to `@modelcontextprotocol/sdk` v1.16.0
- Improved error messages with actionable guidance
- Streamlined package for public npm release

### Security
- Cleaned up configuration files
- Removed personal identifiers from code

## [11.2.3] - 2025-11-20

### Added
- **Phase 16.4**: Unicode sanitization to prevent JSON encoding errors
- Fixes "no low surrogate" errors from corrupted Unicode in memories
- Automatic text cleaning before sending to Claude API

### Fixed
- 400 errors caused by unpaired surrogate characters

## [11.0.0] - 2025-11-15

### Added
- **Phase 16.3**: Wisdom Layer - AI-powered tool orchestration
- Proactive next-tool suggestions with context
- Cross-platform discovery across ChatGPT, Claude, Gemini

### Changed
- Enhanced semantic clustering for related conversation discovery

## [10.0.0] - 2025-11-10

### Added
- **Phase 15**: Intelligent memory saving with auto-context extraction
- Smart title generation (no more timestamp titles!)
- Automatic project/component/feature detection
- Roadmap tracking across AI tools

### Changed
- Living document pattern with auto-ID from title
- Improved chunking algorithm for large conversations

## [9.0.0] - 2025-10-25

### Added
- **Phase 2**: Knowledge Graph Intelligence filters
- Entity, initiative, stakeholder, deadline, and intent filters
- `has_observations` filter for finding substantial conversations

### Changed
- Enhanced recall with semantic ranking
- Improved quota handling with user-friendly upgrade messages

## [8.0.0] - 2025-10-15

### Added
- Living document pattern - same title updates existing memory
- Auto-generated conversation IDs from titles
- Server-side auto-chunking for large conversations (>15K chars)

### Changed
- Unified save flow for single and chunked content

## [7.0.0] - 2025-10-01

### Added
- Cross-platform memory support (ChatGPT, Claude, Gemini)
- Platform detection via `MCP_PLATFORM` environment variable
- `discover_related_conversations` tool

### Changed
- Migrated to MCP SDK v1.x

## [1.0.0] - 2025-09-01

### Added
- Initial release
- `save_conversation` tool for saving complete conversations
- `recall_memories` tool for semantic search
- `get_memory_details` tool for retrieving full memory content
- OAuth authentication support
- Claude Desktop and Cursor compatibility
