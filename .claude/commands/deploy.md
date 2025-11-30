# Pre-Deployment Checklist

**Description:** Comprehensive pre-deployment checks for safe production deployment to Render/Supabase.

**Usage:** `/deploy [optional: environment like "to production" or "staging"]`

**When to use:**
- Before EVERY production deployment
- After passing all tests and reviews
- When ready to ship to users

**Example:**
```
User: /deploy to production
→ Returns: 12-step checklist (tests, env vars, logs, migrations, build, security, rollback plan, deploy commands, verification)
→ Integrates with Render MCP and Supabase MCP
→ Saves deployment record to purmemo
```

---

Execute comprehensive pre-deployment checklist before deploying to production.

## Your Process

Execute the following checks before deploying to Render, Supabase, or any production environment:

### Step 1: Verify Deployment Target
Confirm the deployment details:
- Which environment? (staging/production)
- Which services? (Render, Supabase, both)
- What's being deployed? (API, frontend, database changes)
- Expected impact? (new feature, bug fix, breaking change)

Ask user if unclear.

### Step 2: Run Full Test Suite

**Execute all tests:**
```bash
# Run unit tests
npm test || pytest || go test -v || mvn test || echo "No test command"

# Run integration tests if available
npm run test:integration || pytest tests/integration || echo "No integration tests"

# Run E2E tests if available
npm run test:e2e || echo "No E2E tests"

# Check test coverage
npm run test:coverage || pytest --cov || go test -cover || echo "No coverage report"
```

**Requirements:**
- ✅ All tests must pass (0 failures)
- ✅ No skipped critical tests
- ✅ Coverage should meet project standards (typically >80%)

**If tests fail:**
- ❌ STOP deployment immediately
- Debug and fix failing tests
- Re-run this checklist after fixes

### Step 3: Check Environment Variables

**A. List required environment variables:**

Use Grep to find all environment variable usage:
```bash
# Find all env var references (Node.js)
grep -rn "process\.env\." --include="*.{js,ts}" src/ | cut -d: -f3 | sort -u

# Find all env var references (Python)
grep -rn "os\.environ\|os\.getenv" --include="*.py" . | cut -d: -f3 | sort -u

# Check .env.example for documented vars
cat .env.example 2>/dev/null || echo "No .env.example found"
```

**B. Verify deployment environment has all required vars:**

For **Render**:
```bash
# List current Render env vars for the service
render services list
render services env <service-id>

# Or use MCP tool
mcp__render__get_service(serviceId="<service-id>")
```

For **Supabase**:
```bash
# Check Supabase project settings
supabase status
supabase secrets list

# Or use MCP tool
mcp__supabase__get_project(id="<project-id>")
```

**C. Compare local vs production:**
- Are all required vars set in production?
- Are values correct (not dev/test values)?
- Are secrets properly secured (not exposed in logs)?
- Are new env vars documented?

**Critical env vars to verify:**
- DATABASE_URL / Connection strings
- API keys (third-party services)
- Authentication secrets (JWT_SECRET, etc.)
- Service URLs (correct production URLs)
- Feature flags (if applicable)

### Step 4: Review Recent Logs

**Check for existing issues before deploying:**

For **Render**:
```bash
# Get recent logs
render logs <service-id> --tail 100

# Or use MCP tool
mcp__render__list_logs(serviceId="<service-id>", limit=100)
```

For **Supabase**:
```bash
# Check database logs
supabase logs

# Or use MCP tool
mcp__supabase__get_logs(project_id="<project-id>", service="postgres")
mcp__supabase__get_logs(project_id="<project-id>", service="api")
```

**Look for:**
- ❌ Recent error spikes
- ❌ Performance degradation
- ❌ Failed requests
- ⚠️ Warning patterns
- ✅ Stable baseline (healthy logs)

**If issues found:**
- Investigate root cause
- Consider fixing before deploying new changes
- New deployment might compound existing problems

### Step 5: Database Migration Check

**A. Review pending migrations:**
```bash
# Check migration status (depends on ORM)
npm run migrate:status || alembic current || django-admin showmigrations || echo "Check migrations manually"

# List migration files
ls -lt migrations/ || ls -lt alembic/versions/ || ls -lt db/migrations/
```

**B. Verify migration safety:**

For **Supabase**:
```bash
# List pending migrations
mcp__supabase__list_migrations(project_id="<project-id>")

# Review migration SQL
cat migrations/<migration-file>.sql
```

**Critical checks:**
- ✅ Migrations are backwards compatible (if possible)
- ✅ No data loss operations (DROP TABLE, DROP COLUMN without backup)
- ✅ Indexes created for new queries
- ✅ Migrations tested on staging/dev database
- ⚠️ Large tables? Consider migration time and locking

**C. Migration execution plan:**
```bash
# Dry-run migration if tool supports it
npm run migrate:dry-run || alembic upgrade --sql || echo "No dry-run available"
```

**D. Backup before migration:**

