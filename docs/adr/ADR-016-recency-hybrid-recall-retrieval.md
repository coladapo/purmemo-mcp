# ADR-016: Recency-Hybrid Recall Retrieval — Temporal Query Awareness

**Date:** 2026-03-12
**Status:** Accepted
**Deciders:** Chris Oladapo

---

## Context and Problem Statement

The MCP recall system fetches the top-50 candidate memories using **pure vector cosine similarity** (`ORDER BY embedding <=> query_embedding`), then applies a multi-layer scoring pipeline. This architecture has a critical flaw: memories that are semantically dominant (large bodies of content from months ago) permanently occupy the top-50 pool, crowding out recent memories that are semantically weaker but temporally correct.

**Observed failure mode (confirmed 2026-03-12):**
- Query: `"Use purmemo to recall my recent conversations"`
- Result: Top 5 results all dated **2025-11-01** (4+ months old)
- Expected: Results from **Feb–Mar 2026** (last 2–4 weeks of active work)
- Root cause: "Intelligent Scoring for MCP Recall Tool" sessions from Nov 2025 have the strongest embeddings for any purmemo-related query and dominate the candidate pool before recency scoring even runs

Additionally, temporal language in queries ("recent", "latest", "this week") is treated as semantic content rather than as a hard time constraint.

---

## Decision Drivers

1. Recall must reflect current reality — users expect current state, not historically dominant memories
2. Temporal intent must be respected — "recent" should mean recent, not "most semantically similar"
3. Cannot break semantic accuracy — pure recency ranking would be equally wrong
4. Low regression risk — changes must not degrade non-temporal queries
5. No schema migrations required — fix works with existing DB structure

---

## Options Considered

### Option A: Increase recency weights only
Raise `RECENCY_90_DAYS_PENALTY` from 0.95 → 0.70, boost recent memories harder.

- **Pros:** Smallest change, zero SQL risk
- **Cons:** Doesn't fix root cause. If old memories never leave the top-50 pool, boosting recent ones that aren't in the pool does nothing.
- **Verdict:** Insufficient alone.

### Option B: Hybrid candidate pool (semantic + recency UNION)
Fetch blended pool: top-35 by vector similarity UNION top-15 by `created_at DESC`. Guarantees recent memories always enter scoring.

- **Pros:** Fixes root cause directly. Recent memories always get a chance. No scoring logic change.
- **Cons:** Slightly more complex SQL. May surface a recent but low-relevance memory.
- **Verdict:** Correct architectural fix for the candidate pool problem.

### Option C: Temporal query parsing → hard date filter
Parse temporal keywords before embedding ("recent", "latest", "last week", "today") → map to `created_at >=` WHERE clause applied before vector search.

- **Pros:** Respects user intent explicitly. Deterministic. Clean.
- **Cons:** Needs fallback if no memories exist in window. Requires keyword detection before embedding.
- **Verdict:** Essential for temporal query correctness. Complements Option B.

### Option D: Time-decay scoring in SQL (cosine × decay formula)
Replace `ORDER BY embedding <=> vector` with a weighted formula incorporating days_old.

- **Pros:** Elegant unified scoring
- **Cons:** **Rejected** — pgvector HNSW index requires `<=>` operator standalone. Computing a formula causes full table scans. Unacceptable performance regression.
- **Verdict:** Rejected — pgvector index incompatible.

---

## Decision Outcome

**Chosen: Option B + C (hybrid pool + temporal parsing) + Option A (weight tuning)**

Neither B nor C alone is sufficient:
- B without C: Recent memories enter pool, but "recent purmemo conversations" still searches all time
- C without B: Time filter applied, but semantically dominant old memories still crowd within that window

Together:
1. **C** detects temporal intent → `created_at` pre-filter
2. **B** guarantees recent memories always have pool representation (even for non-temporal queries)
3. **A** tunes weights so 90-day-old memories take a meaningful penalty
4. **Existing 10-layer scoring** pipeline sorts the blended pool

