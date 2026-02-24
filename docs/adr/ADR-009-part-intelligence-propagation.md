# ADR-009: Part Intelligence Propagation — Index → Parts Taxonomy Sync

**Status**: Accepted
**Date**: 2026-02-24
**Deciders**: Purmemo core team
**Technical area**: Backend Worker / Recall Quality

---

## Context and Problem Statement

The Chrome extension captures large conversations by chunking them into N Part records plus one Index record (ADR-007). The Index is a non-chunked summary record (`is_part=false`); Parts are individual content chunks (`is_part=true`).

ADR-008 made intelligence extraction fully async: after the Index record is saved, an arq job (`extract_full_intelligence_async`) runs Gemini once and writes all 23 intelligence fields to the Index. Parts intentionally skip this job (`if not memory.is_part`) to avoid N×Gemini calls and N×Render timeouts.

This creates a permanent recall gap:

| Memory type | tags | category | intent | observations | Recall score |
|---|---|---|---|---|---|
| Index | ✅ 6–25 tags | ✅ "Projects" | ✅ "learning" | ✅ 18–25 | High |
| Part N/M | ❌ `[]` | ❌ "Other" | ❌ "decision" | ❌ 0 | 3–5× lower |

The recall scoring system (`enhanced_recall_scoring.py`) applies multiplier boosts for tags (1.3×), priority tags (up to 1.5×), intent alignment (1.25×), and observation quality (+30%). Parts receive none of these — they score on embedding similarity alone, which is insufficient for cross-platform recall.

**This breaks the core product loop**: user captures a ChatGPT conversation → saves in record time → tries to recall from Claude or Cursor → can't find it. The content exists in the DB but is effectively invisible to the recall system.

### Evidence

- 21 Part records saved 2026-02-24 had `tags=[], category="Other", intent="decision"` post-save
- Recall test with topic-specific query returned Parts at 35–65% relevance vs Index at 99%+
- Manual backfill raised Part relevance to match Index — confirming taxonomy is the signal gap, not content

---

## Decision Drivers

1. **No extra Gemini calls** — Parts contain raw chunks, not summaries. Running Gemini on each part would cost N× more and produce lower-quality results (no full conversation context).
2. **Index already has correct intelligence** — after `extract_full_intelligence_async` completes, the Index has the correct `tags`, `category`, `intent`, `project_name`, and `technologies` for the entire conversation. These are conversation-level signals that apply equally to all parts.
3. **Observation/entity fields must NOT propagate** — `observations` and `entities` are content-derived (Gemini extracted them from Index content). They would be factually wrong if applied to Part content.
4. **Must be automatic** — manual backfills are not sustainable at scale.

---

## Options Considered

### Option A: Run intelligence extraction on each part separately
- ❌ N×Gemini calls (ADR-007 explicitly prevented this)
- ❌ Each part lacks full conversation context — poor extraction quality
- ❌ N×arq jobs per capture — queue congestion

### Option B: Send taxonomy fields from extension with each part save
- ❌ Extension doesn't know the final Gemini-extracted taxonomy at save time (extraction is async)
- ❌ Would require a second round-trip from extension after Index extraction completes
- ❌ Extension complexity increases significantly

### Option C: Propagate taxonomy from Index → Parts inside the arq worker (CHOSEN)
After `extract_full_intelligence_async` writes to the Index, append a single SQL UPDATE that copies taxonomy-safe fields to all sibling Part records.

- ✅ Zero extra Gemini calls
- ✅ Correct taxonomy (extracted from full conversation in Index)
- ✅ No extension changes
- ✅ Automatic on every capture going forward
- ✅ Idempotent (safe to run multiple times)
- ✅ Single SQL UPDATE covering all parts

**Taxonomy-safe fields to propagate** (conversation-level, not content-derived):

| Field | Propagate | Reason |
|---|---|---|
| `tags` | ✅ | Primary recall signal — conversation-level |
| `category` | ✅ | Recall filter — same for all parts |
| `intent` | ✅ | 1.25× scoring boost — same for conversation |
| `project_name` | ✅ | Cluster grouping signal |
| `technologies` | ✅ | Accurate across all parts |
| `technologies_validated` | ✅ | Accurate across all parts |
| `observations` | ❌ | Content-derived — wrong for part content |
| `entities` | ❌ | Content-derived — wrong for part content |
| `relations` | ❌ | Content-derived — wrong for part content |
| `impact` | ❌ | Synthesized from full content |
| `task_type` | ❌ | Index-specific |

---

## Implementation

**Single change**: append propagation block to `extract_full_intelligence_async` in `app/workers/arq_worker.py`, after the Index UPDATE and before `db.close()`.

The Index `conversation_id` follows the pattern `{base_uuid}:index`. Parts follow `{base_uuid}:part:N`. The base UUID is the shared link — extract it with `SPLIT_PART` and match all siblings in one UPDATE.

```python
# ADR-009: Propagate taxonomy fields from Index → sibling Parts
# Parts share the same base UUID in conversation_id: "{uuid}:part:N" vs "{uuid}:index"
# Only propagates conversation-level signals — NOT content-derived fields (observations, entities)
base_conv_id = memory_id  # used as fallback; real key is conversation_id pattern in DB

propagate_query = """
UPDATE v1_mvp.memories AS parts
SET
    tags                  = idx.tags,
    category              = idx.category,
    intent                = idx.intent,
    project_name          = idx.project_name,
    technologies          = idx.technologies,
    technologies_validated = idx.technologies_validated,
    updated_at            = NOW()
FROM v1_mvp.memories AS idx
WHERE idx.id = %s
  AND idx.conversation_id LIKE '%%:index'
  AND parts.conversation_id LIKE REPLACE(SPLIT_PART(idx.conversation_id, ':index', 1), '%', '\\%') || ':part:%%'
  AND parts.user_id = idx.user_id
  AND parts.id != idx.id
"""
```

---

## Consequences

### Positive
- Part recall quality matches Index quality immediately after first save
- No code changes to extension, frontend, or DB schema
- Idempotent — safe to re-run on existing data
- Automatic for all future chunked captures (ChatGPT, Gemini, any platform)

### Negative / Trade-offs
- Slight increase in arq job duration (~50–100ms for the extra UPDATE)
- Parts' `tags` will include `"capture-index"` tag inherited from Index — minor noise, can be filtered in future

### Non-goals
- Does not enrich Part `observations`/`entities` — intentional (content-derived fields must match actual content)
- Does not backfill historical parts — separate one-time migration if needed

---

## Links

- ADR-007: Large Conversation Capture — `docs/adr/ADR-007-large-conversation-capture.md`
- ADR-008: Fully Async Intelligence Extraction — referenced in `app/workers/arq_worker.py`
- Implementation: `app/workers/arq_worker.py` — `extract_full_intelligence_async()`
- Scoring: `app/services/enhanced_recall_scoring.py`
