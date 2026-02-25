/**
 * Secure Token Storage for Purmemo MCP
 * Stores OAuth tokens securely in user's home directory
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

class TokenStore {
  constructor() {
    // Store tokens in user's home directory
    this.configDir = path.join(os.homedir(), '.purmemo');
    this.tokenFile = path.join(this.configDir, 'auth.json');
    this.encryptionKey = this.getEncryptionKey();
  }

  /**
   * Get or generate encryption key for token storage
   */
  getEncryptionKey() {
    // Use machine ID + user info for key generation
    const machineId = os.hostname() + os.userInfo().username;
    return crypto.createHash('sha256').update(machineId).digest();
  }

  /**
   * Ensure config directory exists
   */
  async ensureConfigDir() {
    try {
      await fs.mkdir(this.configDir, { recursive: true });
      // Set restrictive permissions (owner read/write only)
      if (process.platform !== 'win32') {
        await fs.chmod(this.configDir, 0o700);
      }
    } catch (error) {
      console.error('Failed to create config directory:', error);
    }
  }

  /**
   * Encrypt data
   */
  encrypt(data) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
    
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return {
      iv: iv.toString('hex'),
      data: encrypted
    };
  }

  /**
   * Decrypt data
   */
  decrypt(encryptedData) {
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
    
    let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }

  /**
   * Save token to disk
   */
  async saveToken(tokenData) {
    await this.ensureConfigDir();
    
    // Encrypt token data
    const encrypted = this.encrypt(tokenData);
    
    // Write to file
    await fs.writeFile(
      this.tokenFile, 
      JSON.stringify(encrypted, null, 2),
      'utf8'
    );
    
    // Set restrictive permissions
    if (process.platform !== 'win32') {
      await fs.chmod(this.tokenFile, 0o600);
    }
  }

  /**
   * Get stored token
   */
  async getToken() {
    try {
      const data = await fs.readFile(this.tokenFile, 'utf8');
      const encrypted = JSON.parse(data);
      return this.decrypt(encrypted);
    } catch (error) {
      // File doesn't exist or is corrupted
      if (error.code === 'ENOENT') {
        return null;
      }
      console.error('Failed to read token:', error.message);
      return null;
    }
  }

  /**
   * Clear stored token
   */
  async clearToken() {
    try {
      await fs.unlink(this.tokenFile);
    } catch (error) {
      // Ignore if file doesn't exist
      if (error.code !== 'ENOENT') {
        console.error('Failed to clear token:', error);
      }
    }
  }

  /**
   * Check if token exists
   */
  async hasToken() {
    try {
      await fs.access(this.tokenFile);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get user info from stored token
   */
  async getUserInfo() {
    const token = await this.getToken();
    if (!token) return null;
    
    return {
      user_id: token.user?.id,
      email: token.user?.email,
      tier: token.user_tier || 'free',
      memory_limit: token.memory_limit,
      expires_at: token.expires_at
    };
  }
}

export default TokenStore;