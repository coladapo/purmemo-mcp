/**
 * OAuth Manager for Purmemo MCP
 * Handles OAuth 2.1 + PKCE flow for seamless authentication
 */

import crypto from 'crypto';
import express from 'express';
import open from 'open';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import TokenStore from './token-store.js';

const execAsync = promisify(exec);

class OAuthManager {
  constructor(config = {}) {
    this.apiUrl = config.apiUrl || process.env.PUO_MEMO_API_URL || 'https://api.purmemo.ai';
    this.clientId = config.clientId || 'purmemo-mcp';
    this.redirectUri = config.redirectUri || 'http://localhost:3456/callback';
    this.tokenStore = new TokenStore();
    this.server = null;
    this.pendingAuth = null;
    this.platform = os.platform();
  }

  /**
   * Robust browser opening with multiple fallback strategies
   * Handles macOS security restrictions and provides user-friendly alternatives
   */
  async openBrowserRobustly(url) {
    console.log(`🌐 Opening OAuth URL...`);
    
    const strategies = [
      () => this.tryOpenPackage(url),
      () => this.tryDirectCommand(url),
      () => this.tryAlternativeCommands(url),
      () => this.tryAppleScript(url),
      () => this.provideFallbackInstructions(url)
    ];

    for (let i = 0; i < strategies.length; i++) {
      try {
        const result = await strategies[i]();
        
        if (result.success) {
          if (result.requiresManualAction) {
            // User needs to manually open the URL
            return { opened: false, manualRequired: true, url };
          }
          console.log(`✅ Browser opened successfully`);
          return { opened: true, manualRequired: false };
        }
      } catch (error) {
        console.log(`Strategy ${i + 1} failed, trying next...`);
      }
    }

    return { opened: false, manualRequired: true, url };
  }

  async tryOpenPackage(url) {
    try {
      await open(url, { wait: false });
      await new Promise(resolve => setTimeout(resolve, 1000));
      return { success: true };
    } catch (error) {
      throw new Error(`open package failed: ${error.message}`);
    }
  }

  async tryDirectCommand(url) {
    try {
      let command;
      
      switch (this.platform) {
        case 'darwin':
          command = `open "${url}"`;
          break;
        case 'win32':
          command = `start "" "${url}"`;
          break;
        default:
          command = `xdg-open "${url}"`;
      }

      await execAsync(command);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return { success: true };
    } catch (error) {
      throw new Error(`direct command failed: ${error.message}`);
    }
  }

  async tryAlternativeCommands(url) {
    if (this.platform !== 'darwin') {
      throw new Error('Not macOS');
    }

    const commands = [
      `open -a Safari "${url}"`,
      `open -a "Google Chrome" "${url}"`,
      `open -a Firefox "${url}"`,
      `/usr/bin/open "${url}"`
    ];

    for (const command of commands) {
      try {
        await execAsync(command);
        await new Promise(resolve => setTimeout(resolve, 500));
        return { success: true };
      } catch (error) {
        continue;
      }
    }
    
    throw new Error('All alternative commands failed');
  }

