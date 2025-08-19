/**
 * Universal Authentication Manager for Purmemo
 * Handles ALL authentication scenarios across all platforms
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import readline from 'readline';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class UniversalAuthManager {
  constructor() {
    this.configDir = path.join(os.homedir(), '.purmemo');
    this.configFile = path.join(this.configDir, 'universal-auth.json');
    this.apiUrl = 'https://api.purmemo.ai';
    
    // Ensure config directory exists
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
  }

  /**
   * Main authentication flow that works for ALL clients
   */
  async authenticate(options = {}) {
    const {
      client = 'universal',  // claude, chatgpt, npm, vscode, cursor, etc.
      purpose = 'general',   // mcp, plugin, api, web, mobile, etc.
      interactive = true
    } = options;

    console.log('\n🧠 PURMEMO UNIVERSAL AUTHENTICATION');
    console.log('═'.repeat(50));
    console.log(`Client: ${client}`);
    console.log(`Purpose: ${purpose}`);
    console.log('═'.repeat(50));
    console.log('');

    // Check for existing valid token
    const existingAuth = await this.getStoredAuth();
    if (existingAuth && await this.validateToken(existingAuth.token)) {
      console.log('✅ Existing authentication found and valid!');
      return existingAuth.token;
    }

    // Show authentication options
    console.log('Choose authentication method:');
    console.log('');
    console.log('1. Web Login (Recommended)');
    console.log('2. API Key (Legacy)');
    console.log('3. Create New Account');
    console.log('4. Import from Another Client');
    console.log('5. Manual Token Entry');
    console.log('');

    if (!interactive) {
      return this.nonInteractiveAuth(client, purpose);
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const choice = await new Promise(resolve => {
      rl.question('Choose [1-5]: ', resolve);
    });

    let token;
    switch (choice) {
      case '1':
        token = await this.webLoginFlow(client);
        break;
      case '2':
        token = await this.apiKeyFlow();
        break;
      case '3':
        token = await this.createAccountFlow();
        break;
      case '4':
        token = await this.importFromClient();
        break;
      case '5':
        token = await this.manualTokenEntry();
        break;
      default:
        console.log('Invalid choice');
        rl.close();
        return null;
    }

    rl.close();

    if (token) {
      await this.saveAuth(token, client, purpose);
      console.log('\n✅ Authentication successful!');
      await this.showClientInstructions(client, token);
    }

    return token;
  }

  /**
   * Web-based login flow (OAuth-like but simpler)
   */
  async webLoginFlow(client) {
    // Generate a unique session ID
    const sessionId = crypto.randomBytes(16).toString('hex');
    
    // Create auth URL
    const authUrl = `${this.apiUrl}/api/auth/universal?session=${sessionId}&client=${client}`;
    
    console.log('\n📋 AUTHENTICATION URL:');
    console.log('─'.repeat(50));
    console.log(authUrl);
    console.log('─'.repeat(50));
    console.log('');
    console.log('Steps:');
    console.log('1. Copy the URL above');
    console.log('2. Open in your browser');
    console.log('3. Sign in with Google/GitHub/Email');
    console.log('4. Copy the token shown after login');
    console.log('');

    // Try to open browser
    try {
      if (process.platform === 'darwin') {
        await execAsync(`open "${authUrl}"`);
        console.log('✨ Browser opened automatically');
      } else if (process.platform === 'win32') {
        await execAsync(`start "${authUrl}"`);
      } else {
        await execAsync(`xdg-open "${authUrl}"`);
      }
    } catch {
      // Silent fail - user has manual instructions
    }

    // Wait for user to paste token
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const token = await new Promise(resolve => {
      rl.question('\nPaste your token here: ', resolve);
    });

    rl.close();
    return token.trim();
  }

  /**
   * API Key flow for legacy support
   */
  async apiKeyFlow() {
    console.log('\n📝 API KEY AUTHENTICATION');
    console.log('');
    console.log('1. Go to: https://app.purmemo.ai/settings/api');
    console.log('2. Generate or copy your API key');
    console.log('');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const apiKey = await new Promise(resolve => {
      rl.question('Paste your API key: ', resolve);
    });

    rl.close();
    return apiKey.trim();
  }

  /**
   * Create new account flow
   */
  async createAccountFlow() {
    console.log('\n👤 CREATE NEW ACCOUNT');
    console.log('');
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const email = await new Promise(resolve => {
      rl.question('Email: ', resolve);
    });

    const password = await new Promise(resolve => {
      rl.question('Password: ', resolve);
    });

    rl.close();

    // Call registration API
    try {
      const response = await fetch(`${this.apiUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Account created successfully!');
        return data.access_token;
      } else {
        console.log('❌ Registration failed:', await response.text());
        return null;
      }
    } catch (error) {
      console.log('❌ Error:', error.message);
      return null;
    }
  }

  /**
   * Import authentication from another client
   */
  async importFromClient() {
    console.log('\n🔄 IMPORT FROM ANOTHER CLIENT');
    console.log('');
    console.log('Searching for existing authentications...');
    
    const sources = [
      { name: 'Claude MCP', path: path.join(os.homedir(), '.purmemo/auth.json') },
      { name: 'NPM Global', path: path.join(os.homedir(), '.npmrc') },
      { name: 'Environment', env: 'PUO_MEMO_API_KEY' },
      { name: 'VS Code', path: path.join(os.homedir(), '.vscode/purmemo.json') }
    ];

    for (const source of sources) {
      if (source.env) {
        const token = process.env[source.env];
        if (token) {
          console.log(`✅ Found token in ${source.name}`);
          return token;
        }
      } else if (fs.existsSync(source.path)) {
        try {
          const content = fs.readFileSync(source.path, 'utf8');
          const data = JSON.parse(content);
          if (data.access_token || data.token || data.api_key) {
            console.log(`✅ Found token in ${source.name}`);
            return data.access_token || data.token || data.api_key;
          }
        } catch {
          // Continue searching
        }
      }
    }

    console.log('❌ No existing authentication found');
    return null;
  }

  /**
   * Manual token entry
   */
  async manualTokenEntry() {
    console.log('\n🔑 MANUAL TOKEN ENTRY');
    console.log('');
    console.log('If you already have a token from:');
    console.log('- Browser DevTools (localStorage)');
    console.log('- Another installation');
    console.log('- API response');
    console.log('');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const token = await new Promise(resolve => {
      rl.question('Paste your token: ', resolve);
    });

    rl.close();
    return token.trim();
  }

  /**
   * Non-interactive authentication for scripts
   */
  async nonInteractiveAuth(client, purpose) {
    // Try environment variable
    if (process.env.PURMEMO_TOKEN || process.env.PUO_MEMO_API_KEY) {
      return process.env.PURMEMO_TOKEN || process.env.PUO_MEMO_API_KEY;
    }

    // Try stored auth
    const stored = await this.getStoredAuth();
    if (stored) {
      return stored.token;
    }

    // Try importing
    return await this.importFromClient();
  }

  /**
   * Validate token with API
   */
  async validateToken(token) {
    try {
      const response = await fetch(`${this.apiUrl}/api/v5/memories?limit=1`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'purmemo-universal-auth/1.0.0'
        }
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Save authentication
   */
  async saveAuth(token, client, purpose) {
    const authData = {
      token,
      client,
      purpose,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };

    // Save to universal config
    fs.writeFileSync(this.configFile, JSON.stringify(authData, null, 2));

    // Also save to client-specific locations
    await this.saveClientSpecific(token, client);
  }

  /**
   * Save to client-specific locations
   */
  async saveClientSpecific(token, client) {
    switch (client) {
      case 'claude':
      case 'mcp':
        // Save for MCP
        const mcpAuth = {
          access_token: token,
          token_type: 'Bearer',
          client: 'claude-mcp'
        };
        fs.writeFileSync(
          path.join(this.configDir, 'auth.json'),
          JSON.stringify(mcpAuth, null, 2)
        );
        break;

      case 'npm':
        // Add to bashrc/zshrc
        const shellConfig = process.env.SHELL?.includes('zsh') ? '.zshrc' : '.bashrc';
        const configPath = path.join(os.homedir(), shellConfig);
        const exportLine = `\nexport PUO_MEMO_API_KEY="${token}"\n`;
        
        if (fs.existsSync(configPath)) {
          const content = fs.readFileSync(configPath, 'utf8');
          if (!content.includes('PUO_MEMO_API_KEY')) {
            fs.appendFileSync(configPath, exportLine);
          }
        }
        break;

      case 'vscode':
      case 'cursor':
        // Save for VS Code extensions
        const vscodeDir = path.join(os.homedir(), '.vscode');
        if (!fs.existsSync(vscodeDir)) {
          fs.mkdirSync(vscodeDir, { recursive: true });
        }
        fs.writeFileSync(
          path.join(vscodeDir, 'purmemo.json'),
          JSON.stringify({ api_key: token }, null, 2)
        );
        break;
    }
  }

  /**
   * Get stored authentication
   */
  async getStoredAuth() {
    if (fs.existsSync(this.configFile)) {
      try {
        return JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Show client-specific instructions
   */
  async showClientInstructions(client, token) {
    console.log('\n📚 CLIENT-SPECIFIC INSTRUCTIONS');
    console.log('═'.repeat(50));

    switch (client) {
      case 'claude':
      case 'mcp':
        console.log('Claude Desktop / MCP:');
        console.log('✅ Authentication saved to ~/.purmemo/auth.json');
        console.log('✅ MCP tools will now work automatically');
        break;

      case 'chatgpt':
        console.log('ChatGPT Plugin:');
        console.log('Add this header to your ChatGPT requests:');
        console.log(`Authorization: Bearer ${token}`);
        break;

      case 'npm':
        console.log('NPM Packages:');
        console.log('✅ Added PUO_MEMO_API_KEY to shell config');
        console.log('Restart your terminal or run: source ~/.bashrc');
        break;

      case 'vscode':
      case 'cursor':
        console.log('VS Code / Cursor:');
        console.log('✅ Saved to ~/.vscode/purmemo.json');
        console.log('Extensions will auto-detect the token');
        break;

      case 'api':
        console.log('API Access:');
        console.log('Use this header in your requests:');
        console.log(`Authorization: Bearer ${token}`);
        console.log('');
        console.log('Example:');
        console.log(`curl -H "Authorization: Bearer ${token}" ${this.apiUrl}/api/v5/memories`);
        break;

      default:
        console.log('Token saved successfully!');
        console.log('Use it as Authorization header:');
        console.log(`Authorization: Bearer ${token}`);
    }
  }

  /**
   * List all authenticated clients
   */
  async listClients() {
    console.log('\n🔐 AUTHENTICATED CLIENTS');
    console.log('═'.repeat(50));

    const auth = await this.getStoredAuth();
    if (auth) {
      console.log(`✅ Universal: ${auth.client} (${auth.purpose})`);
      console.log(`   Created: ${auth.created_at}`);
      console.log(`   Expires: ${auth.expires_at}`);
    }

    // Check other locations
    const locations = [
      { name: 'MCP', path: path.join(this.configDir, 'auth.json') },
      { name: 'VS Code', path: path.join(os.homedir(), '.vscode/purmemo.json') },
      { name: 'Environment', env: 'PUO_MEMO_API_KEY' }
    ];

    for (const loc of locations) {
      if (loc.env && process.env[loc.env]) {
        console.log(`✅ ${loc.name}: Set`);
      } else if (loc.path && fs.existsSync(loc.path)) {
        console.log(`✅ ${loc.name}: Configured`);
      }
    }
  }

  /**
   * Clear all authentication
   */
  async clearAll() {
    console.log('\n🗑️  CLEARING ALL AUTHENTICATION');
    
    // Remove universal config
    if (fs.existsSync(this.configFile)) {
      fs.unlinkSync(this.configFile);
    }

    // Remove MCP auth
    const mcpAuth = path.join(this.configDir, 'auth.json');
    if (fs.existsSync(mcpAuth)) {
      fs.unlinkSync(mcpAuth);
    }

    // Remove VS Code config
    const vscodeAuth = path.join(os.homedir(), '.vscode/purmemo.json');
    if (fs.existsSync(vscodeAuth)) {
      fs.unlinkSync(vscodeAuth);
    }

    console.log('✅ All authentication cleared');
  }
}

export default UniversalAuthManager;

// CLI interface if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const manager = new UniversalAuthManager();
  
  const command = process.argv[2];
  const client = process.argv[3] || 'universal';

  switch (command) {
    case 'login':
      await manager.authenticate({ client });
      break;
    case 'list':
      await manager.listClients();
      break;
    case 'clear':
      await manager.clearAll();
      break;
    case 'validate':
      const auth = await manager.getStoredAuth();
      if (auth && await manager.validateToken(auth.token)) {
        console.log('✅ Token is valid');
      } else {
        console.log('❌ Token is invalid or expired');
      }
      break;
    default:
      console.log('Usage:');
      console.log('  node universal-auth.js login [client]');
      console.log('  node universal-auth.js list');
      console.log('  node universal-auth.js clear');
      console.log('  node universal-auth.js validate');
      console.log('');
      console.log('Clients: claude, chatgpt, npm, vscode, cursor, api');
  }
}