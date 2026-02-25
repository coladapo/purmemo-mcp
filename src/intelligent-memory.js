#!/usr/bin/env node
/**
 * Intelligent Memory Saving System - Phase 15
 *
 * Provides automatic context extraction, project tracking, and intelligent
 * title generation for pūrmemo memories across all AI tools.
 *
 * Key Features:
 * - Automatic project/component/feature detection
 * - Status and phase tracking for roadmap visualization
 * - Intelligent title generation (no more timestamps!)
 * - Technology stack and tools extraction
 * - Relationship mapping (depends_on, related_to, blocks)
 * - Enhanced clustering hints for better memory organization
 *
 * Design Document: purmemo-intelligent-memory-system-design
 */

/**
 * Extract project context from conversation content
 *
 * Analyzes conversation to automatically detect:
 * - Project name
 * - Component (Frontend, Backend, MCP Server, etc.)
 * - Feature being worked on
 * - Phase/iteration
 * - Status (planning, in_progress, completed, blocked)
 */
function extractProjectContext(content) {
  const context = {
    project_name: null,
    project_component: null,
    feature_name: null,
    phase: null,
    status: null,
    progression_from: null,
    technologies: [],
    tools_used: [],
    related_work: [],
    clustering_hints: {}
  };

  // ============================================================================
  // 1. PROJECT NAME DETECTION
  // ============================================================================

  // Pattern 1: File paths (highest priority)
  // e.g., /Users/username/projects/myproject/v1-mvp/frontend/...
  const filePathMatch = content.match(/(?:\/|\\)([a-zA-Z0-9-_]+)\/(?:v\d+[-.]\w+|src|components|backend|frontend)/i);
  if (filePathMatch) {
    context.project_name = normalizeProjectName(filePathMatch[1]);
  }

  // Pattern 2: Explicit project mentions
  // e.g., "in the Purmemo project", "working on FutureShift"
  if (!context.project_name) {
    const projectMentions = content.match(/(?:in the|working on|building|developing|project:|for)\s+([A-Z][a-zA-Z0-9-]+)(?:\s+project|\s+application|\s+app)?/);
    if (projectMentions) {
      context.project_name = normalizeProjectName(projectMentions[1]);
    }
  }

  // Pattern 3: Package.json or project config files
  if (!context.project_name) {
    const packageMatch = content.match(/"name":\s*"([^"]+)"/);
    if (packageMatch) {
      context.project_name = normalizeProjectName(packageMatch[1]);
    }
  }

  // Pattern 4: Domain/URL references
  if (!context.project_name) {
    const domainMatch = content.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+)\.(?:com|ai|io|dev)/);
    if (domainMatch && !['github', 'npm', 'docs', 'api', 'localhost'].includes(domainMatch[1])) {
      context.project_name = normalizeProjectName(domainMatch[1]);
    }
  }

  // ============================================================================
  // 2. COMPONENT DETECTION - PHASE 15.7: UNIVERSAL DOMAIN SUPPORT
  // ============================================================================
  // Supports 8 domains: Technology, Business, Creative, Education, Research, Personal, Legal, Healthcare

  const componentPatterns = {
    // ========== TECHNOLOGY & SOFTWARE DEVELOPMENT ==========
    'Frontend': [/frontend/i, /client/i, /ui\//, /components\//, /pages\//, /react/i, /vue/i, /angular/i, /svelte/i],
    'Backend': [/backend/i, /server/i, /api\//, /routes\//, /controllers\//, /express/i, /fastapi/i, /django/i],
    'Database': [/database/i, /migrations\//, /schema/i, /models\//, /postgres/i, /mongo/i, /sql/i, /db\//i],
    'MCP Server': [/mcp[_-]?server/i, /mcp\//, /@modelcontextprotocol/i, /model context protocol/i],
    'Authentication': [/auth/i, /login/i, /authentication/i, /jwt/i, /oauth/i, /saml/i, /sso/i],
    'Infrastructure': [/docker/i, /kubernetes/i, /terraform/i, /deployment/i, /ci\/cd/i, /devops/i, /aws/i, /azure/i, /gcp/i],
    'Testing': [/test/i, /spec\./i, /\.test\./i, /__tests__\//i, /jest/i, /pytest/i, /qa\b/i, /quality assurance/i],
    'Documentation': [/docs\//i, /readme/i, /documentation/i, /\.md$/i, /wiki/i, /technical writing/i],
    'Mobile App': [/mobile/i, /ios\b/i, /android/i, /react native/i, /flutter/i, /swift/i, /kotlin/i],
    'DevOps': [/devops/i, /pipeline/i, /ci\/cd/i, /continuous integration/i, /continuous deployment/i],
    'Security': [/security/i, /penetration test/i, /vulnerability/i, /encryption/i, /compliance/i],
    'Performance': [/performance/i, /optimization/i, /profiling/i, /load testing/i, /scalability/i],

    // ========== BUSINESS & MARKETING ==========
    'Business Strategy': [/business strategy/i, /strategic planning/i, /market analysis/i, /competitive analysis/i, /swot/i],
    'Product Strategy': [/product strategy/i, /product roadmap/i, /feature prioritization/i, /product vision/i],
    'Marketing Campaign': [/marketing/i, /campaign/i, /advertisement/i, /promotion/i, /growth hacking/i, /seo/i, /sem/i],
    'Sales': [/sales/i, /lead generation/i, /prospecting/i, /closing deals/i, /crm/i, /pipeline/i],
    'Customer Success': [/customer success/i, /customer support/i, /client onboarding/i, /retention/i, /churn/i],
    'Brand Development': [/branding/i, /brand identity/i, /brand strategy/i, /brand guidelines/i],
    'Social Media': [/social media/i, /instagram/i, /twitter/i, /linkedin/i, /facebook/i, /tiktok/i, /content calendar/i],
    'Email Marketing': [/email marketing/i, /newsletter/i, /email campaign/i, /mailchimp/i, /drip campaign/i],
    'Analytics & Metrics': [/analytics/i, /metrics/i, /kpi/i, /dashboard/i, /reporting/i, /data analysis/i],
    'Partnerships': [/partnership/i, /collaboration/i, /affiliate/i, /channel partner/i, /alliance/i],
    'Pricing Strategy': [/pricing/i, /revenue model/i, /monetization/i, /pricing tier/i],
    'Market Research': [/market research/i, /user research/i, /survey/i, /focus group/i, /customer interview/i],

    // ========== CREATIVE & CONTENT ==========
    'Content Writing': [/blog/i, /article/i, /writing/i, /copywriting/i, /content creation/i, /editorial/i],
    'Video Production': [/video/i, /filming/i, /editing/i, /premiere/i, /final cut/i, /youtube/i, /vimeo/i],
    'Graphic Design': [/graphic design/i, /illustration/i, /visual design/i, /photoshop/i, /illustrator/i, /figma design/i],
    'UI/UX Design': [/ui design/i, /ux design/i, /user experience/i, /wireframe/i, /mockup/i, /prototype/i, /figma/i],
    'Photography': [/photography/i, /photo editing/i, /lightroom/i, /photoshoot/i, /camera/i],
    'Audio Production': [/audio/i, /podcast/i, /music production/i, /sound design/i, /mixing/i, /mastering/i],
    'Animation': [/animation/i, /motion graphics/i, /after effects/i, /3d animation/i, /2d animation/i],
    'Creative Direction': [/creative direction/i, /art direction/i, /creative strategy/i, /brand creative/i],
    'Social Content': [/social content/i, /instagram post/i, /twitter thread/i, /linkedin article/i],

    // ========== EDUCATION & LEARNING ==========
    'Course Development': [/course/i, /curriculum/i, /lesson plan/i, /syllabus/i, /learning objective/i],
    'Teaching': [/teaching/i, /lecture/i, /classroom/i, /student/i, /instructor/i, /educator/i],
    'Tutorial Creation': [/tutorial/i, /how-to/i, /guide/i, /walkthrough/i, /step-by-step/i],
    'Assessment': [/assessment/i, /quiz/i, /exam/i, /test/i, /evaluation/i, /grading/i],
    'Educational Content': [/educational/i, /learning material/i, /study guide/i, /flashcard/i],
    'Workshops': [/workshop/i, /training session/i, /bootcamp/i, /masterclass/i],

    // ========== RESEARCH & ACADEMIA ==========
    'Academic Research': [/research/i, /study/i, /experiment/i, /hypothesis/i, /methodology/i, /thesis/i],
    'Literature Review': [/literature review/i, /paper review/i, /citation/i, /bibliography/i],
    'Data Analysis': [/data analysis/i, /statistical analysis/i, /regression/i, /correlation/i, /spss/i, /r studio/i],
    'Grant Writing': [/grant/i, /proposal/i, /funding application/i, /research proposal/i],
    'Publication': [/publication/i, /journal/i, /peer review/i, /manuscript/i, /submission/i],
    'Presentation': [/presentation/i, /conference/i, /poster/i, /slides/i, /keynote/i],

    // ========== PERSONAL & LIFESTYLE ==========
    'Personal Goals': [/goal/i, /resolution/i, /habit/i, /self-improvement/i, /personal development/i],
    'Health & Fitness': [/workout/i, /exercise/i, /fitness/i, /nutrition/i, /diet/i, /wellness/i],
    'Finance': [/budget/i, /investment/i, /savings/i, /expense/i, /financial planning/i, /tax/i],
    'Travel Planning': [/travel/i, /trip/i, /itinerary/i, /vacation/i, /destination/i, /booking/i],
    'Journaling': [/journal/i, /diary/i, /reflection/i, /daily log/i, /gratitude/i],
    'Meal Planning': [/meal plan/i, /recipe/i, /cooking/i, /grocery/i, /meal prep/i],
    'Home Organization': [/organization/i, /declutter/i, /home project/i, /renovation/i, /cleaning/i],

    // ========== LEGAL & COMPLIANCE ==========
    'Contract Review': [/contract/i, /agreement/i, /terms/i, /legal document/i, /nda/i],
    'Compliance': [/compliance/i, /regulation/i, /gdpr/i, /hipaa/i, /sox/i, /audit/i],
    'Intellectual Property': [/patent/i, /trademark/i, /copyright/i, /ip protection/i, /licensing/i],
    'Legal Research': [/case law/i, /precedent/i, /statute/i, /legal brief/i, /litigation/i],
    'Policy Development': [/policy/i, /procedure/i, /governance/i, /standard operating procedure/i, /sop/i],

    // ========== HEALTHCARE & MEDICAL ==========
    'Patient Care': [/patient/i, /treatment/i, /diagnosis/i, /medical record/i, /care plan/i],
    'Medical Research': [/clinical trial/i, /medical study/i, /health research/i, /epidemiology/i],
    'Healthcare Admin': [/healthcare/i, /hospital/i, /clinic/i, /medical billing/i, /insurance/i],
    'Telemedicine': [/telemedicine/i, /telehealth/i, /virtual care/i, /remote consultation/i],
    'Medical Education': [/medical training/i, /clinical education/i, /medical student/i, /residency/i]
  };

  for (const [component, patterns] of Object.entries(componentPatterns)) {
    if (patterns.some(pattern => pattern.test(content))) {
      context.project_component = component;
      break;
    }
  }

  // ============================================================================
  // 3. FEATURE DETECTION
  // ============================================================================

  // Pattern 1: File-based feature detection
  // e.g., /components/neural-constellation-v67.tsx → "Neural Constellation"
  const featureFromPath = content.match(/\/([a-z-]+(?:view|component|feature|page|modal|widget))(?:[-.]v?\d+)?\.(?:tsx?|jsx?|vue|py)/i);
  if (featureFromPath) {
    context.feature_name = normalizeFeatureName(featureFromPath[1]);
  }

  // Pattern 2: Action-based feature detection
  // e.g., "implementing timeline view", "fixing authentication bug"
  if (!context.feature_name) {
    const actionMatch = content.match(/(?:implementing|building|creating|fixing|updating|adding)\s+(?:the\s+)?([A-Z][a-zA-Z\s]+?)(?:\s+feature|\s+component|\s+functionality|\s+bug)?(?:[,.\n]|$)/);
    if (actionMatch) {
      const feature = actionMatch[1].trim();
      if (feature.length > 3 && feature.length < 50) {
        context.feature_name = normalizeFeatureName(feature);
      }
    }
  }

  // Pattern 3: Title mentions
  // e.g., "Timeline View improvements", "User Authentication"
  if (!context.feature_name) {
    const titleMatch = content.match(/(?:^|\n)(?:##?\s+)?([A-Z][a-zA-Z\s]+)(?:\s+Improvements?|\s+Enhancements?|\s+Feature|\s+Component)/m);
    if (titleMatch) {
      context.feature_name = normalizeFeatureName(titleMatch[1]);
    }
  }

  // ============================================================================
  // 4. PHASE/ITERATION DETECTION
  // ============================================================================

  // Pattern 1: Explicit phase markers
  // e.g., "Phase 14.10", "Sprint 3", "v2.5", "Iteration 4"
  const phasePatterns = [
    /Phase\s+(\d+(?:\.\d+)?(?:[A-Z])?)/i,
    /Sprint\s+(\d+)/i,
    /Iteration\s+(\d+)/i,
    /v(\d+\.\d+(?:\.\d+)?)/i,
    /Release\s+(\d+(?:\.\d+)?)/i
  ];

  for (const pattern of phasePatterns) {
    const match = content.match(pattern);
    if (match) {
      context.phase = match[0]; // Use full match (e.g., "Phase 14.10")
      break;
    }
  }

  // Pattern 2: Migration version (for database work)
  if (!context.phase) {
    const migrationMatch = content.match(/migrations?\/(\d+_[a-z_]+\.sql)/i);
    if (migrationMatch) {
      context.phase = `Migration ${migrationMatch[1].match(/^\d+/)[0]}`;
    }
  }

  // ============================================================================
  // 5. STATUS DETECTION
  // ============================================================================

  // Pattern 1: Emoji indicators (highest priority)
  const emojiStatusMap = {
    'completed': /✅|✓|☑|✔/,
    'in_progress': /🚧|⚙️|🔨|🛠️|⏳/,
    'blocked': /❌|🚫|⛔|❗/,
    'planning': /📋|📝|🗒️|💭|🤔/
  };

  for (const [status, pattern] of Object.entries(emojiStatusMap)) {
    if (pattern.test(content)) {
      context.status = status;
      break;
    }
  }

  // Pattern 2: Explicit status keywords
  if (!context.status) {
    const statusKeywords = {
      'completed': /\b(?:completed|finished|done|deployed|merged|released)\b/i,
      'in_progress': /\b(?:in progress|working on|implementing|developing|building)\b/i,
      'blocked': /\b(?:blocked|stuck|waiting|issue|problem|error)\b/i,
      'planning': /\b(?:planning|designing|drafting|proposing|considering)\b/i
    };

    for (const [status, pattern] of Object.entries(statusKeywords)) {
      if (pattern.test(content)) {
        context.status = status;
        break;
      }
    }
  }

  // Default to in_progress if unclear
  if (!context.status) {
    context.status = 'in_progress';
  }

  // ============================================================================
  // 6. PROGRESSION TRACKING
  // ============================================================================

  // Detect progression from previous phase
  // e.g., "builds on Phase 14.9", "continues from Sprint 2"
  const progressionMatch = content.match(/(?:builds? on|continues? from|after|following)\s+(Phase\s+\d+(?:\.\d+)?|Sprint\s+\d+|v\d+\.\d+)/i);
  if (progressionMatch) {
    context.progression_from = progressionMatch[1];
  }

  // ============================================================================
  // 7. TECHNOLOGY/TOOLS STACK DETECTION - PHASE 15.7: UNIVERSAL SUPPORT
  // ============================================================================

  const techPatterns = {
    // ========== SOFTWARE DEVELOPMENT ==========
    // Frontend
    'React': /\breact\b/i,
    'Next.js': /\bnext(?:\.?js)?\b/i,
    'Vue': /\bvue(?:\.?js)?\b/i,
    'Angular': /\bangular\b/i,
    'Svelte': /\bsvelte\b/i,
    'TypeScript': /\btypescript\b|\.tsx?\b/i,
    'JavaScript': /\bjavascript\b|\.jsx?\b/i,
    'Tailwind CSS': /\btailwind(?:\s*css)?\b/i,
    'Bootstrap': /\bbootstrap\b/i,

    // Backend
    'Node.js': /\bnode(?:\.?js)?\b/i,
    'Express': /\bexpress(?:\.?js)?\b/i,
    'FastAPI': /\bfastapi\b/i,
    'Django': /\bdjango\b/i,
    'Flask': /\bflask\b/i,
    'Python': /\bpython\b|\.py\b/i,
    'Go': /\bgolang\b|\bgo\b/i,
    'Rust': /\brust\b|\.rs\b/i,
    'Ruby': /\bruby\b/i,
    'Rails': /\brails\b/i,
    'PHP': /\bphp\b/i,
    'Laravel': /\blaravel\b/i,

    // Database
    'PostgreSQL': /\bpostgres(?:ql)?\b/i,
    'MongoDB': /\bmongo(?:db)?\b/i,
    'MySQL': /\bmysql\b/i,
    'Redis': /\bredis\b/i,
    'Supabase': /\bsupabase\b/i,
    'Firebase': /\bfirebase\b/i,
    'SQLite': /\bsqlite\b/i,

    // Infrastructure
    'Docker': /\bdocker\b/i,
    'Kubernetes': /\bkubernetes\b|\bk8s\b/i,
    'Railway': /\brailway\b/i,
    'Vercel': /\bvercel\b/i,
    'Render': /\brender\b/i,
    'AWS': /\baws\b|amazon web services/i,
    'Azure': /\bazure\b/i,
    'Google Cloud': /\bgcp\b|google cloud/i,
    'Heroku': /\bheroku\b/i,
    'Netlify': /\bnetlify\b/i,

    // Mobile
    'React Native': /\breact native\b/i,
    'Flutter': /\bflutter\b/i,
    'Swift': /\bswift\b/i,
    'Kotlin': /\bkotlin\b/i,

    // ========== BUSINESS & PRODUCTIVITY ==========
    'Salesforce': /\bsalesforce\b/i,
    'HubSpot': /\bhubspot\b/i,
    'Shopify': /\bshopify\b/i,
    'WordPress': /\bwordpress\b/i,
    'Zapier': /\bzapier\b/i,
    'Airtable': /\bairtable\b/i,
    'Notion': /\bnotion\b/i,
    'Asana': /\basana\b/i,
    'Trello': /\btrello\b/i,
    'Monday.com': /\bmonday\.com\b/i,
    'Slack': /\bslack\b/i,
    'Microsoft Teams': /\bteams\b|microsoft teams/i,
    'Google Workspace': /\bgoogle workspace\b|g suite/i,
    'Microsoft 365': /\bmicrosoft 365\b|office 365/i,

    // ========== MARKETING & ANALYTICS ==========
    'Google Analytics': /\bgoogle analytics\b|\bGA4\b/i,
    'Mailchimp': /\bmailchimp\b/i,
    'Constant Contact': /\bconstant contact\b/i,
    'SEMrush': /\bsemrush\b/i,
    'Ahrefs': /\bahrefs\b/i,
    'Hootsuite': /\bhootsuite\b/i,
    'Buffer': /\bbuffer\b/i,
    'Meta Business Suite': /\bmeta business\b|facebook business/i,
    'Canva': /\bcanva\b/i,

    // ========== CREATIVE & DESIGN ==========
    'Figma': /\bfigma\b/i,
    'Adobe Photoshop': /\bphotoshop\b/i,
    'Adobe Illustrator': /\billustrator\b/i,
    'Adobe Premiere': /\bpremiere\b/i,
    'Adobe After Effects': /\bafter effects\b/i,
    'Sketch': /\bsketch\b/i,
    'InVision': /\binvision\b/i,
    'Blender': /\bblender\b/i,
    'Cinema 4D': /\bcinema 4d\b/i,
    'Final Cut Pro': /\bfinal cut\b/i,
    'DaVinci Resolve': /\bdavinci resolve\b/i,
    'Procreate': /\bprocreate\b/i,

    // ========== DATA & ANALYTICS ==========
    'Tableau': /\btableau\b/i,
    'Power BI': /\bpower bi\b/i,
    'Excel': /\bexcel\b/i,
    'Google Sheets': /\bgoogle sheets\b/i,
    'Python Pandas': /\bpandas\b/i,
    'R': /\br\b(?!eact)|r studio/i,
    'SPSS': /\bspss\b/i,
    'SAS': /\bsas\b/i,
    'Jupyter': /\bjupyter\b/i,

    // ========== EDUCATION & RESEARCH ==========
    'Moodle': /\bmoodle\b/i,
    'Canvas LMS': /\bcanvas lms\b/i,
    'Google Classroom': /\bgoogle classroom\b/i,
    'Zoom': /\bzoom\b/i,
    'LaTeX': /\blatex\b/i,
    'Zotero': /\bzotero\b/i,
    'Mendeley': /\bmendeley\b/i,
    'EndNote': /\bendnote\b/i
  };

  for (const [tech, pattern] of Object.entries(techPatterns)) {
    if (pattern.test(content)) {
      context.technologies.push(tech);
    }
  }

  // ============================================================================
  // 8. TOOLS USED DETECTION - PHASE 15.7: UNIVERSAL SUPPORT
  // ============================================================================

  const toolPatterns = {
    // ========== AI ASSISTANTS ==========
    'Claude Code': /\bclaude\s*code\b/i,
    'Claude': /\bclaude\b(?!\s*code)/i,
    'ChatGPT': /\bchatgpt\b/i,
    'Gemini': /\bgemini\b/i,
    'Cursor': /\bcursor\b/i,
    'Windsurf': /\bwindsurf\b/i,
    'GitHub Copilot': /\bcopilot\b/i,
    'Codeium': /\bcodeium\b/i,
    'Replit': /\breplit\b/i,

    // ========== DEVELOPMENT TOOLS ==========
    'VS Code': /\bvs\s*code\b|\bvscode\b/i,
    'IntelliJ': /\bintellij\b/i,
    'PyCharm': /\bpycharm\b/i,
    'WebStorm': /\bwebstorm\b/i,
    'Sublime Text': /\bsublime\b/i,
    'Vim': /\bvim\b/i,
    'Emacs': /\bemacs\b/i,
    'Git': /\bgit\b/i,
    'GitHub': /\bgithub\b/i,
    'GitLab': /\bgitlab\b/i,
    'Bitbucket': /\bbitbucket\b/i,
    'npm': /\bnpm\b/i,
    'yarn': /\byarn\b/i,
    'pnpm': /\bpnpm\b/i,
    'Postman': /\bpostman\b/i,
    'Insomnia': /\binsomnia\b/i,
    'Docker Desktop': /\bdocker desktop\b/i,
    'Jira': /\bjira\b/i,
    'Linear': /\blinear\b/i,

    // ========== BUSINESS & PRODUCTIVITY ==========
    'Notion': /\bnotion\b/i,
    'Obsidian': /\bobsidian\b/i,
    'Evernote': /\bevernote\b/i,
    'OneNote': /\bonenote\b/i,
    'Todoist': /\btodoist\b/i,
    'Things': /\bthings\b/i,
    'OmniFocus': /\bomnifocus\b/i,
    'Asana': /\basana\b/i,
    'Trello': /\btrello\b/i,
    'Monday.com': /\bmonday\.com\b/i,
    'ClickUp': /\bclickup\b/i,
    'Airtable': /\bairtable\b/i,
    'Coda': /\bcoda\b/i,
    'Google Docs': /\bgoogle docs\b/i,
    'Google Sheets': /\bgoogle sheets\b/i,
    'Excel': /\bexcel\b/i,
    'PowerPoint': /\bpowerpoint\b/i,
    'Keynote': /\bkeynote\b/i,
    'Pages': /\bpages\b/i,
    'Numbers': /\bnumbers\b/i,

    // ========== COMMUNICATION ==========
    'Slack': /\bslack\b/i,
    'Discord': /\bdiscord\b/i,
    'Microsoft Teams': /\bteams\b|microsoft teams/i,
    'Zoom': /\bzoom\b/i,
    'Google Meet': /\bgoogle meet\b|\bmeet\b/i,
    'Loom': /\bloom\b/i,
    'Telegram': /\btelegram\b/i,
    'WhatsApp': /\bwhatsapp\b/i,

    // ========== DESIGN & CREATIVE ==========
    'Figma': /\bfigma\b/i,
    'Sketch': /\bsketch\b/i,
    'Adobe XD': /\badobe xd\b|\bxd\b/i,
    'Photoshop': /\bphotoshop\b/i,
    'Illustrator': /\billustrator\b/i,
    'InDesign': /\bindesign\b/i,
    'Lightroom': /\blightroom\b/i,
    'Premiere Pro': /\bpremiere\b/i,
    'After Effects': /\bafter effects\b/i,
    'Final Cut Pro': /\bfinal cut\b/i,
    'DaVinci Resolve': /\bdavinci\b/i,
    'Canva': /\bcanva\b/i,
    'Procreate': /\bprocreate\b/i,
    'Blender': /\bblender\b/i,

    // ========== MARKETING & ANALYTICS ==========
    'Google Analytics': /\bgoogle analytics\b/i,
    'Mixpanel': /\bmixpanel\b/i,
    'Amplitude': /\bamplitude\b/i,
    'Segment': /\bsegment\b/i,
    'Mailchimp': /\bmailchimp\b/i,
    'SendGrid': /\bsendgrid\b/i,
    'HubSpot': /\bhubspot\b/i,
    'Salesforce': /\bsalesforce\b/i,
    'Intercom': /\bintercom\b/i,
    'Zendesk': /\bzendesk\b/i,

    // ========== RESEARCH & WRITING ==========
    'Zotero': /\bzotero\b/i,
    'Mendeley': /\bmendeley\b/i,
    'EndNote': /\bendnote\b/i,
    'Overleaf': /\boverleaf\b/i,
    'Grammarly': /\bgrammarly\b/i,
    'Hemingway': /\bhemingway editor\b/i,
    'Scrivener': /\bscrivener\b/i,

    // ========== PERSONAL & LIFESTYLE ==========
    'Calendar': /\bcalendar\b/i,
    'Fantastical': /\bfantastical\b/i,
    'MyFitnessPal': /\bmyfitnesspal\b/i,
    'Strava': /\bstrava\b/i,
    'Peloton': /\bpeloton\b/i,
    'YNAB': /\bynab\b/i,
    'Mint': /\bmint\b/i,
    'Personal Capital': /\bpersonal capital\b/i,
    'TripIt': /\btripit\b/i,
    'Google Maps': /\bgoogle maps\b/i
  };

  for (const [tool, pattern] of Object.entries(toolPatterns)) {
    if (pattern.test(content)) {
      context.tools_used.push(tool);
    }
  }

  // ============================================================================
  // 9. METHODOLOGY DETECTION - PHASE 15.8: HOW DIMENSION
  // ============================================================================
  // Captures development methodology, work approach, and implementation style

  const methodology = {};

  // Development Methodology
  const methodologyPatterns = {
    'agile': /\bagile\b|\bscrum\b|\bsprint\b|\bkanban\b/i,
    'waterfall': /\bwaterfall\b|\bsequential\b/i,
    'iterative': /\biterative\b|\bincremental\b|\biteration\b/i,
    'exploratory': /\bexplorator|\bexploratory|\bexperiment/i,
    'experimental': /\bexperimental\b|\bprototype\b|\bproof of concept\b|\bpoc\b/i,
    'lean': /\blean\b|\bmvp\b|minimum viable/i
  };

  for (const [method, pattern] of Object.entries(methodologyPatterns)) {
    if (pattern.test(content)) {
      methodology.development_method = method;
      break;
    }
  }

  // Work Approach
  const approachPatterns = {
    'tdd': /\btdd\b|test[- ]driven|write tests first/i,
    'pair_programming': /\bpair programming\b|\bpairing\b|working together/i,
    'mob_programming': /\bmob programming\b|\bmobbing\b/i,
    'solo': /\bsolo\b|\bindependent|\balone\b/i,
    'collaborative': /\bcollaborat|team effort|\bworking with\b/i,
    'code_review': /\bcode review\b|\bpull request\b|\bpr review\b/i
  };

  for (const [approach, pattern] of Object.entries(approachPatterns)) {
    if (pattern.test(content)) {
      methodology.work_approach = approach;
      break;
    }
  }

  // Implementation Style
  const implementationPatterns = {
    'incremental': /\bincremental\b|\bstep[- ]by[- ]step\b|\bgradual/i,
    'big_bang': /\bbig[- ]bang\b|\ball[- ]at[- ]once\b|\bcomplete rewrite\b/i,
    'refactoring_driven': /\brefactor|\brestructur|\bcleanup\b/i,
    'greenfield': /\bgreenfield\b|\bfrom scratch\b|\bnew project\b/i,
    'brownfield': /\bbrownfield\b|\blegacy\b|\bexisting code\b/i
  };

  for (const [style, pattern] of Object.entries(implementationPatterns)) {
    if (pattern.test(content)) {
      methodology.implementation_style = style;
      break;
    }
  }

  // Development Process
  const processPatterns = {
    'design_first': /\bdesign[- ]first\b|\bmockup\b|\bwireframe\b|\bprototype first\b/i,
    'code_first': /\bcode[- ]first\b|\bstart coding\b|\bstraight to code\b/i,
    'research_driven': /\bresearch[- ]driven\b|\binvestigat|\bexplor|\bstudy\b/i,
    'data_driven': /\bdata[- ]driven\b|\bmetrics\b|\banalytics\b/i,
    'documentation_first': /\bdocument first\b|\bspec first\b|\brequirements first\b/i
  };

  for (const [process, pattern] of Object.entries(processPatterns)) {
    if (pattern.test(content)) {
      methodology.process = process;
      break;
    }
  }

  // Store methodology in metadata (will be saved to DB)
  context.methodology = methodology;

  // ============================================================================
  // 10. CLUSTERING HINTS GENERATION
  // ============================================================================

  context.clustering_hints = {
    belongs_to_project: context.project_name,
    belongs_to_component: context.project_component,
    belongs_to_feature: context.feature_name,
    phase_number: extractPhaseNumber(context.phase),
    primary_intent: detectPrimaryIntent(content),
    work_category: detectWorkCategory(context.project_component, content)
  };

  return context;
}

/**
 * Generate intelligent title from extracted context
 *
 * Template hierarchy (most specific to least):
 * 1. Project + Feature + Phase: "Purmemo - Timeline View - Phase 14.10"
 * 2. Project + Component + Feature: "Purmemo Frontend - Timeline View"
 * 3. Project + Work Type + Feature: "Purmemo - Timeline View - Bug Fix"
 * 4. Project + Phase: "Purmemo - Phase 14.10 Progress"
 * 5. Component + Feature: "Frontend - Timeline View"
 * 6. Feature + Status: "Timeline View - Completed"
 * 7. Fallback: Extract first meaningful line
 */
function generateIntelligentTitle(context, conversationContent) {
  const {
    project_name,
    project_component,
    feature_name,
    phase,
    status,
    clustering_hints
  } = context;

  // Template 1: Project + Feature + Phase (most specific)
  if (project_name && feature_name && phase) {
    return `${project_name} - ${feature_name} - ${phase}`;
  }

  // Template 2: Project + Component + Feature
  if (project_name && project_component && feature_name) {
    return `${project_name} ${project_component} - ${feature_name}`;
  }

  // Template 3: Project + Work Type + Feature
  if (project_name && clustering_hints?.primary_intent && feature_name) {
    const action = clustering_hints.primary_intent.replace('_', ' ');
    const actionTitle = action.charAt(0).toUpperCase() + action.slice(1);
    return `${project_name} - ${feature_name} - ${actionTitle}`;
  }

  // Template 4: Project + Phase
  if (project_name && phase) {
    return `${project_name} - ${phase} Progress`;
  }

  // Template 5: Component + Feature
  if (project_component && feature_name) {
    return `${project_component} - ${feature_name}`;
  }

  // Template 6: Feature + Status
  if (feature_name && status) {
    const statusTitle = status.replace('_', ' ').charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');
    return `${feature_name} - ${statusTitle}`;
  }

  // Template 7: Project only
  if (project_name) {
    return `${project_name} - Development Update`;
  }

  // Fallback: Extract first meaningful line
  return extractFirstMeaningfulLine(conversationContent);
}

/**
 * Extract progress indicators from conversation
 *
 * Returns JSONB structure:
 * {
 *   completed: ["Item 1", "Item 2"],
 *   in_progress: ["Item 3"],
 *   blocked: ["Item 4"]
 * }
 */
function extractProgressIndicators(content) {
  const indicators = {
    completed: [],
    in_progress: [],
    blocked: []
  };

  // Pattern: Emoji-prefixed lists
  const completedPattern = /(?:✅|✓|☑)\s*(.+?)(?=\n|$)/g;
  const inProgressPattern = /(?:🚧|⚙️|🔨)\s*(.+?)(?=\n|$)/g;
  const blockedPattern = /(?:❌|🚫|⛔)\s*(.+?)(?=\n|$)/g;

  let match;
  while ((match = completedPattern.exec(content)) !== null) {
    indicators.completed.push(match[1].trim());
  }
  while ((match = inProgressPattern.exec(content)) !== null) {
    indicators.in_progress.push(match[1].trim());
  }
  while ((match = blockedPattern.exec(content)) !== null) {
    indicators.blocked.push(match[1].trim());
  }

  return indicators;
}

/**
 * Detect relationship between memories
 *
 * Returns arrays of memory IDs for:
 * - related_to: Sibling work (same feature area)
 * - depends_on: Prerequisites (this work depends on)
 * - blocks: Dependent work (other work waiting on this)
 */
function extractRelationships(content) {
  const relationships = {
    related_to: [],
    depends_on: [],
    blocks: []
  };

  // Pattern: "depends on Phase X", "requires [feature]", "needs [work]"
  const dependsPattern = /(?:depends? on|requires?|needs?)\s+([A-Z][a-zA-Z\s]+(?:Phase\s+\d+(?:\.\d+)?|[A-Z][a-zA-Z\s]+))/gi;
  let match;
  while ((match = dependsPattern.exec(content)) !== null) {
    relationships.depends_on.push(match[1].trim());
  }

  // Pattern: "blocks [feature]", "blocking [work]"
  const blocksPattern = /(?:blocks?|blocking)\s+([A-Z][a-zA-Z\s]+)/gi;
  while ((match = blocksPattern.exec(content)) !== null) {
    relationships.blocks.push(match[1].trim());
  }

  // Pattern: "related to [work]", "similar to [feature]"
  const relatedPattern = /(?:related to|similar to|continues)\s+([A-Z][a-zA-Z\s]+(?:Phase\s+\d+(?:\.\d+)?)?)/gi;
  while ((match = relatedPattern.exec(content)) !== null) {
    relationships.related_to.push(match[1].trim());
  }

  return relationships;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function normalizeProjectName(name) {
  // Remove common prefixes/suffixes
  name = name.replace(/^(app-|project-|the-)/i, '');
  name = name.replace(/(-app|-project)$/i, '');

  // Convert kebab-case or snake_case to Title Case
  return name
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function normalizeFeatureName(name) {
  // Remove common suffixes
  name = name.replace(/\s*(?:feature|component|view|page|modal|widget)$/i, '');

  // Convert kebab-case or snake_case to Title Case
  return name
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function extractPhaseNumber(phase) {
  if (!phase) return null;

  const match = phase.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

function detectPrimaryIntent(content) {
  // Analyze what type of work this is
  const intentPatterns = {
    'bug_fix': /\b(?:fix|bug|error|issue|problem|resolved)\b/i,
    'feature': /\b(?:add|new|implement|create|feature|functionality)\b/i,
    'refactor': /\b(?:refactor|restructure|reorganize|improve|optimize)\b/i,
    'planning': /\b(?:plan|design|propose|discuss|consider)\b/i,
    'documentation': /\b(?:document|readme|docs|comment|explain)\b/i,
    'testing': /\b(?:test|spec|coverage|validate)\b/i,
    'deployment': /\b(?:deploy|release|publish|ship)\b/i
  };

  for (const [intent, pattern] of Object.entries(intentPatterns)) {
    if (pattern.test(content)) {
      return intent;
    }
  }

  return 'development'; // Default
}

function detectWorkCategory(component, content) {
  if (component === 'Frontend' || component === 'Backend') {
    return 'development';
  }
  if (component === 'Infrastructure' || component === 'Database') {
    return 'infrastructure';
  }
  if (component === 'Documentation') {
    return 'documentation';
  }
  if (component === 'Testing') {
    return 'testing';
  }

  // Fallback: analyze content
  if (/\b(?:design|ui|ux|mockup)\b/i.test(content)) {
    return 'design';
  }

  return 'development'; // Default
}

function extractFirstMeaningfulLine(content) {
  // Extract first non-empty, non-meta line
  const lines = content.split('\n');
  for (const line of lines) {
    const cleaned = line.trim().replace(/^[#=\-*]+\s*/, ''); // Remove markdown headers
    if (cleaned.length > 10 && cleaned.length < 100 && !cleaned.startsWith('USER:') && !cleaned.startsWith('ASSISTANT:')) {
      return cleaned;
    }
  }

  // Fallback: use timestamp
  return `Conversation ${new Date().toISOString()}`;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  extractProjectContext,
  generateIntelligentTitle,
  extractProgressIndicators,
  extractRelationships
};
