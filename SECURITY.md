# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 11.x    | :white_check_mark: |
| < 11.0  | :x:                |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

### How to Report

1. **Email**: Send details to security@purmemo.ai
2. **Do NOT** open a public GitHub issue for security vulnerabilities

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

### Response Timeline

- **Initial response**: Within 48 hours
- **Status update**: Within 7 days
- **Resolution target**: Within 30 days for critical issues

### Disclosure Policy

- We will acknowledge your report within 48 hours
- We will provide a detailed response within 7 days
- We will work with you to understand and resolve the issue
- We will credit reporters in our release notes (unless you prefer anonymity)

## Security Measures

### Authentication

- OAuth 2.1 + PKCE for secure authentication
- API keys stored securely using platform keychain (macOS) or encrypted file
- Tokens auto-refresh with secure token rotation
- No credentials stored in plain text

### Data Protection

- All API communication over HTTPS
- No sensitive data logged
- Minimal data retention

### Dependencies

- Regular security audits via `npm audit`
- Automated dependency updates via Dependabot
- Locked dependencies via package-lock.json

## Known Security Considerations

### Local Token Storage

On platforms without keychain support, tokens are stored in encrypted files in `~/.purmemo/`. Ensure appropriate file permissions are maintained.

### Environment Variables

When using `PURMEMO_API_KEY` environment variable, ensure:
- The variable is not logged or exposed
- Access to the environment is properly restricted
- The key is rotated periodically