For **Supabase**:
```bash
# Create database backup
supabase db dump > backup-$(date +%Y%m%d-%H%M%S).sql

# Or verify automated backups are enabled
mcp__supabase__get_project(id="<project-id>")
# Check backup schedule in response
```

For **Render** (if using Render Postgres):
```bash
# Verify backup retention settings
render postgres backups list <db-id>
```

**E. Migration rollback plan:**
- Document how to rollback migration
- Test rollback procedure on dev/staging
- Have rollback SQL ready if needed

### Step 6: Build and Artifact Verification

**A. Build for production:**
```bash
# Clean previous builds
rm -rf dist/ build/ || echo "No build directory"

# Run production build
npm run build || python setup.py build || go build || mvn package || echo "No build command"

# Verify build output
ls -lh dist/ || ls -lh build/ || echo "Check build output"
```

**B. Check build warnings/errors:**
- ✅ No build errors
- ⚠️ Review and address build warnings
- ✅ Bundle size acceptable (check bundle analyzer if available)
- ✅ Assets optimized (minified, compressed)

**C. Verify deployment artifacts:**
```bash
# Check package.json version
cat package.json | grep version

# Check git commit/tag
git log -1 --oneline
git describe --tags 2>/dev/null || echo "No tags"
```

### Step 7: Dependency and Security Audit

**A. Check for vulnerabilities:**
```bash
# Node.js security audit
npm audit --production || echo "No npm"

# Python security check
pip check || safety check || echo "No Python security check"

# Check for outdated critical dependencies
npm outdated --production || pip list --outdated || echo "No outdated check"
```

**B. Review findings:**
- ❌ Critical vulnerabilities? MUST FIX before deploying
- ⚠️ High severity? Consider fixing or document risk
- ✅ Low/medium? Can deploy but track for future fixes

### Step 8: Rollback Plan

**Document rollback strategy:**

**A. Application rollback:**

For **Render**:
- Previous deployment can be restored via Render dashboard
- Or redeploy previous git commit/tag
- Rollback time: ~2-5 minutes (build + deploy)

For **Supabase** (Edge Functions):
- Previous function version can be restored
- Rollback time: ~30 seconds

**B. Database rollback:**
- If migration applied, have rollback SQL ready
- Document data implications of rollback
- Test rollback on dev/staging first

**C. Rollback triggers:**
When to rollback immediately:
- ❌ >10% error rate increase
- ❌ Critical functionality broken
- ❌ Data corruption detected
- ❌ Security vulnerability introduced
- ⚠️ Performance degradation >50%

**D. Communication plan:**
- Who to notify if rollback needed?
- How to notify users of downtime?
- Incident response procedures

### Step 9: Pre-Deployment Checklist Summary

Generate a comprehensive deployment readiness report:

**🚀 DEPLOYMENT READINESS REPORT**

**Target Environment:** [staging/production]
**Services:** [Render/Supabase/Both]
**Deployment Type:** [new feature/bug fix/hotfix]
**Expected Impact:** [high/medium/low]

**✅ TESTS**
- Unit tests: ✅/❌ [X passing, Y total]
- Integration tests: ✅/❌/N/A
- E2E tests: ✅/❌/N/A
- Coverage: [percentage]

**✅ ENVIRONMENT VARIABLES**
- Required vars documented: ✅/❌
- Production vars verified: ✅/❌
- Secrets secured: ✅/❌
- New vars added: [list]

**✅ LOGS & MONITORING**
- Recent logs reviewed: ✅
- No critical errors: ✅/❌
- Baseline healthy: ✅/❌
- Issues found: [list]

**✅ DATABASE**
- Migrations reviewed: ✅/❌/N/A
- Backup created: ✅/❌/N/A
- Migration tested: ✅/❌/N/A
- Rollback plan ready: ✅/❌/N/A

**✅ BUILD**
- Production build successful: ✅/❌
- No build errors: ✅/❌
- Artifacts verified: ✅/❌

**✅ SECURITY**
- No critical vulnerabilities: ✅/❌
- Dependencies audited: ✅/❌
- Security scan passed: ✅/❌

**✅ ROLLBACK PLAN**
- Application rollback documented: ✅/❌
- Database rollback ready: ✅/❌/N/A
- Rollback triggers defined: ✅/❌
- Communication plan ready: ✅/❌

**📋 DEPLOYMENT SUMMARY**
- Changes being deployed: [brief description]
- Git commit: [commit hash]
- Version/Tag: [version number]
- Estimated deployment time: [time estimate]
- Expected downtime: [none/minimal/X minutes]

**🎯 DEPLOYMENT STATUS**
- Overall: ✅ READY / ⚠️ PROCEED WITH CAUTION / ❌ NOT READY
- Blockers: [list critical issues]
- Warnings: [list non-critical concerns]
- Go/No-Go: [RECOMMENDED: GO / NO-GO]

### Step 10: Execute Deployment

**If READY, provide deployment commands:**

For **Render**:
```bash
# Option 1: Git push (auto-deploy)
git push origin main

# Option 2: Manual trigger via Render dashboard
# (provide link to dashboard)

# Option 3: Use Render CLI
render deploy

# Monitor deployment
render services logs <service-id> --tail
```

