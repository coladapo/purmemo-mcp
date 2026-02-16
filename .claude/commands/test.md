# Test Command

Run Autonomous Safety System tests for production-ready validation.

## Usage

```
/test phase-1    → API + Auth + Embeddings tests (65 tests, ~15 sec)
/test phase-2    → Redis + SQS + Database + Error Tracking (73 tests, ~25 sec)
/test phase-3    → Performance benchmarks (12 tests, ~47 sec)
/test phase-4    → Intelligence Layer tests (94 tests, ~30 sec)
/test phase-5    → RAG Quality tests (156 tests, ~50 sec)
/test phase-6    → Misc tests (48 tests, ~15 sec)
/test all        → Full Autonomous Safety System (448 tests, ~3.5 min)
/test quick      → Phase 1 + Phase 2 only (138 tests, ~40 sec)
/test core       → Phase 1-3 original tests (150 tests, ~87 sec)
/test intel      → Phase 4 + Phase 5 intelligence tests (250 tests, ~80 sec)

# Frontend E2E Tests (NEW)
/test frontend   → All frontend E2E tests (~41 tests, ~2 min)
/test frontend:auth     → Auth flow tests (login, logout, protected routes)
/test frontend:token    → Token refresh tests (proactive refresh, expiry)
/test frontend:dashboard → Dashboard functionality tests
/test fullstack  → Backend + Frontend tests (comprehensive validation)
```

## Your Task

When user invokes `/test`, you should:

### 1. Use TodoWrite to Track Progress
Create todo list with:
- "Run [phase] tests"
- "Analyze test results"
- "Report findings"

### 2. Recall Relevant Patterns from Purmemo
Before running tests, use `recall_memories` to find:
- Past test failures in this codebase
- Common fix patterns (FK constraints, mocking, thresholds)
- Known issues to watch for

### 3. Execute Tests

Run appropriate pytest command:

```bash
# Navigate to backend directory
cd /Users/wivak/puo-jects/____active/purmemo/v1-mvp/backend
source venv/bin/activate

# Phase 1: API + Auth + Embeddings (65 tests)
pytest tests/test_api_contracts.py tests/test_auth_flows.py tests/test_embeddings_service.py -v

# Phase 2: Redis + SQS + Database + Error Tracking (73 tests)
pytest tests/test_redis_integration.py tests/test_sqs_publishing.py tests/test_database_constraints_v2.py tests/test_error_alerting.py -v

# Phase 3: Performance Benchmarks (12 tests)
pytest tests/test_performance_benchmarks.py -v

# Phase 4: Intelligence Layer (94 tests)
pytest tests/test_clustering.py tests/test_intelligence_extraction.py tests/test_knowledge_graph.py -v

# Phase 5: RAG Quality (156 tests)
pytest tests/test_enhanced_recall_scoring.py tests/test_rag_recall_quality.py tests/test_query_intelligence_matcher.py tests/test_multiword_query_routing.py -v

# Phase 6: Misc (48 tests)
pytest tests/test_living_document_upsert.py tests/test_semantic_quality.py tests/test_unicode_sanitization.py -v

# Quick (Phase 1 + 2 - RECOMMENDED for fast feedback) (138 tests)
pytest tests/test_api_contracts.py tests/test_auth_flows.py tests/test_embeddings_service.py tests/test_redis_integration.py tests/test_sqs_publishing.py tests/test_database_constraints_v2.py tests/test_error_alerting.py -v

# Core (Phase 1-3 original tests) (150 tests)
pytest tests/test_api_contracts.py tests/test_auth_flows.py tests/test_embeddings_service.py tests/test_redis_integration.py tests/test_sqs_publishing.py tests/test_database_constraints_v2.py tests/test_error_alerting.py tests/test_performance_benchmarks.py -v

# Intel (Phase 4 + 5 intelligence tests) (250 tests)
pytest tests/test_clustering.py tests/test_intelligence_extraction.py tests/test_knowledge_graph.py tests/test_enhanced_recall_scoring.py tests/test_rag_recall_quality.py tests/test_query_intelligence_matcher.py tests/test_multiword_query_routing.py -v

# Full Autonomous Safety System (448 tests)
pytest tests/test_api_contracts.py tests/test_auth_flows.py tests/test_embeddings_service.py tests/test_redis_integration.py tests/test_sqs_publishing.py tests/test_database_constraints_v2.py tests/test_error_alerting.py tests/test_performance_benchmarks.py tests/test_clustering.py tests/test_intelligence_extraction.py tests/test_knowledge_graph.py tests/test_enhanced_recall_scoring.py tests/test_rag_recall_quality.py tests/test_query_intelligence_matcher.py tests/test_multiword_query_routing.py tests/test_living_document_upsert.py tests/test_semantic_quality.py tests/test_unicode_sanitization.py -v
```