---

## Implementation Plan

### Change 1 — Temporal query parser (`recall.py`, before embedding)

```python
TEMPORAL_PATTERNS = {
    r'\b(today)\b': 1,
    r'\b(yesterday)\b': 2,
    r'\b(this week|recent|recently|latest)\b': 14,
    r'\b(last week)\b': 14,
    r'\b(this month|last month)\b': 30,
    r'\b(last (\d+) days?)\b': 'dynamic',
}
# Returns Optional[int] days → applied as: created_at >= NOW() - INTERVAL '%(days)s days'
# Fallback: if temporal filter returns < 10 candidates, retry without date constraint
```

### Change 2 — Hybrid candidate pool SQL (`recall.py`)

```sql
-- Replace single ORDER BY with UNION of semantic + recency pools
(
  SELECT ... FROM v1_mvp.memories m
  WHERE m.user_id = %(user_id)s AND m.embedding IS NOT NULL ...
    [AND m.created_at >= %(temporal_cutoff)s]  -- only if temporal detected
  ORDER BY m.embedding <=> %(query_embedding)s::vector
  LIMIT 35
)
UNION
(
  SELECT ... FROM v1_mvp.memories m
  WHERE m.user_id = %(user_id)s AND m.embedding IS NOT NULL ...
  ORDER BY m.created_at DESC
  LIMIT 15
)
-- Deduplicate by id, then score merged pool with existing pipeline
```

### Change 3 — Weight tuning (`enhanced_recall_scoring.py`)

```python
RECENCY_3_DAYS_BOOST = 1.8    # was 1.5
RECENCY_7_DAYS_BOOST = 1.5    # was 1.3
RECENCY_30_DAYS_BOOST = 1.2   # was 1.1
RECENCY_90_DAYS_PENALTY = 0.75  # was 0.95  ← most impactful change
```

### Change 4 — Cache invalidation on save (`mcp_v10.py`)

After successful `save_conversation`, delete `recall:{user_id}:*` keys from Redis so next recall reflects the new save immediately.

---

## Consequences

**Positive:**
- "Recall my recent conversations" returns work from last 7–14 days
- Temporally dominant old memories cannot crowd out recent work
- No schema changes required
- Backward compatible — non-temporal queries unaffected

**Negative / Accepted trade-offs:**
- Bottom ~15 candidate slots are recency-reserved — slightly reduces pure semantic depth for non-temporal queries (acceptable)
- Temporal parsing adds ~1ms latency before embedding call (negligible)
- "Recent" defaults to 14 days (tunable via `TEMPORAL_DEFAULT_DAYS` constant)

**Risks:**
- **Risk:** Temporal filter + sparse recent memories → empty results
  **Mitigation:** If filter returns < 10 candidates, fall back to full search with recency boost
- **Risk:** False positive temporal detection ("I recently read about X")
  **Mitigation:** Only trigger on standalone temporal terms, not mid-phrase uses

---

## Validation Queries

After deploy, verify:
1. `"recent purmemo conversations"` → returns Mar 2026 memories ✓
2. `"intelligent scoring mcp recall"` → still returns Nov 2025 (semantic correctness preserved) ✓
3. `"desktop app setup"` → returns most recent desktop session ✓
4. Save new memory → recall immediately returns it (cache invalidation working) ✓

---

## Review Date

2026-04-12 (30 days post-deploy)

---

## References

- `v1-mvp/backend/app/routers/recall.py` — candidate fetch SQL
- `v1-mvp/backend/app/services/enhanced_recall_scoring.py` — scoring weights
- `v1-mvp/backend/app/routers/mcp_v10.py` — save/cache logic
- ADR-015 — Long Memory Embedding Strategy (chunking, related)
- Phase 17.9.30 — RAG Optimization Research (hybrid search explored previously)
