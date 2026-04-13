/**
 * esbuild config for the VS Code extension.
 * - `vscode` is provided by VS Code at runtime — must be external
 * - `better-sqlite3` and `node-oracledb` are native addons — must be external
 * - Output: single CJS bundle (VS Code extension host requires CJS)
 *
 * Static assets copied to dist/:
 *   src/graph/webview/graph-webview.html  → dist/webview/graph-webview.html
 *
 * Resources the developer must supply manually (not bundled):
 *   resources/cytoscape.min.js  — download from https://unpkg.com/cytoscape/dist/cytoscape.min.js
 */
import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

const watch = process.argv.includes('--watch');

// ── Copy static webview assets ─────────────────────────────────────────────
function copyStaticAssets() {
  const webviewDist = 'dist/webview';
  if (!fs.existsSync(webviewDist)) fs.mkdirSync(webviewDist, { recursive: true });

  const htmlSrc = path.join('src', 'graph', 'webview', 'graph-webview.html');
  const htmlDst = path.join(webviewDist, 'graph-webview.html');
  if (fs.existsSync(htmlSrc)) {
    fs.copyFileSync(htmlSrc, htmlDst);
    console.log(`✓ Copied ${htmlSrc} → ${htmlDst}`);
  }
}

copyStaticAssets();

// ── esbuild ────────────────────────────────────────────────────────────────
const ctx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: 'dist/extension.js',
  external: [
    'vscode',           // provided by VS Code extension host
    'better-sqlite3',   // native addon — copy separately
    'node-oracledb',    // native addon — not used directly by extension
  ],
  sourcemap: true,
  minify: false,        // keep readable for debugging
});

if (watch) {
  await ctx.watch();
  // Re-copy HTML on every watch iteration via a plugin would be ideal,
  // but for now restart watch after editing the HTML template.
  console.log('Watching for changes…');
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log('✓ VS Code extension bundled → dist/extension.js');
}
