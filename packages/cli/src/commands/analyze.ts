/**
 * `plsql-analyze analyze` command.
 *
 * Connects to Oracle via the MCP server subprocess, runs the full analysis
 * pipeline, then outputs results in the requested format.
 *
 * Exit codes:
 *   0 — success, no findings at or above --fail-on severity
 *   1 — findings found that cross the --fail-on threshold
 *   2 — tool error (connection failure, parse failure, etc.)
 */

import { analyzeSchema } from '@plsql-analyzer/analysis';
import { consoleLogger } from '@plsql-analyzer/analysis';
import type { AnalysisResult } from '@plsql-analyzer/analysis';
import type { Finding } from '@plsql-analyzer/shared';
import { CliMcpClient } from '../lib/cli-mcp-client.js';
import { loadConfig, type PartialCliConfig } from '../lib/config.js';
import { printTextReport, printJsonReport } from '../output/text-formatter.js';
import { printSarifReport } from '../output/sarif.js';

export interface AnalyzeOptions {
  host?: string;
  port?: number;
  service?: string;
  user?: string;
  password?: string;
  schema?: string;
  format?: 'text' | 'json' | 'sarif';
  failOn?: 'error' | 'warning' | 'none';
  verbose?: boolean;
  quiet?: boolean;
}

export async function runAnalyze(opts: AnalyzeOptions): Promise<void> {
  const log = opts.quiet ? undefined : opts.verbose ? consoleLogger : {
    ...consoleLogger,
    debug: () => undefined,  // suppress debug in normal mode
  };

  let config;
  try {
    config = loadConfig({
      host:        opts.host,
      port:        opts.port,
      serviceName: opts.service,
      username:    opts.user,
      password:    opts.password,
      schema:      opts.schema,
      format:      opts.format,
      failOn:      opts.failOn,
    } satisfies PartialCliConfig);
  } catch (err) {
    console.error(`Configuration error: ${String(err)}`);
    process.exit(2);
  }

  let client: CliMcpClient | undefined;

  try {
    if (!opts.quiet) {
      process.stderr.write(`Connecting to ${config.host}:${config.port}/${config.serviceName}…\n`);
    }

    client = await CliMcpClient.create(config);

    if (!opts.quiet) {
      process.stderr.write(`Analyzing schema "${config.schema}"…\n`);
    }

    let lastPct = -1;
    const result = await analyzeSchema(
      'cli',
      config.schema,
      client,
      {
        onProgress: (done, total, name) => {
          if (opts.quiet || !process.stderr.isTTY) return;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          if (pct !== lastPct) {
            lastPct = pct;
            process.stderr.write(`\r  ${pct}%  ${name.padEnd(40)}`);
          }
        },
        config: config.rules,
        log: log ?? { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
      },
    );

    if (!opts.quiet && process.stderr.isTTY) process.stderr.write('\r' + ' '.repeat(60) + '\r');

    // Output
    switch (config.format) {
      case 'json':  printJsonReport(result);  break;
      case 'sarif': printSarifReport(result); break;
      default:      printTextReport(result);  break;
    }

    // Exit code
    process.exit(computeExitCode(result, config.failOn));

  } catch (err) {
    console.error(`Analysis failed: ${err instanceof Error ? err.message : String(err)}`);
    if (opts.verbose && err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    process.exit(2);
  } finally {
    await client?.disconnect().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeExitCode(result: AnalysisResult, failOn: 'error' | 'warning' | 'none'): number {
  if (failOn === 'none') return 0;

  const allFindings: Finding[] = [...result.findings, ...result.grantFindings];

  const hasErrors   = allFindings.some(f => f.severity === 'ERROR');
  const hasWarnings = allFindings.some(f => f.severity === 'WARNING');

  if (failOn === 'error'   && hasErrors)   return 1;
  if (failOn === 'warning' && (hasErrors || hasWarnings)) return 1;

  return 0;
}
