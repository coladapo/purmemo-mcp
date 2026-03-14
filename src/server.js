#!/usr/bin/env node
/**
 * pūrmemo MCP Server v13.0.0 - Workflow Engine
 *
 * Comprehensive solution that combines all our learnings:
 * - Smart content detection and routing
 * - Aggressive prompting for complete capture
 * - Automatic chunking for large content
 * - Artifact and code block extraction
 * - Session management for multi-part saves
 * - Living document pattern with auto-ID from title
 * - 🌍 Cross-platform discovery via semantic clusters
 * - 🔗 Find related conversations across ChatGPT, Claude, Gemini
 * - 🧠 NEW: Intelligent memory saving with auto-context extraction
 * - 📊 NEW: Automatic project/component/feature detection
 * - 🎯 NEW: Smart title generation (no more timestamps!)
 * - 🗺️ NEW: Roadmap tracking across AI tools
 * - 🛡️ PHASE 16.4: Unicode sanitization to prevent JSON encoding errors
 *   - Fixes "no low surrogate" errors from corrupted Unicode in memories
 *   - Automatically cleans all text before sending to Claude API
 *   - Prevents 400 errors caused by unpaired surrogate characters
 * - 🎯 NEW: Workflow Engine (run_workflow + list_workflows)
 *   - Memory-powered workflow execution via MCP tools
 *   - 15 bundled universal workflows (prd, ceo, debug, growth, etc.)
 *   - Intent-based auto-routing when no workflow specified
 *   - Pre-loads user identity + relevant memories server-side
 * - 📋 MCP Spec 2025-11-25 Compliance:
 *   - Server instructions for LLM guidance at connection time
 *   - outputSchema on all 4 tools for structured tool output
 *   - Tool annotations (readOnlyHint, destructiveHint, idempotentHint, openWorldHint)
 * - 🛡️ TIER 3 PRODUCTION HARDENING:
 *   - Structured JSON logging for all operations
 *   - Circuit breaker pattern for API resilience
 *   - 30-second request timeouts with AbortController
 *   - Per-tool request timing and metrics
 *   - Safe error messages with fallback handling
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import {
  extractProjectContext,
  generateIntelligentTitle,
  extractProgressIndicators,
  extractRelationships
} from './intelligent-memory.js';
import TokenStore from './auth/token-store.js';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Route subcommands: `npx purmemo-mcp setup|status|logout` → setup.js
const _subcommand = process.argv[2];
if (_subcommand === 'setup' || _subcommand === 'status' || _subcommand === 'logout') {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const setupPath = path.join(__dirname, 'setup.js');
  import(setupPath).catch(err => { console.error(err); process.exit(1); });
  // setup.js manages its own process lifecycle
} else {

const API_URL = process.env.PURMEMO_API_URL || 'https://api.purmemo.ai';

// ============================================================================
// Version check — runs once on startup, non-blocking
// If the server reports this client is below min_required_version, every tool
// response will include an update notice at the top.
// ============================================================================

const require = createRequire(import.meta.url);
// In .mcpb bundles, package.json is at ./package.json (same dir as server.js)
// In npx installs, it's at ../package.json — try both
let CLIENT_VERSION = '0.0.0';
try { CLIENT_VERSION = require('./package.json').version; } catch {
  try { CLIENT_VERSION = require('../package.json').version; } catch { /* unknown */ }
}

let _updateNotice = null; // set to a string if an update is required

function semverLt(a, b) {
  // Returns true if version string a is less than b (simple numeric comparison)
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return true;
    if ((pa[i] || 0) > (pb[i] || 0)) return false;
  }
  return false;
}

async function checkForUpdates() {
  try {
    const res = await fetch(`${API_URL}/api/v1/mcp/version`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return;
    const data = await res.json();
    const { latest_version, min_required_version, update_instructions } = data;
    if (semverLt(CLIENT_VERSION, min_required_version)) {
      _updateNotice = `⚠️ pūrmemo MCP update required (you: v${CLIENT_VERSION}, required: v${min_required_version}). ${update_instructions}`;
      structuredLog.warn('MCP client below minimum required version', { client: CLIENT_VERSION, required: min_required_version });
    } else if (semverLt(CLIENT_VERSION, latest_version)) {
      _updateNotice = `ℹ️ pūrmemo MCP update available (you: v${CLIENT_VERSION}, latest: v${latest_version}). ${update_instructions}`;
      structuredLog.info('MCP client update available', { client: CLIENT_VERSION, latest: latest_version });
    }
  } catch {
    // Version check is best-effort — never block startup
  }
}

// Read current Claude Code session_id from hook state file (written by session_start hook)
// Returns null if not in a Claude Code session or state file unavailable
function readCurrentSessionId() {
  try {
    const stateFile = path.join(os.homedir(), '.claude', 'hooks', 'purmemo_state.json');
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return state.current_session_id || null;
  } catch {
    return null;
  }
}

// API key resolution: env var wins, then ~/.purmemo/auth.json (set by `npx purmemo-mcp setup`)
let resolvedApiKey = process.env.PURMEMO_API_KEY || null;

// ============================================================================
// TIER 3: Structured Logging System
// ============================================================================

function logStructured(level, message, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    message,
    ...context
  };
  console.error(JSON.stringify(entry));
}

const structuredLog = {
  info: (msg, ctx = {}) => logStructured('info', msg, ctx),
  warn: (msg, ctx = {}) => logStructured('warn', msg, ctx),
  error: (msg, ctx = {}) => logStructured('error', msg, ctx),
  debug: (msg, ctx = {}) => logStructured('debug', msg, ctx)
};

// Log API configuration
structuredLog.info('API configuration loaded', {
  api_url: API_URL,
  api_key_present: !!resolvedApiKey,
  api_key_source: resolvedApiKey ? 'env' : 'pending'
});

// ============================================================================
// TIER 3: Circuit Breaker Pattern
// ============================================================================

class CircuitBreaker {
  constructor(name, failureThreshold = 5, recoveryTimeout = 60000) {
    this.name = name;
    this.failureThreshold = failureThreshold;
    this.recoveryTimeout = recoveryTimeout;
    this.failureCount = 0;
    this.successCount = 0;
    this.state = 'CLOSED';
    this.openedAt = null;
    this.lastFailureTime = null;
    this.totalCalls = 0;
    this.totalFailures = 0;
  }

  async execute(fn) {
    this.totalCalls++;

    // Check for OPEN → HALF_OPEN transition
    if (this.state === 'OPEN') {
      if (Date.now() - this.openedAt >= this.recoveryTimeout) {
        this.state = 'HALF_OPEN';
        structuredLog.info('Circuit breaker entering HALF_OPEN', { circuit_breaker: this.name });
      } else {
        throw new CircuitBreakerOpenError(this.name);
      }
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure(error);
      throw error;
    }
  }

  _onSuccess() {
    this.failureCount = 0;
    this.successCount++;
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      structuredLog.info('Circuit breaker recovered', { circuit_breaker: this.name });
    }
  }

  _onFailure(error) {
    this.failureCount++;
    this.totalFailures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.openedAt = Date.now();
      structuredLog.warn('Circuit breaker reopened', { circuit_breaker: this.name, error: error.message });
    } else if (this.failureCount >= this.failureThreshold && this.state === 'CLOSED') {
      this.state = 'OPEN';
      this.openedAt = Date.now();
      structuredLog.error('Circuit breaker opened', { circuit_breaker: this.name, failures: this.failureCount });
    }
  }

  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
      openedAt: this.openedAt ? new Date(this.openedAt).toISOString() : null
    };
  }
}

class CircuitBreakerOpenError extends Error {
  constructor(name) {
    super(`Circuit breaker '${name}' is OPEN. Service temporarily unavailable.`);
    this.name = 'CircuitBreakerOpenError';
    this.circuitBreakerName = name;
  }
}

const apiCircuitBreaker = new CircuitBreaker('purmemo-api', 5, 60000);

// ============================================================================
// TIER 3: Safe Error Message Helper
// ============================================================================

function safeErrorMessage(error) {
  if (error.message?.includes('429') || error.message?.includes('quota')) {
    return error.message; // Quota messages are user-facing
  }
  if (error.name === 'AbortError' || error.message?.includes('timeout')) {
    return 'Request timed out. Please try again.';
  }
  if (error instanceof CircuitBreakerOpenError) {
    return 'Service temporarily unavailable. Please try again in a moment.';
  }
  if (error.message?.includes('API Error 401') || error.message?.includes('API Error 403')) {
    return 'Invalid or missing API key.\n\nOption 1 — Easy setup (opens browser):\n  npx purmemo-mcp setup\n\nOption 2 — Manual:\n  claude mcp remove purmemo\n  claude mcp add purmemo -e PURMEMO_API_KEY=your-key -- npx -y purmemo-mcp\n\nGet your key at: https://app.purmemo.ai';
  }
  return 'An error occurred while processing your request. Please try again.';
}

// Platform detection: user specifies via MCP_PLATFORM env var
// Supported: 'claude', 'claude-code', 'cursor', 'chatgpt', 'windsurf', 'zed'
// MCP is a universal protocol - same server works across all platforms
// Auto-detect Claude Code vs Claude Desktop
const detectPlatform = () => {
  // 1. Explicit override (highest priority)
  if (process.env.MCP_PLATFORM) {
    return process.env.MCP_PLATFORM;
  }

  // 2. Auto-detect Claude Code via env vars set by Claude Code CLI
  // Claude Code sets CLAUDECODE=1 and CLAUDE_CODE_ENTRYPOINT=cli
  if (process.env.CLAUDECODE === '1' || process.env.CLAUDE_CODE_ENTRYPOINT === 'cli') {
    return 'claude-code';
  }

  // 3. Default to claude for Claude Desktop
  return 'claude';
};

const PLATFORM = detectPlatform();

// Admin mode: enables get_acknowledged_errors + save_investigation_result
// Only enabled when PURMEMO_ADMIN=1 is set in the environment.
// Never set by default — npm package users never see these tools.
const ADMIN_MODE = process.env.PURMEMO_ADMIN === '1';

// Log detected platform for debugging (only in development)
if (process.env.NODE_ENV !== 'production') {
  structuredLog.debug('Platform detected', { platform: PLATFORM });
  structuredLog.debug('Admin mode', { admin_mode: ADMIN_MODE });
}

// Session management for chunked captures
const sessions = {
  active: new Map(),
  completed: new Map()
};

// ============================================================================
// WORKFLOW ENGINE — Memory-powered workflows via MCP
// ============================================================================

// ============================================================================
// WORKFLOW QUERY PREPROCESSING — Extract search terms from long user input
// ============================================================================

const SEARCH_STOP_WORDS = new Set([
  // Articles, prepositions, conjunctions
  'a','an','the','is','are','was','were','be','been','being',
  'have','has','had','do','does','did','will','would','could',
  'should','may','might','can','need','to','of','in','for',
  'on','with','at','by','from','as','into','through','during',
  'before','after','above','below','between','out','off','over',
  'under','again','then','once','here','there','when','where',
  'why','how','all','each','every','both','few','more','most',
  'other','some','such','no','not','only','own','same','so',
  'than','too','very','just','because','but','and','or','if',
  'while','about','against','up','down',
  // Pronouns
  'i','me','my','we','our','you','your','he','she','it',
  'they','them','their','this','that','these','those',
  'what','which','who','whom',
  // Common verbs that don't carry search meaning
  'want','wants','need','needs','let','lets','get','got',
  'make','made','like','also','new','way','going','thing',
  'things','dont','doesnt','really','see','show','know',
  // Generic adjectives
  'existing','currently','available','using','many','much',
  'right','good','best','first','last','next','able'
]);

function extractSearchTerms(input, maxTerms = 5) {
  const words = input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !SEARCH_STOP_WORDS.has(w));

  // Deduplicate preserving first-occurrence order
  const unique = [...new Set(words)];
  return unique.slice(0, maxTerms).join(' ');
}

function buildMemoryQueries(template, input) {
  const wordCount = input.trim().split(/\s+/).length;

  // Short input (≤6 words): use directly — already a good query
  if (wordCount <= 6) {
    return template.memory_queries.map(q =>
      q.replace('[INPUT]', input.trim())
    );
  }

  // Long input (>6 words): extract key terms first
  const keywords = extractSearchTerms(input, 5);

  // Fallback: if extraction produced nothing, use first 5 words
  const fallback = input.trim().split(/\s+/).slice(0, 5).join(' ');
  const searchTerms = keywords.length > 0 ? keywords : fallback;

  return template.memory_queries.map(q =>
    q.replace('[INPUT]', searchTerms)
  );
}

