#!/usr/bin/env node
/**
 * Purmemo Claude Code — Session Recall
 *
 * Fires on SessionStart. Fetches the 5 most recently user-touched memories
 * and injects them as numbered context. Sorts by user_updated_at (not
 * updated_at, which gets bumped by background Gemini processing).
 *
 * Skips on compact/clear. Posts a session context heartbeat.
 * Never blocks session start on any error.
 */

import * as path from 'node:path';
import {
  dbg, readState, writeState, loadApiKey,
  apiGet, apiPost, readHookInput,
  checkForUpdate, HOOKS_VERSION,
} from './purmemo_lib.js';

const TAG = 'recall';
const MAX_MEMORIES = 5;
const MAX_PREVIEW = 300;

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

async function main(): Promise<void> {
  let hookData;
  try { hookData = await readHookInput(); } catch { return; }
  if (!hookData) return;

  const { session_id, cwd, source } = hookData;
  dbg(TAG, `fired — source=${source} session=${session_id} cwd=${cwd}`);

  if (source === 'compact' || source === 'clear') {
    dbg(TAG, `skip — source=${source}`);
    return;
  }

  const apiKey = loadApiKey();
  if (!apiKey) { dbg(TAG, 'skip — no api key'); return; }

  const projectName = path.basename(cwd || process.cwd());

  // Post session context (fire-and-forget)
  apiPost(apiKey, '/api/v1/identity/session', {
    project: projectName, platform: 'claude-code', auto: true,
  }, 5000).then(r => dbg(TAG, `session POST → ${r ? 'ok' : 'error'}`));

  // Fetch most recent memories by user activity (not background processing)
  const params = new URLSearchParams({
    limit: String(MAX_MEMORIES),
    sort: 'user_updated_at',
    order: 'desc',
  });
  const result = await apiGet(apiKey, `/api/v1/memories/?${params}`);
  const memories = (result as { memories?: Array<Record<string, unknown>> })?.memories || [];
  dbg(TAG, `recalled ${memories.length} recent memories`);

  if (!memories.length) { dbg(TAG, 'no memories found'); return; }

  // Build context for Claude (injected silently)
  const contextLines = [
    `[Purmemo — recent context for "${projectName}"]`,
    `${memories.length} recent memories:\n`,
  ];
  memories.forEach((mem, i) => {
    const title = (mem.title as string) || 'Untitled';
    const preview = ((mem.content_preview as string) || (mem.content as string) || '')
      .replace(/\n+/g, ' ').trim().slice(0, MAX_PREVIEW);
    const ts = (mem.updated_at as string) || (mem.created_at as string);
    const when = ts ? relativeTime(new Date(ts)) : '';
    contextLines.push(`${i + 1}. ${title}${when ? ` (${when})` : ''}`);
    if (preview) contextLines.push(`   ${preview}${preview.length >= MAX_PREVIEW ? '…' : ''}`);
    contextLines.push('');
  });
  contextLines.push(source === 'resume'
    ? '(Session resumed — context above from Purmemo)'
    : '(New session — context auto-loaded from Purmemo. Type a number to load fully.)');

  // Store recall data for first_message hook
  const state = readState();
  state[`session_recall_${session_id}`] = {
    project: projectName,
    titles: memories.map(m => (m.title as string) || 'Untitled'),
    ids: memories.map(m => m.id as string),
  };
  writeState(state);

  // Check for hook updates (non-blocking, cached for 24h)
  const latestVersion = await checkForUpdate();
  const updateNotice = latestVersion
    ? `\npurmemo hooks ${HOOKS_VERSION} → ${latestVersion} available. Run: npx purmemo-mcp@latest hooks\n`
    : '';

  // Output: numbered list visible to user, full context silent to Claude
  const banner = memories
    .map((m, i) => `${i + 1}. ${(m.title as string) || 'Untitled'}`)
    .join('\n');

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: contextLines.join('\n'),
    },
    systemMessage: `${updateNotice}${banner}\n\nType a number to load a memory.`,
  }));
}

await main().catch(() => {});
