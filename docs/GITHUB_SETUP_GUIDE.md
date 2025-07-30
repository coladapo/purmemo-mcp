# GitHub Repository Setup Guide

This guide will help you configure your GitHub repository for the full CI/CD pipeline.

## 1. Enable GitHub Pages

GitHub Pages hosts your documentation site automatically.

### Steps:
1. Go to your repository: https://github.com/coladapo/puo-memo-mcp
2. Click on **Settings** (in the repository navigation)
3. Scroll down to **Pages** in the left sidebar
4. Under **Source**, select **GitHub Actions**
5. Click **Save**

Your documentation will be available at: https://coladapo.github.io/puo-memo-mcp/

## 2. Configure Docker Hub Secrets

These secrets allow GitHub Actions to push Docker images to your Docker Hub account.

### Prerequisites:
- Docker Hub account (you have: https://app.docker.com/accounts/coladapo)
- Docker Hub Access Token (more secure than password)

### Create Docker Hub Access Token:
1. Log in to Docker Hub: https://hub.docker.com
2. Click on your username (top right) → **Account Settings**
3. Click on **Security** → **Access Tokens**
4. Click **New Access Token**
5. Description: `puo-memo-mcp-github-actions`
6. Access permissions: **Read, Write, Delete**
7. Click **Generate**
8. **COPY THE TOKEN NOW** (you won't see it again!)

### Add Secrets to GitHub:
1. Go to your repository: https://github.com/coladapo/puo-memo-mcp
2. Click on **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** for each:

| Secret Name | Value |
|------------|--------|
| `DOCKER_USERNAME` | `coladapo` |
| `DOCKER_TOKEN` | Your Docker Hub Access Token |

## 3. Configure Deployment Secrets (Optional)

If you want to enable automatic deployments:

### For Staging Environment:
| Secret Name | Description | Example |
|------------|-------------|---------|
| `STAGING_HOST` | Staging server hostname | `staging.puo-memo.com` |
| `STAGING_USER` | SSH username | `deploy` |
| `STAGING_SSH_KEY` | Private SSH key | `-----BEGIN RSA PRIVATE KEY-----...` |

### For Production Environment:
| Secret Name | Description | Example |
|------------|-------------|---------|
| `PROD_HOST` | Production server hostname | `api.puo-memo.com` |
| `PROD_USER` | SSH username | `deploy` |
| `PROD_SSH_KEY` | Private SSH key | `-----BEGIN RSA PRIVATE KEY-----...` |

### For Slack Notifications (Optional):
| Secret Name | Description |
|------------|-------------|
| `SLACK_WEBHOOK` | Slack webhook URL for CI/CD notifications |

## 4. Configure API Secrets

For integration tests and MCP testing:

| Secret Name | Description | Required |
|------------|-------------|----------|
| `PUO_MEMO_API_URL` | API endpoint URL | No (defaults to http://localhost:8000) |
| `PUO_MEMO_API_KEY` | API key for testing | Yes for MCP tests |

## 5. Verify Setup

After configuration, you can verify everything works:

1. **Test Docker Build:**
   ```bash
   # Manually trigger the CI/CD workflow
   # Go to Actions → CI/CD Pipeline → Run workflow
   ```

2. **Test Documentation:**
   ```bash
   # Make a small change to docs/ and push
   echo "Test update $(date)" >> docs/index.md
   git add docs/index.md
   git commit -m "Test documentation deployment"
   git push
   ```

3. **Check Workflow Status:**
   - Go to the **Actions** tab
   - All workflows should show green checkmarks

## Security Best Practices

1. **Never commit secrets** to the repository
2. **Use Access Tokens** instead of passwords
3. **Limit token permissions** to only what's needed
4. **Rotate secrets regularly** (every 90 days)
5. **Use environment-specific secrets** (staging vs production)

## Troubleshooting

### Docker push fails
- Verify `DOCKER_USERNAME` and `DOCKER_TOKEN` are set correctly
- Check token permissions include "Write"
- Ensure Docker Hub repository exists or will be auto-created

### GitHub Pages fails
- Ensure Pages is enabled with "GitHub Actions" as source
- Check workflow has `pages: write` permission
- Verify docs/ directory contains valid Jekyll/markdown files

### Integration tests fail
- Check docker-compose services start correctly locally
- Verify all required environment variables are set
- Check service health endpoints are accessible

## Next Steps

1. Set up monitoring for your Docker images
2. Configure automated security scanning
3. Set up deployment pipelines for staging/production
4. Add status badges to your README.md