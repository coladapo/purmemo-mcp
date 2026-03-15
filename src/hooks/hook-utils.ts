/**
 * Shared utilities for Purmemo Claude Code hooks
 * Extracted from heartbeat, precompact, save, and session_start hooks
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as https from 'node:https';
import * as crypto from 'node:crypto';
import * as os from 'node:os';
import type { HookMessage, MemoryPayload } from '../types.js';

const API_URL = process.env.PURMEMO_API_URL || 'https://api.purmemo.ai';
const STATE_FILE = path.join(os.homedir(), '.claude', 'hooks', 'purmemo_state.json');
const DEBUG_LOG = path.join(os.homedir(), '.claude', 'hooks', 'purmemo_debug.log');

export function dbg(hookName: string, msg: string): void {
  try { fs.appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] [${hookName}] ${msg}\n`); } catch {}
}

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

export function getEncryptionKey(): Buffer {
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

export function buildContent(messages: HookMessage[]): string {
  return messages
    .filter((m: HookMessage) => m.role && m.content)
    .map((m: HookMessage) => {
      const role = m.role === 'user' ? 'Human' : 'Assistant';
      const text = typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content)
          ? m.content.filter((b: { type: string; text?: string }) => b.type === 'text').map((b: { type: string; text?: string }) => b.text || '').join('\n')
          : String(m.content);
      return `${role}: ${text}`;
    })
    .join('\n\n');
}

export interface PostMemoryResult {
  id?: string;
  memory_id?: string;
}

export function postMemory(apiKey: string, payload: MemoryPayload): Promise<PostMemoryResult | null> {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const url = new URL('/api/v1/memories/', API_URL);
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
      timeout: 15000,
    };
    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as PostMemoryResult); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

export { API_URL, STATE_FILE, DEBUG_LOG };
