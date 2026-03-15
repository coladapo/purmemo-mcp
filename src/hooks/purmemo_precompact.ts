#!/usr/bin/env node
/**
 * Purmemo Claude Code PreCompact Hook
 *
 * Fires before context compaction. Saves current conversation state
 * with a 30-second cooldown to prevent duplicate saves.
 */

import * as path from 'node:path';
import { dbg as _dbg, readState, writeState, loadApiKey, buildContent, postMemory } from './hook-utils.js';
import type { HookData, HookMessage } from '../types.js';

const COOLDOWN_MS = 30_000;
const MIN_CHARS = 200;

const dbg = (msg: string) => _dbg('precompact', msg);

async function main(): Promise<void> {
  let hookData: HookData;
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString('utf8').trim();
    if (!text) return;
    hookData = JSON.parse(text) as HookData;
  } catch { return; }

  const { session_id, trigger } = hookData;
  if (!session_id) return;
  dbg(`fired — trigger=${trigger} session=${session_id}`);

  const state = readState();
  const now = Date.now();
  const lastSaved = (state[`pc_${session_id}`] as number) || 0;
  const cooldownRemaining = COOLDOWN_MS - (now - lastSaved);
  if (cooldownRemaining > 0) {
    dbg(`skip — cooldown active (${Math.round(cooldownRemaining / 1000)}s remaining)`);
    return;
  }

  const apiKey = loadApiKey();
  if (!apiKey) { dbg('skip — no api key'); return; }

  const messages: HookMessage[] = Array.isArray(hookData.messages) ? hookData.messages : [];
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
    tags: ['claude-code', 'auto-captured', 'precompact', projectName],
    metadata: {
      source: 'claude_code_precompact_hook',
      session_id,
      trigger,
      project_path: cwd,
      captured_at: new Date().toISOString(),
    },
  });

  if (result?.id || result?.memory_id) {
    state[`pc_${session_id}`] = now;
    writeState(state);
    dbg(`saved — messages=${messages.length} chars=${content.length}`);
  } else {
    dbg(`error — ${JSON.stringify(result)?.slice(0, 200)}`);
  }
}

main().catch(() => {});
