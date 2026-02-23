#!/usr/bin/env node
/**
 * Purmemo Claude Code Stop Hook — Auto-Save
 *
 * Fires on Claude Code Stop event. Saves the full session transcript
 * to Purmemo as a living document. Uses a 2-minute cooldown to avoid
 * duplicate saves (Stop fires after every assistant turn, not just close).
 *
 * Silent on all errors — never blocks Claude Code.
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import crypto from 'node:crypto';
import os from 'node:os';

const API_URL = process.env.PURMEMO_API_URL || 'https://api.purmemo.ai';
const STATE_FILE = path.join(os.homedir(), '.claude', 'hooks', 'purmemo_state.json');
const DEBUG_LOG  = path.join(os.homedir(), '.claude', 'hooks', 'purmemo_debug.log');
const COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes between saves per session
const MIN_CHARS = 500;

function dbg(msg) {
  try { fs.appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] [stop] ${msg}\n`); } catch {}
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

  const { session_id, transcript } = hookData;
  if (!session_id) return;
  dbg(`fired — session=${session_id} cwd=${process.env.PWD || process.cwd()}`);

  // Cooldown check
  const state = readState();
  const now = Date.now();
  const lastSaved = state[`stop_${session_id}`] || 0;
  const cooldownRemaining = COOLDOWN_MS - (now - lastSaved);
  if (cooldownRemaining > 0) {
    dbg(`skip — cooldown active (${Math.round(cooldownRemaining / 1000)}s remaining)`);
    return;
  }

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
    tags: ['claude-code', 'auto-captured', projectName],
    metadata: {
      source: 'claude_code_stop_hook',
      session_id,
      project_path: cwd,
      captured_at: new Date().toISOString(),
    },
  });

  if (result?.id || result?.memory_id) {
    state[`stop_${session_id}`] = now;
    writeState(state);
    dbg(`saved — title="${title}" messages=${messages.length} chars=${content.length}`);
  } else {
    dbg(`error — unexpected response: ${JSON.stringify(result)?.slice(0, 200)}`);
  }
}

main().catch(() => {});
