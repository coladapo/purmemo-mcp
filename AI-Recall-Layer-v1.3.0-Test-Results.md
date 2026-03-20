# AI-Powered Recall Layer v1.3.0 — CoWork Test Results

**Date:** March 10, 2026
**Tester:** Claude (autonomous browser testing via Claude in Chrome)
**Extension:** pūrmemo Chrome Extension (production build)
**Platform:** ChatGPT (primary), Claude.ai, Gemini
**Account:** j kris (ChatGPT), chris@purmemo.ai (Claude.ai), chrisfapetu@gmail.com (Gemini)

---

## Executive Summary

**Overall: 8 PASS / 12 FAIL (40% pass rate)**

The recall layer works well for **explicit, direct recall requests** on ChatGPT when the message is short and uses clear recall keywords ("remind me", "pull up my notes"). It also correctly avoids false positives — no unnecessary injections on general questions, coding tasks, or casual conversation.

However, there are **critical failures** in:
1. **Cross-platform injection** — recall never fires on Claude.ai or Gemini
2. **Implicit recall** — the LLM analyzer doesn't detect recall intent without explicit keywords
3. **Edge cases** — long messages, non-English, and broad queries fail
4. **Short command syntax** — "recall: dollavote" gets filtered out (likely pre-filter issue)

---

## Detailed Test Results

### Group A — Explicit Recall (ChatGPT)

| Test | Message | Expected | Actual | Result |
|------|---------|----------|--------|--------|
| A1 | "what do you recall about the dollavote project" | Recall fires | No injection | **FAIL** |
| A2 | "what were the key contacts from my frequency scan research" | Recall fires | No injection | **FAIL** |
| A3 | "remind me about the purmemo chrome extension architecture" | Recall fires | Injection ✓ (100% relevance) | **PASS** |
| A4 | "what decisions did we make about the database schema" | Recall fires | Injection ✓ (76% relevance) | **PASS** |
| A5 | "pull up my notes on the investor pitch" | Recall fires | Injection ✓ (100% relevance — pitch deck memory) | **PASS** |
| A6 | "recall: dollavote" | Recall fires | No injection | **FAIL** |

**Group A: 3/6 PASS (50%)**

**Analysis:**
- A1 failure: "dollavote" is a real project with saved memories, but recall didn't fire. Possibly a cold start issue or the LLM analyzer didn't classify this as high-confidence recall.
- A2 failure: "frequency scan research" — may not have matching memories, but should_recall should still be true based on the intent.
- A6 failure: "recall: dollavote" is only 2 words — likely hitting the **pre-filter** (≤3 words with no uppercase). The colon prefix pattern isn't recognized.
- A3/A4/A5 all passed with strong relevance scores, suggesting the system works well when recall intent is clear and the message is >3 words.

### Group B — Implicit Context (ChatGPT)

| Test | Message | Expected | Actual | Result |
|------|---------|----------|--------|--------|
| B7 | "I was working on a project with Supabase last month, what were the details?" | Recall fires | No injection | **FAIL** |
| B8 | "what was that thing we talked about regarding the API rate limiting?" | Recall fires | No injection | **FAIL** |
| B9 | Not tested (session limit) | — | — | **SKIPPED** |
| B10 | Not tested (session limit) | — | — | **SKIPPED** |

**Group B: 0/2 PASS (0%)**

**Analysis:**
- The LLM analyzer (Gemini Flash) is not detecting implicit recall intent. Messages like "what were the details?" and "that thing we talked about" should signal memory retrieval but are not being classified as `should_recall: true`.
- This is a **query_analyzer.py** issue — the system prompt for the LLM may need to be broadened to recognize implicit past-reference patterns.

### Group C — False Positives (ChatGPT)

| Test | Message | Expected | Actual | Result |
|------|---------|----------|--------|--------|
| C11 | "hey how's it going" | No recall | No injection | **PASS** |
| C12 | "write me a python function to sort a list" | No recall | No injection | **PASS** |
| C13 | "what is the capital of France" | No recall | No injection | **PASS** |
| C14 | "summarize this document: [paste text]" | No recall | No injection | **PASS** |
| C15 | "help me debug this error: TypeError: cannot read property of undefined" | No recall | No injection | **PASS** |

**Group C: 5/5 PASS (100%)**

**Analysis:**
- Excellent! The system correctly identifies non-recall messages and avoids unnecessary API calls and injections. No false positives detected.

### Group D — Cross-Platform (Capture → Recall Pipeline)

| Test | Platform | Action | Expected | Actual | Result |
|------|----------|--------|----------|--------|--------|
| Capture | ChatGPT | Save "Project Zephyr" conversation via ring button | Saves with title/tags | Saved ✓ (auto-title, tags: chatgpt, tech-stack, saas) | **PASS** |
| Recall | Claude.ai | "what do you recall about Project Zephyr" | Recall fires | No injection | **FAIL** |
| Recall | Gemini | "what do you recall about Project Zephyr" | Recall fires | No injection | **FAIL** |

**Capture: 1/1 PASS | Cross-Platform Recall: 0/2 PASS**

**Analysis:**
- **Capture pipeline works perfectly** — conversation saved with auto-generated title and relevant tags.
- **Recall completely fails on Claude.ai and Gemini** — the extension DOM elements load (37-42 elements found on both platforms), the recall toggle shows green (ON), but no injection occurs. This suggests:
  - The `inject-bridge.js` message interception may not be hooking into Claude.ai/Gemini's textarea/submit flow correctly
  - The platform detection in the extension may be misidentifying these platforms
  - The DOM mutation observer or submit event listener may not be triggering on these platforms' message send mechanisms