const WORKFLOW_TEMPLATES = {
  prd: {
    name: 'prd',
    display_name: 'PRD — Product Requirements Document',
    category: 'product',
    description: 'Generate a complete Product Requirements Document for any feature or initiative.',
    memory_queries: ['[INPUT] requirements decisions', 'product [INPUT] architecture'],
    signals: ['prd', 'requirements', 'spec', 'specification'],
    route_chain: ['story', 'design', 'feature'],
    prompt: `# PRD — Senior Product Manager

You are a senior product manager generating a complete Product Requirements Document.

## Your Process
1. Review the pre-loaded memories below for any past decisions about this feature area
2. Ask 1-2 clarifying questions if the scope is unclear (who is the user? what pain does this solve?)
3. Generate the PRD in this structure:

## PRD Output Structure
- **Problem Statement** — What is broken, missing, or painful? (1-3 sentences)
- **Goals** — Specific, measurable goals (3-5 bullets)
- **Non-Goals** — What this explicitly does NOT do
- **User Stories** — As a [user], I want [action], so that [outcome]. Include acceptance criteria.
- **Technical Surface Impact** — Which systems/surfaces are affected
- **Success Metrics** — How do we know this worked?
- **Open Questions & Recommendations** — List unresolved decisions. For EACH open question, include your recommended answer with reasoning. Never leave a question without a recommendation.
- **Next Steps** — Numbered list so the user can reply with just a number to proceed:
  1. First suggested next step (e.g., run_workflow story to break into tickets)
  2. Second option (e.g., run_workflow design if UI-first)
  3. Third option if applicable

Be specific. Reference the user's past decisions from memory where relevant.`
  },
  ceo: {
    name: 'ceo',
    display_name: 'CEO — Strategic Advisor',
    category: 'strategy',
    description: 'Think through strategic decisions with CEO-level frameworks — product strategy, market positioning, PMF, priority calls.',
    memory_queries: ['[INPUT] strategy decisions', 'product direction vision PMF'],
    signals: ['strategy', 'prioritize', 'direction', 'should we', 'focus'],
    route_chain: ['roadmap', 'prd'],
    prompt: `# CEO — Strategic Advisor

You are a strategic advisor helping a founder think through a decision.

## Your Process
1. Review pre-loaded memories for past strategic context and decisions
2. Restate the decision clearly in one sentence
3. Apply the most relevant framework:
   - **RICE** for prioritization (Reach × Impact × Confidence / Effort)
   - **Two-Door** for reversibility assessment (one-way vs two-way door)
   - **Regret Minimization** for founder clarity (which choice would you regret NOT making?)
   - **PMF Quadrant** for product direction (problem-solution fit vs product-market fit)
4. Give a clear recommendation with reasoning
5. State what you'd need to be wrong about for the other option to be better
6. List numbered next steps so the user can reply with just a number to proceed`
  },
  debug: {
    name: 'debug',
    display_name: 'Debug — Structured Debugging',
    category: 'engineering',
    description: 'Debug errors with research, context recall, and automatic solution documentation.',
    memory_queries: ['[INPUT] error fix', 'similar bugs resolved'],
    signals: ['debug', 'error', 'bug', 'broken', 'failing', 'crash', 'exception', 'typeerror', 'undefined'],
    route_chain: ['review', 'deploy'],
    prompt: `# Debug — Structured Debugging Workflow

You are a senior engineer debugging an issue systematically.

## Your Process
1. Review pre-loaded memories for similar past bugs and fixes
2. Understand the error — exact message, when it occurs, what the user was trying to do
3. Form 2-3 hypotheses ranked by likelihood
4. Research if needed — check docs, search for known issues
5. Implement the fix with minimal changes
6. Verify the fix resolves the issue
7. Document: what broke, why, and how it was fixed
8. Suggest next steps: review (before committing), deploy (if ready to ship)`
  },
  growth: {
    name: 'growth',
    display_name: 'Growth — Head of Growth',
    category: 'business',
    description: 'Analyze the growth funnel, identify the weakest stage, and generate prioritized experiments.',
    memory_queries: ['growth experiments acquisition', 'activation retention metrics churn'],
    signals: ['growth', 'acquisition', 'retention', 'churn', 'conversion', 'experiment'],
    route_chain: ['funnel', 'ab-test', 'copy'],
    prompt: `# Growth — Head of Growth

You are a head of growth analyzing the funnel and proposing experiments.

## Your Process
1. Review pre-loaded memories for past growth experiments and metrics
2. Map the current funnel: Awareness → Acquisition → Activation → Retention → Revenue → Referral
3. Identify the weakest stage with data
4. Generate 3-5 experiment ideas using the ICE framework (Impact × Confidence × Ease)
5. Recommend the top experiment to run this week
6. Suggest next steps: funnel (deeper analysis), ab-test (design the experiment), copy (if messaging needs work)`
  },
  sprint: {
    name: 'sprint',
    display_name: 'Sprint — Sprint Planning & Execution',
    category: 'operations',
    description: 'Plan a focused work sprint, track progress, and close with a summary.',
    memory_queries: ['sprint planning development progress', 'outstanding tasks backlog'],
    signals: ['sprint', 'plan', 'week', 'focus', 'session', 'work on'],
    route_chain: ['story', 'feature'],
    prompt: `# Sprint — Sprint Planning & Execution

You are a sprint planner helping maximize a focused work session.

## Your Process
1. Review pre-loaded memories for development progress and outstanding tasks
2. Check current git status for in-progress work
3. Present the priority queue: what's most important RIGHT NOW?
4. Help the user commit to 2-3 concrete deliverables for this session
5. Track progress during the session
6. Close with a sprint summary: what was done, what's next, any blockers`
  },
  design: {
    name: 'design',
    display_name: 'Design — Senior UX Engineer',
    category: 'product',
    description: 'Implement UI components and layouts with pixel-perfect precision in the project\'s design language.',
    memory_queries: ['design system components [INPUT]', 'UI decisions design tokens'],
    signals: ['design', 'ui', 'ux', 'component', 'layout', 'pixel', 'visual', 'interface'],
    route_chain: ['component', 'animate', 'audit-ui'],
    prompt: `# Design — Senior UX Engineer

You are a senior UX engineer implementing UI with pixel-perfect precision.

## Your Process
1. Review pre-loaded memories for past design decisions and design system context
2. Read the current design token system and existing components
3. Implement with the project's exact design language — no generic styles
4. Ensure responsive behavior, accessibility, and consistent spacing
5. Suggest next steps: component (if building a reusable component), audit-ui (before shipping)`
  },
  review: {
    name: 'review',
    display_name: 'Review — Pre-Commit Security & Quality',
    category: 'engineering',
    description: 'Comprehensive security and quality checks before committing code.',
    memory_queries: ['security review patterns', 'code quality standards'],
    signals: ['review', 'before commit', 'check code', 'security check', 'quality'],
    route_chain: ['deploy'],
    prompt: `# Review — Pre-Commit Security & Quality Review

You are a security-focused code reviewer.

## Your Process
1. Identify all changes using git diff
2. Check for OWASP Top 10 vulnerabilities (injection, XSS, auth issues, etc.)
3. Check for secrets/credentials in code
4. Check for error handling gaps
5. Check for performance issues
6. Provide a pass/fail verdict with specific issues to fix
7. Suggest next steps: deploy (if pass), or fix issues first`
  },
  copy: {
    name: 'copy',
    display_name: 'Copy — Senior Copywriter & Brand Voice',
    category: 'content',
    description: 'Write high-converting copy for landing pages, announcements, emails, and in-app messaging.',
    memory_queries: ['brand voice copy messaging', 'product positioning tagline'],
    signals: ['copy', 'headline', 'tagline', 'landing page', 'email', 'announcement', 'microcopy', 'cta'],
    route_chain: ['social', 'content'],
    prompt: `# Copy — Senior Copywriter & Brand Voice

You are a senior copywriter writing in the product's brand voice.

## Your Process
1. Review pre-loaded memories for brand voice guidelines and past copy decisions
2. Identify the surface (landing page, email, in-app, tweet, etc.)
3. Apply the right framework: AIDA for landing pages, PAS for emails, Hook-Bridge-CTA for social
4. Write 2-3 options at different energy levels (professional, conversational, bold)
5. Recommend the strongest option with reasoning`
  },
  incident: {
    name: 'incident',
    display_name: 'Incident — Production Incident Commander',
    category: 'operations',
    description: 'Coordinate a production incident: triage, communicate, fix, resolve, postmortem.',
    memory_queries: ['recent incidents infrastructure', 'production issues deployment'],
    signals: ['incident', 'down', 'outage', 'broken', 'users can\'t', 'urgent', 'production', 'hacked'],
    route_chain: ['deploy', 'changelog'],
    prompt: `# Incident — Production Incident Commander

You are an incident commander triaging a production issue.

## Your Process
1. IMMEDIATE: Assess health (API, MCP, frontend, database) — all in parallel
2. IMMEDIATE: Draft user communication (what's affected, ETA, workaround)
3. Classify severity (SEV-1 full outage → SEV-4 minor)
4. Start timestamped incident log
5. Identify root cause
6. Implement fix
7. Verify resolution
8. Suggest next steps: deploy (ship the fix), changelog (communicate to users)`
  },
  roadmap: {
    name: 'roadmap',
    display_name: 'Roadmap — Chief Product Officer',
    category: 'product',
    description: 'Generate a prioritized product roadmap from backlog, strategic context, and PMF stage.',
    memory_queries: ['roadmap strategy priorities', 'backlog features planned'],
    signals: ['roadmap', 'what to build', 'priorities', 'planning', 'next quarter'],
    route_chain: ['prd', 'story', 'sprint'],
    prompt: `# Roadmap — Chief Product Officer

You are a CPO generating a prioritized product roadmap.

## Your Process
1. Review pre-loaded memories for strategic context, past roadmap decisions, and backlog
2. Assess current PMF stage and what it implies for priorities
3. RICE-score the top 10 candidate features/initiatives
4. Organize into: Now (this week), Next (this month), Later (this quarter)
5. Flag dependencies and risks
6. Suggest next steps: prd (spec the top priority), story (break it into tasks), sprint (start building)`
  },
  story: {
    name: 'story',
    display_name: 'Story — Product Analyst',
    category: 'product',
    description: 'Break a feature into RICE-scored user stories with acceptance criteria and edge cases.',
    memory_queries: ['[INPUT] requirements stories', 'feature acceptance criteria'],
    signals: ['story', 'stories', 'user story', 'tickets', 'break down', 'scope'],
    route_chain: ['sprint', 'feature'],
    prompt: `# Story — Product Analyst

You are a product analyst breaking features into executable user stories.

## Your Process
1. Review pre-loaded memories for existing PRDs and requirements
2. Break the feature into 3-7 user stories (if more, the feature is too big — split it)
3. For each story: As a [user], I want [action], so that [outcome]
4. Add acceptance criteria (testable, specific)
5. Add edge cases and error states
6. RICE-score each story
7. Suggest implementation order (dependencies first)
8. Suggest next steps: sprint (start building), design (if UI-first)`
  },
  metrics: {
    name: 'metrics',
    display_name: 'Metrics — Weekly SaaS Dashboard',
    category: 'business',
    description: 'Pull and present all key product metrics — users, memories, activation, retention.',
    memory_queries: ['metrics dashboard weekly', 'KPIs product health'],
    signals: ['metrics', 'dashboard', 'numbers', 'kpis', 'how are we doing', 'data'],
    route_chain: ['growth', 'cfo'],
    prompt: `# Metrics — Weekly SaaS Dashboard

You are a data analyst presenting the weekly product dashboard.

## Your Process
1. Review pre-loaded memories for last metrics snapshot (for week-over-week comparison)
2. Query current metrics: users, memories saved, activation rate, retention, revenue
3. Present in a clean dashboard format with trends (↑↓→)
4. Highlight anomalies — anything that changed significantly
5. Suggest next steps: growth (if metrics are flat), cfo (if financial review needed)`
  },
  deploy: {
    name: 'deploy',
    display_name: 'Deploy — Pre-Deployment Checklist',
    category: 'operations',
    description: 'Comprehensive pre-deployment checks for safe production deployment.',
    memory_queries: ['deployment checklist', 'recent deploys issues'],
    signals: ['deploy', 'ship', 'push to production', 'release'],
    route_chain: ['changelog', 'social'],
    prompt: `# Deploy — Pre-Deployment Checklist

You are a release engineer ensuring safe production deployment.

## Your Process
1. Confirm deployment target (staging vs production)
2. Verify all tests pass
3. Check for uncommitted changes
4. Review recent git log for what's being deployed
5. Check current service health before deploying
6. Deploy and verify health after
7. Suggest next steps: changelog (communicate what shipped), social (announce if noteworthy)`
  },
  feedback: {
    name: 'feedback',
    display_name: 'Feedback — User Feedback Synthesizer',
    category: 'product',
    description: 'Collect and synthesize user feedback from all sources into actionable product intelligence.',
    memory_queries: ['user feedback requests', 'feature requests complaints'],
    signals: ['feedback', 'users say', 'feature request', 'complaints', 'reviews'],
    route_chain: ['prd', 'roadmap'],
    prompt: `# Feedback — User Feedback Synthesizer

You are a product researcher synthesizing user feedback.

## Your Process
1. Review pre-loaded memories for recent feedback patterns
2. Categorize: bug reports, feature requests, UX friction, praise
3. Identify top 3 themes by frequency
4. For each theme: evidence (quotes/examples), severity, opportunity size
5. Recommend: which feedback to act on NOW vs LATER vs NEVER
6. Suggest next steps: prd (spec a feature from feedback), roadmap (reprioritize)`
  },
  intel: {
    name: 'intel',
    display_name: 'Intel — AI Landscape Intelligence Briefing',
    category: 'strategy',
    description: 'Morning intelligence briefing — scan the AI landscape for opportunities and threats.',
    memory_queries: ['AI landscape competitors', 'last intel brief'],
    signals: ['intel', 'ai news', 'landscape', 'what\'s happening', 'competitors'],
    route_chain: ['moat', 'ceo'],
    prompt: `# Intel — AI Landscape Intelligence Briefing

You are an intelligence analyst delivering a landscape briefing.

## Your Process
1. Review pre-loaded memories for last intel brief (for delta comparison)
2. Research: scan AI news, competitor moves, platform announcements from the last 7 days
3. Present briefing:
   - **Opportunities** — new platforms, partnerships, distribution channels
   - **Threats** — competitor launches, platform policy changes
   - **Signals** — trends that could affect strategy in 30-90 days
4. Rate each item: 🔴 Act Now / 🟡 Monitor / 🟢 Informational
5. Suggest next steps: moat (if threat detected), ceo (if strategic pivot needed)`
  }
};

// Intent classifier for auto-routing when no workflow is specified
function classifyWorkflowIntent(input) {
  const lower = input.toLowerCase();

  // Check each workflow's signals — first match wins (order matters: emergency first)
  const priorityOrder = [
    'incident', 'debug', 'deploy', 'review',  // urgent/engineering
    'prd', 'story', 'design', 'roadmap',       // product
    'ceo', 'growth', 'metrics', 'intel',       // strategy/business
    'sprint', 'copy', 'feedback'               // operations/content
  ];

  for (const wfName of priorityOrder) {
    const wf = WORKFLOW_TEMPLATES[wfName];
    if (wf.signals.some(signal => lower.includes(signal))) {
      return { workflow: wfName, confidence: 'high', chain: wf.route_chain };
    }
  }

  // Fallback heuristics for common phrases
  if (/what should (i|we) (build|do|focus|work)/i.test(input)) return { workflow: 'ceo', confidence: 'medium', chain: ['roadmap'] };
  if (/how (are|is) (we|the product|things) doing/i.test(input)) return { workflow: 'metrics', confidence: 'medium', chain: ['growth'] };
  if (/ship|launch|release/i.test(input)) return { workflow: 'deploy', confidence: 'medium', chain: ['changelog'] };
  if (/write|draft|announce/i.test(input)) return { workflow: 'copy', confidence: 'medium', chain: ['social'] };

  return { workflow: null, confidence: 'none', chain: [] };
}

