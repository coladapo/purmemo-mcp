/**
 * Unified OAuth 2.1 Server for Purmemo
 * Implements OAuth 2.1 with mandatory PKCE for all clients
 * Supports: Claude MCP, ChatGPT, NPM, Web, Mobile, API clients
 */

import express from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

class UnifiedOAuthServer {
  constructor(config = {}) {
    this.app = express();
    this.config = {
      port: config.port || 3000,
      jwtSecret: config.jwtSecret || process.env.JWT_SECRET,
      databaseUrl: config.databaseUrl || process.env.DATABASE_URL,
      supabaseUrl: config.supabaseUrl || process.env.SUPABASE_URL,
      supabaseKey: config.supabaseKey || process.env.SUPABASE_ANON_KEY,
      ...config
    };

    // Database connection
    this.db = new Pool({ connectionString: this.config.databaseUrl });

    // Registered OAuth clients
    this.clients = {
      'claude-mcp': {
        name: 'Claude MCP',
        type: 'public',
        redirectUris: ['http://localhost:3456/callback'],
        scopes: ['memories.read', 'memories.write', 'entities.read']
      },
      'chatgpt-purmemo': {
        name: 'ChatGPT Plugin',
        type: 'confidential',
        secret: process.env.CHATGPT_CLIENT_SECRET,
        redirectUris: ['https://chat.openai.com/aip/plugin-purmemo/oauth/callback'],
        scopes: ['memories.read', 'memories.write']
      },
      'npm-cli': {
        name: 'NPM CLI',
        type: 'public',
        redirectUris: ['http://localhost:8080/callback', 'http://localhost:3456/callback'],
        scopes: ['memories.read', 'memories.write', 'api.full']
      },
      'web-app': {
        name: 'Web Application',
        type: 'public',
        redirectUris: ['https://app.purmemo.ai/auth/callback'],
        scopes: ['*']
      },
      'mobile-app': {
        name: 'Mobile App',
        type: 'public',
        redirectUris: ['purmemo://auth/callback'],
        scopes: ['*']
      }
    };

    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    // CORS configuration
    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow registered redirect URIs
        const allowedOrigins = [
          'https://app.purmemo.ai',
          'https://chat.openai.com',
          'http://localhost:3456',
          'http://localhost:8080',
          'http://localhost:3000'
        ];
        
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true
    }));

    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Rate limiting
    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10, // limit each IP to 10 requests per windowMs
      message: 'Too many authentication attempts, please try again later'
    });

    this.app.use('/oauth/authorize', authLimiter);
    this.app.use('/oauth/token', authLimiter);
  }

  setupRoutes() {
    // OAuth 2.1 Authorization Endpoint
    this.app.get('/oauth/authorize', this.handleAuthorize.bind(this));
    
    // OAuth 2.1 Token Endpoint
    this.app.post('/oauth/token', this.handleToken.bind(this));
    
    // UserInfo Endpoint
    this.app.get('/oauth/userinfo', this.handleUserInfo.bind(this));
    
    // Token Revocation Endpoint
    this.app.post('/oauth/revoke', this.handleRevoke.bind(this));
    
    // OpenID Configuration Discovery
    this.app.get('/.well-known/openid-configuration', this.handleDiscovery.bind(this));
    
    // Client Registration Endpoint (admin only)
    this.app.post('/oauth/clients/register', this.handleClientRegistration.bind(this));
    
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', service: 'unified-oauth-server' });
    });
  }

  /**
   * OAuth 2.1 Authorization Endpoint
   * Initiates the authorization flow with mandatory PKCE
   */
  async handleAuthorize(req, res) {
    const {
      response_type,
      client_id,
      redirect_uri,
      scope,
      state,
      code_challenge,
      code_challenge_method
    } = req.query;

    // Validate required parameters
    if (!response_type || response_type !== 'code') {
      return res.status(400).json({ 
        error: 'invalid_request',
        error_description: 'Only authorization code flow is supported'
      });
    }

    // Validate client
    const client = this.clients[client_id];
    if (!client) {
      return res.status(400).json({ 
        error: 'invalid_client',
        error_description: 'Client not registered'
      });
    }

    // Validate redirect URI (exact match required)
    if (!client.redirectUris.includes(redirect_uri)) {
      return res.status(400).json({ 
        error: 'invalid_request',
        error_description: 'Invalid redirect_uri'
      });
    }

    // OAuth 2.1 MANDATORY: Validate PKCE parameters
    if (!code_challenge) {
      return res.status(400).json({ 
        error: 'invalid_request',
        error_description: 'PKCE code_challenge is required (OAuth 2.1)'
      });
    }

    if (code_challenge_method && code_challenge_method !== 'S256') {
      return res.status(400).json({ 
        error: 'invalid_request',
        error_description: 'Only S256 code_challenge_method is supported'
      });
    }

    // Create authorization session
    const sessionId = crypto.randomBytes(16).toString('hex');
    
    try {
      await this.db.query(`
        INSERT INTO oauth_sessions 
        (session_id, client_id, redirect_uri, scope, state, code_challenge, code_challenge_method, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '10 minutes')
      `, [sessionId, client_id, redirect_uri, scope, state, code_challenge, code_challenge_method || 'S256']);

      // Redirect to login page with session
      const loginUrl = new URL('https://app.purmemo.ai/oauth/login');
      loginUrl.searchParams.append('session', sessionId);
      loginUrl.searchParams.append('client', client.name);
      
      res.redirect(loginUrl.toString());
    } catch (error) {
      console.error('Authorization error:', error);
      res.status(500).json({ 
        error: 'server_error',
        error_description: 'Internal server error'
      });
    }
  }

  /**
   * OAuth 2.1 Token Endpoint
   * Exchanges authorization code for tokens with PKCE verification
   */
  async handleToken(req, res) {
    const {
      grant_type,
      code,
      redirect_uri,
      client_id,
      client_secret,
      code_verifier,
      refresh_token
    } = req.body;

    try {
      if (grant_type === 'authorization_code') {
        // Validate client
        const client = this.clients[client_id];
        if (!client) {
          return res.status(401).json({ 
            error: 'invalid_client',
            error_description: 'Client authentication failed'
          });
        }

        // Validate client secret for confidential clients
        if (client.type === 'confidential' && client.secret !== client_secret) {
          return res.status(401).json({ 
            error: 'invalid_client',
            error_description: 'Client authentication failed'
          });
        }

        // Retrieve and validate authorization code
        const codeResult = await this.db.query(`
          SELECT * FROM oauth_codes 
          WHERE code = $1 AND client_id = $2 AND expires_at > NOW()
        `, [code, client_id]);

        if (codeResult.rows.length === 0) {
          return res.status(400).json({ 
            error: 'invalid_grant',
            error_description: 'Invalid or expired authorization code'
          });
        }

        const authCode = codeResult.rows[0];

        // Validate redirect URI
        if (authCode.redirect_uri !== redirect_uri) {
          return res.status(400).json({ 
            error: 'invalid_grant',
            error_description: 'Redirect URI mismatch'
          });
        }

        // OAuth 2.1 MANDATORY: Validate PKCE
        if (!code_verifier) {
          return res.status(400).json({ 
            error: 'invalid_request',
            error_description: 'PKCE code_verifier is required'
          });
        }

        const challenge = crypto
          .createHash('sha256')
          .update(code_verifier)
          .digest('base64url');

        if (challenge !== authCode.code_challenge) {
          return res.status(400).json({ 
            error: 'invalid_grant',
            error_description: 'PKCE verification failed'
          });
        }

        // Delete used authorization code
        await this.db.query('DELETE FROM oauth_codes WHERE code = $1', [code]);

        // Generate tokens
        const accessToken = this.generateAccessToken(authCode.user_id, client_id, authCode.scope);
        const refreshToken = this.generateRefreshToken(authCode.user_id, client_id);

        // Store refresh token
        await this.db.query(`
          INSERT INTO refresh_tokens (token, user_id, client_id, scope, expires_at)
          VALUES ($1, $2, $3, $4, NOW() + INTERVAL '30 days')
        `, [refreshToken, authCode.user_id, client_id, authCode.scope]);

        res.json({
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: refreshToken,
          scope: authCode.scope
        });

      } else if (grant_type === 'refresh_token') {
        // Handle refresh token flow with rotation
        const tokenResult = await this.db.query(`
          SELECT * FROM refresh_tokens 
          WHERE token = $1 AND expires_at > NOW()
        `, [refresh_token]);

        if (tokenResult.rows.length === 0) {
          return res.status(400).json({ 
            error: 'invalid_grant',
            error_description: 'Invalid or expired refresh token'
          });
        }

        const oldToken = tokenResult.rows[0];

        // Generate new tokens
        const accessToken = this.generateAccessToken(oldToken.user_id, oldToken.client_id, oldToken.scope);
        const newRefreshToken = this.generateRefreshToken(oldToken.user_id, oldToken.client_id);

        // Rotate refresh token (OAuth 2.1 best practice)
        await this.db.query('BEGIN');
        
        // Mark old token as rotated
        await this.db.query(`
          UPDATE refresh_tokens 
          SET expires_at = NOW() 
          WHERE token = $1
        `, [refresh_token]);

        // Insert new refresh token
        await this.db.query(`
          INSERT INTO refresh_tokens (token, user_id, client_id, scope, expires_at, rotated_from)
          VALUES ($1, $2, $3, $4, NOW() + INTERVAL '30 days', $5)
        `, [newRefreshToken, oldToken.user_id, oldToken.client_id, oldToken.scope, oldToken.id]);

        await this.db.query('COMMIT');

        res.json({
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: newRefreshToken,
          scope: oldToken.scope
        });

      } else {
        res.status(400).json({ 
          error: 'unsupported_grant_type',
          error_description: 'Grant type not supported'
        });
      }
    } catch (error) {
      console.error('Token error:', error);
      await this.db.query('ROLLBACK');
      res.status(500).json({ 
        error: 'server_error',
        error_description: 'Internal server error'
      });
    }
  }

  /**
   * UserInfo Endpoint
   */
  async handleUserInfo(req, res) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'invalid_token',
        error_description: 'Bearer token required'
      });
    }

    const token = authHeader.substring(7);

    try {
      const payload = jwt.verify(token, this.config.jwtSecret);
      
      // Get user info from database
      const userResult = await this.db.query(`
        SELECT id, email, name, picture, created_at 
        FROM users 
        WHERE id = $1
      `, [payload.sub]);

      if (userResult.rows.length === 0) {
        return res.status(404).json({ 
          error: 'invalid_token',
          error_description: 'User not found'
        });
      }

      const user = userResult.rows[0];
      
      res.json({
        sub: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        created_at: user.created_at
      });
    } catch (error) {
      res.status(401).json({ 
        error: 'invalid_token',
        error_description: 'Invalid or expired token'
      });
    }
  }

  /**
   * Token Revocation Endpoint
   */
  async handleRevoke(req, res) {
    const { token, token_type_hint } = req.body;

    try {
      // Try to revoke as refresh token first
      await this.db.query(`
        UPDATE refresh_tokens 
        SET expires_at = NOW() 
        WHERE token = $1
      `, [token]);

      res.status(200).json({ revoked: true });
    } catch (error) {
      console.error('Revocation error:', error);
      res.status(200).json({ revoked: true }); // Always return success per RFC
    }
  }

  /**
   * OpenID Configuration Discovery
   */
  handleDiscovery(req, res) {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    res.json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      userinfo_endpoint: `${baseUrl}/oauth/userinfo`,
      revocation_endpoint: `${baseUrl}/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
      scopes_supported: [
        'openid',
        'profile',
        'email',
        'memories.read',
        'memories.write',
        'entities.read',
        'api.full'
      ]
    });
  }

  /**
   * Client Registration (Admin only)
   */
  async handleClientRegistration(req, res) {
    // TODO: Add admin authentication
    
    const {
      client_name,
      client_type,
      redirect_uris,
      scopes
    } = req.body;

    const clientId = crypto.randomBytes(16).toString('hex');
    const clientSecret = client_type === 'confidential' 
      ? crypto.randomBytes(32).toString('base64url')
      : null;

    try {
      await this.db.query(`
        INSERT INTO oauth_clients 
        (client_id, client_secret, client_name, client_type, redirect_uris, allowed_scopes)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [clientId, clientSecret, client_name, client_type, redirect_uris, scopes]);

      res.json({
        client_id: clientId,
        client_secret: clientSecret,
        client_name,
        client_type,
        redirect_uris,
        scopes
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ 
        error: 'server_error',
        error_description: 'Failed to register client'
      });
    }
  }

  /**
   * Generate JWT access token
   */
  generateAccessToken(userId, clientId, scope) {
    return jwt.sign({
      sub: userId,
      client_id: clientId,
      scope,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour
    }, this.config.jwtSecret);
  }

  /**
   * Generate refresh token
   */
  generateRefreshToken(userId, clientId) {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Start the server
   */
  start() {
    this.app.listen(this.config.port, () => {
      console.log(`🔐 Unified OAuth Server running on port ${this.config.port}`);
      console.log(`   Authorization: http://localhost:${this.config.port}/oauth/authorize`);
      console.log(`   Token:         http://localhost:${this.config.port}/oauth/token`);
      console.log(`   Discovery:     http://localhost:${this.config.port}/.well-known/openid-configuration`);
    });
  }
}

// Export for use as module
export default UnifiedOAuthServer;

// Run directly if called as script
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new UnifiedOAuthServer();
  server.start();
}