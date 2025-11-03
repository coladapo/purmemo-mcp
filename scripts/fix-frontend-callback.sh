#!/bin/bash

# Fix Frontend OAuth Callback Chain
# This script patches the frontend to properly handle OAuth callbacks

echo "🔧 FIXING FRONTEND OAUTH CALLBACK"
echo "================================="
echo ""

# Find the frontend directory
FRONTEND_DIR="../puo-memo-platform-private/frontend"

if [ ! -d "$FRONTEND_DIR" ]; then
    echo "❌ Frontend directory not found at $FRONTEND_DIR"
    echo "Please specify the correct path:"
    read -p "Frontend directory path: " FRONTEND_DIR
fi

if [ ! -d "$FRONTEND_DIR" ]; then
    echo "❌ Directory not found"
    exit 1
fi

echo "📁 Working in: $FRONTEND_DIR"
echo ""

# Create the fixed OAuth callback handler
cat > "$FRONTEND_DIR/src/services/oauth-callback-handler.js" << 'EOF'
/**
 * Fixed OAuth Callback Handler
 * Properly completes OAuth flows including MCP redirects
 */

import { API_BASE_URL } from '../config';

class OAuthCallbackHandler {
  constructor() {
    this.sessionKey = 'oauth_session';
    this.verifierKey = 'code_verifier';
  }

  /**
   * Handle OAuth callback on page load
   */
  async handleCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');
    
    if (error) {
      return this.handleError(error, params.get('error_description'));
    }
    
    if (!code) {
      return this.handleError('no_code', 'No authorization code received');
    }
    
    // Get stored OAuth session
    const sessionData = this.getSession();
    
    // Check if this is an MCP OAuth flow
    if (this.isMCPFlow(sessionData)) {
      return this.completeMCPFlow(code, state, sessionData);
    }
    
    // Handle regular OAuth flow
    return this.completeRegularFlow(code, state, sessionData);
  }
  
  /**
   * Check if this is an MCP OAuth flow
   */
  isMCPFlow(session) {
    if (!session) return false;
    
    // MCP flows redirect to localhost
    return session.redirect_uri && (
      session.redirect_uri.includes('localhost:3456') ||
      session.redirect_uri.includes('localhost:8080') ||
      session.client_id === 'claude-mcp' ||
      session.client_id === 'npm-cli'
    );
  }
  
  /**
   * Complete MCP OAuth flow by redirecting back to localhost
   */
  completeMCPFlow(code, state, session) {
    console.log('Completing MCP OAuth flow...');
    
    // Build callback URL
    const callbackUrl = new URL(session.redirect_uri);
    callbackUrl.searchParams.append('code', code);
    if (state) {
      callbackUrl.searchParams.append('state', state);
    }
    
    // Clear session
    this.clearSession();
    
    // Show message before redirect
    this.showMessage('Completing authentication...', 'success');
    
    // Redirect to MCP callback
    setTimeout(() => {
      console.log('Redirecting to:', callbackUrl.toString());
      window.location.href = callbackUrl.toString();
    }, 500);
    
    return true;
  }
  
  /**
   * Complete regular OAuth flow
   */
  async completeRegularFlow(code, state, session) {
    console.log('Completing regular OAuth flow...');
    
    try {
      // Get code verifier if using PKCE
      const codeVerifier = localStorage.getItem(this.verifierKey);
      
      // Exchange code for token
      const response = await fetch(`${API_BASE_URL}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code: code,
          client_id: session?.client_id || 'web-app',
          redirect_uri: session?.redirect_uri || window.location.origin + '/oauth/callback',
          code_verifier: codeVerifier
        }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }
      
      const tokenData = await response.json();
      
      // Store tokens
      this.storeTokens(tokenData);
      
      // Clear OAuth session
      this.clearSession();
      
      // Redirect to dashboard
      this.showMessage('Login successful!', 'success');
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 1000);
      
      return true;
      
    } catch (error) {
      console.error('Token exchange failed:', error);
      this.handleError('token_exchange_failed', error.message);
      return false;
    }
  }
  
  /**
   * Store OAuth session before initiating flow
   */
  storeSession(clientId, redirectUri, scope) {
    const session = {
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scope,
      initiated_at: new Date().toISOString()
    };
    
    localStorage.setItem(this.sessionKey, JSON.stringify(session));
    return session;
  }
  
  /**
   * Get stored OAuth session
   */
  getSession() {
    const data = localStorage.getItem(this.sessionKey);
    return data ? JSON.parse(data) : null;
  }
  
  /**
   * Clear OAuth session
   */
  clearSession() {
    localStorage.removeItem(this.sessionKey);
    localStorage.removeItem(this.verifierKey);
  }
  
  /**
   * Store tokens securely
   */
  storeTokens(tokenData) {
    if (tokenData.access_token) {
      localStorage.setItem('access_token', tokenData.access_token);
    }
    if (tokenData.refresh_token) {
      localStorage.setItem('refresh_token', tokenData.refresh_token);
    }
    if (tokenData.expires_in) {
      const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
      localStorage.setItem('token_expires_at', expiresAt.toISOString());
    }
  }
  
  /**
   * Handle OAuth errors
   */
  handleError(error, description) {
    console.error('OAuth error:', error, description);
    this.showMessage(`Authentication failed: ${description || error}`, 'error');
    
    // Clear session
    this.clearSession();
    
    // Redirect to login after delay
    setTimeout(() => {
      window.location.href = '/login';
    }, 3000);
  }
  
  /**
   * Show user message
   */
  showMessage(message, type = 'info') {
    // Create or update message element
    let messageEl = document.getElementById('oauth-message');
    if (!messageEl) {
      messageEl = document.createElement('div');
      messageEl.id = 'oauth-message';
      messageEl.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 5px;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      `;
      document.body.appendChild(messageEl);
    }
    
    // Set message and style
    messageEl.textContent = message;
    messageEl.style.backgroundColor = type === 'error' ? '#ff4444' : 
                                      type === 'success' ? '#44bb44' : '#4444ff';
    messageEl.style.color = 'white';
    messageEl.style.display = 'block';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      if (messageEl) {
        messageEl.style.display = 'none';
      }
    }, 5000);
  }
}

