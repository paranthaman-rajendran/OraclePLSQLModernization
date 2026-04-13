/**
 * Human-readable text output for the CLI.
 * Writes to stdout; errors/warnings go to stderr.
 */

import type { AnalysisResult } from '@plsql-analyzer/analysis';
import type { Finding } from '@plsql-analyzer/shared';

// chalk is ESM-only, import dynamically to keep this file synchronous
// when chalk isn't available (e.g. no TTY) we fall back to plain text.
let chalk: typeof import('chalk').default | undefined;
try {
  const mod = await import('chalk');
  chalk = mod.default;
} catch { /* optional */ }

function c(color: 'red' | 'yellow' | 'cyan' | 'green' | 'gray' | 'bold', text: string): string {
  if (!chalk) return text;
  return chalk[color](text);
}

export function printTextReport(result: AnalysisResult): void {
  const allFindings: Finding[] = [...result.findings, ...result.grantFindings];
  const errors   = allFindings.filter(f => f.severity === 'ERROR');
  const warnings = allFindings.filter(f => f.severity === 'WARNING');
  const infos    = allFindings.filter(f => f.severity === 'INFO');

  // Header
  console.log('');
  console.log(c('bold', `PL/SQL Analysis — ${result.schema}`));
  console.log(c('gray', `Objects: ${result.objects.length}  |  Duration: ${(result.durationMs / 1000).toFixed(1)}s`));
  console.log('');

  // Findings grouped by object
  if (allFindings.length === 0) {
    console.log(c('green', '✓ No findings — schema is clean'));
  } else {
    const byObject = new Map<string, Finding[]>();
    for (const f of allFindings) {
      const existing = byObject.get(f.objectId) ?? [];
      existing.push(f);
      byObject.set(f.objectId, existing);
    }

    for (const [objectId, findings] of byObject) {
      const shortName = objectId.split('.')[1]?.split(':')[0] ?? objectId;
      console.log(c('bold', shortName));
      for (const f of findings.sort((a, b) => a.location.line - b.location.line)) {
        const sev = f.severity === 'ERROR'   ? c('red',    'ERROR')
                  : f.severity === 'WARNING' ? c('yellow', 'WARN ')
                  : c('cyan', 'INFO ');
        console.log(`  ${sev}  ${c('gray', `line ${String(f.location.line).padStart(5)}`)}  [${f.ruleId}] ${f.message}`);
        if (f.suggestion) {
          console.log(`         ${c('gray', '→')} ${f.suggestion}`);
        }
      }
      console.log('');
    }
  }

  // Summary
  console.log(c('gray', '─'.repeat(60)));
  const errPart  = errors.length   > 0 ? c('red',    `${errors.length} error${errors.length !== 1 ? 's' : ''}`)   : '';
  const warnPart = warnings.length > 0 ? c('yellow', `${warnings.length} warning${warnings.length !== 1 ? 's' : ''}`) : '';
  const infoPart = infos.length    > 0 ? c('cyan',   `${infos.length} info`)  : '';
  const parts = [errPart, warnPart, infoPart].filter(Boolean);

  if (parts.length === 0) {
    console.log(c('green', '✓ Clean'));
  } else {
    console.log(parts.join('  '));
  }

  if (result.errors.length > 0) {
    console.log(c('gray', `\n${result.errors.length} object(s) could not be parsed:`));
    for (const e of result.errors) {
      console.log(c('gray', `  • ${e.objectName}: ${e.error}`));
    }
  }
  console.log('');
}

export function printJsonReport(result: AnalysisResult): void {
  process.stdout.write(JSON.stringify(result, jsonReplacer, 2) + '\n');
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Set)  return [...value];
  return value;
}
