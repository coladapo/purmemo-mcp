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
  // e.g., /Users/wivak/projects/purmemo/v1-mvp/frontend/...
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
  // 2. COMPONENT DETECTION
  // ============================================================================

  const componentPatterns = {
    'Frontend': [/frontend/i, /client/i, /ui\//, /components\//, /pages\//, /react/i, /vue/i, /angular/i],
    'Backend': [/backend/i, /server/i, /api\//, /routes\//, /controllers\//, /express/i, /fastapi/i],
    'Database': [/database/i, /migrations\//, /schema/i, /models\//, /postgres/i, /mongo/i, /sql/i],
    'MCP Server': [/mcp[_-]?server/i, /mcp\//, /@modelcontextprotocol/i],
    'Authentication': [/auth/i, /login/i, /authentication/i, /jwt/i, /oauth/i],
    'Infrastructure': [/docker/i, /kubernetes/i, /terraform/i, /deployment/i, /ci\/cd/i],
    'Testing': [/test/i, /spec\./i, /\.test\./i, /__tests__\//i, /jest/i, /pytest/i],
    'Documentation': [/docs\//i, /readme/i, /documentation/i, /\.md$/i]
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
  // 7. TECHNOLOGY STACK DETECTION
  // ============================================================================

  const techPatterns = {
    // Frontend
    'React': /\breact\b/i,
    'Next.js': /\bnext(?:\.?js)?\b/i,
    'Vue': /\bvue(?:\.?js)?\b/i,
    'TypeScript': /\btypescript\b|\.tsx?\b/i,
    'JavaScript': /\bjavascript\b|\.jsx?\b/i,
    'Tailwind CSS': /\btailwind(?:\s*css)?\b/i,

    // Backend
    'Node.js': /\bnode(?:\.?js)?\b/i,
    'Express': /\bexpress(?:\.?js)?\b/i,
    'FastAPI': /\bfastapi\b/i,
    'Python': /\bpython\b|\.py\b/i,
    'Go': /\bgolang\b|\bgo\b/i,
    'Rust': /\brust\b|\.rs\b/i,

    // Database
    'PostgreSQL': /\bpostgres(?:ql)?\b/i,
    'MongoDB': /\bmongo(?:db)?\b/i,
    'Redis': /\bredis\b/i,
    'Supabase': /\bsupabase\b/i,

    // Infrastructure
    'Docker': /\bdocker\b/i,
    'Kubernetes': /\bkubernetes\b|\bk8s\b/i,
    'Railway': /\brailway\b/i,
    'Vercel': /\bvercel\b/i,
    'Render': /\brender\b/i
  };

  for (const [tech, pattern] of Object.entries(techPatterns)) {
    if (pattern.test(content)) {
      context.technologies.push(tech);
    }
  }

  // ============================================================================
  // 8. TOOLS USED DETECTION
  // ============================================================================

  const toolPatterns = {
    'Claude Code': /\bclaude\s*code\b/i,
    'Claude': /\bclaude\b/i,
    'ChatGPT': /\bchatgpt\b/i,
    'Gemini': /\bgemini\b/i,
    'VS Code': /\bvs\s*code\b|\bvscode\b/i,
    'Git': /\bgit\b/i,
    'GitHub': /\bgithub\b/i,
    'npm': /\bnpm\b/i,
    'yarn': /\byarn\b/i,
    'pnpm': /\bpnpm\b/i,
    'Cursor': /\bcursor\b/i,
    'Windsurf': /\bwindsurf\b/i
  };

  for (const [tool, pattern] of Object.entries(toolPatterns)) {
    if (pattern.test(content)) {
      context.tools_used.push(tool);
    }
  }

  // ============================================================================
  // 9. CLUSTERING HINTS GENERATION
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