  async tryAppleScript(url) {
    if (this.platform !== 'darwin') {
      throw new Error('Not macOS');
    }

    try {
      const script = `tell application "Safari" to open location "${url}"`;
      await execAsync(`osascript -e '${script}'`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return { success: true };
    } catch (error) {
      throw new Error(`AppleScript failed: ${error.message}`);
    }
  }

  async provideFallbackInstructions(url) {
    console.log('\n' + '━'.repeat(60));
    console.log('🚨 BROWSER OPENING BLOCKED BY SECURITY');
    console.log('━'.repeat(60));
    console.log('');
    console.log('Please manually copy and paste this URL into your browser:');
    console.log('');
    console.log('📋 COPY THIS URL:');
    console.log('⬇'.repeat(40));
    console.log(url);
    console.log('⬆'.repeat(40));
    console.log('');
    console.log('📱 QUICK STEPS:');
    console.log('1. Copy the URL above');
    console.log('2. Open your browser');
    console.log('3. Paste and press Enter');
    console.log('4. Sign in with Google/GitHub');
    console.log('');
    console.log('⏰ Waiting for OAuth callback...');
    console.log('━'.repeat(60));

    return { 
      success: true, 
      requiresManualAction: true 
    };
  }

  /**
   * Get current authentication token
   * @returns {Promise<string|null>} Access token or null if not authenticated
   */
  async getToken() {
    // First check if we have a valid token
    const storedToken = await this.tokenStore.getToken();
    
    if (storedToken && storedToken.access_token) {
      // Check if token needs refresh (expired or close to expiry)
      if (this.isTokenExpired(storedToken)) {
        try {
          return await this.refreshToken(storedToken.refresh_token);
        } catch (error) {
          console.error('Token refresh failed:', error.message);
          // If refresh fails, start new OAuth flow
          return null;
        }
      }
      return storedToken.access_token;
    }

    // Fallback to environment variable for backwards compatibility
    const envApiKey = process.env.PUO_MEMO_API_KEY;
    if (envApiKey) {
      console.log('📔 Using API key from environment variable');
      return envApiKey;
    }

    return null;
  }

  /**
   * Check if token is expired or about to expire
   */
  isTokenExpired(token) {
    if (!token.expires_at) return false;
    
    const now = Date.now();
    const expiresAt = new Date(token.expires_at).getTime();
    const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
    
    return now >= (expiresAt - bufferTime);
  }

  /**
   * Start OAuth flow
   * @returns {Promise<string>} Access token
   */
  async authenticate() {
    if (this.pendingAuth) {
      return this.pendingAuth;
    }

    this.pendingAuth = this.performOAuthFlow();
    
    try {
      const token = await this.pendingAuth;
      return token;
    } finally {
      this.pendingAuth = null;
    }
  }

  /**
   * Perform the actual OAuth flow
   */
  async performOAuthFlow() {
    console.log('\n🔐 Starting Purmemo authentication...\n');
    
    // Generate PKCE challenge
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);
    const state = crypto.randomBytes(16).toString('hex');

    // Build OAuth URL
    const authUrl = new URL(`${this.apiUrl}/api/oauth/initiate`);
    authUrl.searchParams.append('client_id', this.clientId);
    authUrl.searchParams.append('redirect_uri', this.redirectUri);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', 'memories.read memories.write entities.read');
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('code_challenge', codeChallenge);
    authUrl.searchParams.append('code_challenge_method', 'S256');

    // Start local server for callback
    const authCode = await this.startCallbackServer(state);
    
    // Open browser for authentication with robust fallback
    const browserResult = await this.openBrowserRobustly(authUrl.toString());
    
    if (!browserResult.opened && browserResult.manualRequired) {
      // The robust method already displayed instructions
      console.log(''); // Just add some spacing
    }

    // Wait for callback with auth code
    const code = await authCode;

    // Exchange code for token
    const tokenResponse = await this.exchangeCodeForToken(code, codeVerifier);
    
    // Store token securely
    await this.tokenStore.saveToken(tokenResponse);
    
    console.log('✅ Authentication successful!\n');
    
    return tokenResponse.access_token;
  }

