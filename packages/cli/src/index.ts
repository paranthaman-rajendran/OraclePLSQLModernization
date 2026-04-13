#!/usr/bin/env node
/**
 * plsql-analyze — CLI entry point.
 *
 * Commands:
 *   analyze         Run analysis against a live Oracle schema
 *   install-hook    Install git pre-push hook
 *   remove-hook     Remove git pre-push hook
 *   init            Scaffold .plsql-analyzer.json in current directory
 *
 * Usage examples:
 *   plsql-analyze analyze --schema MYAPP --format sarif > results.sarif
 *   plsql-analyze analyze --user scott --password tiger --host localhost
 *   plsql-analyze install-hook
 *   SKIP_PLSQL=1 git push origin main   # bypass hook
 */

import { Command } from 'commander';
import { runAnalyze } from './commands/analyze.js';
import { runInstallHook, runRemoveHook } from './commands/install-hook.js';
import { writeConfigTemplate } from './commands/init.js';

const pkg = { name: 'plsql-analyze', version: '0.1.0' };

const program = new Command();

program
  .name(pkg.name)
  .description('Oracle PL/SQL static analysis for CI/CD pipelines')
  .version(pkg.version);

// ── analyze ──────────────────────────────────────────────────────────────────

program
  .command('analyze')
  .description('Analyze a live Oracle schema and report findings')
  .option('--host <host>',      'Oracle host (overrides config / PLSQL_HOST)')
  .option('--port <port>',      'Oracle port (overrides config / PLSQL_PORT)', parseInt)
  .option('--service <name>',   'Oracle service name (overrides config / PLSQL_SERVICE)')
  .option('--user <user>',      'Oracle username (overrides config / PLSQL_USER)')
  .option('--password <pass>',  'Oracle password (overrides config / PLSQL_PASSWORD) — prefer env var')
  .option('--schema <schema>',  'Schema to analyze (defaults to username)')
  .option('--format <format>',  'Output format: text | json | sarif (default: text)', 'text')
  .option('--fail-on <level>',  'Exit 1 when findings reach: error | warning | none (default: error)', 'error')
  .option('--verbose',          'Enable debug logging')
  .option('--quiet',            'Suppress all progress output (findings still printed)')
  .action(async (opts: {
    host?: string; port?: number; service?: string; user?: string; password?: string;
    schema?: string; format?: string; failOn?: string; verbose?: boolean; quiet?: boolean;
  }) => {
    await runAnalyze({
      host:    opts.host,
      port:    opts.port,
      service: opts.service,
      user:    opts.user,
      password: opts.password,
      schema:  opts.schema,
      format:  opts.format as 'text' | 'json' | 'sarif' | undefined,
      failOn:  opts.failOn as 'error' | 'warning' | 'none' | undefined,
      verbose: opts.verbose,
      quiet:   opts.quiet,
    });
  });

// ── install-hook ──────────────────────────────────────────────────────────────

program
  .command('install-hook')
  .description('Install git pre-push hook that blocks pushes with ERROR-level findings')
  .option('--force', 'Overwrite an existing pre-push hook')
  .action(async (opts: { force?: boolean }) => {
    await runInstallHook(opts);
  });

// ── remove-hook ───────────────────────────────────────────────────────────────

program
  .command('remove-hook')
  .description('Remove the plsql-analyze git pre-push hook')
  .action(async () => {
    await runRemoveHook();
  });

// ── init ─────────────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Create a .plsql-analyzer.json config file in the current directory')
  .option('--force', 'Overwrite existing config file')
  .action(async (opts: { force?: boolean }) => {
    await writeConfigTemplate(opts);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});
