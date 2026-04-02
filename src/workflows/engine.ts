// @ts-nocheck — typing deferred (matches server.ts convention)
/**
 * Workflow engine for purmemo MCP server.
 * Templates, intent classification, and query preprocessing.
 */

// ============================================================================
// WORKFLOW QUERY PREPROCESSING — Extract search terms from long user input
// ============================================================================

export const SEARCH_STOP_WORDS = new Set([
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

export function extractSearchTerms(input, maxTerms = 5) {
  const words = input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !SEARCH_STOP_WORDS.has(w));

  // Deduplicate preserving first-occurrence order
  const unique = [...new Set(words)];
  return unique.slice(0, maxTerms).join(' ');
}

export function buildMemoryQueries(template, input) {
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

export const WORKFLOW_TEMPLATES = {
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
  },
  kickoff: {
    name: 'kickoff',
    display_name: 'Kickoff — Launch Into a Todo With Full Context',
    category: 'operations',
    description: 'Pick an active todo and get a comprehensive context brief from all related memories, decisions, and conversations across platforms.',
    memory_queries: ['[INPUT] implementation decisions architecture', '[INPUT] recent progress status', '[INPUT] project todos blockers'],
    signals: ['kickoff', 'start on', 'work on', 'pick up', 'resume', 'begin', 'tackle'],
    route_chain: ['prd', 'sprint', 'feature'],
    // Flag: handleRunWorkflow pre-loads active todos when this is true
    preloadTodos: true,
    prompt: `# Kickoff — Launch Into a Todo With Full Context

You are preparing a comprehensive context brief so the user can start working on a todo item with full awareness of everything that led to it.

## Your Process

1. **Check the Active Todos** — Look at the active todos shown in the pre-loaded data below. If the user specified which todo to work on, use that. If not, list the active todos and ask which one.

2. **Load the Source Memory** — If the todo has a linked Context memory ID, call get_memory_details on that ID to load the full conversation where the todo was conceived. This contains the architectural decisions, constraints, and reasoning.

3. **Find Related Conversations** — Call discover_related_conversations with the todo text to find every conversation across all platforms (Claude, ChatGPT, Gemini, Cursor) that relates to this work.

4. **Load Key Details** — For the top 2-3 most relevant related memories, call get_memory_details to load the full content. Focus on: decisions made, blockers encountered, approaches tried, code changed.

5. **Present the Kickoff Brief** in this structure:

## Kickoff Brief Output

### What You're Building
[One paragraph summary of the todo and why it exists]

### How You Got Here
[Timeline of conversations and decisions that led to this todo, across platforms]

### Key Decisions Already Made
[Bullet list of architectural and design decisions from past conversations]

### What Was Tried / What Didn't Work
[Any failed approaches, abandoned ideas, or lessons learned]

### Current State of the Code
[What exists now — files, tables, APIs relevant to this work]

### Sibling Todos (Same Project)
[List other active todos for the same project — shows what else is in flight and potential dependencies]

### Blockers & Dependencies
[Any open blockers, dependencies, or prerequisites]

### Recommended Approach
[Your suggested first step based on all the context gathered]

### Related Memories
[List of memory IDs the user can reference during implementation — with one-line summaries]

## Important
- Call get_memory_details and discover_related_conversations — don't just use the pre-loaded recall results. The pre-loaded memories are a starting point, not the full picture.
- Be specific. Quote actual decisions from past conversations.
- If you find conflicting decisions across memories, flag them.
- The goal is: after reading this brief, the user (or any AI agent) can start implementing without needing to ask "what was decided before?" or "why are we doing it this way?"

## After Presenting the Brief
Save this kickoff brief as a living document using save_conversation with:
- title: "Kickoff Brief — [todo summary]"
- tags: ["kickoff-brief", "context-package"]
This persists the brief so the user (or another AI agent) can recall it later without re-assembling.`
  }
};

// Intent classifier for auto-routing when no workflow is specified
export function classifyWorkflowIntent(input) {
  const lower = input.toLowerCase();

  // Check each workflow's signals — first match wins (order matters: emergency first)
  const priorityOrder = [
    'incident', 'debug', 'deploy', 'review',  // urgent/engineering
    'kickoff',                                  // todo launch
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
