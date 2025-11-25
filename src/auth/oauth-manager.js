/**
 * OAuth Manager for Purmemo MCP
 * Handles OAuth 2.1 + PKCE flow for seamless authentication
 */

import crypto from 'crypto';
import express from 'express';
import open from 'open';
import { execFile } from 'child_process';
import os from 'os';
import TokenStore from './token-store.js';

class OAuthManager {
  constructor(config = {}) {
    this.apiUrl = config.apiUrl || process.env.PURMEMO_API_URL || 'https://api.purmemo.ai';
    // Using chatgpt-purmemo as it's the only OAuth client configured in production
    // TODO: Switch to 'claude-purmemo' once unified OAuth is deployed
    this.clientId = config.clientId || 'chatgpt-purmemo';
    this.redirectUri = config.redirectUri || 'http://localhost:3456/callback';
    this.tokenStore = new TokenStore();
    this.server = null;
    this.pendingAuth = null;
    this.platform = os.platform();
  }

  // Removed complex browser opening strategies - going manual-first
  // The performOAuthFlow method now handles everything clearly

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
    const envApiKey = process.env.PURMEMO_API_KEY;
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
    // Generate PKCE challenge
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);
    const state = crypto.randomBytes(16).toString('hex');

    // Build OAuth URL
    const authUrl = new URL(`${this.apiUrl}/api/oauth/authorize`);
    authUrl.searchParams.append('client_id', this.clientId);
    authUrl.searchParams.append('redirect_uri', this.redirectUri);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', 'memories.read memories.write entities.read');
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('code_challenge', codeChallenge);
    authUrl.searchParams.append('code_challenge_method', 'S256');

    // MANUAL-FIRST: Show the URL BEFORE starting the server
    console.log('\n' + '═'.repeat(70));
    console.log('🔐 AUTHENTICATION REQUIRED');
    console.log('═'.repeat(70));
    console.log('');
    console.log('Please complete authentication in your browser:');
    console.log('');
    console.log('📋 COPY THIS URL:');
    console.log('─'.repeat(70));
    console.log(authUrl.toString());
    console.log('─'.repeat(70));
    console.log('');
    console.log('📱 STEPS:');
    console.log('  1. Copy the URL above');
    console.log('  2. Open your browser');
    console.log('  3. Paste and press Enter');
    console.log('  4. Sign in with Google, GitHub, or Email');
    console.log('  5. You\'ll be redirected back automatically');
    console.log('');
    console.log('⏳ Waiting for you to sign in...');
    console.log('═'.repeat(70));
    console.log('');
    
    // NOW start the callback server after showing instructions
    const authCode = await this.startCallbackServer(state);
    
    // Try to open browser quietly in background (might work, might not)
    try {
      if (this.platform === 'darwin') {
        // On macOS, use execFile (not exec) to avoid shell injection vulnerabilities
        // execFile doesn't spawn a shell, so the URL is passed as a safe argument
        execFile('open', [authUrl.toString()], (error) => {
          if (!error) {
            console.log('✨ Browser opened automatically - check your browser tabs');
          }
          // If it fails, that's fine - user has manual instructions
        });
      } else {
        // Try other platforms
        await open(authUrl.toString(), { wait: false }).catch(() => {
          // Silently fail - manual instructions are already shown
        });
      }
    } catch {
      // Silent fail - manual instructions are primary
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