  /**
   * Start local server to handle OAuth callback
   */
  startCallbackServer(expectedState) {
    return new Promise((resolve, reject) => {
      const app = express();
      let resolved = false;

      app.get('/callback', async (req, res) => {
        const { code, state, error, error_description } = req.query;

        if (error) {
          res.send(`
            <html>
              <head>
                <title>Authentication Failed</title>
                <style>
                  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                         display: flex; justify-content: center; align-items: center; 
                         height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
                  .container { background: white; padding: 40px; border-radius: 10px; 
                              box-shadow: 0 20px 60px rgba(0,0,0,0.3); text-align: center; max-width: 400px; }
                  h1 { color: #e53e3e; margin: 0 0 10px 0; }
                  p { color: #718096; margin: 10px 0; }
                  .error { background: #fed7d7; padding: 10px; border-radius: 5px; 
                          color: #c53030; margin-top: 20px; }
                </style>
              </head>
              <body>
                <div class="container">
                  <h1>❌ Authentication Failed</h1>
                  <p>Unable to complete authentication</p>
                  <div class="error">${error}: ${error_description || 'Unknown error'}</div>
                  <p style="margin-top: 20px; font-size: 14px;">You can close this window</p>
                </div>
              </body>
            </html>
          `);
          
          if (!resolved) {
            resolved = true;
            this.stopCallbackServer();
            reject(new Error(`OAuth error: ${error} - ${error_description}`));
          }
          return;
        }

        if (state !== expectedState) {
          res.send(`
            <html>
              <head><title>Security Error</title></head>
              <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: red;">Security Error</h1>
                <p>State mismatch - possible CSRF attack</p>
              </body>
            </html>
          `);
          
          if (!resolved) {
            resolved = true;
            this.stopCallbackServer();
            reject(new Error('OAuth state mismatch'));
          }
          return;
        }

        // Success response
        res.send(`
          <html>
            <head>
              <title>Authentication Successful</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                       display: flex; justify-content: center; align-items: center; 
                       height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
                .container { background: white; padding: 40px; border-radius: 10px; 
                            box-shadow: 0 20px 60px rgba(0,0,0,0.3); text-align: center; max-width: 400px; }
                h1 { color: #48bb78; margin: 0 0 10px 0; }
                p { color: #718096; margin: 10px 0; }
                .success { background: #c6f6d5; padding: 15px; border-radius: 5px; 
                          color: #22543d; margin-top: 20px; }
                .logo { font-size: 48px; margin-bottom: 20px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="logo">🧠</div>
                <h1>✅ Authentication Successful!</h1>
                <p>You're now connected to Purmemo</p>
                <div class="success">
                  You can now close this window and return to Claude Desktop
                </div>
                <script>setTimeout(() => window.close(), 3000);</script>
              </div>
            </body>
          </html>
        `);

        if (!resolved) {
          resolved = true;
          this.stopCallbackServer();
          resolve(code);
        }
      });

      // Start server
      this.server = app.listen(3456, () => {
        console.log('🌐 Waiting for authentication callback...\n');
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.stopCallbackServer();
          reject(new Error('Authentication timeout'));
        }
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Stop the callback server
   */
  stopCallbackServer() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code, codeVerifier) {
    const response = await fetch(`${this.apiUrl}/api/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'purmemo-mcp/2.0.0'
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: this.clientId,
        redirect_uri: this.redirectUri,
        code_verifier: codeVerifier
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const tokenData = await response.json();
    
    // Add expiry time
    if (tokenData.expires_in) {
      tokenData.expires_at = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
    }

    // Store user tier info
    if (tokenData.user) {
      tokenData.user_tier = tokenData.user.tier || 'free';
      tokenData.memory_limit = tokenData.user.tier === 'pro' ? null : 100;
    }

    return tokenData;
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken) {
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    console.log('🔄 Refreshing authentication token...');

    const response = await fetch(`${this.apiUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'purmemo-mcp/2.0.0'
      },
      body: JSON.stringify({
        refresh_token: refreshToken
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    const tokenData = await response.json();
    
    // Add expiry time
    if (tokenData.expires_in) {
      tokenData.expires_at = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
    }

    // Store refreshed token
    await this.tokenStore.saveToken(tokenData);
    
    console.log('✅ Token refreshed successfully');
    
    return tokenData.access_token;
  }

  /**
   * Clear stored authentication
   */
  async logout() {
    await this.tokenStore.clearToken();
    console.log('👋 Logged out successfully');
  }

  /**
   * Generate PKCE code verifier
   */
  generateCodeVerifier() {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Generate PKCE code challenge from verifier
   */
  generateCodeChallenge(verifier) {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }
}

export default OAuthManager;