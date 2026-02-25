#!/usr/bin/env node
/**
 * Purmemo Claude Code PostToolUse Hook — Heartbeat Save
 *
 * Fires after every tool call (Bash, Edit, Write, Task, MultiEdit).
 * Counts tool calls per session. Every TOOL_CALL_THRESHOLD calls,
 * saves a mid-session snapshot to Purmemo.
 *
 * Catches long sessions that end without triggering the Stop hook.
 * Silent on all errors — never blocks Claude Code.
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import crypto from 'node:crypto';
import os from 'node:os';
import readline from 'node:readline/promises';

const API_URL            = process.env.PURMEMO_API_URL || 'https://api.purmemo.ai';
const STATE_FILE         = path.join(os.homedir(), '.claude', 'hooks', 'purmemo_state.json');
const DEBUG_LOG          = path.join(os.homedir(), '.claude', 'hooks', 'purmemo_debug.log');
const TOOL_CALL_THRESHOLD = 10;
const MIN_CHARS           = 200;

function dbg(msg) {
  try { fs.appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] [heartbeat] ${msg}\n`); } catch {}
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

function buildContent(messages) {
  return messages
    .filter(m => m.role && m.content)
    .map(m => {
      const role = m.role === 'user' ? 'Human' : 'Assistant';
      const text = typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content)
          ? m.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
          : String(m.content);
      return `${role}: ${text}`;
    })
    .join('\n\n');
}

function postMemory(apiKey, payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const url  = new URL('/api/v1/memories/', API_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 15000,
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
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

async function main() {
  let hookData;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString('utf8').trim();
    if (!text) return;
    hookData = JSON.parse(text);
  } catch { return; }

  const { session_id, tool_name, transcript } = hookData;
  if (!session_id) return;

  const state    = readState();
  const countKey = `hb_count_${session_id}`;
  const count    = (state[countKey] || 0) + 1;
  state[countKey] = count;
  writeState(state);

  const nextSave = Math.ceil(count / TOOL_CALL_THRESHOLD) * TOOL_CALL_THRESHOLD;

  if (count === 1) dbg(`new session detected — session=${session_id}`);
  dbg(`tick ${count} (next save at ${nextSave}) tool=${tool_name}`);

  if (count % TOOL_CALL_THRESHOLD !== 0) return;

  // Threshold reached — save
  dbg(`threshold reached (${count}) tool=${tool_name} — saving...`);

  const apiKey = loadApiKey();
  if (!apiKey) { dbg('skip — no api key'); return; }

  const messages = Array.isArray(transcript) ? transcript : [];
  const content  = buildContent(messages);
  if (content.length < MIN_CHARS) { dbg(`skip — content too short (${content.length} chars)`); return; }

  const cwd         = process.env.PWD || process.cwd();
  const projectName = path.basename(cwd);
  const date        = new Date().toISOString().split('T')[0];
  const title       = `${projectName} - Claude Code - ${date}`;

  const result = await postMemory(apiKey, {
    content,
    title,
    conversation_id: `claude-code-${session_id}`,
    platform: 'claude-code',
    tags: ['claude-code', 'auto-captured', 'heartbeat', projectName],
    metadata: {
      source: 'claude_code_heartbeat_hook',
      session_id,
      tool_call_count: count,
      project_path: cwd,
      captured_at: new Date().toISOString(),
    },
  });

  if (result?.id || result?.memory_id) {
    dbg(`saved — tool_call_count=${count} messages=${messages.length} chars=${content.length}`);
  } else {
    dbg(`error — ${JSON.stringify(result)?.slice(0, 200)}`);
  }
}

main().catch(() => {});
