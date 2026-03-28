/**
 * Shared type definitions for purmemo-mcp
 * All interfaces used across multiple modules live here.
 */

// ============================================================================
// MCP Protocol Types
// ============================================================================

export interface ToolAnnotations {
  title: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export interface ToolMeta {
  'openai/outputTemplate'?: string;
  'openai/toolInvocation/invoking'?: string;
  'openai/toolInvocation/invoked'?: string;
  'openai/widgetAccessible'?: boolean;
  'openai/widgetDomain'?: string;
  [key: string]: string | boolean | undefined;
}

export interface MCPTool {
  name: string;
  annotations: ToolAnnotations;
  _meta?: ToolMeta;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  _meta?: Record<string, unknown>;
}

export interface MCPResourceTemplate {
  uriTemplate: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface MCPPromptArgument {
  name: string;
  description: string;
  required: boolean;
}

export interface MCPPrompt {
  name: string;
  description: string;
  arguments: MCPPromptArgument[];
}

export interface MCPToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

// ============================================================================
// Workflow Engine Types
// ============================================================================

export type WorkflowCategory = 'product' | 'strategy' | 'engineering' | 'business' | 'operations' | 'content';

export interface WorkflowTemplate {
  name: string;
  display_name: string;
  category: WorkflowCategory;
  description: string;
  memory_queries: string[];
  signals: string[];
  route_chain: string[];
  prompt: string;
}

export type WorkflowTemplateMap = Record<string, WorkflowTemplate>;

export interface WorkflowClassification {
  workflow: string | null;
  confidence: 'high' | 'medium' | 'none';
  chain: string[];
}

// ============================================================================
// Content & Memory Types
// ============================================================================

export interface ContentMetadata {
  characterCount: number;
  wordCount: number;
  hasCodeBlocks: boolean;
  codeBlockCount: number;
  hasArtifacts: boolean;
  artifactCount: number;
  hasUrls: boolean;
  urlCount: number;
  hasFilePaths: boolean;
  filePathCount: number;
  conversationTurns: number;
  conversationId?: string;
  intelligent?: IntelligentContext;
  session_context?: SessionContext;
  captureType?: string;
  isComplete?: boolean;
  lastUpdated?: string;
  [key: string]: unknown;
}

export interface SessionContext {
  session_id?: string;
  project?: string;
  context?: string;
  focus?: string;
  platform?: string;
}

export interface WisdomSuggestion {
  tool: string;
  reason: string;
  confidence: number;
  url: string;
  best_for: string[];
  context_prompt: string;
}

// ============================================================================
// Intelligent Memory Types (from intelligent-memory.js)
// ============================================================================

export interface IntelligentContext {
  project_name: string | null;
  project_component: string | null;
  feature_name: string | null;
  phase: string | null;
  status: 'completed' | 'in_progress' | 'blocked' | 'planning' | null;
  progression_from: string | null;
  technologies: string[];
  tools_used: string[];
  related_work: string[];
  clustering_hints: ClusteringHints;
  methodology?: Methodology;
  progress_indicators?: ProgressIndicators;
  [key: string]: unknown;
}

export interface ClusteringHints {
  belongs_to_project: string | null;
  belongs_to_component: string | null;
  belongs_to_feature: string | null;
  phase_number: number | null;
  primary_intent: string;
  work_category: string;
}

export interface Methodology {
  development_method?: string;
  work_approach?: string;
  implementation_style?: string;
  process?: string;
}

export interface ProgressIndicators {
  completed: string[];
  in_progress: string[];
  blocked: string[];
}

export interface Relationships {
  related_to: string[];
  depends_on: string[];
  blocks: string[];
}

// ============================================================================
// Save / Chunk Types
// ============================================================================

export interface SaveConversationArgs {
  conversationContent: string;
  title?: string;
  conversationId?: string;
  tags?: string[];
  priority?: 'low' | 'medium' | 'high';
}

// ADR-025: Artifact Preservation
export type ArtifactType = 'research' | 'code' | 'table' | 'framework' | 'spec' | 'diagram' | 'other';

export interface SaveArtifactArgs {
  conversationId: string;
  title: string;
  type: ArtifactType;
  content: string;
  tags?: string[];
}

export interface RecallMemoriesArgs {
  query: string;
  limit?: number;
  includeChunked?: boolean;
  contentPreview?: boolean;
  entity?: string;
  initiative?: string;
  stakeholder?: string;
  deadline?: string;
  intent?: 'decision' | 'learning' | 'question' | 'blocker';
  has_observations?: boolean;
}

export interface GetMemoryDetailsArgs {
  memoryId: string;
  includeLinkedParts?: boolean;
}

export interface DiscoverRelatedArgs {
  query: string;
  limit?: number;
  relatedPerMemory?: number;
}

export interface RunWorkflowArgs {
  workflow?: string;
  input: string;
}

export interface ListWorkflowsArgs {
  category?: WorkflowCategory;
}

export interface ChunkedSaveResult {
  sessionId: string;
  totalParts: number;
  totalSize: number;
  indexId: string;
  parts: Array<{ partNumber: number; memoryId: string; size: number }>;
}

export interface SingleSaveResult {
  memoryId: string;
  size: number;
  wisdomSuggestion: WisdomSuggestion | null;
}

// ============================================================================
// Auth Types
// ============================================================================

export interface TokenData {
  access_token: string;
  token_type?: string;
  expires_at?: string;
  refresh_token?: string;
  user?: { id?: string; email?: string; tier?: string };
  user_tier?: string;
  memory_limit?: number | null;
}

export interface UserInfo {
  user_id?: string;
  email?: string;
  tier: string;
  memory_limit?: number | null;
  expires_at?: string;
}

export interface EncryptedPayload {
  iv: string;
  data: string;
}

// ============================================================================
// OAuth Types (remote)
// ============================================================================

export interface AuthCodeData {
  apiKey: string;
  refreshToken: string | null;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string | null;
  state: string | null;
  createdAt: number;
  expiresAt: number;
  used: boolean;
}

export interface StoreAuthCodeParams {
  code: string;
  apiKey: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope?: string | null;
  state?: string | null;
  refreshToken?: string | null;
}

export interface ExchangeCodeParams {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}

// ============================================================================
// Connection Monitoring Types
// ============================================================================

export interface ConnectionInfo {
  type?: string;
  connectedAt: number;
  lastActivity: number;
  toolCalls: Record<string, number>;
  errors: number;
}

export interface ConnectionEvent {
  type: 'connect' | 'disconnect';
  timestamp: number;
  connId?: string;
  success?: boolean;
  reason?: string;
  duration?: number;
}

export interface ConnectionRate {
  window_seconds: number;
  connects: number;
  failures: number;
  disconnects: number;
  success_rate: number;
  connections_per_minute: number;
}

export interface ConnectionMetrics {
  active_connections: number;
  total_connections: number;
  successful_connections: number;
  failed_connections: number;
  connection_rates: { last_1min: ConnectionRate; last_5min: ConnectionRate };
  auth_failures: { total: number; last_5min: number };
  alerts: { connection_surge: boolean; high_failure_rate: boolean; auth_failure_surge: boolean };
}

export interface ConnectionSummary {
  active: number;
  total: number;
  success_rate: number;
  connections: Array<{ id: string; duration_seconds: number; tool_calls: number; errors: number }>;
}

// ============================================================================
// Circuit Breaker Types
// ============================================================================

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerStatus {
  name: string;
  state: CircuitBreakerState;
  failureCount: number;
  totalCalls: number;
  totalFailures: number;
  openedAt: string | null;
}

// ============================================================================
// Session Types (remote MCP)
// ============================================================================

export interface MCPSession {
  token: string;
  createdAt: number;
  lastActivity: number;
}

export interface OAuthState {
  params: string;
  provider: 'google' | 'github';
  createdAt: number;
}

// ============================================================================
// Hook Types
// ============================================================================

export interface HookMessage {
  role?: string;
  content?: string | Array<{ type: string; text?: string }>;
}

export interface HookData {
  session_id?: string;
  tool_name?: string;
  transcript?: HookMessage[];
  messages?: HookMessage[];
  trigger?: string;
  cwd?: string;
  source?: string;
}

export interface MemoryPayload {
  content: string;
  title: string;
  conversation_id: string;
  platform: string;
  tags: string[];
  metadata: Record<string, unknown>;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ErrorDetail {
  timestamp: string;
  tool?: string;
  status?: number;
  error: string;
}

export interface HealthResponse {
  status: string;
  version: string;
  timestamp: string;
  active_connections: number;
  metrics: {
    memory_usage_mb: number;
    heap_used_mb: number;
    uptime_seconds: number;
    uptime_human: string;
    total_connections: number;
  };
  tool_usage: Record<string, number>;
  performance: {
    error_rate_percent: number;
    total_errors: number;
    recent_errors: ErrorDetail[];
  };
  backend_api: {
    url: string;
    status: string;
    latency_ms: number | null;
  };
  circuit_breaker: {
    state: CircuitBreakerState;
    consecutive_failures: number;
  };
  service_info: {
    version: string;
    runtime: string;
    api_backend: string;
    environment: string;
    capabilities: string[];
  };
}
