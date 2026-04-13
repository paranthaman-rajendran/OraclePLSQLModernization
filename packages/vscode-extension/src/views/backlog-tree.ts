/**
 * Refactoring Backlog TreeView — populates the `plsqlRefactoringBacklog`
 * sidebar panel with findings from the latest analysis, ranked by
 * remediation effort (effortMinutes × severity weight).
 *
 * Tree structure:
 *   [ERROR] CALCULATE_TAX (PROCEDURE)          [~60 min]
 *     ⚠ PLSQL-Q001: Cyclomatic complexity 24   [45 min]
 *     🔒 PLSQL-S001: SQL injection risk        [30 min]
 *   [WARN]  GET_CUSTOMER (FUNCTION)             [~30 min]
 *     ⚠ PLSQL-Q002: Nesting depth 6            [30 min]
 *
 * Clicking a finding fires plsql-analyzer.analyzeObject so the source
 * opens in the editor with diagnostics overlaid.
 */

import * as vscode from 'vscode';
import type { AnalysisResult, AnalyzedObject } from '../analysis/analysis-engine.js';
import type { Finding } from '@plsql-analyzer/shared';

// ---------------------------------------------------------------------------
// Tree item types
// ---------------------------------------------------------------------------

export class BacklogObjectItem extends vscode.TreeItem {
  constructor(
    readonly analyzed: AnalyzedObject,
    readonly totalEffort: number,
    readonly maxSeverity: Finding['severity'],
  ) {
    const label = `${analyzed.object.name} (${analyzed.object.type})`;
    super(label, vscode.TreeItemCollapsibleState.Collapsed);

    const icon = maxSeverity === 'ERROR' ? '$(error)'
               : maxSeverity === 'WARNING' ? '$(warning)'
               : '$(info)';

    this.description = `~${totalEffort} min`;
    this.tooltip = `${analyzed.object.type} ${analyzed.object.name}\nFindings: ${analyzed.findings.length}\nEstimated effort: ${totalEffort} min`;
    this.contextValue = 'backlogObject';
    this.iconPath = new vscode.ThemeIcon(
      maxSeverity === 'ERROR'   ? 'error'
      : maxSeverity === 'WARNING' ? 'warning'
      : 'info',
    );
    this.command = {
      command: 'plsql-analyzer.analyzeObject',
      title: 'Open Object',
      arguments: [
        analyzed.object.connectionId,
        analyzed.object.schema,
        analyzed.object.name,
        analyzed.object.type,
      ],
    };
  }
}

export class BacklogFindingItem extends vscode.TreeItem {
  constructor(readonly finding: Finding) {
    const ruleShort = finding.ruleId.replace('PLSQL-', '').replace('ORACLE-', '');
    super(`${finding.message}`, vscode.TreeItemCollapsibleState.None);

    this.description = finding.effortMinutes ? `${finding.effortMinutes} min` : '';
    this.tooltip = [
      `Rule: ${finding.ruleId}`,
      `Severity: ${finding.severity}`,
      `Category: ${finding.category}`,
      `Line: ${finding.location.line}`,
      finding.suggestion ? `\nSuggestion: ${finding.suggestion}` : '',
    ].filter(Boolean).join('\n');
    this.contextValue = 'backlogFinding';
    this.iconPath = new vscode.ThemeIcon(
      finding.severity === 'ERROR'   ? 'error'
      : finding.severity === 'WARNING' ? 'warning'
      : 'info',
    );
  }
}

type BacklogItem = BacklogObjectItem | BacklogFindingItem;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class BacklogTreeProvider
  implements vscode.TreeDataProvider<BacklogItem>, vscode.Disposable
{
  private _onDidChangeTreeData = new vscode.EventEmitter<BacklogItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _result: AnalysisResult | undefined;
  private _ranked: BacklogObjectItem[] = [];

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  update(result: AnalysisResult): void {
    this._result = result;
    this._ranked = this._buildRanked(result);
    this._onDidChangeTreeData.fire(null);
  }

  clear(): void {
    this._result = undefined;
    this._ranked = [];
    this._onDidChangeTreeData.fire(null);
  }

  // ---------------------------------------------------------------------------
  // TreeDataProvider
  // ---------------------------------------------------------------------------

  getTreeItem(element: BacklogItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: BacklogItem): BacklogItem[] {
    if (!element) {
      // Root: show objects ranked by effort
      if (this._ranked.length === 0) {
        if (!this._result) {
          return [this._placeholderItem('Run Analyze Schema (Ctrl+Shift+A) to populate the backlog.')];
        }
        return [this._placeholderItem('No findings — great job!')];
      }
      return this._ranked;
    }

    if (element instanceof BacklogObjectItem) {
      // Children: sorted findings for this object
      return element.analyzed.findings
        .slice()
        .sort((a, b) => (b.effortMinutes ?? 0) - (a.effortMinutes ?? 0))
        .map(f => new BacklogFindingItem(f));
    }

    return [];
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _buildRanked(result: AnalysisResult): BacklogObjectItem[] {
    const items: BacklogObjectItem[] = [];

    for (const analyzed of result.objects) {
      if (analyzed.findings.length === 0) continue;

      const totalEffort = analyzed.findings.reduce(
        (sum, f) => sum + (f.effortMinutes ?? 0),
        0,
      );
      const maxSeverity = this._maxSeverity(analyzed.findings);

      items.push(new BacklogObjectItem(analyzed, totalEffort, maxSeverity));
    }

    // Sort: ERROR objects first, then by total effort descending
    items.sort((a, b) => {
      const sevA = severityWeight(a.maxSeverity);
      const sevB = severityWeight(b.maxSeverity);
      if (sevA !== sevB) return sevB - sevA;
      return b.totalEffort - a.totalEffort;
    });

    return items;
  }

  private _maxSeverity(findings: Finding[]): Finding['severity'] {
    if (findings.some(f => f.severity === 'ERROR'))   return 'ERROR';
    if (findings.some(f => f.severity === 'WARNING')) return 'WARNING';
    return 'INFO';
  }

  private _placeholderItem(text: string): vscode.TreeItem {
    const item = new vscode.TreeItem(text, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon('info');
    return item as BacklogItem;
  }
}

function severityWeight(s: Finding['severity']): number {
  return s === 'ERROR' ? 3 : s === 'WARNING' ? 2 : 1;
}