// ULTIMATE TOOL DEFINITIONS
// MCP Tool Annotations (Anthropic Connector Directory Requirement #17)
// - readOnlyHint: true for tools that only read data, false for write operations
// - destructiveHint: true for tools that delete/modify existing data destructively
// - idempotentHint: true for tools that produce same result when called multiple times
// - openWorldHint: true for tools that interact with external world beyond local data
// - title: Human-readable title for display in UIs
const TOOLS = [
  {
    name: 'save_conversation',
    annotations: {
      title: 'Save Conversation',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    },
    description: `Save complete conversations as living documents. REQUIRED: Send COMPLETE conversation in 'conversationContent' parameter (minimum 100 chars, should be thousands). Include EVERY message verbatim - NO summaries or partial content.

    Intelligently tracks context, extracts project details, and maintains a single memory per conversation topic.

    LIVING DOCUMENT + INTELLIGENT PROJECT TRACKING:
    - Each conversation becomes a living document that grows over time
    - Automatically extracts project context (name, component, feature being discussed)
    - Detects work iteration and status (planning/in_progress/completed/blocked)
    - Generates smart titles like "Purmemo - Timeline View - Implementation" (no more timestamp titles!)
    - Tracks technologies, tools used, and identifies relationships/dependencies
    - Works like Chrome extension: intelligent memory that grows with each save

    How memory updating works:
    - Conversation ID auto-generated from title (e.g., "MCP Tools" → "mcp-tools")
    - Same title → UPDATES existing memory (not create duplicate)
    - "Save progress" → Updates most recent memory for current project context
    - Explicit conversationId → Always updates that specific memory
    - Example: Saving "Project X Planning" three times = ONE memory updated three times
    - To force new memory: Change title or use different conversationId

    SERVER AUTO-CHUNKING:
    - Large conversations (>15K chars) automatically split into linked chunks
    - Small conversations (<15K chars) saved directly as single memory
    - You always send complete content - server handles chunking intelligently
    - All chunks linked together for seamless retrieval

    EXAMPLES:
    User: "Save progress" (working on Purmemo timeline feature)
    → System auto-generates: "Purmemo - Timeline View - Implementation"
    → Updates existing memory if this title was used before

    User: "Save this conversation" (discussing React hooks implementation)
    → System auto-generates: "Frontend - React Hooks - Implementation"

    User: "Save as conversation react-hooks-guide"
    → You call save_conversation with conversationId="react-hooks-guide"
    → Creates or updates memory with this specific ID

    WHAT TO INCLUDE (COMPLETE CONVERSATION REQUIRED):
    - EVERY user message (verbatim, not paraphrased)
    - EVERY assistant response (complete, not summarized)
    - ALL code blocks with full syntax
    - ALL artifacts with complete content (not just titles/descriptions)
    - ALL file paths, URLs, and references mentioned
    - ALL system messages and tool outputs
    - EXACT conversation flow and context
    - Minimum 500 characters expected - should be THOUSANDS of characters

    FORMAT REQUIRED:
    === CONVERSATION START ===
    [timestamp] USER: [complete user message 1]
    [timestamp] ASSISTANT: [complete assistant response 1]
    [timestamp] USER: [complete user message 2]
    [timestamp] ASSISTANT: [complete assistant response 2]
    ... [continue for ALL exchanges]
    === ARTIFACTS ===
    [Include ALL artifacts with full content]
    === CODE BLOCKS ===
    [Include ALL code with syntax highlighting]
    === END ===

    IMPORTANT: Do NOT send just "save this conversation" or summaries. If you send less than 500 chars, you're doing it wrong. Include the COMPLETE conversation with all details.`,
    inputSchema: {
      type: 'object',
      properties: {
        conversationContent: {
          type: 'string',
          description: 'COMPLETE conversation transcript - minimum 500 characters expected. Include EVERYTHING discussed.',
          minLength: 100
        },
        title: {
          type: 'string',
          description: 'Title for this conversation memory',
          default: `Conversation ${new Date().toISOString()}`
        },
        conversationId: {
          type: 'string',
          description: 'Optional unique identifier for living document pattern. If provided and memory exists with this conversationId, UPDATES that memory instead of creating new one. Use for maintaining single memory per conversation that updates over time.'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for categorization',
          default: ['complete-conversation']
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Priority level for this memory',
          default: 'medium'
        }
      },
      required: ['conversationContent']
    }
  },
  {
    name: 'recall_memories',
    annotations: {
      title: 'Recall Memories',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    description: `Search and retrieve saved memories with intelligent semantic ranking.

🎯 BASIC SEARCH:
  recall_memories(query="authentication")
  → Returns all memories about authentication, ranked by semantic relevance

🔍 FILTERED SEARCH (Phase 2 Knowledge Graph Intelligence):
  Use filters when you need PRECISION over semantic similarity:

  ✓ entity="name" - Find memories mentioning specific people/projects/technologies
    Example: entity="purmemo" → Only memories discussing purmemo

  ✓ has_observations=true - Find substantial, fact-dense conversations
    Example: has_observations=true → Only high-quality technical discussions

  ✓ initiative="project" - Scope to specific initiatives/goals
    Example: initiative="Q1 OKRs" → Only Q1-related memories

  ✓ intent="type" - Filter by conversation purpose
    Options: decision, learning, question, blocker
    Example: intent="blocker" → Only conversations about blockers

💡 WHEN TO FILTER:
  - Use entity when user asks about specific person/project by name
  - Use has_observations for "detailed" or "substantial" requests
  - Use initiative/stakeholder for project-specific searches
  - Use intent when user asks for decisions, learnings, or blockers

📝 COMBINED EXAMPLES:
  recall_memories(query="auth", entity="purmemo", has_observations=true)
  → Find detailed technical discussions about purmemo authentication

  recall_memories(query="blockers", intent="blocker", stakeholder="Engineering")
  → Find engineering team blockers`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query - can be keywords, topics, or specific content'
        },
        includeChunked: {
          type: 'boolean',
          default: true,
          description: 'Include chunked/multi-part conversations in results'
        },
        limit: {
          type: 'integer',
          default: 10,
          description: 'Maximum number of memories to return'
        },
        contentPreview: {
          type: 'boolean',
          default: true,
          description: 'Include content preview in results'
        },
        entity: {
          type: 'string',
          description: 'Filter by entity name (people, projects, technologies). Use when user asks about a specific person, project, or technology by name. Example: entity="Alice" finds only memories mentioning Alice. More precise than semantic search. Supports partial matching.'
        },
        initiative: {
          type: 'string',
          description: 'Filter by initiative/project name from conversation context. Use when user scopes search to specific project or goal. Example: initiative="Q1 OKRs" finds only Q1-related memories. Supports partial matching (ILIKE).'
        },
        stakeholder: {
          type: 'string',
          description: "Filter by stakeholder (person or team) from conversation context. Use when user asks about specific person's or team's involvement. Example: stakeholder=\"Engineering Team\" finds memories where Engineering Team was mentioned as stakeholder. Supports partial matching (ILIKE)."
        },
        deadline: {
          type: 'string',
          description: 'Filter by deadline date from conversation context (YYYY-MM-DD format). Use when user asks about time-sensitive memories or specific deadlines. Example: deadline="2025-03-31" finds memories with March 31, 2025 deadline. Exact match only.'
        },
        intent: {
          type: 'string',
          description: 'Filter by conversation intent/purpose. Options: "decision" (decisions made), "learning" (knowledge gained), "question" (open questions), "blocker" (obstacles/issues). Use when user asks specifically for one of these types. Example: intent="decision" finds only conversations where decisions were made. Exact match only.'
        },
        has_observations: {
          type: 'boolean',
          description: 'Filter by conversation quality based on extracted observations (atomic facts). Set to true to find substantial, structured conversations with extracted knowledge (high-quality technical discussions, detailed planning). Set to false for lightweight chats. Omit to return all memories regardless of observation count. Use when user asks for "detailed", "substantial", or "in-depth" information.'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'get_memory_details',
    annotations: {
      title: 'Get Memory Details',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    description: 'Get complete details of a specific memory, including all linked parts if chunked',
    inputSchema: {
      type: 'object',
      properties: {
        memoryId: {
          type: 'string',
          description: 'ID of the memory to retrieve'
        },
        includeLinkedParts: {
          type: 'boolean',
          default: true,
          description: 'Include all linked parts if this is a chunked memory'
        }
      },
      required: ['memoryId']
    }
  },
  {
    name: 'discover_related_conversations',
    annotations: {
      title: 'Discover Related Conversations',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    description: `CROSS-PLATFORM DISCOVERY: Find related conversations across ALL AI platforms.

    Uses Purmemo's semantic clustering to automatically discover conversations about similar topics,
    regardless of which AI platform was used (ChatGPT, Claude Desktop, Gemini, etc).

    WHAT THIS DOES:
    - Searches for memories matching your query
    - Uses AI-organized semantic clusters to find related conversations
    - Groups results by topic cluster with platform indicators
    - Shows conversations you may have forgotten about on other platforms

    EXAMPLES:
    User: "Show me all conversations about the marketing project"
    → Finds conversations across ChatGPT, Claude, Gemini automatically

    User: "What have I discussed about licensing requirements?"
    → Discovers related discussions from all platforms, grouped by semantic similarity

    User: "Find everything about React hooks"
    → Returns conversations from any platform where you discussed React hooks

    RESPONSE FORMAT:
    Shows memories grouped by semantic cluster with platform badges (ChatGPT, Claude, Gemini)
    Each cluster represents conversations about similar topics across all platforms`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language query for discovering related conversations across platforms'
        },
        limit: {
          type: 'integer',
          default: 10,
          description: 'Maximum number of initial search results (will find related for each)'
        },
        relatedPerMemory: {
          type: 'integer',
          default: 5,
          description: 'Maximum related conversations to find per result'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'get_user_context',
    annotations: {
      title: 'Get User Context',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    description: `Get the current user's cognitive identity and active session context.

Call this at the START of a conversation to understand who you're talking to —
their role, expertise, current project, and recent memory themes.

This is the core of Purmemo's identity layer: once set in the dashboard,
your identity travels silently to every AI session so you're never explaining
yourself from scratch again.

WHAT IT RETURNS:
- identity: role, expertise areas, primary domain, work style, preferred tools
- current_session: what the user is working on right now (project, focus)
- memory_summary: 2-3 sentence synthesis of the user's most recent memory themes

WHEN TO CALL:
- At the start of every new session (add to Claude system prompt)
- When user says "load my context" or "what do you know about me?"
- Before making recommendations that depend on knowing the user's background

EXAMPLE USAGE:
→ User starts new Claude session
→ Claude calls get_user_context automatically
→ Response: { role: "founder", expertise: ["product", "fullstack"],
              project: "purmemo", focus: "identity layer",
              memory_summary: "Chris has been building Purmemo's..." }
→ Claude responds with full context already loaded — no re-explaining needed`,
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  // ============================================================================
  // WORKFLOW ENGINE TOOLS
  // ============================================================================
  {
    name: 'run_workflow',
    annotations: {
      title: 'Run Workflow',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    description: `Run a Purmemo workflow — structured, memory-powered processes for product, engineering, business, and operations tasks. Your relevant memories and identity are automatically loaded to personalize every workflow.

WHEN TO USE THIS TOOL:
- User wants to write a PRD, debug an issue, plan a sprint, review code, or any structured task
- User describes a goal but doesn't know the exact process ("I want to ship a feature")
- User asks for strategic advice, design guidance, or operational help
- User says "help me", "guide me", "walk me through", or describes a business/product/engineering need

AVAILABLE WORKFLOWS (pass the workflow name, or describe what you need):
  Product:     prd, roadmap, story, design, feedback
  Strategy:    ceo, growth, metrics, intel
  Engineering: debug, review, deploy, incident
  Operations:  sprint
  Content:     copy

EXAMPLES:
  run_workflow(workflow="prd", input="notification system for mobile app")
  run_workflow(workflow="debug", input="TypeError: Cannot read property 'map' of undefined in Timeline")
  run_workflow(input="production is down, users can't save memories") → auto-routes to incident
  run_workflow(input="what should I focus on this week?") → auto-routes to sprint
  run_workflow(input="how's the business doing?") → auto-routes to metrics

DO NOT use this tool for: simple memory recall (use recall_memories), saving conversations (use save_conversation), or finding related discussions (use discover_related_conversations).

If no specific workflow is named, the system auto-routes based on the user's intent.`,
    inputSchema: {
      type: 'object',
      properties: {
        workflow: {
          type: 'string',
          description: 'Workflow name (e.g., "prd", "debug", "sprint"). Use list_workflows to see all available options including custom workflows. Optional — if omitted, auto-routes from input.'
        },
        input: {
          type: 'string',
          description: 'What you want to accomplish, the problem to solve, or context for the workflow.'
        }
      },
      required: ['input']
    }
  },
  {
    name: 'list_workflows',
    annotations: {
      title: 'List Available Workflows',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    description: `List all available Purmemo workflows — structured, memory-powered processes you can run.

WHEN TO USE THIS TOOL:
- User asks "what can you help me with?" or "what workflows do you have?"
- User wants to see available capabilities before choosing one
- User says "show me what's available" or "list workflows"

Returns the full catalog of workflows organized by category with descriptions.`,
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['product', 'strategy', 'engineering', 'business', 'operations', 'content'],
          description: 'Optional filter by category. Omit to see all workflows.'
        }
      },
      required: []
    }
  },
  // Admin-only tools — only included when PURMEMO_ADMIN=1
  ...(ADMIN_MODE ? [{
    name: 'get_acknowledged_errors',
    annotations: {
      title: 'Get Acknowledged Errors',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    description: `Fetch acknowledged errors waiting for AI investigation.

    Used to fetch errors that have been acknowledged in the admin panel and need investigation.
    Returns errors with full context including logs, metadata, occurrence count.

    USAGE:
    - Call this when user says "investigate acknowledged errors" or "/investigate-errors"
    - Errors are sorted by occurrence count (most frequent first)
    - Returns full error details for investigation

    QUERY PARAMETERS:
    - limit: Max errors to return (default: 10)
    - level_filter: Filter by level - 'all', 'critical', 'error', 'warning' (default: 'all')
    - min_occurrences: Only errors with occurrence_count >= this (default: 1)

    EXAMPLE:
    get_acknowledged_errors(limit=5, level_filter="error", min_occurrences=3)
    → Returns top 5 error-level issues that occurred 3+ times

    RETURNS:
    - acknowledged_errors: Array of error objects
    - total_count: Number of errors returned
    - filters_applied: Summary of filters used`,
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          default: 10,
          description: 'Maximum number of errors to return'
        },
        level_filter: {
          type: 'string',
          default: 'all',
          enum: ['all', 'critical', 'error', 'warning'],
          description: 'Filter by error level'
        },
        min_occurrences: {
          type: 'integer',
          default: 1,
          description: 'Only errors with occurrence_count >= this'
        }
      },
      required: []
    }
  },
  {
    name: 'save_investigation_result',
    annotations: {
      title: 'Save Investigation Result',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    },
    description: `Save AI investigation results for an error incident.

    Used to store investigation results for audit trail and learning from past fixes.
    Call this after investigating an error and proposing/deploying a fix.

    USAGE:
    - Call after completing investigation and deploying fix
    - Stores root cause analysis, research sources, proposed changes
    - Creates audit trail for learning from past investigations

    REQUEST FIELDS:
    - incident_id: UUID of the error incident (from get_acknowledged_errors)
    - root_cause_analysis: Your analysis of what caused the error
    - similar_incidents_analyzed: Array of similar incident IDs found
    - research_sources: Array of URLs used (search_web_ai, Context7 docs)
    - fix_type: Type of fix - 'code_change', 'config_update', 'deployment', 'migration', 'documentation'
    - proposed_changes: Object with file paths and changes made
    - confidence_score: Your confidence in the fix (0.0-1.0)
    - risk_level: Risk assessment - 'low', 'medium', 'high'
    - test_plan: How you tested the fix
    - rollback_plan: How to roll back if needed
    - deployment_commit_hash: Git commit hash of the fix
    - deployment_results: Object with deployment success/failure details

    EXAMPLE:
    save_investigation_result({
      incident_id: "550e8400-e29b-41d4-a716-446655440000",
      root_cause_analysis: "Timeout set to 5s, too short for slow networks",
      fix_type: "code_change",
      confidence_score: 0.85,
      risk_level: "low",
      deployment_commit_hash: "abc123def456"
    })

    RETURNS:
    - investigation_id: UUID of saved investigation
    - incident_id: UUID of the error incident
    - investigation_status: 'in_progress' or 'completed'
    - deployment_status: 'not_started', 'in_progress', 'completed'
    - success: true if saved successfully`,
    inputSchema: {
      type: 'object',
      properties: {
        incident_id: {
          type: 'string',
          description: 'UUID of the error incident from get_acknowledged_errors'
        },
        root_cause_analysis: {
          type: 'string',
          description: 'Your analysis of what caused the error'
        },
        similar_incidents_analyzed: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of similar incident IDs found via recall_memories'
        },
        research_sources: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              url: { type: 'string' },
              title: { type: 'string' },
              source: { type: 'string' }
            }
          },
          description: 'Array of research sources used (URLs from search_web_ai, Context7)'
        },
        fix_type: {
          type: 'string',
          enum: ['code_change', 'config_update', 'deployment', 'migration', 'documentation'],
          description: 'Type of fix applied'
        },
        proposed_changes: {
          type: 'object',
          description: 'Object with file paths and changes made'
        },
        confidence_score: {
          type: 'number',
          minimum: 0.0,
          maximum: 1.0,
          description: 'AI confidence in proposed fix (0.0-1.0)'
        },
        risk_level: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Risk assessment of the fix'
        },
        test_plan: {
          type: 'string',
          description: 'How the fix was tested'
        },
        rollback_plan: {
          type: 'string',
          description: 'How to roll back if fix fails'
        },
        deployment_commit_hash: {
          type: 'string',
          description: 'Git commit hash of the deployed fix'
        },
        deployment_results: {
          type: 'object',
          description: 'Deployment success/failure details'
        }
      },
      required: ['incident_id']
    }
  }] : [])
];

