/**
 * `plsql-analyze install-hook` — installs a git pre-push hook that runs
 * the analysis and blocks the push if ERROR-level findings are present.
 *
 * The installed hook:
 *   1. Runs `plsql-analyze analyze --format text --fail-on error --quiet`
 *   2. Exits non-zero on findings → git aborts the push
 *   3. Supports SKIP_PLSQL=1 env var to bypass in emergencies
 */

import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';

const HOOK_MARKER = '# plsql-analyze-hook';

const HOOK_CONTENT = `#!/usr/bin/env bash
${HOOK_MARKER}
# Installed by: plsql-analyze install-hook
# Remove with:  plsql-analyze remove-hook  OR delete this file

if [ "\${SKIP_PLSQL:-0}" = "1" ]; then
  echo "[plsql-analyze] Skipping PL/SQL analysis (SKIP_PLSQL=1)"
  exit 0
fi

echo "[plsql-analyze] Running PL/SQL analysis before push…"
plsql-analyze analyze --format text --fail-on error

STATUS=$?
if [ $STATUS -ne 0 ]; then
  echo ""
  echo "[plsql-analyze] Push blocked: fix ERROR-level findings or set SKIP_PLSQL=1 to bypass."
  exit 1
fi

exit 0
`;

export async function runInstallHook(opts: { force?: boolean }): Promise<void> {
  const gitRoot = findGitRoot();
  if (!gitRoot) {
    console.error('Error: not inside a git repository. Run from inside your project.');
    process.exit(2);
  }

  const hooksDir = path.join(gitRoot, '.git', 'hooks');
  const hookPath = path.join(hooksDir, 'pre-push');

  // Check if hook already exists
  if (fs.existsSync(hookPath) && !opts.force) {
    const existing = fs.readFileSync(hookPath, 'utf-8');
    if (existing.includes(HOOK_MARKER)) {
      console.log('pre-push hook is already installed.');
      return;
    }
    console.error(`Error: ${hookPath} already exists and was not installed by plsql-analyze.`);
    console.error('Use --force to overwrite, or manually merge the hook.');
    process.exit(2);
  }

  fs.writeFileSync(hookPath, HOOK_CONTENT, { mode: 0o755 });
  console.log(`✓ pre-push hook installed at ${hookPath}`);
  console.log('  The hook will run `plsql-analyze analyze` before every git push.');
  console.log('  Set SKIP_PLSQL=1 to bypass in emergencies.');
}

export async function runRemoveHook(): Promise<void> {
  const gitRoot = findGitRoot();
  if (!gitRoot) {
    console.error('Error: not inside a git repository.');
    process.exit(2);
  }

  const hookPath = path.join(gitRoot, '.git', 'hooks', 'pre-push');
  if (!fs.existsSync(hookPath)) {
    console.log('No pre-push hook found.');
    return;
  }

  const content = fs.readFileSync(hookPath, 'utf-8');
  if (!content.includes(HOOK_MARKER)) {
    console.error('The existing pre-push hook was not installed by plsql-analyze — not removing.');
    process.exit(2);
  }

  fs.unlinkSync(hookPath);
  console.log('✓ pre-push hook removed.');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findGitRoot(): string | undefined {
  try {
    const result = child_process.execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  } catch {
    return undefined;
  }
}
