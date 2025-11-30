# Testing Skill

**Description:** Proactively run Autonomous Safety System tests when code changes are detected, with contextual intelligence and pattern-based suggestions.

**Total Coverage:** 124 tests protecting critical infrastructure
- Phase 1: API + Auth + Embeddings (65 tests)
- Phase 2: Redis + SQS + Database (47 tests)
- Phase 3: Performance Benchmarks (12 tests)

---

## When to Invoke This Skill

### 1. After Code Changes (File → Test Mapping)

**Backend Service Changes:**
- `app/services/event_publisher.py` → Run Phase 2 (Redis + SQS integration tests)
- `app/services/embeddings.py` → Run Phase 1 (API contracts using embeddings) + Phase 3 (performance)
- `app/services/redis_client.py` → Run Phase 2 (Redis integration tests)
- `app/services/*` → Suggest Phase 2 (integration tests)

**API Router Changes:**
- `app/routers/memories.py` → Run Phase 1 (API contracts) + database constraints
- `app/routers/auth.py` → Run Phase 1 (auth flows - security critical)
- `app/routers/conversations.py` → Run Phase 1 (API contracts)
- `app/routers/*` → Suggest Phase 1 (API contract tests)

**Middleware Changes:**
- `app/middleware/*` → Run Phase 2 (integration layer)

**Schema Changes:**
- `app/schemas/*` → Run Phase 1 (API contracts)

**Test File Changes:**
- `tests/test_*.py` → Run the modified test file directly

**Multiple Areas Changed:**
- Suggest `/test quick` (Phase 1 + Phase 2, 112 tests, ~35 sec)

**Performance-Sensitive Changes:**
- Changes affecting database queries, Redis, or SQS → Include Phase 3 (performance benchmarks)

### 2. Natural Language Triggers

**Direct test requests:**
- "test this" → Analyze recent changes, suggest relevant tests
- "run tests" → Ask which phase or suggest based on context
- "check if this works" → Run tests for files recently modified
- "make sure it works" → Run relevant test subset

**After significant changes:**
- "done with refactoring" → Suggest `/test quick`
- "finished the feature" → Suggest relevant phase based on files changed
- "fixed the bug" → Run tests affected by the fix

### 3. After Significant Milestones

**Refactoring Complete:**
- Suggest `/test quick` (Phase 1 + 2, comprehensive but fast)

**New Feature Added:**
- Analyze files modified, suggest relevant phase(s)

**Bug Fix Applied:**
- Run tests for the area where bug was fixed

---

## Intelligence Layer

### 1. Recall Past Failures from Purmemo

Before running tests, use `recall_memories` to search for:
- Past test failures in this codebase
- Common fix patterns (FK constraints, mocking issues, performance thresholds)
- Known issues to watch for

**Example queries:**
- `recall_memories(query="test failures pytest", entity="purmemo")`
- `recall_memories(query="FK constraint violations tests")`
- `recall_memories(query="boto3 mocking SQS tests")`

### 2. File → Test Phase Mapping

Use this reference to determine which tests to run:

| Changed File(s) | Run Tests | Rationale |
|----------------|-----------|-----------|
| `app/services/event_publisher.py` | Phase 2 (Redis + SQS) | Event publishing integration |
| `app/services/embeddings.py` | Phase 1 + Phase 3 | API contracts + performance |
| `app/routers/memories.py` | Phase 1 + DB constraints | API + data integrity |
| `app/routers/auth.py` | Phase 1 (auth tests) | Security critical |
| `app/middleware/*` | Phase 2 | Integration layer |
| `app/schemas/*` | Phase 1 | API contracts |
| `tests/*` | Modified test file | Self-test |
| Multiple areas | `/test quick` | Broad impact |
| Performance sensitive | Phase 3 | Regression detection |

### 3. Smart Filtering and Reporting