const server = new Server(
  { name: 'purmemo-mcp', version: '13.3.0' },
  {
    capabilities: { tools: {}, resources: {}, prompts: {} },
    instructions: `Purmemo is a cross-platform AI conversation memory system. Use these tools to save, search, and discover conversations across ChatGPT, Claude, Gemini, and other platforms.

CORE WORKFLOW:
1. save_conversation — Save COMPLETE conversations as living documents. Same title updates existing memory. Include every message verbatim (minimum 500 chars, expect thousands). Server auto-chunks content >15K chars.
2. recall_memories — Search memories with semantic ranking. Use Phase 2 filters (entity, has_observations, initiative, intent) for precision. Default hybrid search covers most cases.
3. get_memory_details — Retrieve full memory content including all linked chunks for multi-part conversations.
4. discover_related_conversations — Find related conversations across ALL AI platforms using semantic clustering.

KEY PATTERNS:
- Living Documents: Same title = updates existing memory (not duplicates). Use conversationId for explicit control.
- Cross-Platform: Memories span ChatGPT, Claude, Gemini, Cursor — discover_related_conversations finds connections across all platforms.
- Intelligent Extraction: save_conversation auto-extracts project context, technologies, status, and generates smart titles.
- Quality Filtering: Use has_observations=true to find substantial technical discussions; entity="name" for specific topics.

WORKFLOWS:
5. run_workflow — Run memory-powered workflows (PRD, debug, sprint, growth, etc). Describe what you need or name a specific workflow. Memories and identity are pre-loaded automatically.
6. list_workflows — See all available workflows organized by category.

BEST PRACTICES:
- Always send complete conversation content when saving — never summaries or partial content.
- Use recall_memories before saving to check if a living document already exists for the topic.
- For "save progress" requests, the system auto-generates contextual titles from conversation content.
- When users describe a structured task (writing PRDs, debugging, planning sprints, strategic analysis), use run_workflow instead of handling it generically.`
  }
);

// ============================================================================
// TIER 4: Resource Definitions (MCP 2025-11-25)
// ============================================================================

const RESOURCES = [
  {
    uri: 'memory://me',
    name: 'Who I Am',
    description: 'Your cognitive fingerprint — role, expertise, domain, tools, work style, current session, and vault stats. Attach this at the start of any conversation so Claude knows who it\'s talking to without you having to explain yourself.',
    mimeType: 'text/plain'
  },
  {
    uri: 'memory://context',
    name: 'My Recent Work Context',
    description: 'A briefing of your 5 most recent memories — what you\'ve been working on, what decisions were made, what\'s in progress. Attach when starting a work session to skip the "catch me up" step.',
    mimeType: 'text/plain'
  },
  {
    uri: 'memory://projects',
    name: 'My Active Projects',
    description: 'Your active projects grouped by name, showing recent activity per project. Attach when switching between projects or planning what to work on next.',
    mimeType: 'text/plain'
  },
  {
    uri: 'memory://stats',
    name: 'Memory Vault Stats',
    description: 'How many memories you\'ve saved, which platforms they\'re from, and your activity this week.',
    mimeType: 'text/plain'
  }
];

const RESOURCE_TEMPLATES = [
  {
    uriTemplate: 'memory://{memoryId}',
    name: 'Specific Memory',
    description: 'Retrieve full content of a specific memory by its unique ID',
    mimeType: 'application/json'
  }
];

// ============================================================================
// TIER 4: Prompt Definitions (MCP 2025-11-25)
// ============================================================================

const PROMPTS = [
  {
    name: 'load-context',
    description: 'Load relevant memory context before starting work. Searches your vault for past conversations, decisions, and patterns related to what you\'re about to do.',
    arguments: [
      {
        name: 'topic',
        description: 'What you\'re about to work on (optional — omit to load general recent context)',
        required: false
      }
    ]
  },
  {
    name: 'save-this-conversation',
    description: 'Save this conversation to your memory vault as a living document. Updates an existing memory if the same topic was saved before.',
    arguments: [
      {
        name: 'note',
        description: 'Optional note about what was most important in this conversation',
        required: false
      }
    ]
  },
  {
    name: 'catch-me-up',
    description: 'Catch me up on a project — what\'s been done, what decisions were made, what\'s next.',
    arguments: [
      {
        name: 'project',
        description: 'Project name to summarize',
        required: true
      }
    ]
  },
  {
    name: 'weekly-review',
    description: 'What have I been working on this week? Summarizes recent memory activity across all projects and platforms.',
    arguments: []
  }
];

// Utility functions

/**
 * Sanitize text to remove invalid Unicode characters that would break JSON encoding.
 * Fixes "no low surrogate" errors by removing unpaired surrogates and other invalid chars.
 *
 * @param {string} text - Text to sanitize
 * @returns {string} - Sanitized text safe for JSON encoding
 */
function sanitizeUnicode(text) {
  if (!text || typeof text !== 'string') return text;

  try {
    // Method 1: Replace unpaired surrogates with replacement character
    // High surrogates: 0xD800-0xDBFF, Low surrogates: 0xDC00-0xDFFF
    return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g, '\uFFFD')
               // Also remove other problematic characters
               .replace(/\uFFFE|\uFFFF/g, '') // Non-characters
               .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // Control characters except \n, \r, \t
  } catch (error) {
    structuredLog.error('Error sanitizing text', { error_message: error.message });
    // Fallback: try to encode/decode to fix encoding issues
    try {
      return Buffer.from(text, 'utf8').toString('utf8');
    } catch (fallbackError) {
      structuredLog.error('Fallback sanitization failed, returning empty string', { error_message: fallbackError.message });
      return '';
    }
  }
}

