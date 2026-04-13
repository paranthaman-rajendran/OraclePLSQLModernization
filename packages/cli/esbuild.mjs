/**
 * esbuild config for the plsql-analyze CLI.
 * Produces a single ESM bundle with a Node shebang.
 */
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const ctx = await esbuild.context({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: 'dist/index.js',
  banner: { js: '#!/usr/bin/env node' },
  external: [
    'node-oracledb',  // heavy native addon — not needed directly by CLI
  ],
  sourcemap: true,
  minify: false,
});

if (watch) {
  await ctx.watch();
  console.log('CLI watching for changes…');
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log('✓ CLI bundled → dist/index.js');
}
