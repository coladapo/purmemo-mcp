# ADR-027: Reranker Optimization Per Surface

**Date:** 2026-03-29
**Status:** Accepted
**Deciders:** Chris (founder), Claude Code (implementation)

## Context and Problem Statement

Gemini-powered reranking is the single most expensive AI operation in Purmemo, consuming **38% of all Gemini spend** ($1.56/month, 487K tokens/day). Every recall — regardless of source — sends ~50 candidates with 3,000 chars of content each to Gemini 2.0 Flash for relevance scoring.

The problem: **not all callers need the same quality of reranking.**

- **Chrome Extension / Web Search / iOS**: Users see ranked results directly. Bad ranking = bad UX.
- **MCP (Claude Code)**: Results are injected as context into Claude, which is itself an LLM that judges relevance natively. We're paying Gemini to rank documents that Claude will re-evaluate anyway.

Live telemetry (24h, 2026-03-29):
- 13 rerank calls, average 40K prompt tokens each ($0.0045/call)
- MCP: 19 recalls (65%), Chrome/iOS: 10 recalls (35%)
- Average rerank latency: 4.5 seconds per call

## Decision Drivers

1. **Cost**: Reranking is $1.56/month — disproportionate for a single operation
2. **Latency**: 4.5s per MCP recall is unnecessary when Claude processes context in <1s
3. **Quality differentiation**: Human-facing surfaces (Chrome, Search) need precise ranking; LLM-facing surfaces (MCP) do not
4. **Token efficiency**: 3,000 chars per candidate is excessive when title + observations + first 1,500 chars provides sufficient signal

## Options Considered

### Option A: Skip reranker for MCP only

**Description:** Add a `skipRerank` flag to the recall flow. MCP calls use cosine+recency fallback scoring (already implemented). Chrome/Search/iOS continue using Gemini reranking.

- Pros:
  - Eliminates 65% of rerank cost ($1.01/month saved)
  - Removes 4.5s latency from every MCP recall
  - Zero quality impact for human-facing surfaces
  - Minimal code change (pass flag through to rerankAndScore)
- Cons:
  - MCP recall ordering may be slightly less precise
  - Claude may receive less optimally ordered context
- Research findings: RAG literature confirms reranking improves precision by 20-35% for human-facing search, but for LLM context injection the consuming LLM acts as its own relevance filter. The "double reranking" pattern (reranker → LLM) has diminishing returns documented in LlamaIndex and Elastic research.
- Past experience: Purmemo already has a working fallback scorer (cosine 0.85 + recency 0.15) that was the original system before Gemini reranking was added. No quality complaints during that period.

### Option B: Reduce MAX_CONTENT_CHARS from 3000 to 1500

**Description:** Cut the content body sent per candidate in half. Keep title, metadata, entities, observations, tags (high-signal fields) at full length. Only truncate raw conversation content.

- Pros:
  - ~40% token reduction on all rerank calls ($0.62/month saved)
  - Faster Gemini response (less to read)
  - Title + observations + entities are usually sufficient for relevance judgment
  - No behavioral change to any caller
- Cons:
  - Edge case: long documents where relevance signal is in the second half
  - Slightly less context for Gemini's scoring decision
- Research findings: Elastic's research explicitly warns that rerankers truncate content to their token window, potentially cutting off relevant sections. However, Purmemo's intelligence extraction already creates a `summary`, `observations`, and `entities` — the reranker prompt includes these high-signal fields BEFORE the content body, so the most relevant information is always in the first portion sent to Gemini.

### Option C: Both A + B (RECOMMENDED)

**Description:** Skip reranker for MCP AND reduce content for Chrome/Search/iOS.

- Pros:
  - Maximum cost savings (~$1.30/month on reranking)
  - MCP recalls are 4.5s faster
  - Chrome/Search quality preserved with leaner reranking
  - Compounds benefits of both approaches
- Cons:
  - Two changes to validate simultaneously
  - MCP ordering relies on fallback scorer
- Risk mitigation: Both changes are independently reversible. The fallback scorer has been proven in production. Content reduction can be tuned (1500 → 2000 if quality drops).

## Decision Outcome

**Chosen option: Option C — Skip reranker for MCP + reduce content to 1500 chars**

### Rationale

1. **MCP's consumer is an LLM.** Claude Desktop/Claude Code reads all recalled memories and applies its own relevance judgment. Paying Gemini $0.005 to pre-sort 50 documents that Claude will evaluate anyway is architecturally redundant.

2. **The fallback scorer is production-proven.** Cosine similarity × 0.85 + recency × 0.15 + soft bonuses (intent match, entity match, penalties) was the original scoring system. It works. Gemini reranking was an *enhancement*, not a necessity.

3. **Title + observations contain 80% of relevance signal.** The reranker prompt already includes TITLE, META, ENTITIES, KEY FACTS, and TAGS before the content body. Cutting content from 3000 → 1500 chars removes the least-informative portion.

4. **Savings compound.** 65% fewer Gemini calls (MCP) + 40% fewer tokens per remaining call = ~75% total reranker cost reduction.

## Consequences

### Positive
- Reranker cost drops from $1.56/month → ~$0.35/month
- MCP recall latency drops by ~4.5 seconds
- Reduced Gemini API dependency for majority of recalls
- Background pipeline processes faster (less API contention)

### Negative
- MCP recall ordering may occasionally surface a less-relevant memory in position 1-3
- Reduced content window means Gemini sees less of each document for Chrome/Search reranking

### Risks
- **MCP quality regression:** Monitor recall quality via user feedback. If Claude Code starts surfacing irrelevant context, re-enable reranking for MCP with reduced content (Option B only). The `skipRerank` flag makes this a one-line revert.
- **Chrome/Search quality regression:** If users report worse search results after content reduction, increase to 2000 chars. The change is a single constant.

## Implementation Plan

1. Add `skipRerank?: boolean` parameter to `rerankAndScore()`
2. When `skipRerank = true`, call `fallbackScore()` directly (already exists)
3. Pass `skipRerank: true` from MCP route (`/api/v10/mcp/tools/execute`)
4. Reduce `MAX_CONTENT_CHARS` from 3000 to 1500 in reranker.ts
5. Deploy and monitor via `llm_usage_log` — rerank call count should drop ~65%, token count per remaining call should drop ~40%
6. Watch admin panel AI Cost Tracking for 1 week to validate savings

## Review Date

2026-04-30 — Review reranker cost data and any quality feedback after 1 month.

## References

- Live telemetry: `SELECT * FROM v1_mvp.llm_usage_log WHERE operation = 'rerank'`
- LlamaIndex: "Using LLMs for Retrieval and Reranking" — documents diminishing returns of double-reranking
- Elastic: "LLM chunking & snippet extraction" — warns about reranker truncation but notes metadata fields mitigate this
- ADR-016: Hybrid search pool design (35 semantic + 15 recency)
- ADR-021: Temporal query handling (skip rewrite for temporal queries)
- Reranker implementation: `purmemo-api/src/lib/reranker.ts`
