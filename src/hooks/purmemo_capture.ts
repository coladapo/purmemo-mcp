#!/usr/bin/env node
/**
 * Purmemo Claude Code — Unified Capture
 *
 * Single hook that handles ALL save triggers:
 *   - Stop       → after Claude finishes responding (2 min cooldown)
 *   - PreCompact → before context compression (30s cooldown)
 *   - PostToolUse → heartbeat every N tool calls (implicit cooldown via counter)
 *
 * Reads the JSONL transcript, builds content, saves to Purmemo as a
 * living document (same conversation_id per session = updates, not duplicates).
 *
 * If a manual /save happened in this session (detected by scanning the
 * transcript for save_conversation tool calls), the hook adopts that
 * conversation_id so auto-saves update the manual save instead of
 * creating a parallel memory.
 *
 * Title is intentionally simple ("project - Claude Code - date") because
 * the API's Gemini intelligence layer auto-upgrades it to a summary.
 *
 * Silent on all errors — never blocks Claude Code.
 */

import * as path from 'node:path';
import {
  dbg, readState, writeState, loadApiKey,
  readTranscript, extractMessages, buildContent,
  apiPost, readHookInput,
  detectPlatform, initPlatformPaths, normalizeEvent,
  type TranscriptEntry,
} from './purmemo_lib.js';

const TAG = 'capture';
const COOLDOWNS: Record<string, number> = { Stop: 120_000, PreCompact: 30_000 };
const HEARTBEAT_INTERVAL = 10;
const MIN_CHARS = 500;

/**
 * Scan transcript for MCP save_conversation calls to find manual save's conversation_id.
 * If found, the hook will update that memory instead of creating a separate one.
 */
function findManualSaveId(entries: TranscriptEntry[]): { convId: string; title: string } | null {
  for (const entry of entries) {
    if (entry.type !== 'assistant') continue;
    const content = (entry.message as Record<string, unknown>)?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if ((block as Record<string, unknown>).type !== 'tool_use') continue;
      const name = ((block as Record<string, unknown>).name as string) || '';
      if (name.includes('save_conversation')) {
        const input = (block as Record<string, unknown>).input as Record<string, unknown> | undefined;
        const title = input?.title as string | undefined;
        const convId = input?.conversationId as string | undefined;
        if (convId) return { convId, title: title || convId };
        if (title) {
          const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 100);
          return { convId: slug, title };
        }
      }
    }
  }
  return null;
}

async function main(): Promise<void> {
  let hookData;
  try { hookData = await readHookInput(); } catch { return; }
  if (!hookData) return;

  const platform = detectPlatform(hookData);
  initPlatformPaths(platform);

  const { session_id, transcript_path, hook_event_name, tool_name } = hookData;
  if (!session_id) return;

  // Normalize Gemini event names to internal (Claude) names
  const event = normalizeEvent(hook_event_name || 'unknown');
  const state = readState();

  // ── Heartbeat: count tool calls, only save at intervals ──────────────────
  if (event === 'PostToolUse') {
    const countKey = `hb_count_${session_id}`;
    const count = ((state[countKey] as number) || 0) + 1;
    state[countKey] = count;
    writeState(state);

    const nextSave = Math.ceil(count / HEARTBEAT_INTERVAL) * HEARTBEAT_INTERVAL;
    if (count === 1) dbg(TAG, `new session — ${session_id}`);
    dbg(TAG, `tick ${count}/${nextSave} tool=${tool_name}`);

    if (count % HEARTBEAT_INTERVAL !== 0) return;
    dbg(TAG, `heartbeat threshold (${count}) — saving`);
  }

  // ── Cooldown check for Stop / PreCompact ─────────────────────────────────
  const cooldownMs = COOLDOWNS[event];
  if (cooldownMs) {
    const cooldownKey = `cd_${event}_${session_id}`;
    const lastSaved = (state[cooldownKey] as number) || 0;
    const remaining = cooldownMs - (Date.now() - lastSaved);
    if (remaining > 0) {
      dbg(TAG, `${event} skip — cooldown ${Math.round(remaining / 1000)}s`);
      return;
    }
  }

  dbg(TAG, `${event} fired — session=${session_id} transcript=${transcript_path || 'none'}`);

  const apiKey = loadApiKey();
  if (!apiKey) { dbg(TAG, 'skip — no api key'); return; }

  // ── Read and build content ───────────────────────────────────────────────
  const entries  = readTranscript(transcript_path);
  const messages = extractMessages(entries);
  let content    = buildContent(messages);

  if (content.length < MIN_CHARS) {
    dbg(TAG, `skip — ${content.length} chars < ${MIN_CHARS} min`);
    return;
  }

  // ── Detect manual /save — adopt its conversation_id if found ─────────────
  const cwd         = hookData.cwd || process.env.PWD || process.cwd();
  const projectName = path.basename(cwd);
  const date        = new Date().toISOString().split('T')[0];

  const platformName = platform === 'gemini' ? 'gemini' : 'claude-code';
  const platformLabel = platform === 'gemini' ? 'Gemini CLI' : 'Claude Code';

  const manualSave = findManualSaveId(entries);
  const conversationId = manualSave?.convId || `${platformName}-${session_id}`;
  const title = manualSave?.title || `${projectName} - ${platformLabel} - ${date}`;

  if (manualSave) {
    dbg(TAG, `adopting manual save — convId="${manualSave.convId}" title="${manualSave.title}"`);
  }

  const tags = [platformName, 'auto-captured', projectName];
  const metadata = {
    source: `${platformName}_${event.toLowerCase()}_hook`,
    session_id,
    project_path: cwd,
    captured_at: new Date().toISOString(),
    adopted_manual_save: !!manualSave,
  };

  // ── Save to Purmemo (single row, API accepts up to 1MB) ─────────────────
  const result = await apiPost(apiKey, '/api/v1/memories/', {
    content, title, conversation_id: conversationId,
    platform: platformName, source_type: 'auto_capture', tags, metadata,
  });
  const saved = !!(result?.id || result?.memory_id);

  if (saved) {
    if (cooldownMs) {
      state[`cd_${event}_${session_id}`] = Date.now();
      writeState(state);
    }
    dbg(TAG, `${event} saved — ${messages.length} msgs, ${content.length} chars, convId=${conversationId}`);
  } else {
    dbg(TAG, `${event} error — save failed`);
  }
}

// Top-level await keeps the process alive until all HTTP requests complete
await main().catch(() => {});
