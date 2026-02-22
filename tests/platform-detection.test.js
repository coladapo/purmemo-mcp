/**
 * Platform Detection Tests
 *
 * These tests verify platform detection logic for different MCP clients
 * (Claude Code, Cursor, Claude Desktop, Windsurf, etc.)
 *
 * Total: ~10 tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

/**
 * Platform detection logic (extracted from server.js)
 * Detects which MCP client is running based on environment variables
 */
function detectPlatform() {
  // Check explicit platform override
  if (process.env.MCP_PLATFORM) {
    return process.env.MCP_PLATFORM.toLowerCase();
  }

  // Claude Code detection
  if (process.env.CLAUDECODE === '1' || process.env.CLAUDE_CODE === '1') {
    return 'claude-code';
  }

  // Cursor detection
  if (process.env.CURSOR_EDITOR === '1' || process.env.CURSOR) {
    return 'cursor';
  }

  // Windsurf detection
  if (process.env.WINDSURF === '1' || process.env.WINDSURF_EDITOR) {
    return 'windsurf';
  }

  // Zed detection
  if (process.env.ZED_EDITOR === '1' || process.env.ZED) {
    return 'zed';
  }

  // VS Code detection (generic MCP)
  if (process.env.VSCODE_PID || process.env.TERM_PROGRAM === 'vscode') {
    return 'vscode';
  }

  // Claude Desktop (default for stdio MCP)
  return 'claude-desktop';
}

/**
 * Get platform-specific user agent
 */
function getPlatformUserAgent(platform) {
  const agents = {
    'claude-code': 'Claude-Code/1.0 MCP-Client',
    'cursor': 'Cursor/1.0 MCP-Client',
    'claude-desktop': 'Claude-Desktop/1.0 MCP-Client',
    'windsurf': 'Windsurf/1.0 MCP-Client',
    'zed': 'Zed/1.0 MCP-Client',
    'vscode': 'VSCode/1.0 MCP-Client'
  };
  return agents[platform] || 'Unknown-MCP-Client/1.0';
}

/**
 * Check if platform supports advanced features
 */
function platformSupportsFeature(platform, feature) {
  const featureMatrix = {
    'context-injection': ['claude-code', 'cursor', 'windsurf'],
    'file-context': ['claude-code', 'cursor', 'windsurf', 'zed', 'vscode'],
    'project-detection': ['claude-code', 'cursor', 'windsurf'],
    'auto-save': ['claude-code', 'cursor', 'claude-desktop'],
    'rich-notifications': ['claude-desktop', 'cursor']
  };

  const supportedPlatforms = featureMatrix[feature] || [];
  return supportedPlatforms.includes(platform);
}

// Store original env values
let originalEnv = {};

