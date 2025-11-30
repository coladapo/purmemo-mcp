# Test Command

Run Autonomous Safety System tests for production-ready validation.

## Usage

```
/test phase-1    → API + Auth + Embeddings tests (65 tests, ~15 sec)
/test phase-2    → Redis + SQS + Database tests (47 tests, ~20 sec)
/test phase-3    → Performance benchmarks (12 tests, ~47 sec)
/test phase-4    → Intelligence Layer tests (94 tests, ~30 sec)
/test phase-5    → RAG Quality tests (131 tests, ~45 sec)
/test phase-6    → Misc tests (48 tests, ~15 sec)
/test all        → Full Autonomous Safety System (397 tests, ~3 min)
/test quick      → Phase 1 + Phase 2 only (112 tests, ~35 sec)
/test core       → Phase 1-3 original tests (124 tests, ~82 sec)
/test intel      → Phase 4 + Phase 5 intelligence tests (225 tests, ~75 sec)
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

# Phase 2: Redis + SQS + Database (47 tests)
pytest tests/test_redis_integration.py tests/test_sqs_publishing.py tests/test_database_constraints_v2.py -v

# Phase 3: Performance Benchmarks (12 tests)
pytest tests/test_performance_benchmarks.py -v

# Phase 4: Intelligence Layer (94 tests)
pytest tests/test_clustering.py tests/test_intelligence_extraction.py tests/test_knowledge_graph.py -v

# Phase 5: RAG Quality (131 tests)
pytest tests/test_enhanced_recall_scoring.py tests/test_rag_recall_quality.py tests/test_query_intelligence_matcher.py -v

# Phase 6: Misc (48 tests)
pytest tests/test_living_document_upsert.py tests/test_semantic_quality.py tests/test_unicode_sanitization.py -v

# Quick (Phase 1 + 2 - RECOMMENDED for fast feedback) (112 tests)
pytest tests/test_api_contracts.py tests/test_auth_flows.py tests/test_embeddings_service.py tests/test_redis_integration.py tests/test_sqs_publishing.py tests/test_database_constraints_v2.py -v

# Core (Phase 1-3 original tests) (124 tests)
pytest tests/test_api_contracts.py tests/test_auth_flows.py tests/test_embeddings_service.py tests/test_redis_integration.py tests/test_sqs_publishing.py tests/test_database_constraints_v2.py tests/test_performance_benchmarks.py -v

# Intel (Phase 4 + 5 intelligence tests) (225 tests)
pytest tests/test_clustering.py tests/test_intelligence_extraction.py tests/test_knowledge_graph.py tests/test_enhanced_recall_scoring.py tests/test_rag_recall_quality.py tests/test_query_intelligence_matcher.py -v

# Full Autonomous Safety System (397 tests)
pytest tests/test_api_contracts.py tests/test_auth_flows.py tests/test_embeddings_service.py tests/test_redis_integration.py tests/test_sqs_publishing.py tests/test_database_constraints_v2.py tests/test_performance_benchmarks.py tests/test_clustering.py tests/test_intelligence_extraction.py tests/test_knowledge_graph.py tests/test_enhanced_recall_scoring.py tests/test_rag_recall_quality.py tests/test_query_intelligence_matcher.py tests/test_living_document_upsert.py tests/test_semantic_quality.py tests/test_unicode_sanitization.py -v
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

**Phase 2 - Integration (47 tests):**
- Redis Integration: `tests/test_redis_integration.py` (14 tests)
- SQS Publishing: `tests/test_sqs_publishing.py` (11 tests)
- Database Constraints: `tests/test_database_constraints_v2.py` (22 tests)

**Phase 3 - Performance (12 tests):**
- Performance Benchmarks: `tests/test_performance_benchmarks.py` (12 tests)

**Phase 4 - Intelligence Layer (94 tests):**
- Semantic Clustering: `tests/test_clustering.py` (28 tests)
- Intelligence Extraction: `tests/test_intelligence_extraction.py` (33 tests)
- Knowledge Graph: `tests/test_knowledge_graph.py` (33 tests)

**Phase 5 - RAG Quality (131 tests):**
- Enhanced Recall Scoring: `tests/test_enhanced_recall_scoring.py` (51 tests)
- RAG Recall Quality: `tests/test_rag_recall_quality.py` (39 tests)
- Query Intelligence Matcher: `tests/test_query_intelligence_matcher.py` (41 tests)

**Phase 6 - Misc (48 tests):**
- Living Document Upsert: `tests/test_living_document_upsert.py` (13 tests)
- Semantic Quality: `tests/test_semantic_quality.py` (4 tests)
- Unicode Sanitization: `tests/test_unicode_sanitization.py` (31 tests)

**Total: 397 tests protecting complete Purmemo system**

**Documentation:**
- Integration Strategy: `/Users/wivak/puo-jects/____active/purmemo/v1-mvp/backend/AUTONOMOUS_SAFETY_SYSTEM_INTEGRATION.md`
- Phase 3 Report: `/Users/wivak/puo-jects/____active/purmemo/v1-mvp/backend/PHASE_3_PERFORMANCE_BENCHMARKS_COMPLETE.md`
- Coverage Roadmap: `/Users/wivak/puo-jects/____active/purmemo/v1-mvp/backend/TEST_COVERAGE_ROADMAP.md`

## Quick Reference

| Command | Tests | Time | Use Case |
|---------|-------|------|----------|
| `/test quick` | 112 | ~35s | Fast feedback during dev |
| `/test core` | 124 | ~82s | Original Phase 1-3 tests |
| `/test intel` | 225 | ~75s | Intelligence/RAG tests only |
| `/test all` | 397 | ~3m | Full validation before deploy |
| `/test phase-4` | 94 | ~30s | After clustering changes |
| `/test phase-5` | 131 | ~45s | After recall/RAG changes |

## Notes

- **Prefer `/test quick`** for fast feedback during development
- **Use `/test intel`** after changes to intelligence/RAG/clustering
- **Use `/test all`** before major commits or deploys
- **Use `/test phase-3`** after performance-sensitive changes
- All patterns are saved to purmemo for intelligent recall
- Tests protect: API contracts, Redis, SQS, PostgreSQL, performance baselines, clustering, knowledge graph, RAG quality
