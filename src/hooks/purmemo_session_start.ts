#!/usr/bin/env node
/**
 * Purmemo Claude Code SessionStart Hook
 *
 * Fires at session start. Recalls relevant memories and injects
 * context into the conversation. Also updates session context.
 */

import * as path from 'node:path';
import * as https from 'node:https';
import { dbg as _dbg, readState, writeState, loadApiKey } from './hook-utils.js';
import type { HookData } from '../types.js';

const API_URL = process.env.PURMEMO_API_URL || 'https://api.purmemo.ai';
const MAX_MEMORIES = 5;
const MAX_MEMORY_CHARS = 300;

const dbg = (msg: string) => _dbg('session_start', msg);

interface RecalledMemory {
  title?: string;
  conversation_title?: string;
  content?: string;
  created_at?: string;
}

function postSessionContext(apiKey: string, project: string, platform: string): Promise<number | null> {
  return new Promise((resolve) => {
    const body = JSON.stringify({ project, platform, auto: true });
    const url = new URL('/api/v1/identity/session', API_URL);
    const options: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 5000,
    };
    const req = https.request(options, (res) => {
      res.resume();
      resolve(res.statusCode ?? null);
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

function searchMemories(apiKey: string, query: string): Promise<RecalledMemory[]> {
  return new Promise((resolve) => {
    const params = new URLSearchParams({ q: query, limit: String(MAX_MEMORIES), platform: 'claude-code' });
    const url = new URL(`/api/v1/memories/search?${params}`, API_URL);
    const options: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 8000,
    };
    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve(Array.isArray(body) ? body : (body.memories || body.results || []));
        } catch { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
    req.end();
  });
}

function formatMemories(memories: RecalledMemory[], projectName: string, source: string): string | null {
  if (!memories.length) return null;
  const lines: string[] = [
    `[Purmemo — passive recall for "${projectName}"]`,
    `${memories.length} relevant ${memories.length > 1 ? 'memories' : 'memory'} found from past sessions:\n`,
  ];
  for (const mem of memories) {
    const title = mem.title || mem.conversation_title || 'Untitled';
    const preview = (mem.content || '')
      .replace(/=== CONVERSATION START ===|=== .* ===/g, '')
      .replace(/\n+/g, ' ')
      .trim()
      .slice(0, MAX_MEMORY_CHARS);
    const date = mem.created_at
      ? new Date(mem.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : '';
    lines.push(`• ${title}${date ? ` (${date})` : ''}`);
    if (preview) lines.push(`  ${preview}${preview.length >= MAX_MEMORY_CHARS ? '…' : ''}`);
    lines.push('');
  }
  lines.push(source === 'resume'
    ? '(Session resumed — context above from Purmemo memory)'
    : '(New session — context above auto-loaded from Purmemo. Ask to recall more if needed.)');
  return lines.join('\n');
}

async function main(): Promise<void> {
  let hookData: HookData & { cwd?: string; source?: string };
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString('utf8').trim();
    if (!text) return;
    hookData = JSON.parse(text);
  } catch { return; }

  const { session_id, cwd, source } = hookData;
  dbg(`fired — source=${source} session=${session_id} cwd=${cwd}`);

  if (source === 'compact' || source === 'clear') {
    dbg(`skip — source=${source}`);
    return;
  }

  const apiKey = loadApiKey();
  if (!apiKey) { dbg('skip — no api key'); return; }

  const projectName = path.basename(cwd || process.cwd());

  postSessionContext(apiKey, projectName, 'claude-code').then(status => {
    dbg(`auto session context POST → ${status ?? 'error'}`);
  });

  const memories = await searchMemories(apiKey, projectName);
  dbg(`recalled ${memories.length} memories for query="${projectName}"`);

  if (!memories.length) { dbg('no memories found'); return; }

  const context = formatMemories(memories, projectName, source || 'new');
  if (!context) return;

  dbg(`injecting context — ${context.length} chars`);

  const state = readState();
  state[`session_recall_${session_id}`] = {
    project: projectName,
    titles: memories.map(m => m.title || 'Untitled'),
  };
  writeState(state);

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: context,
    },
    systemMessage: `Purmemo recalled ${memories.length} ${memories.length > 1 ? 'memories' : 'memory'} for "${projectName}":\n${memories.map(m => `  • ${m.title || 'Untitled'}`).join('\n')}`,
  }));
}

main().catch(() => {});
