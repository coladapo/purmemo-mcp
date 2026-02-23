#!/usr/bin/env node
/**
 * Purmemo Claude Code SessionStart Hook — Passive Recall
 *
 * Fires once when a Claude Code session starts. Searches Purmemo for
 * recent memories about the current project and injects them as context —
 * so Claude already knows what you were working on before you type a word.
 *
 * source=startup  → full context injection (new terminal, needs orientation)
 * source=resume   → light injection (continuing known session)
 * source=compact  → skip (Claude already has context, just compacted)
 * source=clear    → skip (user intentionally cleared, respect that)
 *
 * Output: systemMessage (visible banner) + additionalContext (silent, for Claude)
 * Never blocks session start on any error.
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import crypto from 'node:crypto';
import os from 'node:os';

const API_URL        = process.env.PURMEMO_API_URL || 'https://api.purmemo.ai';
const STATE_FILE     = path.join(os.homedir(), '.claude', 'hooks', 'purmemo_state.json');
const DEBUG_LOG      = path.join(os.homedir(), '.claude', 'hooks', 'purmemo_debug.log');
const MAX_MEMORIES   = 5;
const MAX_MEMORY_CHARS = 800;

function dbg(msg) {
  try { fs.appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] [session_start] ${msg}\n`); } catch {}
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}

function writeState(state) {
  try {
    const tmp = STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
    fs.renameSync(tmp, STATE_FILE);
  } catch {}
}

function getEncryptionKey() {
  const machineId = os.hostname() + os.userInfo().username;
  return crypto.createHash('sha256').update(machineId).digest();
}

function loadApiKey() {
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

function searchMemories(apiKey, query) {
  return new Promise((resolve) => {
    const params = new URLSearchParams({ q: query, limit: String(MAX_MEMORIES), platform: 'claude-code' });
    const url    = new URL(`/api/v1/memories/search?${params}`, API_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 8000,
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
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

function formatMemories(memories, projectName, source) {
  if (!memories.length) return null;
  const lines = [
    `[Purmemo — passive recall for "${projectName}"]`,
    `${memories.length} relevant ${memories.length > 1 ? 'memories' : 'memory'} found from past sessions:\n`,
  ];
  for (const mem of memories) {
    const title   = mem.title || mem.conversation_title || 'Untitled';
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

async function main() {
  let hookData;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
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
  const memories    = await searchMemories(apiKey, projectName);
  dbg(`recalled ${memories.length} memories for query="${projectName}"`);

  if (!memories.length) { dbg('no memories found'); return; }

  const context = formatMemories(memories, projectName, source);
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
    systemMessage: `🧠 Purmemo recalled ${memories.length} ${memories.length > 1 ? 'memories' : 'memory'} for "${projectName}":\n${memories.map(m => `  • ${m.title || 'Untitled'}`).join('\n')}`,
  }));
}

main().catch(() => {});