async function makeApiCall(endpoint, options = {}) {
  const method = options.method || 'GET';
  const requestId = `api_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  structuredLog.info('API call starting', {
    request_id: requestId,
    method,
    endpoint,
    api_url: API_URL,
    api_key_configured: !!resolvedApiKey
  });

  if (!resolvedApiKey) {
    structuredLog.error('No API key configured', { request_id: requestId });
    throw new Error('API Error 401: No API key configured. Run `npx purmemo-mcp setup` to connect, or set PURMEMO_API_KEY.');
  }

  return await apiCircuitBreaker.execute(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${resolvedApiKey}`,
          'Content-Type': 'application/json',
          ...options.headers
        }
      });

      clearTimeout(timeoutId);

      structuredLog.debug('API response received', {
        request_id: requestId,
        endpoint,
        status: response.status,
        status_text: response.statusText
      });

      if (!response.ok) {
        const errorText = await response.text();
        structuredLog.warn('API error response', {
          request_id: requestId,
          endpoint,
          status: response.status,
          error_preview: errorText.substring(0, 500)
        });

        // Special handling for quota exceeded (429)
        if (response.status === 429) {
          try {
            const errorData = JSON.parse(errorText);
            const upgradeUrl = errorData.upgrade_url || 'https://app.purmemo.ai/dashboard/plans';
            const currentUsage = errorData.current_usage || '?';
            const quotaLimit = errorData.quota_limit || '?';
            const tier = errorData.tier || 'FREE';
            const billingPeriod = errorData.billing_period || 'this month';

            // Calculate reset date (first day of next month)
            const now = new Date();
            const resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            const resetDateStr = resetDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

            const userMessage = [
              `❌ Monthly recall quota exceeded (${currentUsage}/${quotaLimit} used)`,
              ``,
              `You've reached the ${tier.toUpperCase()} tier limit of ${quotaLimit} recalls per month.`,
              ``,
              `🚀 Upgrade to PRO for unlimited recalls:`,
              `   ${upgradeUrl}`,
              ``,
              `📅 Your quota will reset on ${resetDateStr}`,
              ``,
              `For immediate access, please upgrade your subscription.`
            ].join('\n');

            throw new Error(userMessage);
          } catch (parseError) {
            // If JSON parsing fails, fall back to generic quota message
            throw new Error(`Monthly recall quota exceeded. Upgrade to PRO for unlimited recalls:\nhttps://app.purmemo.ai/dashboard/plans`);
          }
        }

        throw new Error(`API Error ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      structuredLog.info('API call successful', {
        request_id: requestId,
        endpoint,
        response_keys: Object.keys(data).length,
        response_size_bytes: JSON.stringify(data).length
      });

      return data;

    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        structuredLog.error('API request timeout', {
          request_id: requestId,
          endpoint,
          timeout_ms: 30000
        });
        throw new Error('Request timeout after 30 seconds');
      }

      structuredLog.error('API call exception', {
        request_id: requestId,
        endpoint,
        error_name: error.constructor.name,
        error_message: error.message
      });

      throw error;
    }
  });
}

function extractContentMetadata(content) {
  const metadata = {
    characterCount: content.length,
    wordCount: content.split(/\s+/).length,
    hasCodeBlocks: false,
    codeBlockCount: 0,
    hasArtifacts: false,
    artifactCount: 0,
    hasUrls: false,
    urlCount: 0,
    hasFilePaths: false,
    filePathCount: 0,
    conversationTurns: 0
  };

  // Count code blocks
  const codeMatches = content.match(/```[\s\S]*?```/g);
  if (codeMatches) {
    metadata.hasCodeBlocks = true;
    metadata.codeBlockCount = codeMatches.length;
  }

  // Count conversation turns (USER:/ASSISTANT: patterns)
  const turnMatches = content.match(/(USER|ASSISTANT):/g);
  if (turnMatches) {
    metadata.conversationTurns = turnMatches.length;
  }

  // Count URLs
  const urlMatches = content.match(/https?:\/\/[^\s]+/g);
  if (urlMatches) {
    metadata.hasUrls = true;
    metadata.urlCount = urlMatches.length;
  }

  // Count file paths
  const pathMatches = content.match(/[\/~][\w\-.\/]+\.\w+/g);
  if (pathMatches) {
    metadata.hasFilePaths = true;
    metadata.filePathCount = pathMatches.length;
  }

  // Check for artifacts section
  if (content.includes('=== ARTIFACTS ===') || content.includes('ARTIFACT:')) {
    metadata.hasArtifacts = true;
    // Rough count of artifacts
    const artifactSections = content.match(/ARTIFACT:|=== ARTIFACTS ===/g);
    metadata.artifactCount = artifactSections ? artifactSections.length : 1;
  }

  return metadata;
}

function shouldChunk(content) {
  // Auto-chunk if content is over 15K characters
  return content.length > 15000;
}

function chunkContent(content, maxChunkSize = 20000) {
  const chunks = [];
  let currentPos = 0;

  while (currentPos < content.length) {
    let chunkEnd = Math.min(currentPos + maxChunkSize, content.length);

    // Try to break at natural boundaries (paragraph, section, etc.)
    if (chunkEnd < content.length) {
      // Look for good break points within the last 1000 chars of the chunk
      const searchStart = Math.max(chunkEnd - 1000, currentPos);
      const segment = content.slice(searchStart, chunkEnd);

      // Try to break at section markers first
      const sectionBreak = segment.lastIndexOf('\n===');
      if (sectionBreak !== -1) {
        chunkEnd = searchStart + sectionBreak;
      } else {
        // Try to break at conversation turns
        const conversationBreak = segment.lastIndexOf('\nUSER:');
        if (conversationBreak !== -1) {
          chunkEnd = searchStart + conversationBreak;
        } else {
          // Break at paragraph
          const paragraphBreak = segment.lastIndexOf('\n\n');
          if (paragraphBreak !== -1) {
            chunkEnd = searchStart + paragraphBreak;
          }
        }
      }
    }

    const chunk = content.slice(currentPos, chunkEnd);
    chunks.push(chunk);
    currentPos = chunkEnd;
  }

  return chunks;
}

async function saveChunkedContent(content, title, tags = [], metadata = {}) {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const chunks = chunkContent(content);
  const totalParts = chunks.length;

  structuredLog.info('Saving chunked content', {
    session_id: sessionId,
    total_chars: content.length,
    total_parts: totalParts
  });

  const savedParts = [];

  // Save each chunk
  for (let i = 0; i < chunks.length; i++) {
    const partNumber = i + 1;
    const chunk = chunks[i];

    const partData = await makeApiCall('/api/v1/memories/', {
      method: 'POST',
      body: JSON.stringify({
        content: chunk,
        title: `${title} - Part ${partNumber}/${totalParts}`,
        tags: [...tags, 'chunked-conversation', `session:${sessionId}`],
        platform: PLATFORM,
        conversation_id: `${sessionId}-part-${partNumber}`,
        metadata: {
          ...metadata,
          captureType: 'chunked',
          sessionId,
          partNumber,
          totalParts,
          chunkSize: chunk.length,
          isComplete: false
        }
      })
    });

    savedParts.push({
      partNumber,
      memoryId: partData.id || partData.memory_id,
      size: chunk.length
    });

    structuredLog.debug('Chunk saved', {
      session_id: sessionId,
      part_number: partNumber,
      total_parts: totalParts,
      chunk_size: chunk.length,
      memory_id: partData.id || partData.memory_id
    });
  }

  // Create index memory
  const indexContent = `# ${title} - Complete Capture Index\n\n## Capture Summary\n- Total Parts: ${totalParts}\n- Total Size: ${content.length} characters\n- Session ID: ${sessionId}\n- Saved: ${new Date().toISOString()}\n\n## Parts Overview\n${savedParts.map(p => `- Part ${p.partNumber}: ${p.size} chars [${p.memoryId}]`).join('\n')}\n\n## Metadata\n${JSON.stringify(metadata, null, 2)}\n\n## Full Content Access\nUse recall_memories with session:${sessionId} to find all parts, or use get_memory_details with any part ID.`;

  const indexData = await makeApiCall('/api/v1/memories/', {
    method: 'POST',
    body: JSON.stringify({
      content: indexContent,
      title: `${title} - Index`,
      tags: [...tags, 'chunked-index', `session:${sessionId}`],
      platform: PLATFORM,
      conversation_id: `${sessionId}-index`,
      metadata: {
        ...metadata,
        captureType: 'chunked-index',
        sessionId,
        totalParts,
        totalSize: content.length,
        partIds: savedParts.map(p => p.memoryId),
        isComplete: true
      }
    })
  });

  structuredLog.info('Chunked content save complete', {
    session_id: sessionId,
    total_parts: totalParts,
    index_memory_id: indexData.id || indexData.memory_id
  });

  return {
    sessionId,
    totalParts,
    totalSize: content.length,
    indexId: indexData.id || indexData.memory_id,
    parts: savedParts
  };
}

async function saveSingleContent(content, title, tags = [], metadata = {}) {
  structuredLog.debug('Saving single content', {
    char_count: content.length,
    title
  });

  const data = await makeApiCall('/api/v1/memories/', {
    method: 'POST',
    body: JSON.stringify({
      content,
      title,
      tags: [...tags, 'complete-conversation'],
      platform: PLATFORM,
      conversation_id: metadata.conversationId || null,
      session_id: readCurrentSessionId(),  // Layer 0 coordination: links manual save to current Claude Code session
      metadata: {
        ...metadata,
        captureType: 'single',
        isComplete: true
      }
    })
  });

  structuredLog.info('Single content saved', {
    memory_id: data.id || data.memory_id,
    char_count: content.length
  });

  return {
    memoryId: data.id || data.memory_id,
    size: content.length,
    wisdomSuggestion: data.wisdom_suggestion || null
  };
}

// PHASE 16.3: Helper to format wisdom suggestions
function formatWisdomSuggestion(wisdomSuggestion) {
  if (!wisdomSuggestion) return '';

  const { tool, reason, confidence, url, best_for, context_prompt } = wisdomSuggestion;

  return `\n\n` +
    `🧠 WISDOM SUGGESTION (Phase 16.3):\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `✨ Recommended Next Tool: ${tool.toUpperCase()}\n` +
    `📊 Confidence: ${(confidence * 100).toFixed(0)}%\n` +
    `💡 Why: ${reason}\n` +
    `🔗 URL: ${url}\n\n` +
    `📋 Best For: ${best_for.join(', ')}\n\n` +
    `💬 Ready-to-use prompt:\n` +
    `${context_prompt.split('\n').slice(0, 8).join('\n')}\n` +
    `   [...see full prompt in ${tool}]\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🎯 Click the URL above to continue your workflow in ${tool}!\n`;
}

// Tool handlers
async function handleSaveConversation(args) {
  const toolName = 'save_conversation';
  const requestId = `${toolName}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const startTime = Date.now();

  structuredLog.info(`${toolName}: starting`, {
    tool_name: toolName,
    request_id: requestId
  });

  try {
    const rawContent = args.conversationContent || '';
    const content = sanitizeUnicode(rawContent);
    const contentLength = content.length;

    structuredLog.debug('Extracting intelligent context', {
      request_id: requestId,
      content_length: contentLength
    });

    const intelligentContext = extractProjectContext(content);

    let title = args.title;
    if (!title || title.startsWith('Conversation 202')) {
      title = generateIntelligentTitle(intelligentContext, content);
      structuredLog.debug('Generated intelligent title', {
        request_id: requestId,
        title
      });
    }

    const progressIndicators = extractProgressIndicators(content);
    const relationships = extractRelationships(content);

    const tags = args.tags || ['complete-conversation'];

    let conversationId = args.conversationId;
    if (!conversationId && title && !title.startsWith('Conversation 202')) {
      conversationId = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 100);

      structuredLog.debug('Generated conversation ID from title', {
        request_id: requestId,
        conversation_id: conversationId
      });
    }

    if (contentLength < 100) {
      structuredLog.warn('Insufficient content detected', {
        request_id: requestId,
        content_length: contentLength
      });

      return {
        content: [{
          type: 'text',
          text: `❌ INSUFFICIENT CONTENT DETECTED!\n\n` +
                `You provided only ${contentLength} characters.\n` +
                `This tool requires the COMPLETE conversation content.\n\n` +
                `What you sent: "${content.substring(0, 100)}..."\n\n` +
                `REQUIREMENTS:\n` +
                `- Include ALL user messages verbatim\n` +
                `- Include ALL assistant responses completely\n` +
                `- Include ALL code blocks and artifacts\n` +
                `- Minimum 500 characters expected for real conversations\n\n` +
                `Please retry with the FULL conversation content.`
        }]
      };
    }

    if (contentLength < 500 && !content.includes('USER:') && !content.includes('ASSISTANT:')) {
      structuredLog.warn('Possible summary detected', {
        request_id: requestId,
        content_length: contentLength
      });

      return {
        content: [{
          type: 'text',
          text: `⚠️ POSSIBLE SUMMARY DETECTED!\n\n` +
                `Content: "${content}"\n\n` +
                `This appears to be a summary rather than the full conversation.\n` +
                `Please include the complete conversation with:\n` +
                `- USER: [exact messages]\n` +
                `- ASSISTANT: [exact responses]\n` +
                `- All code blocks and artifacts\n\n` +
                `Or confirm this is the complete content by adding more context.`
        }]
      };
    }

    const metadata = extractContentMetadata(content);

    if (conversationId) {
      try {
        const params = new URLSearchParams({
          conversation_id: conversationId,
          platform: PLATFORM,
          page_size: '1'
        });

        const searchResponse = await makeApiCall(`/api/v1/memories/?${params}`, {
          method: 'GET'
        });

        const existingMemories = searchResponse.results || [];

        if (existingMemories.length > 0) {
          const existingMemory = existingMemories[0];
          const memoryId = existingMemory.id;

          structuredLog.debug('Found existing memory for living document update', {
            request_id: requestId,
            memory_id: memoryId,
            conversation_id: conversationId
          });

          const updateMetadata = {
            ...metadata,
            captureType: shouldChunk(content) ? 'chunked' : 'single',
            isComplete: true,
            lastUpdated: new Date().toISOString(),
            intelligent: {
              ...intelligentContext,
              progress_indicators: progressIndicators,
              ...relationships
            }
          };

          // Identity Layer: attach session context to living document updates
          try {
            const sessionResp = await makeApiCall(`/api/v1/identity/session?platform=${encodeURIComponent(PLATFORM)}`);
            const sess = sessionResp.session || {};
            if (sess.id || sess.context || sess.project) {
              updateMetadata.session_context = {
                session_id: sess.id,
                project: sess.project,
                context: sess.context,
                focus: sess.focus,
                platform: PLATFORM
              };
              structuredLog.debug('Attached session context to living document update', { project: sess.project });
            }
          } catch (sessionErr) {
            structuredLog.warn('Could not fetch session context for update (non-fatal)', { error_message: sessionErr.message });
          }

          const updateResponse = await makeApiCall(`/api/v1/memories/${memoryId}/`, {
            method: 'PATCH',
            body: JSON.stringify({
              content: content,
              title: title,
              tags: tags,
              metadata: updateMetadata
            })
          });

          const isAutoGenerated = !args.conversationId && conversationId;
          const wisdomSuggestion = updateResponse.wisdom_suggestion || null;

          structuredLog.info(`${toolName}: completed`, {
            tool_name: toolName,
            request_id: requestId,
            duration_ms: Date.now() - startTime,
            action: 'updated',
            memory_id: memoryId,
            char_count: content.length
          });

          return {
            content: [{
              type: 'text',
              text: `✅ CONVERSATION UPDATED (Living Document)!\n\n` +
                    `📝 Conversation ID: ${conversationId}` + (isAutoGenerated ? ' (auto-generated from title)\n' : '\n') +
                    `📏 New size: ${content.length} characters\n` +
                    `🔗 Memory ID: ${memoryId}\n\n` +
                    `📊 Content Analysis:\n` +
                    `- Conversation turns: ${metadata.conversationTurns}\n` +
                    `- Code blocks: ${metadata.codeBlockCount}\n` +
                    `- Artifacts: ${metadata.artifactCount}\n` +
                    `- URLs: ${metadata.urlCount}\n\n` +
                    (isAutoGenerated ? `💡 Auto-living document: Saves with title "${title}" will update this memory\n` : '') +
                    `✓ Updated existing memory (not duplicated)!` +
                    formatWisdomSuggestion(wisdomSuggestion)
            }]
          };
        } else {
          structuredLog.debug('No existing memory found, will create new', {
            request_id: requestId,
            conversation_id: conversationId
          });
        }
      } catch (error) {
        structuredLog.warn('Error checking for existing memory', {
          request_id: requestId,
          error_message: error.message
        });
      }
    }

    metadata.conversationId = conversationId;

    metadata.intelligent = {
      ...intelligentContext,
      progress_indicators: progressIndicators,
      ...relationships
    };

    // Identity Layer: attach session context to new memories
    try {
      const sessionResp = await makeApiCall(`/api/v1/identity/session?platform=${encodeURIComponent(PLATFORM)}`);
      const sess = sessionResp.session || {};
      if (sess.id || sess.context || sess.project) {
        metadata.session_context = {
          session_id: sess.id,
          project: sess.project,
          context: sess.context,
          focus: sess.focus,
          platform: PLATFORM
        };
        structuredLog.debug('Attached session context to memory', { project: sess.project });
      }
    } catch (sessionErr) {
      // Non-fatal — save proceeds without session context
      structuredLog.warn('Could not fetch session context (non-fatal)', { error_message: sessionErr.message });
    }

    if (shouldChunk(content)) {
      const result = await saveChunkedContent(content, title, tags, metadata);
      const isAutoGenerated = !args.conversationId && conversationId;

      structuredLog.info(`${toolName}: completed`, {
        tool_name: toolName,
        request_id: requestId,
        duration_ms: Date.now() - startTime,
        action: 'chunked',
        session_id: result.sessionId,
        total_parts: result.totalParts,
        char_count: result.totalSize
      });

      return {
        content: [{
          type: 'text',
          text: `✅ LARGE CONVERSATION SAVED (Auto-chunked)!\n\n` +
                (conversationId ? `📝 Conversation ID: ${conversationId}` + (isAutoGenerated ? ' (auto-generated from title)\n' : '\n') : '') +
                `📏 Total size: ${result.totalSize} characters\n` +
                `📦 Saved as: ${result.totalParts} linked parts\n` +
                `🔗 Session ID: ${result.sessionId}\n` +
                `📋 Index ID: ${result.indexId}\n\n` +
                `📊 Content Analysis:\n` +
                `- Conversation turns: ${metadata.conversationTurns}\n` +
                `- Code blocks: ${metadata.codeBlockCount}\n` +
                `- Artifacts: ${metadata.artifactCount}\n` +
                `- URLs: ${metadata.urlCount}\n` +
                `- File paths: ${metadata.filePathCount}\n\n` +
                (conversationId && isAutoGenerated ? `💡 Auto-living document: Next save with title "${title}" will UPDATE this memory\n` : '') +
                (conversationId && !isAutoGenerated ? `✓ Use conversation ID "${conversationId}" to update this later!\n` : '') +
                `✓ Complete conversation preserved with all context!`
        }]
      };
    } else {
      const result = await saveSingleContent(content, title, tags, metadata);
      const isAutoGenerated = !args.conversationId && conversationId;

      structuredLog.info(`${toolName}: completed`, {
        tool_name: toolName,
        request_id: requestId,
        duration_ms: Date.now() - startTime,
        action: 'created',
        memory_id: result.memoryId,
        char_count: result.size
      });

      return {
        content: [{
          type: 'text',
          text: `✅ CONVERSATION SAVED!\n\n` +
                (conversationId ? `📝 Conversation ID: ${conversationId}` + (isAutoGenerated ? ' (auto-generated from title)\n' : '\n') : '') +
                `📏 Size: ${result.size} characters\n` +
                `🔗 Memory ID: ${result.memoryId}\n\n` +
                `📊 Content Analysis:\n` +
                `- Conversation turns: ${metadata.conversationTurns}\n` +
                `- Code blocks: ${metadata.codeBlockCount}\n` +
                `- Artifacts: ${metadata.artifactCount}\n` +
                `- URLs: ${metadata.urlCount}\n` +
                `- File paths: ${metadata.filePathCount}\n\n` +
                (conversationId && isAutoGenerated ? `💡 Auto-living document: Next save with title "${title}" will UPDATE this memory\n` : '') +
                (conversationId && !isAutoGenerated ? `✓ Use conversation ID "${conversationId}" to update this later!\n` : '') +
                `✓ Complete conversation preserved!` +
                formatWisdomSuggestion(result.wisdomSuggestion)
        }]
      };
    }

  } catch (error) {
    const errorMsg = safeErrorMessage(error);

    structuredLog.error(`${toolName}: failed`, {
      tool_name: toolName,
      request_id: requestId,
      duration_ms: Date.now() - startTime,
      error_message: error.message,
      error_type: error.constructor.name
    });

    return {
      content: [{
        type: 'text',
        text: `❌ Save Error: ${errorMsg}\n\nPlease try again or contact support if the issue persists.`
      }]
    };
  }
}

