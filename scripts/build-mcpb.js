#!/usr/bin/env node
/**
 * Build purmemo-mcp.mcpb
 *
 * - Syncs version from package.json into src/manifest.json and bundle/manifest.json
 * - Copies updated .js source files from src/ into bundle/server/ (preserves node_modules)
 * - Zips bundle/ contents flat into purmemo-mcp.mcpb
 */

import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// 1. Sync version from package.json into both manifests
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const version = pkg.version;
console.log(`Building purmemo-mcp.mcpb v${version}...`);

for (const rel of ['src/manifest.json', 'bundle/manifest.json']) {
  const p = resolve(root, rel);
  const m = JSON.parse(readFileSync(p, 'utf8'));
  m.version = version;
  writeFileSync(p, JSON.stringify(m, null, 2) + '\n');
  console.log(`  ✓ ${rel} → ${version}`);
}

// 2. Copy updated source files from src/ into bundle/server/
//    Only copies .js files — does NOT touch node_modules or package.json
const filesToSync = [
  'server.js',
  'intelligent-memory.js',
  'index.js',
  'auth/token-store.js',
  'auth/universal-auth.js',
  'auth/oauth-manager.js',
];

for (const f of filesToSync) {
  const src = resolve(root, 'src', f);
  const dest = resolve(root, 'bundle/server', f);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}
console.log(`  ✓ src/*.js → bundle/server/ synced (${filesToSync.length} files)`);

// 3. Zip bundle/ contents flat (delete old .mcpb first to avoid stale entries)
const mcpbPath = resolve(root, 'purmemo-mcp.mcpb');
try { execSync(`rm -f "${mcpbPath}"`); } catch {}
execSync(`cd "${root}/bundle" && zip -r "${mcpbPath}" . -x ".mcpbignore"`, { stdio: 'inherit' });

const sizeMB = (readFileSync(mcpbPath).length / 1024 / 1024).toFixed(1);
console.log(`  ✓ purmemo-mcp.mcpb built (${sizeMB} MB)`);
