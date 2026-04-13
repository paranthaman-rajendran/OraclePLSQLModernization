/**
 * Hover provider — shows signature, complexity, and summary documentation
 * when the user hovers over a procedure/function call in PL/SQL source.
 *
 * Displayed hover card example:
 * ─────────────────────────────────────────────
 * **HR.CALCULATE_BONUS** (FUNCTION)
 * Returns: NUMBER
 *
 * Parameters:
 * • p_employee_id IN NUMBER
 * • p_period_start IN DATE
 *
 * Metrics: Complexity 8 · 45 lines · 2 callers
 * Findings: 1 warning
 * ─────────────────────────────────────────────
 */

import * as vscode from 'vscode';
import type { AnalyzedObject } from './analysis-engine.js';
import { PLSQL_SCHEME } from './diagnostics.js';
import type { McpClient } from '../mcp/client.js';
import { logger } from '../util/logger.js';

export class PlsqlHoverProvider implements vscode.HoverProvider, vscode.Disposable {
  /** Cache updated after each analysis run */
  private readonly cache = new Map<string, AnalyzedObject>();
  private connectionId: string | undefined;
  private schema: string | undefined;

  setContext(connectionId: string, schema: string): void {
    this.connectionId = connectionId;
    this.schema = schema;
  }

  updateCache(analyzed: AnalyzedObject[]): void {
    this.cache.clear();
    for (const a of analyzed) {
      // Key by name (upper) for quick lookup when hovering over call sites
      this.cache.set(a.object.name.toUpperCase(), a);
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Hover | undefined> {
    const wordRange = document.getWordRangeAtPosition(position, /\b[\w.]+\b/);
    if (!wordRange) return undefined;

    const word = document.getText(wordRange).toUpperCase();
    const analyzed = this.cache.get(word);
    if (!analyzed) return undefined;

    return buildHover(analyzed, wordRange);
  }

  dispose(): void {}
}

function buildHover(analyzed: AnalyzedObject, range: vscode.Range): vscode.Hover {
  const { object, parsed, metric, callerCount, findings } = analyzed;
  const md = new vscode.MarkdownString('', true);
  md.isTrusted = true;

  // Header
  md.appendMarkdown(`**${object.schema}.${object.name}** *(${object.type})*\n\n`);

  // Return type (functions only)
  if (parsed.returnType) {
    md.appendMarkdown(`Returns: \`${parsed.returnType}\`\n\n`);
  }

  // Parameters
  if (parsed.parameters.length > 0) {
    md.appendMarkdown('**Parameters:**\n');
    for (const p of parsed.parameters) {
      const dir = p.direction !== 'IN' ? ` ${p.direction}` : '';
      const def = p.hasDefault ? ' *(optional)*' : '';
      md.appendMarkdown(`- \`${p.name}\`${dir} \`${p.dataType}\`${def}\n`);
    }
    md.appendMarkdown('\n');
  }

  // Metrics
  const ccLabel = metric.cyclomaticComplexity > 20 ? '🔴' : metric.cyclomaticComplexity > 10 ? '🟡' : '🟢';
  md.appendMarkdown(`**Metrics:** ${ccLabel} Complexity ${metric.cyclomaticComplexity} · ${metric.linesOfCode} lines · ${callerCount} caller${callerCount !== 1 ? 's' : ''}\n\n`);

  // Findings summary
  const errorCount = findings.filter(f => f.severity === 'ERROR').length;
  const warnCount = findings.filter(f => f.severity === 'WARNING').length;

  if (errorCount > 0 || warnCount > 0) {
    md.appendMarkdown(`**Findings:** ${errorCount > 0 ? `⛔ ${errorCount} error${errorCount > 1 ? 's' : ''}` : ''} ${warnCount > 0 ? `⚠️ ${warnCount} warning${warnCount > 1 ? 's' : ''}` : ''}\n\n`);
  } else {
    md.appendMarkdown('**Findings:** ✅ No issues\n\n');
  }

  // Object status
  if (object.status !== 'VALID') {
    md.appendMarkdown(`⚠️ **Status:** ${object.status}\n`);
  }

  return new vscode.Hover(md, range);
}
