#!/usr/bin/env node
/**
 * Purmemo Claude Code Stop Hook — Session End Save
 *
 * Fires when Claude Code session ends. Saves the full transcript
 * with a 2-minute cooldown.
 */

import * as path from 'node:path';
import { dbg as _dbg, readState, writeState, loadApiKey, buildContent, postMemory } from './hook-utils.js';
import type { HookData, HookMessage } from '../types.js';

const COOLDOWN_MS = 120_000; // 2 minutes
const MIN_CHARS = 200;

const dbg = (msg: string) => _dbg('save', msg);

async function main(): Promise<void> {
  let hookData: HookData;
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString('utf8').trim();
    if (!text) return;
    hookData = JSON.parse(text) as HookData;
  } catch { return; }

  const { session_id, transcript } = hookData;
  if (!session_id) return;
  dbg(`fired — session=${session_id} cwd=${process.env.PWD || process.cwd()}`);

  const state = readState();
  const now = Date.now();
  const lastSaved = (state[`stop_${session_id}`] as number) || 0;
  const cooldownRemaining = COOLDOWN_MS - (now - lastSaved);
  if (cooldownRemaining > 0) {
    dbg(`skip — cooldown active (${Math.round(cooldownRemaining / 1000)}s remaining)`);
    return;
  }

  const apiKey = loadApiKey();
  if (!apiKey) { dbg('skip — no api key'); return; }

  const messages: HookMessage[] = Array.isArray(transcript) ? transcript : [];
  const content = buildContent(messages);
  if (content.length < MIN_CHARS) { dbg(`skip — content too short (${content.length} chars)`); return; }

  const cwd = process.env.PWD || process.cwd();
  const projectName = path.basename(cwd);
  const date = new Date().toISOString().split('T')[0];
  const title = `${projectName} - Claude Code - ${date}`;

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
