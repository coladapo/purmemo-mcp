#!/usr/bin/env node
/**
 * Purmemo MCP Diagnostic Tool
 * Helps users diagnose and fix common MCP connection issues
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runDiagnostics() {
    console.log('🔧 Purmemo MCP Diagnostic Tool');
    console.log('================================\n');

    // Test 1: Check if server starts without console output
    console.log('1️⃣  Testing server startup (should be silent)...');
    
    const serverPath = join(__dirname, 'server-oauth.js');
    const serverProcess = spawn('node', [serverPath], {
        stdio: ['ignore', 'pipe', 'pipe']
    });

    let hasOutput = false;
    let outputBuffer = '';

    serverProcess.stdout.on('data', (data) => {
        hasOutput = true;
        outputBuffer += data.toString();
    });

    serverProcess.stderr.on('data', (data) => {
        hasOutput = true;
        outputBuffer += data.toString();
    });

    // Give server 2 seconds to start
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (hasOutput) {
        console.log('❌ Server produces console output (will break MCP protocol)');
        console.log('📝 Output detected:', outputBuffer.substring(0, 200) + '...');
        console.log('🔧 This will cause "Unexpected token" errors in Claude Desktop');
    } else {
        console.log('✅ Server starts silently (MCP protocol compatible)');
    }

    serverProcess.kill();

    // Test 2: Check package.json version
    console.log('\n2️⃣  Checking package version...');
    
    try {
        const packagePath = join(__dirname, '..', 'package.json');
        const { readFile } = await import('fs/promises');
        const packageData = JSON.parse(await readFile(packagePath, 'utf8'));
        
        if (packageData.version >= '2.1.3') {
            console.log(`✅ Using fixed version: ${packageData.version}`);
        } else {
            console.log(`⚠️  Using old version: ${packageData.version}`);
            console.log('🔧 Please update to version 2.1.3 or higher');
        }
    } catch (error) {
        console.log('❌ Could not check package version:', error.message);
    }

    // Test 3: Check environment variables
    console.log('\n3️⃣  Checking environment configuration...');
    
    const requiredEnvs = [
        'PURMEMO_API_URL',
        'PURMEMO_OAUTH_CALLBACK_URL', 
        'PURMEMO_FRONTEND_URL'
    ];

    let envIssues = 0;
    for (const env of requiredEnvs) {
        if (process.env[env]) {
            console.log(`✅ ${env}: ${process.env[env]}`);
        } else {
            console.log(`⚠️  ${env}: Not set (will use defaults)`);
            envIssues++;
        }
    }

    if (envIssues === 0) {
        console.log('✅ All environment variables properly configured');
    }

    // Final recommendation
    console.log('\n🎯 Final Diagnosis:');
    
    if (!hasOutput && envIssues === 0) {
        console.log('✅ Your MCP server should work perfectly with Claude Desktop!');
        console.log('📱 If you still have issues, try restarting Claude Desktop');
    } else {
        console.log('⚠️  Issues detected that may cause Claude Desktop connection failures');
        console.log('🔧 Please address the issues above and run diagnostics again');
    }

    console.log('\n📚 For help: https://github.com/coladapo/purmemo-mcp/issues');
}

runDiagnostics().catch(console.error);