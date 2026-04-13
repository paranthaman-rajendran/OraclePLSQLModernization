/**
 * esbuild config for the MCP server.
 * node-oracledb is a native addon — must be external.
 * Output is a single ESM bundle at dist/index.js.
 */
import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: 'dist/index.js',
  external: [
    'node-oracledb',          // native addon
    'better-sqlite3',         // native addon (used by extension only)
  ],
  banner: {
    js: '#!/usr/bin/env node\n// PL/SQL Analyzer MCP Server',
  },
  sourcemap: true,
  metafile: true,
});

// Copy native oracledb binding alongside the bundle
try {
  const oracledbPath = resolve(require.resolve('node-oracledb'), '../../');
  const destDir = resolve(__dirname, 'dist');
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
  // The actual .node files are resolved at runtime by node-oracledb itself
  console.log('✓ MCP server bundled → dist/index.js');
} catch {
  console.warn('⚠ node-oracledb not installed — install before running the server');
}
