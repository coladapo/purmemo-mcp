# Test Command

Run tests for production-ready validation.

## Usage

```
# ─── No argument = EVERYTHING (~204 tests, ~3 min) ───────────────────────
/test           → Runs ALL tests: backend + chrome ext + frontend E2E

# ─── Backend Only (purmemo-api) ──────────────────────────────────────────
/test api       → All backend route + middleware tests (102 tests, <1s)
/test unit      → Pure function unit tests — TTLCache, contentHash (19 tests, <1s)
/test backend   → Full backend test suite (121 tests, <1s)
/test auth      → Auth route + middleware tests (19 tests, <1s)
/test memories  → Memory CRUD contract tests (19 tests, <1s)
/test mcp       → MCP tool dispatcher tests (21 tests, <1s)
/test search    → Search/recall contract tests (6 tests, <1s)
/test identity  → Identity session tests (6 tests, <1s)
/test dashboard → Dashboard initial-load tests (4 tests, <1s)
/test users     → User routes tests (8 tests, <1s)
/test api-keys  → API key CRUD tests (6 tests, <1s)

# ─── Chrome Extension Auth Contract Tests ─────────────────────────────────
/test ext:auth  → Run ALL cross-repo auth tests (42 tests, ~15s) ← RUN BEFORE ANY AUTH CHANGE
/test ext:urls  → Extension URL contract tests (24 tests, <1s)
/test ext:oauth → Backend OAuth redirect tests (10 tests, <1s)
/test ext:flow  → Frontend sign-in flow tests (8 tests, ~13s)

# ─── Frontend E2E Tests ───────────────────────────────────────────────────
/test frontend         → All frontend E2E tests (~41 tests, ~2 min)
/test frontend:auth    → Auth flow tests (login, logout, protected routes)
/test frontend:token   → Token refresh tests (proactive refresh, expiry)
/test frontend:dashboard → Dashboard functionality tests
```

## Your Task

When user invokes `/test`, you should:

### 0. No Argument = Run EVERYTHING

**If no argument is provided**, run all three layers sequentially:
1. Backend (Vitest) — 121 tests, <1s
2. Chrome extension auth contracts — 34 tests, <1s
3. Frontend E2E (Playwright) — ~41 tests + 8 sign-in flow, ~2.5 min

Run them in sequence and report a unified summary at the end.

### 1. Recall Relevant Patterns from Purmemo
Before running tests, use `recall_memories` to find:
- Past test failures in this codebase
- Common fix patterns
- Known issues to watch for

### 2. Execute Tests

Run appropriate command based on the argument:

```bash
# ─── TypeScript Backend (purmemo-api) ─────────────────────────────────────

# All backend tests (121 tests, <1 second)
cd /Users/wivak/puo-jects/____active/purmemo-api && npx vitest run --reporter=verbose

# Route + middleware tests only (102 tests)
cd /Users/wivak/puo-jects/____active/purmemo-api && npx vitest run src/__tests__/routes/ src/__tests__/middleware/ --reporter=verbose

# Unit tests only (19 tests)
cd /Users/wivak/puo-jects/____active/purmemo-api && npx vitest run src/__tests__/unit/ --reporter=verbose

# Auth tests
cd /Users/wivak/puo-jects/____active/purmemo-api && npx vitest run src/__tests__/routes/auth.test.ts --reporter=verbose

# Memory tests
cd /Users/wivak/puo-jects/____active/purmemo-api && npx vitest run src/__tests__/routes/memories.test.ts --reporter=verbose

# MCP tests
cd /Users/wivak/puo-jects/____active/purmemo-api && npx vitest run src/__tests__/routes/mcp.test.ts --reporter=verbose

# Search tests
cd /Users/wivak/puo-jects/____active/purmemo-api && npx vitest run src/__tests__/routes/search.test.ts --reporter=verbose

# Identity tests
cd /Users/wivak/puo-jects/____active/purmemo-api && npx vitest run src/__tests__/routes/identity.test.ts --reporter=verbose

# Dashboard tests
cd /Users/wivak/puo-jects/____active/purmemo-api && npx vitest run src/__tests__/routes/dashboard.test.ts --reporter=verbose

# Users tests
cd /Users/wivak/puo-jects/____active/purmemo-api && npx vitest run src/__tests__/routes/users.test.ts --reporter=verbose

# API keys tests
cd /Users/wivak/puo-jects/____active/purmemo-api && npx vitest run src/__tests__/routes/api-keys.test.ts --reporter=verbose
```

### Cross-Repo Auth Contract Tests (Chrome Extension Sign-In)

These 42 tests protect the sign-in flow that spans extension → frontend → backend → OAuth providers.
**Run `/test ext:auth` before ANY change to auth, login, OAuth, or extension sign-in code.**

```bash
# ALL cross-repo auth tests (42 tests, ~5 seconds)
cd "/Users/wivak/puo-jects/____active/purmemo/chrome ext/chrome-extension-production" && node --test tests/signin-url-contracts.test.js && cd /Users/wivak/puo-jects/____active/purmemo-api && npm test && echo "All 42 cross-repo auth tests pass"

# Extension URL contracts only (24 tests, <1s)
cd "/Users/wivak/puo-jects/____active/purmemo/chrome ext/chrome-extension-production" && node --test tests/signin-url-contracts.test.js

# Backend OAuth redirects only (10 tests, <1s)
cd /Users/wivak/puo-jects/____active/purmemo-api && npm test

# Frontend sign-in flow only (8 tests, ~30s — needs dev server)
cd /Users/wivak/puo-jects/____active/purmemo/v1-mvp/frontend && npx playwright test e2e/auth-signin-flow.spec.ts
```

