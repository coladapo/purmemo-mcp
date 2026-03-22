#!/usr/bin/env node
/**
 * Purmemo First-Message — Number Quick-Load
 *
 * Fires on UserPromptSubmit. On the first user message of a session,
 * checks if the user typed a number (1-5) to load a recalled memory fully.
 * Only fires once per session. Silent on all errors.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import {
  dbg, readState, writeState, loadApiKey,
  apiGet, readHookInput,
} from './purmemo_lib.js';

const TAG = 'first_msg';

function countUserMessages(transcriptPath: string): number {
  try {
    const expanded = transcriptPath.replace(/^~/, os.homedir());
    if (!fs.existsSync(expanded)) return 0;
    const lines = fs.readFileSync(expanded, 'utf8').trim().split('\n').filter(Boolean);
    let count = 0;
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'user') count++;
      } catch {}
    }
    return count;
  } catch { return 0; }
}

async function main(): Promise<void> {
  let hookData;
  try { hookData = await readHookInput(); } catch { return; }
  if (!hookData) return;

  const { session_id, transcript_path } = hookData;
  if (!session_id || !transcript_path) return;

  const state = readState();
  const bannerKey = `banner_shown_${session_id}`;
  if (state[bannerKey]) return;

  const userMsgCount = countUserMessages(transcript_path);
  if (userMsgCount > 1) {
    state[bannerKey] = true;
    writeState(state);
    return;
  }

  // First message — check for recalled memories from session start
  const recalled = state[`session_recall_${session_id}`] as {
    titles?: string[];
    ids?: string[];
    project?: string;
  } | undefined;
  state[bannerKey] = true;
  writeState(state);

  if (!recalled?.titles?.length) {
    dbg(TAG, `no recall data for session ${session_id}`);
    return;
  }

  // Check if user typed a number (1-5) to load a memory
  const prompt = (hookData.prompt || '').trim();
  const numMatch = prompt.match(/^([1-5])$/);

  if (numMatch && recalled.ids) {
    const idx = parseInt(numMatch[1], 10) - 1;
    const memId = recalled.ids[idx];
    const memTitle = recalled.titles[idx] || `Memory ${numMatch[1]}`;

    if (memId) {
      dbg(TAG, `loading #${numMatch[1]} — ${memId} (${memTitle})`);
      const apiKey = loadApiKey();
      if (apiKey) {
        const mem = await apiGet(apiKey, `/api/v1/memories/${memId}`) as { content?: string } | null;
        if (mem?.content) {
          const content = mem.content
            .replace(/=== CONVERSATION START ===|=== .* ===/g, '')
            .trim();
          dbg(TAG, `loaded "${memTitle}" — ${content.length} chars`);
          process.stdout.write(JSON.stringify({
            hookSpecificOutput: {
              hookEventName: 'UserPromptSubmit',
              additionalContext: `[Purmemo — full memory loaded: "${memTitle}"]\n\n${content}`,
            },
          }));
          return;
        }
      }
      dbg(TAG, `failed to load ${memId}`);
    }
  }

  dbg(TAG, `first message — no number shortcut, session ${session_id}`);
}

await main().catch(() => {});
