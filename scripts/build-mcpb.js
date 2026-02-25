#!/usr/bin/env node
/**
 * Build purmemo-mcp.mcpb
 *
 * - Syncs version from package.json into src/manifest.json and bundle/manifest.json
 * - Zips bundle/ contents (flat, no prefix) into purmemo-mcp.mcpb
 */

import { readFileSync, writeFileSync } from 'fs';
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

// 2. Zip bundle/ contents flat (cd into bundle so paths are root-relative)
const mcpbPath = resolve(root, 'purmemo-mcp.mcpb');
execSync(`cd "${root}/bundle" && zip -r "${mcpbPath}" . -x ".mcpbignore"`, { stdio: 'inherit' });

const sizeMB = (readFileSync(mcpbPath).length / 1024 / 1024).toFixed(1);
console.log(`  ✓ purmemo-mcp.mcpb built (${sizeMB} MB)`);