**What these catch:**
- Extension URLs missing `popup=true` or `ext_id` (the original bug)
- `/signup` stripping query params when redirecting to `/login`
- Backend OAuth not passing `popup`/`ext_id` through redirect chain
- Frontend token delivery silently redirecting to dashboard
- Background script not handling auth callback message types

### Frontend E2E Tests (Playwright)

```bash
# Navigate to frontend directory
cd /Users/wivak/puo-jects/____active/purmemo/v1-mvp/frontend

# All frontend E2E tests (~41 tests)
npm run test:e2e

# Auth flow tests only
npx playwright test e2e/auth/auth-flow.spec.ts

# Token refresh tests only
npx playwright test e2e/auth/token-refresh.spec.ts

# Dashboard tests only
npx playwright test e2e/dashboard/dashboard.spec.ts

# Run with browser visible (for debugging)
npm run test:e2e:headed
```

### No Argument / Full Suite (ALL tests)

When `/test` is invoked with no argument, run all three in sequence:

```bash
# 1. Backend (121 tests, <1s)
cd /Users/wivak/puo-jects/____active/purmemo-api && npx vitest run --reporter=verbose

# 2. Chrome extension URL contracts (24 tests, <1s)
cd "/Users/wivak/puo-jects/____active/purmemo/chrome ext/chrome-extension-production" && node --test tests/signin-url-contracts.test.js

# 3. Backend OAuth redirects (10 tests, <1s)
cd /Users/wivak/puo-jects/____active/purmemo-api && npx vitest run src/__tests__/oauth-redirect.test.ts --reporter=verbose

# 4. Frontend E2E + sign-in flow (~49 tests, ~2.5 min)
cd /Users/wivak/puo-jects/____active/purmemo/v1-mvp/frontend && npx playwright test
```

Report a unified summary at the end:
```
FULL TEST SUITE
Backend:       121/121 (<1s)
Extension:      24/24  (<1s)
OAuth:          10/10  (<1s)
Frontend E2E:   49/49  (2.5 min)
─────────────────────────────
Total:         204/204
```

### 3. Intelligent Reporting

**Show concise summary:**
- X/Y tests passing (Z%)
- Runtime: X seconds
- Focus on failures only (don't list all passing tests)

**For failures, provide:**
1. **Failed test name + error message**
2. **Pattern detection** (recall from purmemo)
3. **Suggested fix** with code example and file reference

## Quick Reference

| Command | Tests | Time | Use Case |
|---------|-------|------|----------|
| **`/test`** | **~204** | **~3m** | **Everything — backend + ext + frontend** |
| `/test backend` | 121 | <1s | Full backend validation |
| `/test api` | 102 | <1s | Route + middleware contracts |
| `/test unit` | 19 | <1s | Pure function tests |
| `/test auth` | 19 | <1s | After auth/JWT changes |
| `/test memories` | 19 | <1s | After memory CRUD changes |
| `/test mcp` | 21 | <1s | After MCP tool changes |
| `/test search` | 6 | <1s | After search/recall changes |
| `/test identity` | 6 | <1s | After identity session changes |
| `/test dashboard` | 4 | <1s | After dashboard changes |
| `/test users` | 8 | <1s | After user route changes |
| `/test api-keys` | 6 | <1s | After API key changes |
| `/test ext:auth` | 42 | ~15s | **Before ANY auth change** |
| `/test ext:urls` | 24 | <1s | After extension URL changes |
| `/test ext:oauth` | 10 | <1s | After backend OAuth changes |
| `/test ext:flow` | 8 | ~13s | After frontend login changes |
| `/test frontend` | ~41 | ~2m | Frontend E2E validation |

## Test Architecture

### Backend (purmemo-api) — Vitest + Hono app.request()
- **Location:** `/Users/wivak/puo-jects/____active/purmemo-api/src/__tests__/`
- **Framework:** Vitest 4.1.0 with `pool: "forks"` for module isolation
- **Pattern:** vi.mock() at 4 module boundaries (db, auth, embeddings, background) — zero production code changes
- **Config:** `purmemo-api/vitest.config.ts`
- **Helpers:** `src/__tests__/helpers/` — setup.ts, mock-db.ts, fixtures.ts, test-app.ts

### Frontend (v1-mvp/frontend) — Playwright
- **Location:** `/Users/wivak/puo-jects/____active/purmemo/v1-mvp/frontend/e2e/`
- **Auth Helpers:** `e2e/fixtures/auth.ts`

### Cross-Repo Auth — Node built-in test runner + Vitest
- **Extension:** `chrome ext/chrome-extension-production/tests/signin-url-contracts.test.js` (24 tests)
- **Backend:** `purmemo-api/src/__tests__/oauth-redirect.test.ts` (10 tests)
- **Frontend:** `v1-mvp/frontend/e2e/auth-signin-flow.spec.ts` (8 tests)

### Legacy Python Tests (Reference Only)
- **Location:** `/Users/wivak/puo-jects/____active/purmemo/v1-mvp/backend/tests/`
- **Status:** 902 pytest tests against the dead FastAPI/Redis/SQS backend
- **Use:** Contract reference — documents expected endpoint behavior for cross-referencing
- **Do NOT run these** — they test infrastructure that no longer exists

## Notes

- **Prefer `/test all`** for fast feedback (<1 second for 121 tests)
- **Use `/test ext:auth`** before ANY change to auth, login, OAuth, or extension sign-in
- **Use `/test frontend`** before frontend deploys
- **Use `/test fullstack`** before major releases
- Tests protect: API contract shapes, auth flows, MCP tool field names, response formats, error handling, caching logic
