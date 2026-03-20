# Workflow System Help

Display the complete command reference for the Purmemo AI-Native Founder OS.

**Don't know which command to use? Start with `/os [describe your goal]`**

---

## 58 COMMANDS ACROSS 10 DOMAINS

### ENGINEERING (9)
| Command | What it does |
|---------|-------------|
| `/health` | Stack health check — API, MCP, Render, Supabase |
| `/sprint` | Sprint planning, daily standup, unblock |
| `/feature` | Full feature pipeline: spec → build → test → ship |
| `/chrome-build` | Chrome extension build + release |
| `/desktop-build` | Electron desktop app build + release |
| `/release-notes` | Generate changelog from git log |
| `/mcp-sync` | MCP config drift detection |
| `/api-types` | FastAPI → TypeScript type sync |
| `/cws-submit` | Chrome Web Store submission blocker tracker |

### DESIGN & FRONTEND (5)
| Command | What it does |
|---------|-------------|
| `/design` | Senior UX Engineer — pixel-perfect, accessible, dark glassmorphic |
| `/component` | Component Engineer — isolation, props, variants |
| `/v0` | Design-system-aware prompt generator for v0.dev |
| `/animate` | Motion Design Engineer — Motion library, reduced motion |
| `/audit-ui` | Design quality inspector — before any ship |

### PRODUCT (5)
| Command | What it does |
|---------|-------------|
| `/prd` | Product Requirements Document — senior PM |
| `/story` | RICE-scored user stories |
| `/roadmap` | CPO roadmap — now/next/later |
| `/retro` | Sprint retrospective — agile coach |
| `/onboarding-flow` | Activation funnel designer for morphing cluster system |

### BUSINESS INTELLIGENCE (5)
| Command | What it does |
|---------|-------------|
| `/ceo` | Strategic advisor — RICE, Ansoff, two-door decisions |
| `/cfo` | Financial analyst — MRR, ARR, runway, unit economics |
| `/growth` | Head of growth — bowtie model, ICE experiments |
| `/metrics` | Weekly SaaS dashboard — all key numbers |
| `/cost-audit` | Infrastructure cost optimizer |

### CUSTOMER & GROWTH (7)
| Command | What it does |
|---------|-------------|
| `/funnel` | Conversion funnel analysis — find the leaks |
| `/ab-test` | Experiment design + statistical analysis |
| `/feedback` | User feedback synthesizer — all sources → themes |
| `/user` | Voice of customer — personas, JTBD, interviews |
| `/support` | Customer support triage |
| `/launch` | Product Hunt + HN launch coordinator |
| `/social` | Twitter/X threads, LinkedIn, developer content |

### CONTENT & BRAND (4)
| Command | What it does |
|---------|-------------|
| `/copy` | Senior copywriter — PAS/AIDA/BAB, brand voice |
| `/content` | Thought leadership + developer content strategy |
| `/changelog` | Marketing changelog for users |
| `/narrative` | Positioning + messaging coherence audit |

### OPERATIONS (5)
| Command | What it does |
|---------|-------------|
| `/incident` | Production incident commander |
| `/migrate` | Database migration orchestrator |
| `/rotate-secrets` | Credentials and API key rotation |
| `/legal` | GDPR/CCPA compliance + data subject requests |
| `/sow` | Statement of work + contractor IP management |

### STRATEGIC INTELLIGENCE (6)
| Command | What it does |
|---------|-------------|
| `/intel` | Daily AI landscape intelligence briefing |
| `/mcp-ecosystem` | MCP protocol ecosystem tracker |
| `/tos-watch` | Platform TOS monitor — Anthropic/OpenAI/Google |
| `/moat` | Competitive moat assessment (5 moat tests) |
| `/partner` | BD + platform partnerships pipeline |
| `/investors` | Fundraising CRM + investor relationship management |

### FOUNDER RHYTHM (4)
| Command | What it does |
|---------|-------------|
| `/reflect` | Weekly co-founder session — 7 honest questions |
| `/week` | Monday startup + Friday shutdown ritual |
| `/pitch` | Investor relations + fundraising materials |
| `/dogfood` | Self-usage audit — are you using your own product? |

### NAVIGATION & MEMORY (9)
| Command | What it does |
|---------|-------------|
| `/os` | **Intelligent dispatch — describe your goal, get a workflow** |
| `/context` | Session startup + project context loader |
| `/save` | Intelligent conversation saving (living documents) |
| `/research` | Pre-implementation research workflow |
| `/debug` | Structured debugging workflow |
| `/review` | Pre-commit security + quality review |
| `/deploy` | Pre-deployment checklist |
| `/decide` | Architecture Decision Records (ADRs) |
| `/investigate-errors` | Error resolution from admin panel |

---

## WORKFLOW CHAINS

**Ship a feature**: `/prd` → `/story` → `/feature` → `/test` → `/review` → `/deploy` → `/changelog` → `/social`

**Fix a bug**: `/debug` → `/test` → `/review` → `/deploy`

**Weekly Monday**: `/intel` → `/mcp-ecosystem` → `/metrics` → `/health` → `/week monday` → `/sprint`

**Weekly Friday**: `/reflect` → `/week friday` → `/save`

**Grow activation**: `/funnel` → `/onboarding-flow` → `/ab-test` → `/user`

**Launch to PH/HN**: `/audit-ui` → `/funnel` → `/launch` → `/social`

**Raise money**: `/metrics` → `/cfo` → `/investors` → `/pitch`

**Security sweep**: `/rotate-secrets` → `/tos-watch` → `/legal`

**Not sure**: `/os [describe your goal]`

---

## MCP Integrations

- **Purmemo MCP** — memory recall, saving, error investigation
- **Krawlr MCP** — krawlr_think, search_web_ai, scrape_url
- **Context7 MCP** — library docs (FastAPI, Next.js, Electron, Motion, etc.)
- **Render MCP** — service status, logs, deploys, metrics
- **Supabase MCP** — migrations, advisors, SQL, TypeScript types

---

**58 commands. One OS. Use `/os` when you don't know where to start.**
