#!/usr/bin/env node
/**
 * pūrmemo MCP Setup
 *
 * Handles two auth paths:
 *   1. PURMEMO_API_KEY in env (from dashboard install command) → save to auth.json
 *   2. Browser-open OAuth flow → poll for token → save to auth.json
 *
 * After auth, offers to install Claude Code hooks (auto-capture + recall).
 */

import chalk from 'chalk';
import ora from 'ora';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline/promises';
import { execSync } from 'node:child_process';
import TokenStore from './auth/token-store.js';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const API_URL    = process.env.PURMEMO_API_URL || 'https://api.purmemo.ai';
const APP_URL    = process.env.PURMEMO_APP_URL || 'https://app.purmemo.ai';
const tokenStore = new TokenStore();

const HOOKS_DIR     = path.join(os.homedir(), '.claude', 'hooks');
const SETTINGS_FILE = path.join(os.homedir(), '.claude', 'settings.json');
const HOOK_SCRIPTS  = ['purmemo_save.js', 'purmemo_heartbeat.js', 'purmemo_precompact.js', 'purmemo_session_start.js'];

const banner = `
╔═══════════════════════════════════════════╗
║                                           ║
║            🧠 pūrmemo MCP                 ║
║         Memory for your AI tools          ║
║                                           ║
╚═══════════════════════════════════════════╝
`;

const command = process.argv[2] || 'setup';

switch (command) {
  case 'setup':  await runSetup();  break;
  case 'status': await runStatus(); break;
  case 'logout': await runLogout(); break;
  case 'hooks':  await runHooksOnly(); break;
  default:
    console.log(chalk.red(`Unknown command: ${command}`));
    console.log(chalk.gray('Usage: npx purmemo-mcp [setup|status|logout|hooks]'));
    process.exit(1);
}

// ─── Setup ────────────────────────────────────────────────────────────────────

