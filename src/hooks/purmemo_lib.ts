/**
 * Purmemo Claude Code Hooks — Shared Library
 *
 * Single source of truth for auth, transcript reading, API calls,
 * and state management. All hooks import from here.
 *
 * Self-contained: no imports from parent directories. These files are
 * copied standalone to ~/.claude/hooks/ during setup.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as https from 'node:https';
import * as crypto from 'node:crypto';
import * as os from 'node:os';

// ─── Types (self-contained, no ../types.js imports) ──────────────────────────

export interface HookInput {
  session_id?: string;
  cwd?: string;
  source?: string;
  hook_event_name?: string;
  tool_name?: string;
  transcript_path?: string;
  prompt?: string;
  trigger?: string;
}

export interface TranscriptEntry {
  type?: string;
  role?: string;
  message?: {
    role?: string;
    content?: string | Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }>;
  } | string;
  [key: string]: unknown;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Stamped at build time by setup.ts — used for update-notifier pattern */
export const HOOKS_VERSION = '__HOOKS_VERSION__';

const API_URL    = process.env.PURMEMO_API_URL || 'https://api.purmemo.ai';
const STATE_FILE = path.join(os.homedir(), '.claude', 'hooks', 'purmemo_state.json');
const DEBUG_LOG  = path.join(os.homedir(), '.claude', 'hooks', 'purmemo_debug.log');

// ─── Debug logging ───────────────────────────────────────────────────────────

export function dbg(tag: string, msg: string): void {
  try { fs.appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] [${tag}] ${msg}\n`); } catch {}
}

// ─── State management ────────────────────────────────────────────────────────

export function readState(): Record<string, unknown> {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}

export function writeState(state: Record<string, unknown>): void {
  try {
    const tmp = STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
    fs.renameSync(tmp, STATE_FILE);
  } catch {}
}

// ─── Auth ────────────────────────────────────────────────────────────────────

function getEncryptionKey(): Buffer {
  const machineId = os.hostname() + os.userInfo().username;
  return crypto.createHash('sha256').update(machineId).digest();
}

export function loadApiKey(): string | null {
  try {
    if (process.env.PURMEMO_API_KEY) return process.env.PURMEMO_API_KEY;
    const tokenFile = path.join(os.homedir(), '.purmemo', 'auth.json');
    if (!fs.existsSync(tokenFile)) return null;
    const encryptedData = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(), iv);
    let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted).access_token || null;
  } catch { return null; }
}

// ─── Transcript reading ──────────────────────────────────────────────────────

export function readTranscript(transcriptPath: string | undefined): TranscriptEntry[] {
  try {
    if (!transcriptPath || !fs.existsSync(transcriptPath)) return [];
    const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);
    return lines.map(line => {
      try { return JSON.parse(line) as TranscriptEntry; } catch { return null; }
    }).filter((e): e is TranscriptEntry => e !== null);
  } catch { return []; }
}

export function extractMessages(entries: TranscriptEntry[]): Message[] {
  const messages: Message[] = [];
  for (const entry of entries) {
    const role: 'user' | 'assistant' | null =
      entry.type === 'user' || entry.type === 'human' ? 'user'
      : entry.type === 'assistant' ? 'assistant'
      : null;
    if (!role) continue;

    const msg = entry.message;
    const text = typeof msg === 'string' ? msg
      : typeof msg?.content === 'string' ? msg.content
      : Array.isArray(msg?.content)
        ? (msg.content as Array<{ type: string; text?: string }>)
            .filter(b => b.type === 'text')
            .map(b => b.text || '')
            .join('\n')
      : '';
    if (text.trim()) messages.push({ role, content: text.trim() });
  }
  return messages;
}

export function buildContent(messages: Message[]): string {
  return messages
    .filter(m => m.role && m.content)
    .map(m => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`)
    .join('\n\n');
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────

export function apiGet(apiKey: string, urlPath: string, timeout = 8000): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const url = new URL(urlPath, API_URL);
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      timeout,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

export function apiPost(apiKey: string, urlPath: string, payload: unknown, timeout = 15000): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const url = new URL(urlPath, API_URL);
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

// ─── Chunked save (for content >90K) ─────────────────────────────────────────