**Show only what matters:**
- ✅ Display test summary: "X/Y tests passing (Z%)"
- ⏱️ Show runtime
- ❌ Focus on failures only (don't list all 124 passing tests)
- 🆕 Highlight new failures (not existing known issues)
- 📦 Group related failures (e.g., all FK violations together)

**For failures, provide:**
1. **Failed test name + error message**
2. **Pattern detection** (based on purmemo recall):
   - "This looks like a FK constraint issue..."
   - "Similar to past boto3 mocking error..."
   - "Performance threshold may need adjustment..."
3. **Suggested fix** (based on discovered patterns):
   - Code example if applicable
   - Reference to file/line where fix is needed
   - Link to similar fixes from purmemo

### 4. Fix Suggestion Patterns

Common patterns learned from Phase 3 implementation:

**FK Constraint Violations:**
```
Symptom: Key (user_id) not present in table "users"
Fix: Ensure parent record exists first with ON CONFLICT DO NOTHING

Suggested code:
await db.execute("""
    INSERT INTO v1_mvp.users (id, email, full_name, password_hash)
    VALUES (%(user_id)s::uuid, %(email)s, 'Test User', 'hash')
    ON CONFLICT (id) DO NOTHING
""", {'user_id': test_user.user_id, 'email': test_user.email})
```

**boto3 Mocking Errors:**
```
Symptom: AttributeError: boto3 not found in event_publisher
Fix: Patch _get_sqs_client() not boto3 module (lazy loading pattern)

Suggested code:
with patch('app.services.event_publisher._get_sqs_client', return_value=mock_sqs):
```

**Performance Threshold Failures:**
```
Symptom: Memory retrieval 93ms exceeds 50ms target
Fix: Adjust threshold for remote database latency (~40-50ms overhead)

Note: Original threshold may be for local testing. Remote Supabase adds network latency.
```

**Connection Pool Issues:**
```
Symptom: connection pool exhausted
Fix: Check pool size in config, ensure connections are closed properly
```

---

## Example Invocations

### Example 1: User Refactors event_publisher.py

**User:** "I just refactored event_publisher.py"

**Skill Response:**
```
🤖 Testing Skill Activated

Detected changes in: app/services/event_publisher.py
Relevant tests: Phase 2 (Redis + SQS integration)

Recalling past issues with event_publisher...
✓ Found pattern: boto3 lazy loading requires special mocking

Running targeted tests:
pytest tests/test_redis_integration.py tests/test_sqs_publishing.py -v

Results: ✅ All 25 integration tests passing
✓ No regressions detected
⏱️  Runtime: 18.4 seconds
```

### Example 2: User Says "test this"

**User:** "test this"

**Skill Response:**
```
🤖 Analyzing context...

Recent changes detected:
- app/routers/memories.py (memory deletion endpoint modified)

Recommended tests:
- Phase 1 (API contracts)
- Database constraints (data integrity)

Recalling past deletion-related issues...
✓ Found pattern: Soft delete requires deleted_at column

Running: pytest tests/test_api_contracts.py tests/test_database_constraints_v2.py -v

Results: ❌ 55/57 passing (96%)

FAILURES (2):
1. test_memories_delete_cascade
   Error: FK constraint not cascading on delete

2. test_soft_delete_preserves_data
   Error: deleted_at column is NULL after deletion

🧠 Pattern Detected:
These failures are related to soft delete implementation.
Similar issue resolved in past: test_database_constraints_v2.py:142

💡 Suggested Fix:
1. Verify memories table has deleted_at column (TIMESTAMP)
2. Check FK has ON DELETE CASCADE in migration
3. Update delete endpoint to SET deleted_at = NOW() instead of DELETE

Reference: tests/test_database_constraints_v2.py:142-156
```

### Example 3: Multiple Areas Changed

**User:** "finished implementing the new feature"

**Skill Response:**
```
🤖 Analyzing changes...

Files modified (last 30 minutes):
- app/services/embeddings.py
- app/routers/memories.py
- app/schemas/memories.py

Impact: Multiple areas (services + routers + schemas)

Recommended: /test quick
Rationale: Comprehensive coverage without full benchmark suite

Running Phase 1 + Phase 2 (112 tests):
pytest tests/test_api_contracts.py tests/test_auth_flows.py tests/test_embeddings_service.py tests/test_redis_integration.py tests/test_sqs_publishing.py tests/test_database_constraints_v2.py -v

Results: ✅ All 112 tests passing
⏱️  Runtime: 33.7 seconds

✓ Feature is safe to commit
```

---

## Test Execution Commands

When running tests, use these exact commands from backend directory:

```bash
cd /Users/wivak/puo-jects/____active/purmemo/v1-mvp/backend
source venv/bin/activate

# Phase 1: API + Auth + Embeddings (65 tests, ~15 sec)
pytest tests/test_api_contracts.py tests/test_auth_flows.py tests/test_embeddings_service.py -v

# Phase 2: Redis + SQS + Database (47 tests, ~20 sec)
pytest tests/test_redis_integration.py tests/test_sqs_publishing.py tests/test_database_constraints_v2.py -v

# Phase 3: Performance Benchmarks (12 tests, ~47 sec)
pytest tests/test_performance_benchmarks.py -v

# Quick (Phase 1 + 2 - RECOMMENDED) (112 tests, ~35 sec)
pytest tests/test_api_contracts.py tests/test_auth_flows.py tests/test_embeddings_service.py tests/test_redis_integration.py tests/test_sqs_publishing.py tests/test_database_constraints_v2.py -v

# Full Suite (124 tests, ~82 sec)
pytest tests/test_api_contracts.py tests/test_auth_flows.py tests/test_embeddings_service.py tests/test_redis_integration.py tests/test_sqs_publishing.py tests/test_database_constraints_v2.py tests/test_performance_benchmarks.py -v
```

---

## Guidelines for Using This Skill

### When to Be Proactive (AUTO-TRIGGER)
- User modifies backend service files → Automatically suggest relevant tests
- User says "done" or "finished" → Suggest `/test quick`
- User asks "does it work?" → Run relevant tests automatically

### When to Be Conservative (ASK FIRST)
- Full test suite (124 tests, ~82 sec) → Ask if user wants to run it
- Tests not directly related to changes → Explain reasoning before running
- User is in middle of coding → Wait for natural breakpoint

### Noise Level Tuning
- Start conservative, increase proactivity based on user feedback
- If user says "stop suggesting tests" → Reduce auto-triggers
- If user says "this is helpful" → Maintain current level
- Monitor: Should feel helpful > 80% of the time, not annoying

---

## Success Metrics

**This skill is successful if:**
- ✅ Tests run 10x more frequently (1/day → 10/day)
- ✅ 80%+ of suggested tests are relevant to changes made
- ✅ Users say "this is helpful" more than "this is noisy"
- ✅ Bugs caught before commit increase
- ✅ Time from code change to test feedback decreases

---

## Integration with Other Tools

**Works with:**
- `/test` command (user can manually trigger anytime)
- `/review` command (will be enhanced in Phase 3 to auto-run tests)
- Purmemo recall (learns from past failures)
- TodoWrite (tracks test execution progress)

---

## Documentation References

- Integration Strategy: `/Users/wivak/puo-jects/____active/purmemo/v1-mvp/backend/AUTONOMOUS_SAFETY_SYSTEM_INTEGRATION.md`
- Phase 3 Report: `/Users/wivak/puo-jects/____active/purmemo/v1-mvp/backend/PHASE_3_PERFORMANCE_BENCHMARKS_COMPLETE.md`
- Coverage Roadmap: `/Users/wivak/puo-jects/____active/purmemo/v1-mvp/backend/TEST_COVERAGE_ROADMAP.md`
- Test Command: `.claude/commands/test.md`