describe('Platform Detection', () => {

  beforeEach(() => {
    // Store and clear platform-related env vars
    originalEnv = {
      MCP_PLATFORM: process.env.MCP_PLATFORM,
      CLAUDECODE: process.env.CLAUDECODE,
      CLAUDE_CODE: process.env.CLAUDE_CODE,
      CURSOR_EDITOR: process.env.CURSOR_EDITOR,
      CURSOR: process.env.CURSOR,
      WINDSURF: process.env.WINDSURF,
      WINDSURF_EDITOR: process.env.WINDSURF_EDITOR,
      ZED_EDITOR: process.env.ZED_EDITOR,
      ZED: process.env.ZED,
      VSCODE_PID: process.env.VSCODE_PID,
      TERM_PROGRAM: process.env.TERM_PROGRAM
    };

    // Clear all platform env vars
    delete process.env.MCP_PLATFORM;
    delete process.env.CLAUDECODE;
    delete process.env.CLAUDE_CODE;
    delete process.env.CURSOR_EDITOR;
    delete process.env.CURSOR;
    delete process.env.WINDSURF;
    delete process.env.WINDSURF_EDITOR;
    delete process.env.ZED_EDITOR;
    delete process.env.ZED;
    delete process.env.VSCODE_PID;
    delete process.env.TERM_PROGRAM;
  });

  afterEach(() => {
    // Restore original env vars
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    });
  });

  describe('Explicit Platform Override', () => {
    it('should respect MCP_PLATFORM environment variable', () => {
      process.env.MCP_PLATFORM = 'custom-platform';
      assert.strictEqual(detectPlatform(), 'custom-platform');
    });

    it('should lowercase MCP_PLATFORM value', () => {
      process.env.MCP_PLATFORM = 'CURSOR';
      assert.strictEqual(detectPlatform(), 'cursor');
    });
  });

  describe('Claude Code Detection', () => {
    it('should detect Claude Code via CLAUDECODE=1', () => {
      process.env.CLAUDECODE = '1';
      assert.strictEqual(detectPlatform(), 'claude-code');
    });

    it('should detect Claude Code via CLAUDE_CODE=1', () => {
      process.env.CLAUDE_CODE = '1';
      assert.strictEqual(detectPlatform(), 'claude-code');
    });
  });

  describe('Cursor Detection', () => {
    it('should detect Cursor via CURSOR_EDITOR=1', () => {
      process.env.CURSOR_EDITOR = '1';
      assert.strictEqual(detectPlatform(), 'cursor');
    });

    it('should detect Cursor via CURSOR env var', () => {
      process.env.CURSOR = 'true';
      assert.strictEqual(detectPlatform(), 'cursor');
    });
  });

  describe('Windsurf Detection', () => {
    it('should detect Windsurf via WINDSURF=1', () => {
      process.env.WINDSURF = '1';
      assert.strictEqual(detectPlatform(), 'windsurf');
    });

    it('should detect Windsurf via WINDSURF_EDITOR', () => {
      process.env.WINDSURF_EDITOR = '/path/to/windsurf';
      assert.strictEqual(detectPlatform(), 'windsurf');
    });
  });

  describe('Other Platform Detection', () => {
    it('should detect Zed editor', () => {
      process.env.ZED_EDITOR = '1';
      assert.strictEqual(detectPlatform(), 'zed');
    });

    it('should detect VS Code', () => {
      process.env.VSCODE_PID = '12345';
      assert.strictEqual(detectPlatform(), 'vscode');
    });

    it('should default to claude-desktop when no platform detected', () => {
      // All env vars cleared in beforeEach
      assert.strictEqual(detectPlatform(), 'claude-desktop');
    });
  });
});

describe('Platform User Agent', () => {
  it('should return correct user agent for each platform', () => {
    assert.ok(getPlatformUserAgent('claude-code').includes('Claude-Code'));
    assert.ok(getPlatformUserAgent('cursor').includes('Cursor'));
    assert.ok(getPlatformUserAgent('claude-desktop').includes('Claude-Desktop'));
    assert.ok(getPlatformUserAgent('windsurf').includes('Windsurf'));
  });

  it('should return unknown for unrecognized platform', () => {
    const unknown = getPlatformUserAgent('some-random-platform');
    assert.ok(unknown.includes('Unknown'));
  });
});

describe('Platform Feature Support', () => {
  it('should identify context-injection support', () => {
    assert.strictEqual(platformSupportsFeature('claude-code', 'context-injection'), true);
    assert.strictEqual(platformSupportsFeature('cursor', 'context-injection'), true);
    assert.strictEqual(platformSupportsFeature('claude-desktop', 'context-injection'), false);
  });

  it('should identify file-context support', () => {
    assert.strictEqual(platformSupportsFeature('claude-code', 'file-context'), true);
    assert.strictEqual(platformSupportsFeature('vscode', 'file-context'), true);
    assert.strictEqual(platformSupportsFeature('claude-desktop', 'file-context'), false);
  });

  it('should identify auto-save support', () => {
    assert.strictEqual(platformSupportsFeature('claude-code', 'auto-save'), true);
    assert.strictEqual(platformSupportsFeature('cursor', 'auto-save'), true);
    assert.strictEqual(platformSupportsFeature('zed', 'auto-save'), false);
  });

  it('should return false for unknown features', () => {
    assert.strictEqual(platformSupportsFeature('claude-code', 'unknown-feature'), false);
  });
});
