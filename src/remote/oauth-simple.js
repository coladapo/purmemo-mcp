/**
 * Simplified OAuth implementation — in-memory, no database
 * Port of Python oauth_simple.py
 *
 * Stores auth codes in memory. Single-instance only (codes lost on restart).
 * This is fine because the OAuth flow completes in seconds — if the server
 * restarts mid-flow, the user just re-authenticates.
 */

import crypto from 'node:crypto';

// In-memory storage
const oauthCodes = new Map();

/** Remove expired codes */
function cleanupExpired() {
  const now = Date.now();
  for (const [code, data] of oauthCodes) {
    if (data.expiresAt < now) oauthCodes.delete(code);
  }
}

/** Generate a secure authorization code */
export function generateCode() {
  return `code_${crypto.randomBytes(16).toString('base64url')}`;
}

/** Verify PKCE code challenge (S256 or plain) */
export function verifyCodeChallenge(verifier, challenge, method = 'S256') {
  if (method === 'plain') return verifier === challenge;
  if (method === 'S256') {
    const digest = crypto.createHash('sha256').update(verifier, 'utf8').digest();
    const computed = digest.toString('base64url');
    // Compare with and without trailing '=' padding
    return computed === challenge || computed.replace(/=+$/, '') === challenge.replace(/=+$/, '');
  }
  return false;
}

/** Store authorization code with associated API key and OAuth params */
export function storeAuthCode({
  code, apiKey, clientId, redirectUri,
  codeChallenge, codeChallengeMethod,
  scope = null, state = null, refreshToken = null
}) {
  cleanupExpired();
  oauthCodes.set(code, {
    apiKey,
    refreshToken,
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    scope,
    state,
    createdAt: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    used: false
  });
}

/**
 * Exchange authorization code for access token
 * Returns [apiKey, refreshToken] or null if invalid
 */
export function exchangeCodeForToken({ code, clientId, redirectUri, codeVerifier }) {
  cleanupExpired();

  const data = oauthCodes.get(code);
  if (!data) return null;
  if (data.expiresAt < Date.now()) { oauthCodes.delete(code); return null; }
  if (data.used) { oauthCodes.delete(code); return null; }
  if (clientId && clientId !== data.clientId) return null;
  if (redirectUri !== data.redirectUri) return null;
  if (!verifyCodeChallenge(codeVerifier, data.codeChallenge, data.codeChallengeMethod)) return null;

  // Mark used and delete
  data.used = true;
  const apiKey = data.apiKey;
  const refreshToken = data.refreshToken;
  oauthCodes.delete(code);

  return [apiKey, refreshToken];
}