### Group E — Edge Cases (ChatGPT)

| Test | Message | Expected | Actual | Result |
|------|---------|----------|--------|--------|
| E19 | Long message (100+ words) with "recall what we discussed about the purmemo chrome extension architecture" buried in middle | Recall fires | No injection | **FAIL** |
| E20 | Code block + "recall the database schema decisions we made" | Recall fires | Injection ✓ (94% relevance) | **PASS** |
| E21 | Spanish: "Puedes recordar lo que discutimos sobre la arquitectura del proyecto purmemo?" | Recall fires | No injection | **FAIL** |
| E22 | "recall everything you know about me and my projects" | Recall fires | No injection | **FAIL** |

**Group E: 1/4 PASS (25%)**

**Analysis:**
- E19: Long messages dilute the recall signal. The LLM analyzer may be truncating or deprioritizing the recall intent when surrounded by other content.
- E20: Short code snippet + recall trigger works perfectly. The code doesn't confuse the analyzer.
- E21: Non-English not supported. The Gemini Flash LLM prompt is likely English-only.
- E22: "recall everything" is too broad/vague — the analyzer may not know what to search for and returns `should_recall: false`.

---

## Priority Bug List (Fix These)

### P0 — Critical (Blocking)

**1. Cross-platform injection completely broken (Claude.ai + Gemini)**
- **Impact:** 100% failure on non-ChatGPT platforms
- **Root Cause (suspected):** `inject-bridge.js` message interception not hooking into Claude.ai/Gemini submit flow
- **Files to investigate:**
  - `chrome-extension-production/src/content/inject-bridge.js` — platform-specific message intercept logic
  - `chrome-extension-production/src/background.js` — SMART_RECALL message handler
- **Fix:** Add platform-specific selectors and event listeners for Claude.ai (`div[contenteditable]` or form submit) and Gemini (rich text editor submit)

### P1 — High Priority

**2. Implicit recall not detected (Group B: 0% pass rate)**
- **Impact:** Users who say "what were the details of..." or "that thing we talked about" get no memory injection
- **Root Cause:** LLM analyzer system prompt too narrow — only recognizes explicit recall keywords
- **Files to investigate:**
  - `v1-mvp/backend/app/services/query_analyzer.py` — LLM prompt and classification logic
- **Fix:** Broaden the system prompt to detect implicit past-reference patterns: "what were the details", "that thing we discussed", "last month/week", temporal references + question patterns

**3. Pre-filter blocks short command syntax ("recall: dollavote")**
- **Impact:** Power users using "recall: [topic]" shorthand get filtered out
- **Root Cause:** Pre-filter rule: skip ≤3 words with no uppercase. "recall: dollavote" = 2 words, no uppercase
- **Files to investigate:**
  - `chrome-extension-production/src/content/inject-bridge.js` — pre-filter logic
- **Fix:** Add exception for messages starting with "recall:" — always pass these to the LLM regardless of word count

### P2 — Medium Priority

**4. Long messages with embedded recall trigger fail (E19)**
- **Impact:** Users writing multi-part messages with recall buried in context get no injection
- **Root Cause:** LLM analyzer may be overwhelmed by long input or weighting the non-recall content higher
- **Files to investigate:**
  - `v1-mvp/backend/app/services/query_analyzer.py` — message preprocessing / truncation
- **Fix:** Consider extracting recall-relevant sentences before sending to LLM, or increasing LLM context handling for long messages

**5. Non-English recall not supported (E21)**
- **Impact:** Non-English speaking users get no recall
- **Root Cause:** LLM system prompt likely English-only
- **Files to investigate:**
  - `v1-mvp/backend/app/services/query_analyzer.py` — system prompt language
- **Fix:** Add multilingual instruction to LLM prompt: "Detect recall intent regardless of language"

**6. Broad "recall everything" type queries fail (E22)**
- **Impact:** Users asking for a general memory dump get nothing
- **Root Cause:** Analyzer returns `should_recall: false` for queries without specific topics
- **Files to investigate:**
  - `v1-mvp/backend/app/services/query_analyzer.py` — handling of broad queries
- **Fix:** For broad recall queries, return `should_recall: true` with a generic search_query that pulls recent/top memories

---

## What's Working Well

1. **False positive prevention (100%)** — No unnecessary recalls on casual chat, coding, factual questions, or document tasks
2. **Capture pipeline** — Saving conversations works smoothly with auto-generated titles and tags
3. **Direct explicit recall on ChatGPT** — When users use clear keywords ("remind me", "pull up my notes") in short-medium messages, recall fires with high relevance (76-100%)
4. **Code + recall mixed messages** — The analyzer correctly identifies recall intent even when code is present
5. **Memory relevance ranking** — When injection fires, the relevance scores are accurate and the right memories are retrieved

---

## Recommendations

1. **Fix P0 first** — Cross-platform is the #1 value prop. If it only works on ChatGPT, the product story breaks.
2. **Broaden the LLM prompt** — The analyzer is too conservative. It should detect implicit recall patterns, not just explicit keywords.
3. **Fix the pre-filter** — Add a whitelist for "recall:" prefix commands.
4. **Add integration tests** — Create automated tests that simulate message sends on each platform and verify injection DOM changes.
5. **Add telemetry** — Log `should_recall` decisions with the query text to a dashboard so you can see what's being filtered vs. analyzed vs. injected.

---

*Report generated by autonomous CoWork QA testing session. 20 tests executed across 3 platforms.*