For **Supabase** (migrations):
```bash
# Apply migrations
supabase db push

# Or use MCP tool
mcp__supabase__apply_migration(
  project_id="<project-id>",
  name="<migration-name>",
  query="<migration-sql>"
)
```

For **Supabase** (Edge Functions):
```bash
# Deploy function
supabase functions deploy <function-name>
```

**Monitor deployment:**
- Watch build logs for errors
- Monitor application logs after deployment
- Check health endpoints
- Verify critical functionality
- Monitor error rates and performance

### Step 11: Post-Deployment Verification

**Immediately after deployment:**

```bash
# Check service health
curl https://your-app.onrender.com/health || echo "Check health endpoint"

# Check recent logs for errors
render logs <service-id> --tail 50

# Or use MCP
mcp__render__list_logs(serviceId="<service-id>", limit=50)

# Check Supabase services
mcp__supabase__get_advisors(project_id="<project-id>", type="security")
mcp__supabase__get_advisors(project_id="<project-id>", type="performance")
```

**Smoke tests (manual or automated):**
- ✅ Homepage loads
- ✅ User login works
- ✅ Critical API endpoints respond
- ✅ Database queries succeed
- ✅ New feature works as expected

**If issues detected:**
1. Assess severity
2. Check rollback triggers
3. Execute rollback if needed
4. Debug and prepare hotfix

### Step 12: Save Deployment Record to Purmemo

Use `/save` command to document the deployment:

**Title format:** `Deploy - [Environment] - [Version/Feature] - [Date]`

**Examples:**
- "Deploy - Production - v2.1.0 - 2025-11-13"
- "Deploy - Production - Authentication Fix - 2025-11-13"
- "Deploy - Staging - Timeline Feature - 2025-11-13"

**Content should include:**
- Complete deployment readiness report (from Step 9)
- Deployment execution details
- Post-deployment verification results
- Any issues encountered and resolutions
- Actual vs. expected deployment time
- Rollback decision (if applicable)

**Tags:** ["deployment", "production" or "staging", "render", "supabase", version-tag]

This creates an invaluable deployment history and audit trail!

## Example Execution:

```
User: "Ready to deploy to production"

Step 1: Verify Target
→ Environment: Production
→ Services: Render (API) + Supabase (Database)
→ Changes: New authentication feature

Step 2: Run Tests
→ npm test: ✅ 47/47 passing
→ Coverage: 89% ✅

Step 3: Check Env Vars
→ Found 12 required env vars
→ Render env vars verified: ✅ All set
→ Supabase secrets verified: ✅ All set

Step 4: Review Logs
→ Render logs: ✅ Healthy (no recent errors)
→ Supabase logs: ✅ Stable baseline

Step 5: Database Migration
→ Pending: add_auth_tokens_table.sql
→ Reviewed: ✅ Safe (adds table, no data loss)
→ Backup created: ✅ backup-20251113.sql
→ Rollback ready: ✅ drop_auth_tokens_table.sql

Step 6: Build Verification
→ npm run build: ✅ Success
→ No build warnings
→ Bundle size: 245KB (acceptable)

Step 7: Security Audit
→ npm audit: ✅ No vulnerabilities
→ Dependencies: 2 minor updates available (non-blocking)

Step 8: Rollback Plan
→ App rollback: Redeploy commit abc123
→ DB rollback: Execute drop_auth_tokens_table.sql
→ Triggers defined: >10% error rate
→ Communication: Slack #incidents channel

Step 9: Generate Report
→ Status: ✅ READY TO DEPLOY
→ No blockers
→ All checks passed

Step 10: Execute Deployment
→ git push origin main
→ Render: Build started...
→ Render: Build successful
→ Supabase: Applying migration...
→ Supabase: Migration applied ✅

Step 11: Post-Deployment
→ Health check: ✅ 200 OK
→ Smoke tests: ✅ All passing
→ Logs: ✅ No errors
→ Monitoring: ✅ Normal baseline

Step 12: Save Record
→ /save with title "Deploy - Production - v2.1.0 - 2025-11-13"
→ Deployment successful, documented
```

## Smart Features:

**Auto-detect services:**
- Check for Render config (.render.yaml)
- Check for Supabase config (supabase/)
- Adjust checklist based on detected services

**Severity-based decisions:**
- 🔴 Critical blockers → Cannot deploy
- 🟡 Warnings → Proceed with caution
- 🟢 All clear → Safe to deploy

**Integration with MCP tools:**
- Use Render MCP to check service status
- Use Supabase MCP to verify database health
- Automated checks where possible

## Notes

- Never skip the deployment checklist (even for "small" changes)
- Document EVERY production deployment in purmemo
- Build deployment muscle memory through consistent process
- Failed deployments are learning opportunities (document them!)
- Rollback is not failure, it's risk management
- Monitor for 30 minutes after deployment
- Schedule deployments during low-traffic windows
- Have a second person review checklist for critical deployments