const MAX_CONTENT = 90_000;  // stay under API's 100K Zod limit per chunk
const CHUNK_SIZE  = 20_000;  // match MCP server's chunk size

export function shouldChunk(content: string): boolean {
  return content.length > MAX_CONTENT;
}

function chunkContent(content: string): string[] {
  const chunks: string[] = [];
  let pos = 0;
  while (pos < content.length) {
    let end = Math.min(pos + CHUNK_SIZE, content.length);
    if (end < content.length) {
      const searchStart = Math.max(end - 1000, pos);
      const segment = content.slice(searchStart, end);
      const sectionBreak = segment.lastIndexOf('\n===');
      if (sectionBreak !== -1) { end = searchStart + sectionBreak; }
      else {
        const turnBreak = segment.lastIndexOf('\n\nHuman: ');
        if (turnBreak !== -1) { end = searchStart + turnBreak; }
        else {
          const paraBreak = segment.lastIndexOf('\n\n');
          if (paraBreak !== -1) { end = searchStart + paraBreak; }
        }
      }
    }
    chunks.push(content.slice(pos, end));
    pos = end;
  }
  return chunks;
}

export async function saveChunked(
  apiKey: string,
  content: string,
  title: string,
  conversationId: string,
  tags: string[],
  metadata: Record<string, unknown>,
): Promise<boolean> {
  const chunks = chunkContent(content);
  const totalParts = chunks.length;
  let success = true;

  for (let i = 0; i < chunks.length; i++) {
    const partNumber = i + 1;
    const result = await apiPost(apiKey, '/api/v1/memories/', {
      content: chunks[i],
      title: `${title} (${partNumber}/${totalParts})`,
      conversation_id: `${conversationId}:part:${partNumber}`,
      platform: 'claude-code',
      tags: [...tags, 'chunked-conversation', `session:${conversationId}`],
      metadata: { ...metadata, captureType: 'chunked', partNumber, totalParts, chunkSize: chunks[i].length },
    });
    if (!result?.id && !result?.memory_id) success = false;
  }

  // Create index
  const indexContent = `# ${title} - Index\n\nParts: ${totalParts}\nSize: ${content.length} chars\nSaved: ${new Date().toISOString()}\n\n${chunks.map((c, i) => `- Part ${i + 1}: ${c.length} chars`).join('\n')}`;
  await apiPost(apiKey, '/api/v1/memories/', {
    content: indexContent,
    title: `${title} — Index`,
    conversation_id: `${conversationId}:index`,
    platform: 'claude-code',
    tags: [...tags, 'chunked-conversation'],
    metadata: { ...metadata, captureType: 'index', totalParts },
  });

  return success;
}

// ─── Version check (update-notifier pattern) ────────────────────────────────

const VERSION_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // once per day

function isNewer(remote: string, local: string): boolean {
  const r = remote.split('.').map(Number);
  const l = local.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((r[i] || 0) > (l[i] || 0)) return true;
    if ((r[i] || 0) < (l[i] || 0)) return false;
  }
  return false;
}

export async function checkForUpdate(): Promise<string | null> {
  if (HOOKS_VERSION.startsWith('__')) return null; // not stamped (dev mode)
  const state = readState();
  const lastCheck = (state['version_last_check'] as number) || 0;
  if (Date.now() - lastCheck < VERSION_CHECK_INTERVAL) {
    // Return cached result if checked recently
    const cached = state['version_latest'] as string | undefined;
    if (cached && isNewer(cached, HOOKS_VERSION)) return cached;
    return null;
  }

  try {
    const result = await new Promise<string | null>((resolve) => {
      const req = https.request({
        hostname: 'registry.npmjs.org',
        path: '/purmemo-mcp/latest',
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        timeout: 3000,
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            resolve(data.version || null);
          } catch { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.end();
    });

    if (result) {
      state['version_last_check'] = Date.now();
      state['version_latest'] = result;
      writeState(state);
      if (isNewer(result, HOOKS_VERSION)) return result;
    }
  } catch {}
  return null;
}

// ─── Hook stdin reader ───────────────────────────────────────────────────────

export async function readHookInput(): Promise<HookInput | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return null;
  return JSON.parse(text) as HookInput;
}