### Frontend E2E Tests (Playwright)

```bash
# Navigate to frontend directory
cd /Users/wivak/puo-jects/____active/purmemo/v1-mvp/frontend

# All frontend E2E tests (~41 tests)
npm run test:e2e

# Auth flow tests only (login, logout, protected routes)
npx playwright test e2e/auth/auth-flow.spec.ts

# Token refresh tests only (proactive refresh, expiry handling)
npx playwright test e2e/auth/token-refresh.spec.ts

# Dashboard tests only
npx playwright test e2e/dashboard/dashboard.spec.ts

# Run with browser visible (for debugging)
npm run test:e2e:headed

# Run with UI mode (interactive)
npm run test:e2e:ui

# Debug mode
npm run test:e2e:debug

# View test report
npm run test:e2e:report
```

### Fullstack Tests (Backend + Frontend)

```bash
# Run both backend and frontend tests
# Backend first
cd /Users/wivak/puo-jects/____active/purmemo/v1-mvp/backend
source venv/bin/activate
pytest tests/test_api_contracts.py tests/test_auth_flows.py -v

# Then frontend
cd /Users/wivak/puo-jects/____active/purmemo/v1-mvp/frontend
npm run test:e2e
```

### 4. Intelligent Reporting

**Show concise summary:**
- ✅ X/Y tests passing (Z%)
- ⏱️  Runtime: X seconds
- 🎯 Focus on failures only (don't list all passing tests)

**For failures, provide:**
1. **Failed test name + error message**
2. **Pattern detection** (recall from purmemo):
   - "This looks like a FK constraint issue..."
   - "Similar to past boto3 mocking error..."
   - "Performance threshold may need adjustment..."
3. **Suggested fix** (based on past patterns):
   - Code example if applicable
   - Reference to file/line where fix needed
   - Link to documentation in purmemo

**Example good output:**

```
✅ Phase 2 Integration Tests Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Results: 46/47 passing (98%) ⏱️  18.3s

❌ FAILING TEST (1):
test_memory_cleanup_performance
  Error: FK violation - Key (user_id) not present in table "users"
  File: tests/test_performance_benchmarks.py:485

🧠 Pattern Detected:
This is a known FK constraint issue. Tests creating memories must
ensure parent user exists first.

💡 Suggested Fix:
Add user creation before memory creation in test_memory_cleanup_performance:

```python
# Add at line 461 (before creating memories)
await db.execute("""
    INSERT INTO v1_mvp.users (id, email, full_name, password_hash)
    VALUES (%(user_id)s::uuid, %(email)s, 'Test User', 'hash')
    ON CONFLICT (id) DO NOTHING
""", {
    'user_id': test_user.user_id,
    'email': test_user.email
})
```

📚 Reference: Similar fix in test_performance_benchmarks.py:461
```

### 5. Update TodoWrite

Mark todos as completed and add new ones if fixes needed:
- [completed] Run phase-2 tests
- [completed] Analyze test results
- [completed] Report findings
- [in_progress] Fix FK constraint in test_memory_cleanup_performance (if user wants to fix)

## Common Test Patterns (From Past Work)

### FK Constraint Violations
**Symptom:** `Key (user_id) not present in table "users"`
**Fix:** Create parent record first with `ON CONFLICT DO NOTHING`

### boto3 Mocking Errors
**Symptom:** `AttributeError: boto3 not found in event_publisher`
**Fix:** Patch `_get_sqs_client()` not boto3 module (lazy loading)

### Performance Threshold Failures
**Symptom:** `Memory retrieval 93ms exceeds 50ms target`
**Fix:** Adjust threshold for remote database latency (~40-50ms overhead)

### Connection Pool Issues
**Symptom:** `connection pool exhausted`
**Fix:** Check pool size in config, ensure connections are closed

### Class-Based Test Discovery
**Symptom:** Tests not found by pytest
**Note:** Many tests use class structure (`class TestXxx:` with `def test_xxx(self):`). Pytest discovers these correctly.

## File Locations

**Test files:**

**Phase 1 - Infrastructure (65 tests):**
- API Contracts: `tests/test_api_contracts.py` (35 tests)
- Auth Flows: `tests/test_auth_flows.py` (18 tests)
- Embeddings Service: `tests/test_embeddings_service.py` (12 tests)

**Phase 2 - Integration (73 tests):**
- Redis Integration: `tests/test_redis_integration.py` (14 tests)
- SQS Publishing: `tests/test_sqs_publishing.py` (11 tests)
- Database Constraints: `tests/test_database_constraints_v2.py` (22 tests)
- Error Tracking & Resolution: `tests/test_error_alerting.py` (26 tests)

**Phase 3 - Performance (12 tests):**
- Performance Benchmarks: `tests/test_performance_benchmarks.py` (12 tests)

**Phase 4 - Intelligence Layer (94 tests):**
- Semantic Clustering: `tests/test_clustering.py` (28 tests)
- Intelligence Extraction: `tests/test_intelligence_extraction.py` (33 tests)
- Knowledge Graph: `tests/test_knowledge_graph.py` (33 tests)

**Phase 5 - RAG Quality (156 tests):**
- Enhanced Recall Scoring: `tests/test_enhanced_recall_scoring.py` (51 tests)
- RAG Recall Quality: `tests/test_rag_recall_quality.py` (39 tests)
- Query Intelligence Matcher: `tests/test_query_intelligence_matcher.py` (41 tests)
- Multi-Word Query Routing: `tests/test_multiword_query_routing.py` (25 tests)

**Phase 6 - Misc (48 tests):**
- Living Document Upsert: `tests/test_living_document_upsert.py` (13 tests)
- Semantic Quality: `tests/test_semantic_quality.py` (4 tests)
- Unicode Sanitization: `tests/test_unicode_sanitization.py` (31 tests)

**Total Backend: 448 tests protecting complete Purmemo system**

---

### Frontend E2E Tests (Playwright) - NEW

**Location:** `/Users/wivak/puo-jects/____active/purmemo/v1-mvp/frontend/e2e/`

**Auth Tests (~27 tests):**
- Token Refresh: `e2e/auth/token-refresh.spec.ts` (11 tests)
  - Proactive refresh when JWT expired
  - Refresh within 60s buffer window
  - Multiple user types (regular, superadmin)
  - Failure handling and redirects
  - Concurrent request handling
- Auth Flow: `e2e/auth/auth-flow.spec.ts` (16 tests)
  - Login/logout flows
  - Protected route access
  - Session persistence
  - Error handling

**Dashboard Tests (~14 tests):**
- Dashboard: `e2e/dashboard/dashboard.spec.ts` (14 tests)
  - Dashboard loading
  - Navigation
  - Responsive design
  - Superadmin access

**Test Fixtures:**
- Auth Helpers: `e2e/fixtures/auth.ts`
  - `loginUser()`, `loginAndGetTokens()`
  - `createExpiredJWT()`, `createExpiringSoonJWT()`
  - `setAuthTokens()`, `clearAuth()`

**Total Frontend: ~41 tests protecting user-facing flows**

---

**GRAND TOTAL: ~489 tests (448 backend + 41 frontend)**

**Documentation:**
- Integration Strategy: `/Users/wivak/puo-jects/____active/purmemo/v1-mvp/backend/AUTONOMOUS_SAFETY_SYSTEM_INTEGRATION.md`
- Phase 3 Report: `/Users/wivak/puo-jects/____active/purmemo/v1-mvp/backend/PHASE_3_PERFORMANCE_BENCHMARKS_COMPLETE.md`
- Coverage Roadmap: `/Users/wivak/puo-jects/____active/purmemo/v1-mvp/backend/TEST_COVERAGE_ROADMAP.md`

## Quick Reference

| Command | Tests | Time | Use Case |
|---------|-------|------|----------|
| `/test quick` | 138 | ~40s | Fast feedback during dev |
| `/test core` | 150 | ~87s | Original Phase 1-3 tests |
| `/test intel` | 250 | ~80s | Intelligence/RAG tests only |
| `/test all` | 448 | ~3.5m | Full validation before deploy |
| `/test phase-2` | 73 | ~25s | After integration/error tracking changes |
| `/test phase-4` | 94 | ~30s | After clustering changes |
| `/test phase-5` | 156 | ~50s | After recall/RAG changes |
| `/test frontend` | ~41 | ~2m | Frontend E2E validation |
| `/test frontend:token` | 11 | ~30s | Token refresh flow tests |
| `/test frontend:auth` | 16 | ~45s | Auth flow tests |
| `/test frontend:dashboard` | 14 | ~45s | Dashboard tests |
| `/test fullstack` | ~489 | ~5.5m | Complete backend + frontend |

## Notes

### Backend Tests
- **Prefer `/test quick`** for fast feedback during development
- **Use `/test intel`** after changes to intelligence/RAG/clustering
- **Use `/test all`** before major commits or deploys
- **Use `/test phase-3`** after performance-sensitive changes

### Frontend Tests
- **Use `/test frontend:token`** after auth/token changes (critical for token refresh fix)
- **Use `/test frontend:auth`** after login/logout/session changes
- **Use `/test frontend:dashboard`** after dashboard UI changes
- **Use `/test frontend`** before any frontend deploy
- **Use `/test fullstack`** before major releases

### General
- All patterns are saved to purmemo for intelligent recall
- Tests protect: API contracts, Redis, SQS, PostgreSQL, performance baselines, clustering, knowledge graph, RAG quality, token refresh flow, auth flows, dashboard functionality
