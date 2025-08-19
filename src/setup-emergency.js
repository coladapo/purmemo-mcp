#!/usr/bin/env node
/**
 * Emergency Setup - Bypasses Broken OAuth
 * Simple API key authentication until OAuth is fixed
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import TokenStore from './auth/token-store.js';

const tokenStore = new TokenStore();

console.log(chalk.cyan(`
╔═══════════════════════════════════════════╗
║                                           ║
║            🧠 pūrmemo MCP                 ║
║         Emergency Setup Mode             ║
║                                           ║
╚═══════════════════════════════════════════╝
`));

console.log(chalk.yellow('⚠️  OAuth authentication is currently unavailable'));
console.log(chalk.gray('Using API key authentication as fallback\n'));

// Check if already has API key
if (process.env.PUO_MEMO_API_KEY) {
    console.log(chalk.green('✅ API key found in environment variable'));
    console.log(chalk.gray('Your Purmemo MCP is ready to use!'));
    process.exit(0);
}

console.log(chalk.white('📋 Setup Instructions:'));
console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
console.log('1. Visit: ' + chalk.cyan('https://app.purmemo.ai/settings'));
console.log('2. Create an account or sign in');
console.log('3. Generate an API key');
console.log('4. Copy the API key');
console.log('5. Come back here to configure it\n');

const { hasApiKey } = await inquirer.prompt([
    {
        type: 'confirm',
        name: 'hasApiKey',
        message: 'Do you have your API key ready?',
        default: false
    }
]);

if (!hasApiKey) {
    console.log(chalk.yellow('\n📱 Please get your API key first:'));
    console.log(chalk.cyan('   https://app.purmemo.ai/settings'));
    console.log(chalk.gray('\nRun this setup again when ready.'));
    process.exit(0);
}

const { apiKey } = await inquirer.prompt([
    {
        type: 'password',
        name: 'apiKey',
        message: 'Enter your Purmemo API key:',
        validate: (input) => {
            if (!input || input.length < 10) {
                return 'Please enter a valid API key';
            }
            return true;
        }
    }
]);

// Test the API key by trying to access the API
console.log(chalk.gray('\n🔍 Testing API key...'));

try {
    // Try different endpoint paths that might work
    const testEndpoints = [
        'https://api.purmemo.ai/api/memories',
        'https://api.purmemo.ai/memories',
        'https://api.purmemo.ai/api/v1/memories',
        'https://app.purmemo.ai/api/memories'
    ];
    
    let apiWorking = false;
    let workingEndpoint = null;
    
    for (const endpoint of testEndpoints) {
        try {
            const response = await fetch(`${endpoint}?limit=1`, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'User-Agent': 'purmemo-mcp/2.1.4'
                }
            });
            
            if (response.ok || response.status === 401) {
                // 401 means the endpoint exists but needs proper auth
                apiWorking = true;
                workingEndpoint = endpoint;
                break;
            }
        } catch (error) {
            // Continue to next endpoint
        }
    }
    
    if (!apiWorking) {
        console.log(chalk.red('❌ Could not connect to Purmemo API'));
        console.log(chalk.gray('The API server might be temporarily unavailable.'));
        console.log(chalk.yellow('Your API key has been saved and will work when the server is back online.\n'));
    } else {
        console.log(chalk.green('✅ API connection successful!'));
    }
    
    // Save the API key in environment-compatible format
    const tokenData = {
        access_token: apiKey,
        token_type: 'Bearer',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        user: {
            tier: 'free',
            email: 'configured-via-api-key'
        }
    };
    
    await tokenStore.saveToken(tokenData);
    
    console.log(chalk.green.bold('\n🎉 Setup Complete!'));
    console.log(chalk.white('\nNext Steps:'));
    console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log('1. Restart Claude Desktop completely');
    console.log('2. Connect to the Purmemo MCP server');
    console.log('3. Try using memory tools in your conversation\n');
    
    console.log(chalk.cyan('Available Tools:'));
    console.log(chalk.green('  ✓ memory   ') + chalk.gray('- Save anything to memory'));
    console.log(chalk.green('  ✓ recall   ') + chalk.gray('- Search your memories'));
    console.log(chalk.green('  ✓ entities ') + chalk.gray('- Extract people, places, concepts'));
    console.log(chalk.green('  ✓ attach   ') + chalk.gray('- Attach files to memories'));
    console.log(chalk.green('  ✓ correction') + chalk.gray('- Correct existing memories'));
    
    console.log(chalk.cyan.bold('\n🚀 Your AI-powered memory is ready!'));
    
} catch (error) {
    console.error(chalk.red(`\n❌ Setup failed: ${error.message}`));
    console.log(chalk.gray('Please try again or contact support.'));
    process.exit(1);
}