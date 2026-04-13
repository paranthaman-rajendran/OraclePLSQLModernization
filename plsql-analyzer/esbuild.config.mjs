/**
 * Root build orchestrator.
 * Order: shared (types only, no emit) → mcp-server → vscode-extension
 */
import { execSync } from 'child_process';

const run = (cmd) => {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
};

// 1. Type-check and emit declarations for shared
run('npm run build -w shared');

// 2. Bundle MCP server
run('npm run build -w packages/mcp-server');

// 3. Bundle VS Code extension
run('npm run build -w packages/vscode-extension');

console.log('\n✓ All packages built.');