async function handleDiscoverRelated(args) {
  const toolName = 'discover_related_conversations';
  const requestId = `${toolName}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const startTime = Date.now();

  structuredLog.info(`${toolName}: starting`, {
    tool_name: toolName,
    request_id: requestId
  });

  try {
    const safeQuery = sanitizeUnicode(args.query || '');

    const data = await makeApiCall(`/api/v10/mcp/tools/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tool: 'discover_related_conversations',
        arguments: {
          query: args.query,
          limit: parseInt(args.limit) || 10,
          relatedPerMemory: parseInt(args.relatedPerMemory) || 5
        }
      })
    });

    if (!data.content || !data.content[0] || !data.content[0].text) {
      structuredLog.warn(`${toolName}: no results found`, {
        tool_name: toolName,
        request_id: requestId,
        query: safeQuery
      });

      return {
        content: [{
          type: 'text',
          text: `🔍 No related conversations found for "${safeQuery}"\n\nTry different keywords or check if conversations were saved successfully.`
        }]
      };
    }

    const responseText = data.content[0].text;
    const finalSanitizedText = sanitizeUnicode(responseText);

    structuredLog.info(`${toolName}: completed`, {
      tool_name: toolName,
      request_id: requestId,
      duration_ms: Date.now() - startTime,
      response_size: finalSanitizedText.length
    });

    return {
      content: [{ type: 'text', text: finalSanitizedText }]
    };

  } catch (error) {
    const errorMsg = safeErrorMessage(error);

    structuredLog.error(`${toolName}: failed`, {
      tool_name: toolName,
      request_id: requestId,
      duration_ms: Date.now() - startTime,
      error_message: error.message,
      error_type: error.constructor.name
    });

    if (error.message && error.message.includes('429')) {
      return {
        content: [{
          type: 'text',
          text: `⚠️ Monthly recall quota exceeded.\n\n${errorMsg}\n\nNote: 'discover_related_conversations' shares the same quota pool as 'recall_memories'.`
        }]
      };
    }

    return {
      content: [{
        type: 'text',
        text: `❌ Discovery Error: ${errorMsg}\n\nThis could be due to:\n- Monthly quota limit reached (check with your API provider)\n- Network connectivity issues\n- API endpoint changes\n\nTry using 'recall_memories' for basic search, or upgrade to PRO for unlimited recalls.`
      }]
    };
  }
}

async function handleRecallMemories(args) {
  const toolName = 'recall_memories';
  const requestId = `${toolName}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const startTime = Date.now();

  structuredLog.info(`${toolName}: starting`, {
    tool_name: toolName,
    request_id: requestId
  });

  try {
    const safeQuery = sanitizeUnicode(args.query || '');

    const data = await makeApiCall(`/api/v10/mcp/tools/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tool: 'recall_memories',
        arguments: {
          query: args.query,
          limit: parseInt(args.limit) || 10,
          entity: args.entity,
          initiative: args.initiative,
          stakeholder: args.stakeholder,
          deadline: args.deadline,
          intent: args.intent,
          has_observations: args.has_observations
        }
      })
    });

    if (!data.content || !data.content[0] || !data.content[0].text) {
      structuredLog.warn(`${toolName}: no results found`, {
        tool_name: toolName,
        request_id: requestId,
        query: safeQuery
      });

      return {
        content: [{
          type: 'text',
          text: `🔍 No memories found for "${safeQuery}"\n\nTry different keywords or check if the conversation was saved successfully.`
        }]
      };
    }

    const responseText = data.content[0].text;

    const memoryBlocks = responseText.split('\n\n').filter(block => block.trim().startsWith('**') && block.includes('ID:'));

    if (memoryBlocks.length === 0) {
      structuredLog.info(`${toolName}: completed`, {
        tool_name: toolName,
        request_id: requestId,
        duration_ms: Date.now() - startTime,
        results_count: 0
      });

      return {
        content: [{ type: 'text', text: sanitizeUnicode(responseText) }]
      };
    }

    let resultText = `🔍 Found ${memoryBlocks.length} memories for "${safeQuery}" (ranked by relevance)\n\n`;

    memoryBlocks.forEach((block, index) => {
      const titleMatch = block.match(/\*\*(.+?)\*\*/);
      const relevanceMatch = block.match(/Relevance Score: ([\d.]+)/) || block.match(/Relevance: ([\d.]+)%/);
      const idMatch = block.match(/ID: (.+)/);
      const platformMatch = block.match(/Platform: (\w+)/);
      const previewMatch = block.match(/Preview: (.+)/);

      const title = titleMatch ? titleMatch[1] : 'Untitled';
      const relevance = relevanceMatch ? relevanceMatch[1] : '?';
      const memoryId = idMatch ? idMatch[1].trim() : 'unknown';
      const platform = platformMatch ? platformMatch[1] : 'unknown';
      const preview = previewMatch ? previewMatch[1] : '';

      const emoji = platform === 'chatgpt' ? '🤖' :
                     platform === 'claude' ? '🟣' :
                     platform === 'gemini' ? '💎' : '❓';

      resultText += `${index + 1}. ${emoji} **${sanitizeUnicode(title)}**\n`;
      resultText += `   🎯 Relevance: ${relevance}%\n`;
      resultText += `   🌍 Platform: ${platform}\n`;

      if (preview) {
        resultText += `   📝 Preview: ${sanitizeUnicode(preview.substring(0, 150))}...\n`;
      }
      resultText += `   🔗 ID: ${memoryId}\n\n`;
    });

    resultText += `${'─'.repeat(60)}\n\n`;
    resultText += `💡 **Discover More:**\n`;
    resultText += `Use 'discover_related_conversations' with your query to find related\n`;
    resultText += `conversations across ALL platforms (ChatGPT, Claude, Gemini).\n`;
    resultText += `Automatically grouped by AI-organized semantic clusters!\n`;

    const finalSanitizedText = sanitizeUnicode(resultText);

    structuredLog.info(`${toolName}: completed`, {
      tool_name: toolName,
      request_id: requestId,
      duration_ms: Date.now() - startTime,
      results_count: memoryBlocks.length,
      response_size: finalSanitizedText.length
    });

    return {
      content: [{ type: 'text', text: finalSanitizedText }]
    };

  } catch (error) {
    const errorMsg = safeErrorMessage(error);

    structuredLog.error(`${toolName}: failed`, {
      tool_name: toolName,
      request_id: requestId,
      duration_ms: Date.now() - startTime,
      error_message: error.message,
      error_type: error.constructor.name
    });

    return {
      content: [{
        type: 'text',
        text: `❌ Recall Error: ${errorMsg}`
      }]
    };
  }
}

async function handleGetMemoryDetails(args) {
  const toolName = 'get_memory_details';
  const requestId = `${toolName}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const startTime = Date.now();

  structuredLog.info(`${toolName}: starting`, {
    tool_name: toolName,
    request_id: requestId,
    memory_id: args.memoryId,
    include_linked_parts: args.includeLinkedParts
  });

  try {
    const data = await makeApiCall(`/api/v10/mcp/tools/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tool: 'get_memory_details',
        arguments: {
          memoryId: args.memoryId,
          includeLinkedParts: args.includeLinkedParts !== false
        }
      })
    });

    if (!data.content || !data.content[0] || !data.content[0].text) {
      structuredLog.warn(`${toolName}: no content in response`, {
        tool_name: toolName,
        request_id: requestId,
        memory_id: args.memoryId
      });

      return {
        content: [{
          type: 'text',
          text: `❌ Memory not found or invalid response\n\nMemory ID: ${args.memoryId}`
        }]
      };
    }

    const responseText = data.content[0].text;
    const sanitizedText = sanitizeUnicode(responseText);

    structuredLog.info(`${toolName}: completed`, {
      tool_name: toolName,
      request_id: requestId,
      duration_ms: Date.now() - startTime,
      memory_id: args.memoryId,
      response_size: sanitizedText.length
    });

    return {
      content: [{ type: 'text', text: sanitizedText }]
    };

  } catch (error) {
    const errorMsg = safeErrorMessage(error);

    structuredLog.error(`${toolName}: failed`, {
      tool_name: toolName,
      request_id: requestId,
      duration_ms: Date.now() - startTime,
      memory_id: args.memoryId,
      error_message: error.message,
      error_type: error.constructor.name
    });

    return {
      content: [{
        type: 'text',
        text: `❌ Error retrieving memory: ${errorMsg}\n\nMemory ID: ${args.memoryId}\n\nCheck logs for full details.`
      }]
    };
  }
}

// ============================================================================
// IDENTITY LAYER HANDLERS
// ============================================================================

async function handleGetUserContext(args) {
  structuredLog.info('get_user_context: called', { platform: PLATFORM });

  try {
    // Fetch identity, session context, and recent memories in parallel
    const [identityResponse, sessionResponse, recentResponse] = await Promise.allSettled([
      makeApiCall('/api/v1/auth/me'),
      makeApiCall('/api/v1/identity/session'),
      makeApiCall('/api/v1/memories/?limit=20&sort=created_at&order=desc&include_source_types=desktop_clipboard,manual,chrome_extension', { method: 'GET' })
    ]);

    // Extract identity from /me response
    let identity = {};
    let userEmail = null;
    if (identityResponse.status === 'fulfilled') {
      const me = identityResponse.value;
      identity = me.identity || {};
      userEmail = me.email;
      structuredLog.debug('Identity loaded', { email: userEmail });
    } else {
      structuredLog.warn('Identity fetch failed', { error_message: String(identityResponse.reason) });
    }

    // Extract session context
    let session = {};
    if (sessionResponse.status === 'fulfilled') {
      session = sessionResponse.value.session || {};
      structuredLog.debug('Session loaded', { project: session.project, context: session.context });
    } else {
      structuredLog.warn('Session fetch failed', { error_message: String(sessionResponse.reason) });
    }

    // Build memory summary — frequency-weighted across 20 recent memories
    // Projects with ≥2 occurrences are genuinely active; single saves are noise
    let memorySummary = null;
    if (recentResponse.status === 'fulfilled') {
      const data = recentResponse.value;
      const memories = Array.isArray(data) ? data : (data.memories || []);
      if (memories.length > 0) {
        const projectCounts = {};
        const projectLatestTitle = {};
        for (const m of memories) {
          const proj = (m.project_name || '').trim();
          const title = (m.title || '').trim();
          if (!proj || !title) continue;
          projectCounts[proj] = (projectCounts[proj] || 0) + 1;
          if (!projectLatestTitle[proj]) projectLatestTitle[proj] = title;
        }
        // Only projects appearing ≥2 times, sorted by count desc
        const ranked = Object.entries(projectCounts)
          .filter(([, count]) => count >= 2)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);
        if (ranked.length > 0) {
          const parts = ranked.map(([proj]) => {
            const latest = projectLatestTitle[proj] || '';
            return latest ? `${proj} — ${latest}` : proj;
          });
          memorySummary = 'Recently working on: ' + parts.join('; ') + '.';
        }
        structuredLog.debug('Recent memories loaded', { count: memories.length, ranked_projects: ranked.length });
      }
    } else {
      structuredLog.warn('Recent memories fetch failed', { error_message: String(recentResponse.reason) });
    }

    // Build output text
    const hasIdentity = identity.role || (identity.expertise && identity.expertise.length > 0);
    const hasSession = session.context || session.project || session.focus;

    let output = `🧠 User Context for ${userEmail || 'this user'}\n\n`;

    output += `👤 Identity Profile\n`;
    if (identity.role) output += `   Role: ${identity.role}\n`;
    if (identity.primary_domain) output += `   Domain: ${identity.primary_domain}\n`;
    if (identity.work_style) output += `   Work style: ${identity.work_style}\n`;
    if (identity.expertise && identity.expertise.length > 0) {
      output += `   Expertise: ${identity.expertise.join(', ')}\n`;
    }
    if (identity.tools && identity.tools.length > 0) {
      output += `   Tools: ${identity.tools.join(', ')}\n`;
    }
    if (!hasIdentity) {
      output += `   (No identity profile set — user can configure at app.purmemo.ai/dashboard)\n`;
    }

    const autoTag = session.auto ? ' • auto' : '';
    output += `\n🎯 Current Session (${PLATFORM}${autoTag})\n`;
    if (session.project) output += `   Project: ${session.project}\n`;
    if (session.context) output += `   Working on: ${session.context}\n`;
    if (session.focus) output += `   Focus: ${session.focus}\n`;
    if (session.updated_at) output += `   Last updated: ${session.updated_at}\n`;
    if (!hasSession) {
      output += `   (No active session context — user can set "What are you working on?" in the dashboard)\n`;
    }

    output += `\n📚 Recent Memory Themes\n`;
    if (memorySummary) {
      output += `   ${memorySummary}\n`;
    } else {
      output += `   (No recent memories found)\n`;
    }

    output += `\n💡 How to use this context:\n`;
    output += `   - Address the user by their role and domain (not generically)\n`;
    output += `   - Assume their current project context without them having to repeat it\n`;
    output += `   - Tailor your responses to their expertise level and work style\n`;
    output += `   - Ask targeted follow-ups based on their focus area\n`;

    return {
      content: [{ type: 'text', text: output }]
    };

  } catch (error) {
    structuredLog.error('get_user_context: failed', { error_message: error.message });
    return {
      content: [{
        type: 'text',
        text: `❌ Failed to load user context: ${error.message}\n\nMake sure your Purmemo API key is configured.`
      }]
    };
  }
}

