# Contributing to Purmemo MCP

Thank you for your interest in contributing to Purmemo MCP! This document provides guidelines for contributions.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/purmemo-mcp.git`
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feature/your-feature`

## Development Setup

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm 9+
- A Purmemo account (free tier available at https://purmemo.ai)

### Environment Variables

Create a `.env` file (never commit this):

```bash
PURMEMO_API_KEY=your_api_key_here
```

### Running Locally

```bash
# Run the MCP server directly
node src/server.js

# Or use the npm script
npm start
```

## Code Standards

### Style Guide

- Use ES modules (`import`/`export`)
- Use async/await for asynchronous code
- Add JSDoc comments for public functions
- Keep functions focused and small

### Commit Messages

Follow conventional commits:
- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `refactor:` Code refactoring
- `test:` Adding tests
- `chore:` Maintenance tasks

Example: `feat: add conversation tagging support`

## Pull Request Process

1. Update documentation if needed
2. Ensure your code passes linting
3. Write a clear PR description
4. Link related issues
5. Request review from maintainers

### PR Checklist

- [ ] Code follows project style
- [ ] Self-reviewed the changes
- [ ] Added/updated documentation
- [ ] No sensitive data exposed
- [ ] Tested locally

## Reporting Issues

### Bug Reports

Include:
- Node.js version
- npm version
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Error messages (if any)

### Feature Requests

- Check existing issues first
- Describe the use case
- Explain why it would be useful

## Community

- Be respectful and inclusive
- Help others when you can
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md)

## Questions?

- Open a GitHub Discussion
- Email: support@purmemo.ai

Thank you for contributing!
