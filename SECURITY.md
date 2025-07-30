# Security Policy

## Supported Versions

We release patches for security vulnerabilities. Currently supported versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take the security of PUO Memo MCP seriously. If you have discovered a security vulnerability, please follow these steps:

1. **DO NOT** open a public GitHub issue
2. Email your findings to security@puo-memo.com
3. Include the following in your report:
   - Description of the vulnerability
   - Steps to reproduce the issue
   - Potential impact
   - Suggested fix (if any)

### What to expect

- You'll receive an acknowledgment within 48 hours
- We'll investigate and keep you updated on our progress
- Once fixed, we'll publicly acknowledge your contribution (unless you prefer to remain anonymous)

## Security Best Practices

When using PUO Memo MCP:

1. **API Keys**: 
   - Never commit API keys to version control
   - Use environment variables for configuration
   - Rotate keys regularly

2. **Environment**:
   - Keep dependencies up to date
   - Use the latest version of Node.js
   - Run in a secure environment

3. **Data**:
   - Be mindful of what information you store
   - Use HTTPS for all API communications
   - Don't store sensitive credentials in memories

## Security Features

PUO Memo MCP includes:

- Secure API authentication
- Environment-based configuration
- No client-side credential storage
- Encrypted communication with API servers

## Contact

For security concerns, contact: security@puo-memo.com

For general support: support@puo-memo.com