// ============================================================================
// WORKFLOW ENGINE HANDLERS
// ============================================================================

async function handleRunWorkflow(args) {
  const toolName = 'run_workflow';
  const requestId = `${toolName}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const startTime = Date.now();

  structuredLog.info(`${toolName}: starting`, {
    tool_name: toolName,
    request_id: requestId,
    workflow: args.workflow || 'auto-route',
    input_length: (args.input || '').length
  });

  try {
    const input = sanitizeUnicode(args.input || '');

    // Resolve which workflow to run
    let workflowName = args.workflow;
    let routeChain = [];
    let routeConfidence = 'direct';

    if (!workflowName) {
      // Auto-route from input
      const classified = classifyWorkflowIntent(input);
      workflowName = classified.workflow;
      routeChain = classified.chain;
      routeConfidence = classified.confidence;

      structuredLog.info(`${toolName}: auto-routed`, {
        request_id: requestId,
        routed_to: workflowName,
        confidence: routeConfidence
      });
    }

    // Resolve template: check hardcoded first, then database for user-created workflows
    let template = workflowName ? WORKFLOW_TEMPLATES[workflowName] : null;

    if (!workflowName) {
      // Could not route — return the catalog
      const catalogLines = Object.values(WORKFLOW_TEMPLATES)
        .map(wf => `  ${wf.name.padEnd(12)} — ${wf.description}`)
        .join('\n');

      return {
        content: [{
          type: 'text',
          text: `I couldn't determine which workflow to run from your input.\n\n` +
                `📋 Available workflows:\n${catalogLines}\n\n` +
                `Try again with a specific workflow name, or describe your goal more specifically.\n` +
                `Example: run_workflow(workflow="prd", input="auth feature")`
        }]
      };
    }

    // If workflow not in hardcoded templates, it might be a user-created workflow
    // Check the database for it
    if (!template) {
      try {
        const userConfig = await makeApiCall(`/api/v1/workflow-dashboard/${workflowName}/user-config`);
        if (userConfig?.has_custom && userConfig?.prompt) {
          template = {
            name: workflowName,
            display_name: workflowName,
            description: '',
            memory_queries: ['[INPUT]'],
            route_chain: [],
            prompt: userConfig.prompt
          };
          structuredLog.info(`${toolName}: using user-created workflow`, {
            request_id: requestId,
            workflow: workflowName
          });
        }
      } catch {
        // Database unavailable — workflow not found
      }
    }

    if (!template) {
      return {
        content: [{
          type: 'text',
          text: `Unknown workflow: "${workflowName}". Use list_workflows to see available options.`
        }]
      };
    }

    // Check if the user has a custom prompt for this workflow (edits from dashboard)
    // User's custom prompt always wins over hardcoded default
    let workflowPrompt = template.prompt;
    try {
      const userConfig = await makeApiCall(`/api/v1/workflow-dashboard/${workflowName}/user-config`);
      if (userConfig?.has_custom && userConfig?.prompt) {
        workflowPrompt = userConfig.prompt;
        structuredLog.info(`${toolName}: using user's custom prompt`, {
          request_id: requestId,
          workflow: workflowName
        });
      }
    } catch {
      // Database unavailable — use hardcoded default
    }

    // Pre-load memories and identity in parallel
    const memoryQueries = buildMemoryQueries(template, input);

    const [identityResult, ...memoryResults] = await Promise.allSettled([
      // Identity
      (async () => {
        try {
          const [meResponse, sessionResponse] = await Promise.allSettled([
            makeApiCall('/api/v1/auth/me'),
            makeApiCall('/api/v1/identity/session')
          ]);
          const me = meResponse.status === 'fulfilled' ? meResponse.value : {};
          const session = sessionResponse.status === 'fulfilled' ? sessionResponse.value : {};
          const identity = me.identity || {};
          return {
            email: me.email || 'unknown',
            role: identity.role || '',
            expertise: (identity.expertise || []).join(', '),
            domain: identity.primary_domain || '',
            project: (session.session || {}).project || '',
            focus: (session.session || {}).focus || ''
          };
        } catch { return null; }
      })(),
      // Memories (one call per query)
      ...memoryQueries.map(async (query) => {
        try {
          const data = await makeApiCall('/api/v10/mcp/tools/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tool: 'recall_memories',
              arguments: { query, limit: 3 }
            })
          });
          if (data.content && data.content[0] && data.content[0].text) {
            // Trim each memory result to prevent context overflow
            return data.content[0].text.substring(0, 1500);
          }
          return null;
        } catch { return null; }
      })
    ]);

    // Assemble the identity context
    let identityBlock = '';
    if (identityResult.status === 'fulfilled' && identityResult.value) {
      const id = identityResult.value;
      const parts = [];
      if (id.role) parts.push(`Role: ${id.role}`);
      if (id.expertise) parts.push(`Expertise: ${id.expertise}`);
      if (id.domain) parts.push(`Domain: ${id.domain}`);
      if (id.project) parts.push(`Current project: ${id.project}`);
      if (id.focus) parts.push(`Current focus: ${id.focus}`);
      if (parts.length > 0) {
        identityBlock = `## Your Context (User Identity)\n${parts.join('\n')}\n`;
      }
    }

    // Assemble the memory context with transparency
    const memoryTexts = memoryResults
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value);

    // Build transparency block — shows users exactly what memories are being used
    let transparencyBlock = '';
    if (memoryTexts.length > 0) {
      transparencyBlock = `## ⚡ Memories Powering This Workflow\n`;
      transparencyBlock += `The following memories were automatically pre-loaded from your vault to personalize this workflow.\n`;
      transparencyBlock += `Review them before reading the output — if any are outdated or irrelevant, tell the AI to disregard them.\n\n`;
      transparencyBlock += memoryTexts.join('\n\n---\n\n');
      transparencyBlock += `\n\n---\n`;
      transparencyBlock += `💡 **Memory quality feedback:** If any memory above is wrong, outdated, or irrelevant to this task, say so and the workflow will adapt. Your feedback helps improve future workflows.\n`;
    } else {
      transparencyBlock = `## ⚡ Memories Powering This Workflow\nNo relevant memories found in your vault for this topic. This workflow is running without historical context — the output will be generic rather than personalized.\n`;
    }

    // Build the chain suggestion with numbered steps
    let chainBlock = '';
    const chain = routeChain.length > 0 ? routeChain : (template.route_chain || []);
    if (chain.length > 0) {
      const validChain = chain.filter(c => WORKFLOW_TEMPLATES[c]);
      if (validChain.length > 0) {
        const chainSteps = validChain
          .map((c, i) => `  ${i + 1}. run_workflow(workflow="${c}") — ${WORKFLOW_TEMPLATES[c].display_name}`)
          .join('\n');
        chainBlock = `\n## Next Steps\nReply with a number to proceed:\n${chainSteps}\n`;
      }
    }

    // Assemble the full response — transparency block FIRST so user sees context before output
    const assembled = [
      transparencyBlock,
      '',
      workflowPrompt,
      '',
      identityBlock,
      `## User Input\n${input}`,
      chainBlock,
      `\nNow execute the workflow above. Use the pre-loaded memories shown at the top for context. If the user flags any memory as irrelevant or outdated, disregard it. Adapt to the user's identity and input.`
    ].filter(Boolean).join('\n\n');

    structuredLog.info(`${toolName}: assembled`, {
      request_id: requestId,
      workflow: workflowName,
      route_confidence: routeConfidence,
      identity_loaded: !!identityBlock,
      memories_loaded: memoryTexts.length,
      assembled_length: assembled.length,
      duration_ms: Date.now() - startTime
    });

    return {
      content: [{
        type: 'text',
        text: assembled
      }]
    };

  } catch (error) {
    structuredLog.error(`${toolName}: error`, {
      request_id: requestId,
      error_message: error.message,
      duration_ms: Date.now() - startTime
    });

    return {
      content: [{
        type: 'text',
        text: `❌ Error running workflow: ${error.message}\n\nYou can still use this workflow by describing your task directly — the workflow template provides the structure, and your memories will be loaded when possible.`
      }]
    };
  }
}

async function handleListWorkflows(args) {
  const toolName = 'list_workflows';
  structuredLog.info(`${toolName}: called`, { category: args.category || 'all' });

  const workflows = Object.values(WORKFLOW_TEMPLATES);
  const filtered = args.category
    ? workflows.filter(wf => wf.category === args.category)
    : workflows;

  // Group by category
  const grouped = {};
  for (const wf of filtered) {
    const cat = wf.category;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(wf);
  }

  const categoryLabels = {
    product: '📦 Product',
    strategy: '🎯 Strategy',
    engineering: '🔧 Engineering',
    business: '📊 Business',
    operations: '⚙️ Operations',
    content: '✍️ Content'
  };

  let output = `🧠 Purmemo Workflows — Memory-powered processes\n`;
  output += `═══════════════════════════════════════════════\n\n`;
  output += `Each workflow automatically loads your relevant memories and identity.\n`;
  output += `Use: run_workflow(workflow="name", input="what you need")\n\n`;

  for (const [cat, label] of Object.entries(categoryLabels)) {
    if (!grouped[cat]) continue;
    output += `${label}\n`;
    for (const wf of grouped[cat]) {
      output += `  ${wf.name.padEnd(12)} — ${wf.description}\n`;
    }
    output += `\n`;
  }

  output += `Or just describe what you need:\n`;
  output += `  run_workflow(input="your goal here") → auto-routes to the right workflow\n`;

  return {
    content: [{
      type: 'text',
      text: output
    }]
  };
}

async function handleGetAcknowledgedErrors(args) {
  try {
    const limit = args.limit || 10;
    const levelFilter = args.level_filter || 'all';
    const minOccurrences = args.min_occurrences || 1;

    const response = await makeApiCall(
      `/api/v1/admin/acknowledged-errors?limit=${limit}&level_filter=${levelFilter}&min_occurrences=${minOccurrences}`,
      { method: 'GET' }
    );

    if (!response.acknowledged_errors || response.acknowledged_errors.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `✅ No acknowledged errors found!\n\nAll acknowledged errors have been investigated and resolved.`
        }]
      };
    }

    const errorList = response.acknowledged_errors.map((err, idx) => {
      let output = `\n${idx + 1}. **${err.level.toUpperCase()}** (ID: ${err.id})
   Message: ${err.message}
   Occurrences: ${err.occurrence_count}
   First Seen: ${err.first_seen_at}
   Last Seen: ${err.last_seen_at}
   Source: ${err.source}`;

      if (err.metadata) {
        if (err.metadata.exception_type) {
          output += `\n\n   🔍 EXCEPTION DETAILS:`;
          output += `\n   Type: ${err.metadata.exception_type}`;
          if (err.metadata.exception_message) {
            output += `\n   Message: ${err.metadata.exception_message}`;
          }
        }
        if (err.metadata.error_location) {
          const loc = err.metadata.error_location;
          output += `\n\n   📍 ERROR LOCATION:`;
          output += `\n   File: ${loc.file || loc.full_path}`;
          output += `\n   Line: ${loc.line}`;
          output += `\n   Function: ${loc.function}`;
          if (loc.code) output += `\n   Code: ${loc.code}`;
        }
        if (err.metadata.traceback_frames && err.metadata.traceback_frames.length > 0) {
          output += `\n\n   📚 STACK TRACE:`;
          const frames = err.metadata.traceback_frames.slice(-5);
          frames.forEach((frame, i) => {
            output += `\n   ${i + 1}. ${frame.file}:${frame.line} in ${frame.function}`;
            if (frame.code) output += `\n      ${frame.code}`;
          });
        }
        if (err.metadata.request_context) {
          const req = err.metadata.request_context;
          output += `\n\n   🌐 REQUEST CONTEXT:`;
          output += `\n   Endpoint: ${req.endpoint || req.path}`;
          output += `\n   Method: ${req.method}`;
          if (req.user) output += `\n   User: ${req.user}`;
        }
      }

      if (err.sample_log_ids && err.sample_log_ids.length > 0) {
        output += `\n\n   📝 Sample Logs: ${err.sample_log_ids.join(', ')}`;
      }

      if (err.similar_investigations && err.similar_investigations.length > 0) {
        output += `\n\n   🔄 SIMILAR PAST FIXES (${err.similar_investigations.length}):`;
        err.similar_investigations.forEach((inv, i) => {
          output += `\n\n   ${i + 1}. Fixed ${inv.fixed_at ? new Date(inv.fixed_at).toLocaleDateString() : 'previously'}`;
          if (inv.root_cause) output += `\n      Root Cause: ${inv.root_cause}`;
          if (inv.fix_type) output += `\n      Fix Type: ${inv.fix_type}`;
          if (inv.confidence !== null && inv.confidence !== undefined) {
            output += `\n      Confidence: ${(inv.confidence * 100).toFixed(0)}%`;
          }
          if (inv.risk_level) output += `\n      Risk: ${inv.risk_level}`;
          if (inv.commit_hash) output += `\n      Commit: ${inv.commit_hash.substring(0, 7)}`;
        });
        output += `\n\n   💡 TIP: We've fixed this error before! Review the past fixes above.`;
      }

      return output;
    }).join('\n');

    return {
      content: [{
        type: 'text',
        text: `🔍 Found ${response.total_count} Acknowledged Errors\n\nFilters Applied: Level=${levelFilter}, Min Occurrences=${minOccurrences}\n${errorList}\n\n📝 Next Steps:\n1. Choose an error to investigate\n2. Use recall_memories to check if we've seen similar errors\n3. Use search_web_ai to research solutions\n4. Use Context7 for library-specific docs\n5. Propose fix with confidence score\n6. Deploy fix when approved\n7. Call save_investigation_result to store audit trail`
      }]
    };

  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `❌ Error fetching acknowledged errors: ${error.message}\n\nMake sure:\n1. Backend API is running\n2. You have admin permissions\n3. Error tracking service is active`
      }]
    };
  }
}

