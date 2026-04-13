/**
 * Code Lens provider — shows complexity, caller count, and risk level
 * above each procedure/function/package header in PL/SQL documents.
 *
 * Displayed above object headers like:
 *   ⚡ Complexity: 12 | 👥 Callers: 4 | 🔴 Risk: HIGH
 */

import * as vscode from 'vscode';
import type { AnalyzedObject } from './analysis-engine.js';
import { PLSQL_SCHEME, buildObjectUri } from './diagnostics.js';

export class PlsqlCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  /** Map from objectId → analyzed data; updated after each analysis run */
  private readonly cache = new Map<string, AnalyzedObject>();

  updateCache(analyzed: AnalyzedObject[]): void {
    this.cache.clear();
    for (const a of analyzed) {
      this.cache.set(a.object.id, a);
    }
    this._onDidChangeCodeLenses.fire();
  }

  clearCache(): void {
    this.cache.clear();
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (document.uri.scheme !== PLSQL_SCHEME) return [];

    const parsed = parseUriToObjectId(document.uri);
    if (!parsed) return [];

    const analyzed = this.cache.get(parsed);
    if (!analyzed) return [];

    return buildCodeLenses(analyzed, document);
  }

  dispose(): void {
    this._onDidChangeCodeLenses.dispose();
  }
}

function buildCodeLenses(analyzed: AnalyzedObject, document: vscode.TextDocument): vscode.CodeLens[] {
  const lenses: vscode.CodeLens[] = [];
  const { metric, callerCount, calleeCount, findings, object } = analyzed;

  // Place lens at line 0 (top of document)
  const range = new vscode.Range(0, 0, 0, 0);

  // Complexity lens
  const cc = metric.cyclomaticComplexity;
  const ccEmoji = cc > 20 ? '🔴' : cc > 10 ? '🟡' : '🟢';
  lenses.push(new vscode.CodeLens(range, {
    title: `${ccEmoji} Complexity: ${cc}`,
    command: 'plsql-analyzer.analyzeObject',
    arguments: [object.connectionId, object.schema, object.name, object.type],
    tooltip: `Cyclomatic complexity: ${cc}. Click to re-analyze.`,
  }));

  // Callers lens
  lenses.push(new vscode.CodeLens(range, {
    title: `👥 Callers: ${callerCount}`,
    command: 'plsql-analyzer.showDependencies',
    arguments: [object.id],
    tooltip: `${callerCount} objects reference this ${object.type.toLowerCase()}. Click to see dependency graph.`,
  }));

  // Risk level lens
  const riskLevel = computeRiskLevel(cc, findings.filter(f => f.severity === 'ERROR' || f.severity === 'WARNING').length);
  const riskEmoji = riskLevel === 'HIGH' ? '🔴' : riskLevel === 'MEDIUM' ? '🟡' : '🟢';
  lenses.push(new vscode.CodeLens(range, {
    title: `${riskEmoji} Risk: ${riskLevel}`,
    command: 'plsql-analyzer.showDependencies',
    arguments: [object.id],
    tooltip: `Risk assessment based on complexity (${cc}), findings (${findings.length}), and coupling.`,
  }));

  // Findings summary lens
  const errorCount = findings.filter(f => f.severity === 'ERROR').length;
  const warnCount = findings.filter(f => f.severity === 'WARNING').length;
  if (errorCount + warnCount > 0) {
    lenses.push(new vscode.CodeLens(range, {
      title: `⚠ ${errorCount > 0 ? `${errorCount} error${errorCount > 1 ? 's' : ''}, ` : ''}${warnCount} warning${warnCount !== 1 ? 's' : ''}`,
      command: 'workbench.action.problems.focus',
      tooltip: 'Click to open Problems panel',
    }));
  }

  return lenses;
}

function computeRiskLevel(complexity: number, findingCount: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  const score = complexity + findingCount * 2;
  if (score >= 25) return 'HIGH';
  if (score >= 12) return 'MEDIUM';
  return 'LOW';
}

function parseUriToObjectId(uri: vscode.Uri): string | undefined {
  if (uri.scheme !== PLSQL_SCHEME) return undefined;
  const segments = uri.path.split('/').filter(Boolean);
  if (segments.length < 3) return undefined;
  const [schema, type, name] = segments;
  return `${uri.authority}:${schema}.${name}:${type}`;
}