async function runSetup() {
  console.log(chalk.cyan(banner));

  // 1. Already authenticated?
  const existing = await tokenStore.getToken();
  if (existing?.access_token) {
    const info = await tokenStore.getUserInfo();
    console.log(chalk.green('✅ Already connected!'));
    console.log(chalk.gray(`   Account: ${info?.email || 'unknown'}`));
    console.log(chalk.gray(`   Tier:    ${info?.tier || 'free'}`));
    console.log('');

    // Offer hooks even if already connected (they may not have them yet)
    if (!hooksAlreadyInstalled()) {
      await promptInstallHooks();
    } else {
      console.log(chalk.gray('Claude Code hooks already installed. ✓'));
    }
    return;
  }

  // 2. API key in env (dashboard path: PURMEMO_API_KEY=sk-... npx purmemo-mcp setup)
  if (process.env.PURMEMO_API_KEY) {
    const spinner = ora('Verifying your API key…').start();
    const user = await verifyApiKey(process.env.PURMEMO_API_KEY);
    if (!user) {
      spinner.stop();
      console.log(chalk.red('❌ API key verification failed. Please check your key and try again.'));
      process.exit(1);
    }
    spinner.stop();

    // Save to auth.json so hooks can read it
    await tokenStore.saveToken({
      access_token: process.env.PURMEMO_API_KEY,
      token_type: 'Bearer',
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      user: {
        email: user.email || 'unknown',
        tier:  user.tier  || 'free',
      },
    });

    console.log(chalk.green.bold('🎉 Connected!\n'));
    console.log(chalk.gray(`   Account: ${user.email}`));
    console.log(chalk.gray(`   Plan:    ${user.tier === 'pro' ? '⭐ Pro' : '🆓 Free'}`));
    console.log('');

    // Wire up Claude Code
    wireMcpServer();
    await promptInstallHooks();
    printSuccess();
    return;
  }

  // 3. Browser-open OAuth flow
  console.log(chalk.white('Connecting your pūrmemo account…\n'));

  let sessionId;
  try {
    const res = await fetch(`${API_URL}/api/v1/auth/cli/request`, { method: 'POST' });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();
    sessionId = data.session_id;
  } catch (err) {
    console.error(chalk.red(`\n❌ Could not reach pūrmemo servers: ${err.message}`));
    console.log(chalk.gray('Check your internet connection and try again.'));
    process.exit(1);
  }

  const connectUrl = `${APP_URL}/cli-connect?session=${sessionId}`;
  console.log(chalk.cyan('🌐 Opening your browser…'));
  console.log(chalk.gray(`   ${connectUrl}\n`));
  console.log(chalk.gray('If the browser did not open, copy the URL above and paste it manually.\n'));

  try {
    const open = (await import('open')).default;
    await open(connectUrl);
  } catch {}

  const spinner = ora('Waiting for you to sign in…').start();
  const deadline = Date.now() + 10 * 60 * 1000;
  const POLL_MS  = 2500;

  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    let pollData;
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/cli/poll/${sessionId}`);
      if (!res.ok) continue;
      pollData = await res.json();
    } catch { continue; }

    if (pollData.status === 'completed' && pollData.api_key) {
      spinner.stop();

      await tokenStore.saveToken({
        access_token: pollData.api_key,
        token_type: 'Bearer',
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        user: {
          email: pollData.email || 'unknown',
          tier:  pollData.tier  || 'free',
        },
      });

      console.log(chalk.green.bold('\n🎉 Connected!\n'));
      console.log(chalk.gray(`   Account: ${pollData.email || 'connected'}`));
      console.log(chalk.gray(`   Plan:    ${pollData.tier === 'pro' ? '⭐ Pro (unlimited)' : '🆓 Free (50 recalls/month)'}`));
      console.log('');

      wireMcpServer();
      await promptInstallHooks();
      printSuccess();
      return;
    }

    if (pollData.status === 'expired') {
      spinner.stop();
      console.log(chalk.yellow('\n⏰ Session expired. Run setup again:'));
      console.log(chalk.cyan('   npx purmemo-mcp setup'));
      process.exit(1);
    }

    const elapsed = Math.floor((Date.now() - (deadline - 10 * 60 * 1000)) / 1000);
    if (elapsed % 15 === 0 && elapsed > 0) {
      spinner.text = `Still waiting… (${elapsed}s) — check your browser`;
    }
  }

  spinner.stop();
  console.log(chalk.yellow('\n⏰ Timed out after 10 minutes. Run setup again when ready:'));
  console.log(chalk.cyan('   npx purmemo-mcp setup'));
  process.exit(1);
}

// ─── Hooks-only command ───────────────────────────────────────────────────────

async function runHooksOnly() {
  console.log(chalk.cyan(banner));
  const token = await tokenStore.getToken();
  if (!token?.access_token && !process.env.PURMEMO_API_KEY) {
    console.log(chalk.yellow('⚠️  Not connected. Run setup first:'));
    console.log(chalk.cyan('   npx purmemo-mcp setup'));
    process.exit(1);
  }
  if (hooksAlreadyInstalled()) {
    console.log(chalk.green('✅ Claude Code hooks are already installed.'));
    return;
  }
  await installHooks();
}

// ─── Hook installation ────────────────────────────────────────────────────────

function hooksAlreadyInstalled() {
  return HOOK_SCRIPTS.every(f => fs.existsSync(path.join(HOOKS_DIR, f)));
}

async function promptInstallHooks() {
  // Skip prompt if not a TTY (e.g. CI, piped input)
  if (!process.stdin.isTTY) {
    await installHooks();
    return;
  }

  console.log(chalk.white('Install Claude Code hooks?'));
  console.log(chalk.gray('  Auto-captures every session + recalls past context at startup'));
  console.log(chalk.gray('  • SessionStart  — recalls past context when you open Claude'));
  console.log(chalk.gray('  • PostToolUse   — saves progress every 10 tool calls'));
  console.log(chalk.gray('  • PreCompact    — saves before context window resets'));
  console.log(chalk.gray('  • Stop          — saves full session when Claude closes'));
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let answer;
  try {
    answer = await rl.question(chalk.cyan('Install hooks? [Y/n]: '));
  } finally {
    rl.close();
  }

  if (answer.trim().toLowerCase() === 'n') {
    console.log(chalk.gray('\nSkipped. Install later with: npx purmemo-mcp hooks'));
    return;
  }

  await installHooks();
}

async function installHooks() {
  const spinner = ora('Installing Claude Code hooks…').start();

  try {
    // 1. Ensure ~/.claude/hooks/ exists
    fs.mkdirSync(HOOKS_DIR, { recursive: true });

    // 2. Copy hook scripts from package to ~/.claude/hooks/
    const srcHooksDir = path.join(__dirname, 'hooks');
    for (const file of HOOK_SCRIPTS) {
      const src  = path.join(srcHooksDir, file);
      const dest = path.join(HOOKS_DIR, file);
      fs.copyFileSync(src, dest);
      if (process.platform !== 'win32') fs.chmodSync(dest, 0o755);
    }

    // 3. Patch ~/.claude/settings.json
    patchSettings();

    spinner.stop();
    console.log(chalk.green('✅ Claude Code hooks installed!'));
    console.log(chalk.gray(`   Scripts: ~/.claude/hooks/purmemo_*.js`));
    console.log(chalk.gray(`   Config:  ~/.claude/settings.json`));
  } catch (err) {
    spinner.stop();
    console.log(chalk.yellow(`⚠️  Could not install hooks: ${err.message}`));
    console.log(chalk.gray('   You can install them manually later: npx purmemo-mcp hooks'));
  }
}

function patchSettings() {
  let settings = {};
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    }
  } catch {}

  if (!settings.hooks) settings.hooks = {};

  const hookPath = (file) => `node ${path.join(HOOKS_DIR, file)}`;

  // SessionStart
  if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];
  if (!settings.hooks.SessionStart.some(e => e.hooks?.some(h => h.command?.includes('purmemo_session_start')))) {
    settings.hooks.SessionStart.push({ hooks: [{ type: 'command', command: hookPath('purmemo_session_start.js') }] });
  }

  // PostToolUse — heartbeat on code-changing tools
  if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];
  if (!settings.hooks.PostToolUse.some(e => e.hooks?.some(h => h.command?.includes('purmemo_heartbeat')))) {
    settings.hooks.PostToolUse.push({
      matcher: 'Bash|Edit|Write|MultiEdit|Task',
      hooks: [{ type: 'command', command: hookPath('purmemo_heartbeat.js') }],
    });
  }

  // PreCompact
  if (!settings.hooks.PreCompact) settings.hooks.PreCompact = [];
  if (!settings.hooks.PreCompact.some(e => e.hooks?.some(h => h.command?.includes('purmemo_precompact')))) {
    settings.hooks.PreCompact.push({ matcher: '.*', hooks: [{ type: 'command', command: hookPath('purmemo_precompact.js') }] });
  }

  // Stop
  if (!settings.hooks.Stop) settings.hooks.Stop = [];
  if (!settings.hooks.Stop.some(e => e.hooks?.some(h => h.command?.includes('purmemo_save')))) {
    settings.hooks.Stop.push({ matcher: '.*', hooks: [{ type: 'command', command: hookPath('purmemo_save.js') }] });
  }

  // Write atomically
  const tmp = SETTINGS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf8');
  fs.renameSync(tmp, SETTINGS_FILE);
}

// ─── Wire MCP server into Claude Code ─────────────────────────────────────────

function wireMcpServer() {
  try {
    execSync('claude mcp add purmemo -- npx -y purmemo-mcp', {
      stdio: 'ignore',
      timeout: 10000,
    });
    console.log(chalk.green('✅ MCP server registered with Claude Code'));
  } catch {
    // claude CLI may not be in PATH — print manual instructions instead
    console.log(chalk.gray('To add the MCP server manually, run:'));
    console.log(chalk.cyan('   claude mcp add purmemo -- npx -y purmemo-mcp'));
    console.log('');
  }
}

function printSuccess() {
  console.log('');
  console.log(chalk.white('Your AI tools now have persistent memory across sessions.'));
  console.log('');
  console.log(chalk.gray('  Save a conversation: ') + chalk.white('"Save this conversation"'));
  console.log(chalk.gray('  Recall later:        ') + chalk.white('"What did we discuss about X?"'));
  console.log('');
  console.log(chalk.gray('Open a new Claude Code session to activate.'));
}

// ─── Status ───────────────────────────────────────────────────────────────────

async function runStatus() {
  console.log(chalk.cyan(banner));

  if (process.env.PURMEMO_API_KEY) {
    console.log(chalk.green('✅ Connected via PURMEMO_API_KEY environment variable'));
    await testApiKey(process.env.PURMEMO_API_KEY);
  } else {
    const token = await tokenStore.getToken();
    if (!token?.access_token) {
      console.log(chalk.yellow('⚠️  Not connected'));
      console.log(chalk.gray('\nRun setup to connect:'));
      console.log(chalk.cyan('   npx purmemo-mcp setup'));
      return;
    }
    console.log(chalk.green('✅ Connected via ~/.purmemo/auth.json'));
    await testApiKey(token.access_token);
  }

  console.log('');
  if (hooksAlreadyInstalled()) {
    console.log(chalk.green('✅ Claude Code hooks installed'));
  } else {
    console.log(chalk.yellow('⚠️  Claude Code hooks not installed'));
    console.log(chalk.gray('   Run: npx purmemo-mcp hooks'));
  }
}

async function testApiKey(apiKey) {
  const spinner = ora('Testing connection…').start();
  try {
    const res = await fetch(`${API_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    spinner.stop();
    if (res.ok) {
      const user = await res.json();
      console.log(chalk.gray(`   Account: ${user.email}`));
      console.log(chalk.gray(`   Tier:    ${user.tier || 'free'}`));
    } else {
      console.log(chalk.red(`   API returned ${res.status} — key may be invalid`));
      console.log(chalk.gray('   Run: npx purmemo-mcp setup'));
    }
  } catch (err) {
    spinner.stop();
    console.log(chalk.red(`   Connection failed: ${err.message}`));
  }
}

async function verifyApiKey(apiKey) {
  try {
    const res = await fetch(`${API_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ─── Logout ───────────────────────────────────────────────────────────────────

async function runLogout() {
  console.log(chalk.cyan(banner));
  const hasToken = await tokenStore.hasToken();
  if (!hasToken) {
    console.log(chalk.gray('Not connected via local token. Nothing to clear.'));
    return;
  }
  await tokenStore.clearToken();
  console.log(chalk.green('✅ Disconnected. Local token cleared.'));
  console.log(chalk.gray('Run setup again to reconnect: npx purmemo-mcp setup'));
}

// ─── Util ─────────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