// Export handler
export default new OAuthCallbackHandler();

// Auto-run if on callback page
if (typeof window !== 'undefined') {
  const path = window.location.pathname;
  if (path === '/oauth/callback' || path === '/auth/callback') {
    const handler = new OAuthCallbackHandler();
    handler.handleCallback();
  }
}
EOF

echo "✅ Created OAuth callback handler"
echo ""

# Create OAuth initiator helper
cat > "$FRONTEND_DIR/src/services/oauth-initiator.js" << 'EOF'
/**
 * OAuth Flow Initiator
 * Properly initiates OAuth flows with session storage
 */

import { API_BASE_URL } from '../config';

class OAuthInitiator {
  /**
   * Initiate OAuth flow for MCP clients
   */
  initiateMCPOAuth(clientId = 'claude-mcp', redirectUri = 'http://localhost:3456/callback') {
    // Store session for callback handler
    const session = {
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'memories.read memories.write entities.read',
      initiated_at: new Date().toISOString()
    };
    
    localStorage.setItem('oauth_session', JSON.stringify(session));
    
    // Generate PKCE
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);
    
    // Store verifier
    localStorage.setItem('code_verifier', codeVerifier);
    
    // Build auth URL
    const authUrl = new URL(`${API_BASE_URL}/oauth/authorize`);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', clientId);
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('scope', session.scope);
    authUrl.searchParams.append('code_challenge', codeChallenge);
    authUrl.searchParams.append('code_challenge_method', 'S256');
    
    // Add intermediate redirect through app.purmemo.ai
    const intermediateUrl = new URL('https://app.purmemo.ai/oauth/callback');
    intermediateUrl.searchParams.append('mcp_flow', 'true');
    intermediateUrl.searchParams.append('target_url', authUrl.toString());
    
    // Redirect to OAuth provider
    window.location.href = intermediateUrl.toString();
  }
  
  /**
   * Generate PKCE code verifier
   */
  generateCodeVerifier() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode.apply(null, array))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
  
  /**
   * Generate PKCE code challenge
   */
  async generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
}

export default new OAuthInitiator();
EOF

echo "✅ Created OAuth initiator"
echo ""

# Update the callback route in the frontend router
echo "📝 Updating frontend routes..."

# Create a patch for the router
cat > "$FRONTEND_DIR/src/oauth-callback-route.jsx" << 'EOF'
/**
 * OAuth Callback Route Component
 */

import { useEffect } from 'react';
import oauthHandler from '../services/oauth-callback-handler';

function OAuthCallback() {
  useEffect(() => {
    // Handle OAuth callback on mount
    oauthHandler.handleCallback();
  }, []);
  
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif'
    }}>
      <div style={{ fontSize: '48px', marginBottom: '20px' }}>🔐</div>
      <h2>Completing Authentication...</h2>
      <p style={{ color: '#666', marginTop: '10px' }}>
        Please wait while we complete the authentication process.
      </p>
      <div style={{
        marginTop: '30px',
        width: '200px',
        height: '4px',
        backgroundColor: '#e0e0e0',
        borderRadius: '2px',
        overflow: 'hidden'
      }}>
        <div style={{
          width: '50%',
          height: '100%',
          backgroundColor: '#4CAF50',
          animation: 'slide 1.5s ease-in-out infinite'
        }} />
      </div>
      <style>{`
        @keyframes slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}

export default OAuthCallback;
EOF

echo "✅ Created OAuth callback route component"
echo ""

echo "📋 Integration Instructions:"
echo "==========================="
echo ""
echo "1. Import the OAuth handler in your main App.jsx:"
echo "   import OAuthCallback from './oauth-callback-route';"
echo ""
echo "2. Add the route to your router:"
echo "   <Route path=\"/oauth/callback\" element={<OAuthCallback />} />"
echo "   <Route path=\"/auth/callback\" element={<OAuthCallback />} />"
echo ""
echo "3. Update your OAuth initiation code to use the new initiator:"
echo "   import oauthInitiator from './services/oauth-initiator';"
echo "   oauthInitiator.initiateMCPOAuth();"
echo ""
echo "4. Deploy the frontend:"
echo "   cd $FRONTEND_DIR"
echo "   npm run build"
echo "   vercel --prod"
echo ""
echo "✅ Frontend OAuth callback fix ready!"
echo ""
echo "The fix will:"
echo "• Detect MCP OAuth flows and redirect back to localhost"
echo "• Handle regular OAuth flows normally"
echo "• Store OAuth session data properly"
echo "• Show user-friendly messages during the process"