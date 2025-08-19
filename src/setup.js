#!/usr/bin/env node
/**
 * pūrmemo MCP Setup Command
 * Allows users to manually authenticate or manage their connection
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import OAuthManager from './auth/oauth-manager.js';
import TokenStore from './auth/token-store.js';
import ora from 'ora';

const program = new Command();
const authManager = new OAuthManager();
const tokenStore = new TokenStore();

// ASCII Art Banner
const banner = `
╔═══════════════════════════════════════════╗
║                                           ║
║            🧠 pūrmemo MCP                 ║
║         Memory Management Tool            ║
║                                           ║
╚═══════════════════════════════════════════╝
`;

program
  .name('purmemo-mcp')
  .description('Setup and manage your pūrmemo MCP connection')
  .version('2.0.0');

program
  .command('setup')
  .description('Connect your pūrmemo account')
  .action(async () => {
    console.log(chalk.cyan(banner));
    
    // Check if already authenticated
    const hasAuth = await tokenStore.hasToken();
    
    if (hasAuth) {
      const userInfo = await tokenStore.getUserInfo();
      console.log(chalk.green('✅ You are already authenticated!'));
      console.log(chalk.gray(`   Email: ${userInfo?.email}`));
      console.log(chalk.gray(`   Tier: ${userInfo?.tier}`));
      console.log('');
      
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: 'Keep current connection', value: 'keep' },
            { name: 'Sign in with a different account', value: 'reconnect' },
            { name: 'Sign out', value: 'logout' }
          ]
        }
      ]);
      
      if (action === 'keep') {
        console.log(chalk.green('\n✨ Your connection is active and ready to use!'));
        process.exit(0);
      } else if (action === 'logout') {
        await authManager.logout();
        console.log(chalk.yellow('\n👋 You have been signed out.'));
        process.exit(0);
      }
      // Fall through to reconnect
    }
    
    console.log(chalk.yellow('\n📱 Starting authentication process...\n'));
    console.log(chalk.gray('Follow the instructions below to sign in.\n'));
    
    try {
      const token = await authManager.authenticate();
      
      if (token) {
        const userInfo = await tokenStore.getUserInfo();
        
        console.log('');
        console.log(chalk.green.bold('🎉 Success! You are now connected to pūrmemo'));
        console.log('');
        console.log(chalk.white('Account Information:'));
        console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
        console.log(chalk.cyan(`  Email: ${userInfo?.email}`));
        console.log(chalk.cyan(`  Tier: ${userInfo?.tier === 'pro' ? '⭐ Pro' : '🆓 Free'}`));
        
        if (userInfo?.memory_limit) {
          console.log(chalk.yellow(`  Memory Limit: ${userInfo.memory_limit} memories`));
          console.log(chalk.gray(`  (Upgrade to Pro for unlimited memories)`));
        } else {
          console.log(chalk.green(`  Memory Limit: Unlimited`));
        }
        
        console.log('');
        console.log(chalk.white('Available Tools:'));
        console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
        console.log(chalk.green('  ✓ memory   ') + chalk.gray('- Save anything to memory'));
        console.log(chalk.green('  ✓ recall   ') + chalk.gray('- Search your memories'));
        console.log(chalk.green('  ✓ entities ') + chalk.gray('- Extract people, places, concepts'));
        console.log(chalk.green('  ✓ attach   ') + chalk.gray('- Attach files to memories'));
        console.log(chalk.green('  ✓ correction') + chalk.gray('- Correct existing memories'));
        
        console.log('');
        console.log(chalk.cyan.bold('🚀 You can now use all pūrmemo tools in Claude Desktop!'));
        console.log('');
      }
    } catch (error) {
      spinner.fail('Authentication failed');
      console.error(chalk.red(`\n❌ Error: ${error.message}`));
      console.log(chalk.gray('\nPlease try again or visit https://app.purmemo.ai for help.'));
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Check your connection status')
  .action(async () => {
    console.log(chalk.cyan(banner));
    
    const hasAuth = await tokenStore.hasToken();
    
    if (!hasAuth) {
      console.log(chalk.yellow('⚠️  Not authenticated'));
      console.log(chalk.gray('\nRun "npx purmemo-mcp setup" to connect your account.'));
      return;
    }
    
    const userInfo = await tokenStore.getUserInfo();
    const spinner = ora('Checking connection...').start();
    
    try {
      // Test API connection
      const token = await authManager.getToken();
      const response = await fetch('https://api.purmemo.ai/api/v5/memories?limit=1', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'purmemo-mcp/2.0.0'
        }
      });
      
      spinner.stop();
      
      if (response.ok) {
        const data = await response.json();
        const memoryCount = data.total_count || 0;
        
        console.log(chalk.green.bold('✅ Connection Active'));
        console.log('');
        console.log(chalk.white('Account Details:'));
        console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
        console.log(`  Email: ${userInfo?.email}`);
        console.log(`  Tier: ${userInfo?.tier === 'pro' ? '⭐ Pro' : '🆓 Free'}`);
        console.log(`  Memories: ${memoryCount}`);
        
        if (userInfo?.memory_limit) {
          const remaining = userInfo.memory_limit - memoryCount;
          console.log(`  Remaining: ${remaining} of ${userInfo.memory_limit}`);
          
          if (remaining <= 10) {
            console.log('');
            console.log(chalk.yellow('⚠️  You are approaching your free tier limit.'));
            console.log(chalk.gray('   Upgrade to Pro at https://app.purmemo.ai'));
          }
        }
        
        // Check token expiry
        if (userInfo?.expires_at) {
          const expiresAt = new Date(userInfo.expires_at);
          const now = new Date();
          const hoursUntilExpiry = Math.floor((expiresAt - now) / (1000 * 60 * 60));
          
          if (hoursUntilExpiry < 24) {
            console.log('');
            console.log(chalk.yellow(`⚠️  Token expires in ${hoursUntilExpiry} hours`));
            console.log(chalk.gray('   It will auto-refresh when needed.'));
          }
        }
      } else {
        spinner.fail('Connection test failed');
        console.log(chalk.red(`\n❌ API returned status: ${response.status}`));
        console.log(chalk.gray('\nTry running "npx purmemo-mcp setup" to reconnect.'));
      }
    } catch (error) {
      spinner.fail('Connection test failed');
      console.error(chalk.red(`\n❌ Error: ${error.message}`));
      console.log(chalk.gray('\nCheck your internet connection and try again.'));
    }
  });

program
  .command('logout')
  .description('Sign out from your pūrmemo account')
  .action(async () => {
    console.log(chalk.cyan(banner));
    
    const hasAuth = await tokenStore.hasToken();
    
    if (!hasAuth) {
      console.log(chalk.yellow('⚠️  You are not signed in.'));
      return;
    }
    
    const userInfo = await tokenStore.getUserInfo();
    
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Are you sure you want to sign out from ${userInfo?.email}?`,
        default: false
      }
    ]);
    
    if (confirm) {
      await authManager.logout();
      console.log(chalk.green('\n✅ Successfully signed out.'));
      console.log(chalk.gray('Run "npx purmemo-mcp setup" to sign in again.'));
    } else {
      console.log(chalk.gray('\nSign out cancelled.'));
    }
  });

program
  .command('upgrade')
  .description('Open upgrade page to get Pro features')
  .action(async () => {
    console.log(chalk.cyan(banner));
    console.log(chalk.yellow('🚀 Opening upgrade page...'));
    console.log(chalk.gray('\nPro features include:'));
    console.log(chalk.green('  • Unlimited memories'));
    console.log(chalk.green('  • Advanced AI models'));
    console.log(chalk.green('  • Priority support'));
    console.log(chalk.green('  • API access'));
    
    const open = (await import('open')).default;
    await open('https://app.purmemo.ai/upgrade');
  });

// Handle unknown commands
program.on('command:*', () => {
  console.error(chalk.red('\nInvalid command: %s'), program.args.join(' '));
  console.log(chalk.gray('Run "npx purmemo-mcp --help" for available commands.'));
  process.exit(1);
});

// Show help if no command provided
if (!process.argv.slice(2).length) {
  console.log(chalk.cyan(banner));
  console.log(chalk.white('Welcome to pūrmemo MCP!\n'));
  console.log(chalk.gray('Get started by connecting your account:\n'));
  console.log(chalk.cyan('  npx purmemo-mcp setup\n'));
  console.log(chalk.gray('For more commands, run: npx purmemo-mcp --help'));
}

program.parse();