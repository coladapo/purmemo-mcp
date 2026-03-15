#!/usr/bin/env node
/**
 * Purmemo Claude Code PostToolUse Hook — Heartbeat Save
 *
 * Fires after every tool call. Every TOOL_CALL_THRESHOLD calls,
 * saves a mid-session snapshot to Purmemo.
 */

import * as path from 'node:path';
import { dbg as _dbg, readState, writeState, loadApiKey, buildContent, postMemory } from './hook-utils.js';
import type { HookData, HookMessage } from '../types.js';

const TOOL_CALL_THRESHOLD = 10;
const MIN_CHARS = 200;

const dbg = (msg: string) => _dbg('heartbeat', msg);

async function main(): Promise<void> {
  let hookData: HookData;
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString('utf8').trim();
    if (!text) return;
    hookData = JSON.parse(text) as HookData;
  } catch { return; }

  const { session_id, tool_name, transcript } = hookData;
  if (!session_id) return;

  const state = readState();
  const countKey = `hb_count_${session_id}`;
  const count = ((state[countKey] as number) || 0) + 1;
  state[countKey] = count;
  writeState(state);

  const nextSave = Math.ceil(count / TOOL_CALL_THRESHOLD) * TOOL_CALL_THRESHOLD;

  if (count === 1) dbg(`new session detected — session=${session_id}`);
  dbg(`tick ${count} (next save at ${nextSave}) tool=${tool_name}`);

  if (count % TOOL_CALL_THRESHOLD !== 0) return;

  dbg(`threshold reached (${count}) tool=${tool_name} — saving...`);

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