async function handleSaveInvestigation(args) {
  try {
    if (!args.incident_id) {
      return {
        content: [{
          type: 'text',
          text: `❌ Missing required field: incident_id\n\nPlease provide the incident_id from get_acknowledged_errors.`
        }]
      };
    }

    const response = await makeApiCall('/api/v1/admin/investigations', {
      method: 'POST',
      body: JSON.stringify(args)
    });

    if (response.success) {
      return {
        content: [{
          type: 'text',
          text: `✅ Investigation Saved Successfully!\n\n📋 Investigation ID: ${response.investigation_id}\n🔗 Incident ID: ${response.incident_id}\n📊 Status: ${response.investigation_status}\n🚀 Deployment: ${response.deployment_status}\n\n${args.deployment_commit_hash ? `✓ Deployed with commit: ${args.deployment_commit_hash}` : '⏳ Awaiting deployment'}\n\nThis investigation is now part of the audit trail and can be used to learn from similar errors in the future.`
        }]
      };
    } else {
      return {
        content: [{
          type: 'text',
          text: `⚠️ Investigation saved with warnings:\n\n${JSON.stringify(response, null, 2)}`
        }]
      };
    }

  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `❌ Error saving investigation: ${error.message}\n\nPlease check:\n1. incident_id is valid\n2. Backend API is running\n3. You have admin permissions`
      }]
    };
  }
}

// Setup server
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

// Prepend update notice to a tool result if one is set
function withUpdateNotice(result) {
  if (!_updateNotice || !result?.content?.length) return result;
  return {
    ...result,
    content: [{ type: 'text', text: _updateNotice }, ...result.content]
  };
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'save_conversation':
      return withUpdateNotice(await handleSaveConversation(args));
    case 'recall_memories':
      return withUpdateNotice(await handleRecallMemories(args));
    case 'get_memory_details':
      return withUpdateNotice(await handleGetMemoryDetails(args));
    case 'discover_related_conversations':
      return withUpdateNotice(await handleDiscoverRelated(args));
    case 'get_user_context':
      return withUpdateNotice(await handleGetUserContext(args));
    case 'run_workflow':
      return withUpdateNotice(await handleRunWorkflow(args));
    case 'list_workflows':
      return withUpdateNotice(await handleListWorkflows(args));
    case 'get_acknowledged_errors':
      if (!ADMIN_MODE) break;
      return withUpdateNotice(await handleGetAcknowledgedErrors(args));
    case 'save_investigation_result':
      if (!ADMIN_MODE) break;
      return withUpdateNotice(await handleSaveInvestigation(args));
    default:
      return {
        content: [{
          type: 'text',
          text: `❌ Unknown tool: ${name}`
        }]
      };
  }
});

// ============================================================================
// TIER 4: Resource Handlers (MCP 2025-11-25)
// ============================================================================

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  structuredLog.info('resources/list called');
  return {
    resources: RESOURCES,
    resourceTemplates: RESOURCE_TEMPLATES
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  const requestId = `resource_read_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const startTime = Date.now();

  structuredLog.info('resources/read called', { request_id: requestId, uri });

  try {
    let data;
    let resourceUri = uri;

    if (uri === 'memory://me') {
      // Cognitive fingerprint — identity + session + vault stats + recent work
      const [meResp, statsResp, memoriesResp, sessionResp] = await Promise.allSettled([
        makeApiCall('/api/v1/auth/me'),
        makeApiCall('/api/v1/stats/'),
        makeApiCall('/api/v1/memories/?limit=20&sort=created_at&order=desc'),
        makeApiCall('/api/v1/identity/session'),
      ]);

      const me = meResp.status === 'fulfilled' ? meResp.value : null;
      if (!me) throw new Error('Unable to load profile.');

      const identity = me.identity || {};
      const email = me.email || '';
      const name = me.full_name || email.split('@')[0] || 'You';
      const sessionData = sessionResp.status === 'fulfilled' ? (sessionResp.value.session || {}) : {};

      const lines = [`## About Me — ${name}\n`];
      if (identity.role) lines.push(`**Role:** ${identity.role.charAt(0).toUpperCase() + identity.role.slice(1)}`);
      if (identity.primary_domain) lines.push(`**Domain:** ${identity.primary_domain}`);
      if (identity.expertise && identity.expertise.length) lines.push(`**Expertise:** ${identity.expertise.join(', ')}`);
      if (identity.tools && identity.tools.length) lines.push(`**Tools I use:** ${identity.tools.join(', ')}`);
      if (identity.work_style) lines.push(`**Work style:** ${identity.work_style}`);
      if (sessionData.context) lines.push(`**Working on:** ${sessionData.context}`);

      if (statsResp.status === 'fulfilled') {
        const stats = statsResp.value;
        const total = stats.total_memories || 0;
        const thisWeek = stats.memories_this_week || 0;
        const platforms = (stats.platforms || []).filter(p => p && !['user', 'purmemo-web'].includes(p.toLowerCase()) && !p.includes(' '));
        lines.push(`\n**Memory vault:** ${total.toLocaleString()} memories across ${platforms.slice(0, 6).join(', ')}`);
        lines.push(`**This week:** ${thisWeek} memories saved`);
      }

      // Frequency-weighted recent work — projects with ≥2 occurrences only
      if (memoriesResp.status === 'fulfilled') {
        const mems = Array.isArray(memoriesResp.value) ? memoriesResp.value : (memoriesResp.value.memories || []);
        const projectCounts = {};
        for (const m of mems) {
          const proj = (m.project_name || '').trim();
          if (proj) projectCounts[proj] = (projectCounts[proj] || 0) + 1;
        }
        const ranked = Object.entries(projectCounts)
          .filter(([, c]) => c >= 2)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);
        if (ranked.length > 0) {
          lines.push(`\n**Recent work:** ${ranked.map(([p, c]) => `${p} (${c} recent)`).join('; ')}`);
        }
      }

      return {
        contents: [{ uri: resourceUri, mimeType: 'text/plain', text: lines.join('\n') }]
      };

    } else if (uri === 'memory://context') {
      // 5 most recent memories as a human-readable briefing
      data = await makeApiCall('/api/v1/memories/?limit=5&sort=created_at&order=desc');
      const mems = Array.isArray(data) ? data : (data.memories || []);
      const skipPrefixes = ['===', '[', 'USER:', 'ASSISTANT:', 'user:', 'assistant:', '# ', '## '];
      const lines = ['## My Recent Work Context\n'];
      for (const m of mems) {
        if (!m.title) continue;
        lines.push(`### ${m.title}`);
        if (m.project_name) lines.push(`Project: ${m.project_name}`);
        if (m.platform) lines.push(`Platform: ${m.platform}`);
        if (m.content) {
          const preview = m.content.split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 20 && !skipPrefixes.some(p => l.startsWith(p)))
            .slice(0, 3)
            .join(' ');
          if (preview) lines.push(preview);
        }
        lines.push('');
      }

      return {
        contents: [{ uri: resourceUri, mimeType: 'text/plain', text: lines.join('\n') }]
      };

    } else if (uri === 'memory://projects') {
      // Active projects grouped by name, sorted by most recent activity
      data = await makeApiCall('/api/v1/memories/?limit=20&sort=created_at&order=desc');
      const mems = Array.isArray(data) ? data : (data.memories || []);
      const projectMap = {};
      for (const m of mems) {
        const proj = (m.project_name || '').trim();
        if (!proj) continue;
        if (!projectMap[proj]) projectMap[proj] = { count: 0, latest: null, latestDate: null };
        projectMap[proj].count++;
        if (!projectMap[proj].latest) {
          projectMap[proj].latest = m.title || '';
          projectMap[proj].latestDate = m.created_at || '';
        }
      }
      const sorted = Object.entries(projectMap).sort((a, b) => {
        return new Date(b[1].latestDate || 0) - new Date(a[1].latestDate || 0);
      });
      const lines = ['## My Active Projects\n'];
      for (const [proj, info] of sorted) {
        lines.push(`**${proj}** — ${info.count} recent memories`);
        if (info.latest) lines.push(`  Latest: ${info.latest}`);
        lines.push('');
      }
      if (sorted.length === 0) lines.push('No project-tagged memories found in recent activity.');

      return {
        contents: [{ uri: resourceUri, mimeType: 'text/plain', text: lines.join('\n') }]
      };

    } else if (uri === 'memory://stats') {
      data = await makeApiCall('/api/v1/stats/', { method: 'GET' });
      const total = data.total_memories || 0;
      const thisWeek = data.memories_this_week || 0;
      const platforms = (data.platforms || []).filter(p => p && !['user', 'purmemo-web'].includes(p.toLowerCase()) && !p.includes(' '));
      const text = [
        '## Memory Vault Stats\n',
        `**Total memories:** ${total.toLocaleString()}`,
        `**This week:** ${thisWeek} saved`,
        `**Platforms:** ${platforms.join(', ') || 'none'}`,
      ].join('\n');

      return {
        contents: [{ uri: resourceUri, mimeType: 'text/plain', text }]
      };

    } else if (uri.startsWith('memory://')) {
      // Fetch specific memory by ID
      const memoryId = uri.replace('memory://', '');
      if (!memoryId) throw new Error('Memory ID is required in URI: memory://{memoryId}');
      data = await makeApiCall(`/api/v1/memories/${memoryId}/`, { method: 'GET' });

      return {
        contents: [{ uri: resourceUri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }]
      };

    } else {
      throw new Error(`Unknown resource URI: ${uri}`);
    }

  } catch (error) {
    structuredLog.error('resources/read failed', {
      request_id: requestId,
      uri,
      duration_ms: Date.now() - startTime,
      error_message: error.message,
      error_type: error.constructor.name
    });
    throw error;
  }
});

// ============================================================================
// TIER 4: Prompt Handlers (MCP 2025-11-25)
// ============================================================================

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  structuredLog.info('prompts/list called');
  return { prompts: PROMPTS };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: promptArgs } = request.params;
  const requestId = `prompt_get_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  structuredLog.info('prompts/get called', { request_id: requestId, prompt_name: name });

  if (name === 'load-context') {
    const topic = promptArgs?.topic || '';

    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: topic
            ? `Before I start working on "${topic}", please recall relevant past conversations using recall_memories.\n\nSearch for:\n- Previous discussions about "${topic}"\n- Decisions made that might affect this work\n- Code patterns or approaches used before\n- Any blockers or issues encountered in similar tasks\n\nSummarize what you find so I have full context before starting.`
            : `Please load my recent context using recall_memories. Search for my most recent work across all projects and summarize:\n- What I was last working on\n- Any open threads or decisions pending\n- Key patterns or approaches from recent sessions\n\nKeep it brief — just enough for me to pick up where I left off.`
        }
      }]
    };

  } else if (name === 'save-this-conversation') {
    const note = promptArgs?.note || '';

    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Please save our current conversation using the save_conversation tool.\n\n` +
                `Instructions:\n` +
                `- Include the COMPLETE conversation content (every message verbatim)\n` +
                `- Include ALL code blocks with full syntax\n` +
                `- Auto-generate an intelligent title from the content (format: Project - Feature - Type)\n` +
                `- Use the same title if this topic was saved before (living document — it will update, not duplicate)\n` +
                `- Tag with relevant project names and technologies\n` +
                (note ? `- Extra note to include: ${note}\n` : '')
        }
      }]
    };

  } else if (name === 'catch-me-up') {
    const project = promptArgs?.project || 'this project';

    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Please catch me up on "${project}" using recall_memories.\n\nSearch for all recent conversations about "${project}" and summarize:\n1. What has been built or decided\n2. What is currently in progress\n3. Any open questions or blockers\n4. What the logical next step is\n\nBe specific — reference actual decisions and implementations, not just topics.`
        }
      }]
    };

  } else if (name === 'weekly-review') {
    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Please give me a weekly review of my work using recall_memories.\n\nSearch for conversations from the past 7 days and organize them by:\n1. Projects worked on (with brief status per project)\n2. Key decisions made\n3. Things completed\n4. Open threads / next steps\n5. Which AI tools were used (cross-platform activity)\n\nKeep it scannable — use headers and bullets, not paragraphs.`
        }
      }]
    };

  } else {
    throw new Error(`Unknown prompt: ${name}. Available prompts: ${PROMPTS.map(p => p.name).join(', ')}`);
  }
});

// ============================================================================
// Startup: resolve API key (env var → ~/.purmemo/auth.json) then connect
// ============================================================================

async function resolveApiKey() {
  // Priority 1: explicit env var
  if (process.env.PURMEMO_API_KEY) {
    structuredLog.info('API key resolved from environment variable');
    return process.env.PURMEMO_API_KEY;
  }

  // Priority 2: token saved by `npx purmemo-mcp setup`
  try {
    const tokenStore = new TokenStore();
    const token = await tokenStore.getToken();
    if (token?.access_token) {
      structuredLog.info('API key resolved from ~/.purmemo/auth.json (run via npx purmemo-mcp setup)');
      return token.access_token;
    }
  } catch (err) {
    structuredLog.warn('Could not read ~/.purmemo/auth.json', { error: err.message });
  }

  return null;
}

// Start server
const transport = new StdioServerTransport();

// Resolve API key first (async), then connect
resolveApiKey().then(apiKey => {
  resolvedApiKey = apiKey;
  return server.connect(transport);
})
  .then(() => {
    // Non-blocking version check — sets _updateNotice if client is outdated
    checkForUpdates();
    structuredLog.info('Purmemo MCP Server started successfully', {
      version: '12.5.2',
      tier: '4-resources-prompts',
      api_url: API_URL,
      api_key_configured: !!resolvedApiKey,
      api_key_source: process.env.PURMEMO_API_KEY ? 'env_var' : (resolvedApiKey ? 'token_store' : 'none'),
      platform: PLATFORM,
      tools_count: TOOLS.length,
      circuit_breaker_enabled: true,
      request_timeout_ms: 30000,
      features: [
        'Intelligent memory saving with auto-context extraction',
        'Smart title generation (no more timestamps)',
        'Automatic project/component/feature detection',
        'Roadmap tracking across AI tools',
        'Unicode sanitization',
        'Structured JSON logging',
        'Circuit breaker pattern for API resilience',
        'Per-tool request timing and metrics',
        'Safe error handling with fallbacks',
        'MCP Resources (memory://me, memory://context, memory://projects, memory://stats, memory://{id})',
        'MCP Prompts (load-context, save-this-conversation, catch-me-up, weekly-review)'
      ]
    });
  })
  .catch((error) => {
    structuredLog.error('Failed to start MCP server', {
      error_message: error.message,
      error_type: error.constructor.name
    });
    process.exit(1);
  });

} // end else (not a subcommand)
