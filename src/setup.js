#!/usr/bin/env node
/**
 * pūrmemo MCP Setup
 * Browser-open auth flow: opens app.purmemo.ai/cli-connect, polls for token.
 * No manual API key copying required.
 */

import chalk from 'chalk';
import ora from 'ora';
import TokenStore from './auth/token-store.js';

const API_URL = process.env.PURMEMO_API_URL || 'https://api.purmemo.ai';
const APP_URL = process.env.PURMEMO_APP_URL || 'https://app.purmemo.ai';
const tokenStore = new TokenStore();

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
  case 'setup':    await runSetup(); break;
  case 'status':   await runStatus(); break;
  case 'logout':   await runLogout(); break;
  default:
    console.log(chalk.red(`Unknown command: ${command}`));
    console.log(chalk.gray('Usage: npx purmemo-mcp [setup|status|logout]'));
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
    console.log(chalk.gray('Run with "logout" to disconnect: npx purmemo-mcp logout'));
    return;
  }

  // 2. Env var shortcut — user already has a key configured
  if (process.env.PURMEMO_API_KEY) {
    console.log(chalk.green('✅ API key found in PURMEMO_API_KEY environment variable.'));
    console.log(chalk.gray('   pūrmemo MCP is ready. Restart Claude / Cursor to use it.'));
    return;
  }

  // 3. Browser-open flow
  console.log(chalk.white('Connecting your pūrmemo account…\n'));

  // Request a CLI session from the backend
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

  // Open browser
  const connectUrl = `${APP_URL}/cli-connect?session=${sessionId}`;
  console.log(chalk.cyan('🌐 Opening your browser…'));
  console.log(chalk.gray(`   ${connectUrl}\n`));
  console.log(chalk.gray('If the browser did not open, copy the URL above and paste it manually.\n'));

  try {
    const open = (await import('open')).default;
    await open(connectUrl);
  } catch {
    // silent — user has the URL printed above
  }

  // Poll for completion
  const spinner = ora('Waiting for you to sign in…').start();
  const deadline = Date.now() + 10 * 60 * 1000; // 10 min
  const POLL_INTERVAL_MS = 2500;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    let pollData;
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/cli/poll/${sessionId}`);
      if (!res.ok) continue;
      pollData = await res.json();
    } catch {
      continue; // transient network issue — keep polling
    }

    if (pollData.status === 'completed' && pollData.api_key) {
      spinner.stop();

      // Save to ~/.purmemo/auth.json
      await tokenStore.saveToken({
        access_token: pollData.api_key,
        token_type: 'Bearer',
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        user: {
          email: pollData.email || 'unknown',
          tier:  pollData.tier  || 'free',
        },
      });

      console.log(chalk.green.bold('\n🎉 Connected! pūrmemo is ready.\n'));
      console.log(chalk.white('Your AI tools now have persistent memory across sessions.'));
      console.log('');
      console.log(chalk.gray('  Save a conversation: ') + chalk.white('"Save this conversation"'));
      console.log(chalk.gray('  Recall later:        ') + chalk.white('"What did we discuss about X?"'));
      console.log('');
      console.log(chalk.gray('Account: ') + chalk.white(pollData.email || 'connected'));
      console.log(chalk.gray('Plan:    ') + chalk.white(pollData.tier === 'pro' ? '⭐ Pro (unlimited recalls)' : '🆓 Free (50 recalls/month)'));
      console.log('');
      console.log(chalk.gray('Restart Claude Code / Claude Desktop to activate the tools.'));
      return;
    }

    if (pollData.status === 'expired') {
      spinner.stop();
      console.log(chalk.yellow('\n⏰ Session expired. Run setup again:'));
      console.log(chalk.cyan('   npx purmemo-mcp setup'));
      process.exit(1);
    }

    // Still pending — update spinner message occasionally
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

// ─── Status ───────────────────────────────────────────────────────────────────

async function runStatus() {
  console.log(chalk.cyan(banner));

  // Check env var first
  if (process.env.PURMEMO_API_KEY) {
    console.log(chalk.green('✅ Connected via PURMEMO_API_KEY environment variable'));
    await testApiKey(process.env.PURMEMO_API_KEY);
    return;
  }

  const token = await tokenStore.getToken();
  if (!token?.access_token) {
    console.log(chalk.yellow('⚠️  Not connected'));
    console.log(chalk.gray('\nRun setup to connect:'));
    console.log(chalk.cyan('   npx purmemo-mcp setup'));
    return;
  }

  console.log(chalk.green('✅ Connected via local token (~/.purmemo/auth.json)'));
  await testApiKey(token.access_token);
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

// ─── Logout ───────────────────────────────────────────────────────────────────

async function runLogout() {
  console.log(chalk.cyan(banner));
  const hasToken = await tokenStore.hasToken();
  if (!hasToken) {
    console.log(chalk.gray('Not connected via local token. Nothing to clear.'));
    console.log(chalk.gray('(If you use PURMEMO_API_KEY env var, remove it from your config.)'));
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
