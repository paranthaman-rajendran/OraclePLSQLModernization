/**
 * DashboardPanel — schema health dashboard as a VS Code WebviewPanel.
 *
 * Shows:
 *   - Summary cards (objects, findings by severity, avg CC, invalid count)
 *   - Top-10 most complex objects (horizontal bar chart in pure CSS/HTML)
 *   - Finding distribution by rule (top 10 rules by hit count)
 *   - Snapshot history (if SnapshotManager is wired)
 *
 * Singleton like GraphPanel — calling open() while the panel is visible
 * just reveals it; calling update() refreshes the content in-place.
 */

import * as vscode from 'vscode';
import type { AnalysisResult, AnalyzedObject } from '../analysis/analysis-engine.js';
import type { Finding } from '@plsql-analyzer/shared';
import { logger } from '../util/logger.js';

export class DashboardPanel implements vscode.Disposable {
  private static _instance: DashboardPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor() {
    this._panel = vscode.window.createWebviewPanel(
      'plsqlDashboard',
      'PL/SQL Schema Dashboard',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );
    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  static open(): DashboardPanel {
    if (DashboardPanel._instance) {
      DashboardPanel._instance._panel.reveal(vscode.ViewColumn.One);
      return DashboardPanel._instance;
    }
    DashboardPanel._instance = new DashboardPanel();
    return DashboardPanel._instance;
  }

  /** Update the dashboard only if it is already open — does NOT reveal/create it. */
  static updateIfOpen(result: AnalysisResult): void {
    DashboardPanel._instance?.update(result);
  }

  update(result: AnalysisResult): void {
    this._panel.title = `Dashboard — ${result.schema}`;
    this._panel.webview.html = buildDashboardHtml(result);
    logger.info('Dashboard updated', result.schema);
  }

  showEmpty(message = 'Run Analyze Schema (Ctrl+Shift+A) to populate the dashboard.'): void {
    this._panel.webview.html = emptyHtml(message);
  }

  reveal(): void {
    this._panel.reveal(vscode.ViewColumn.One);
  }

  dispose(): void {
    this._dispose();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _dispose(): void {
    DashboardPanel._instance = undefined;
    this._panel.dispose();
    for (const d of this._disposables) d.dispose();
    this._disposables = [];
  }
}

// ---------------------------------------------------------------------------
// HTML builders
// ---------------------------------------------------------------------------

function buildDashboardHtml(result: AnalysisResult): string {
  const allFindings: Finding[] = [...result.findings, ...result.grantFindings];
  const errorCount   = allFindings.filter(f => f.severity === 'ERROR').length;
  const warnCount    = allFindings.filter(f => f.severity === 'WARNING').length;
  const infoCount    = allFindings.filter(f => f.severity === 'INFO').length;
  const secCount     = allFindings.filter(f => f.category === 'SECURITY').length;
  const invalidCount = result.objects.filter(o => o.object.status !== 'VALID').length;
  const avgCC = result.metrics.length > 0
    ? (result.metrics.reduce((s, m) => s + m.cyclomaticComplexity, 0) / result.metrics.length).toFixed(1)
    : '—';

  const top10 = result.objects
    .slice()
    .sort((a, b) => b.metric.cyclomaticComplexity - a.metric.cyclomaticComplexity)
    .slice(0, 10);

  const maxCC = top10.length > 0 ? top10[0]!.metric.cyclomaticComplexity : 1;

  // Rule histogram
  const ruleCounts = new Map<string, number>();
  for (const f of allFindings) {
    ruleCounts.set(f.ruleId, (ruleCounts.get(f.ruleId) ?? 0) + 1);
  }
  const topRules = [...ruleCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const maxRule = topRules.length > 0 ? topRules[0]![1] : 1;

  // Type distribution
  const typeCounts = new Map<string, number>();
  for (const o of result.objects) {
    typeCounts.set(o.object.type, (typeCounts.get(o.object.type) ?? 0) + 1);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
  :root {
    --bg:      var(--vscode-editor-background, #1e1e1e);
    --surface: var(--vscode-sideBar-background, #252526);
    --border:  var(--vscode-panel-border, #3c3c3c);
    --fg:      var(--vscode-editor-foreground, #d4d4d4);
    --muted:   var(--vscode-descriptionForeground, #888);
    --error:   #f48771;
    --warn:    #dcdcaa;
    --info:    #9cdcfe;
    --ok:      #4ec9b0;
    --accent:  var(--vscode-button-background, #0e639c);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg); color: var(--fg);
    font: 13px/1.5 var(--vscode-font-family, 'Segoe UI', sans-serif);
    padding: 20px;
  }
  h1 { font-size: 18px; margin-bottom: 4px; }
  .meta { color: var(--muted); font-size: 11px; margin-bottom: 20px; }
  h2 { font-size: 13px; font-weight: 600; margin: 24px 0 10px;
       border-bottom: 1px solid var(--border); padding-bottom: 4px; }

  /* Cards */
  .cards { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 24px; }
  .card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 4px; padding: 12px 16px; min-width: 100px; text-align: center;
  }
  .card .num { font-size: 26px; font-weight: bold; }
  .card .lbl { font-size: 10px; color: var(--muted); margin-top: 2px; }
  .card.error .num { color: var(--error); }
  .card.warn  .num { color: var(--warn); }
  .card.info  .num { color: var(--info); }
  .card.ok    .num { color: var(--ok); }
  .card.sec   .num { color: #c586c0; }

  /* Bar charts */
  .chart { display: flex; flex-direction: column; gap: 6px; }
  .chart-row { display: flex; align-items: center; gap: 8px; font-size: 11px; }
  .chart-label { width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                 color: var(--fg); flex-shrink: 0; }
  .chart-bar-bg { flex: 1; height: 14px; background: var(--border); border-radius: 2px; }
  .chart-bar    { height: 100%; border-radius: 2px; }
  .chart-val    { width: 40px; text-align: right; color: var(--muted); flex-shrink: 0; }

  /* Type pills */
  .pills { display: flex; flex-wrap: wrap; gap: 8px; }
  .pill {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 12px; padding: 2px 12px; font-size: 11px;
    display: flex; align-items: center; gap: 6px;
  }
  .pill .count { color: var(--ok); font-weight: bold; }
</style>
</head>
<body>

<h1>Schema Dashboard</h1>
<p class="meta">
  Schema: <strong>${esc(result.schema)}</strong>
  &nbsp;|&nbsp; ${result.objects.length} objects
  &nbsp;|&nbsp; Analysed: ${new Date().toLocaleTimeString()}
  &nbsp;|&nbsp; ${(result.durationMs / 1000).toFixed(1)}s
</p>

<h2>Health Summary</h2>
<div class="cards">
  <div class="card"><div class="num">${result.objects.length}</div><div class="lbl">Objects</div></div>
  <div class="card error"><div class="num">${errorCount}</div><div class="lbl">Errors</div></div>
  <div class="card warn"><div class="num">${warnCount}</div><div class="lbl">Warnings</div></div>
  <div class="card info"><div class="num">${infoCount}</div><div class="lbl">Info</div></div>
  <div class="card sec"><div class="num">${secCount}</div><div class="lbl">Security</div></div>
  <div class="card ok"><div class="num">${avgCC}</div><div class="lbl">Avg CC</div></div>
  <div class="card error"><div class="num">${invalidCount}</div><div class="lbl">Invalid</div></div>
</div>

<h2>Object Types</h2>
<div class="pills">
  ${[...typeCounts.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) =>
    `<div class="pill"><span class="count">${n}</span> ${esc(t)}</div>`
  ).join('\n  ')}
</div>

<h2>Top ${top10.length} Most Complex Objects</h2>
<div class="chart">
  ${top10.map(o => {
    const cc = o.metric.cyclomaticComplexity;
    const w  = Math.round((cc / maxCC) * 100);
    const color = cc >= 20 ? 'var(--error)' : cc >= 10 ? 'var(--warn)' : 'var(--ok)';
    return `<div class="chart-row">
    <span class="chart-label" title="${esc(o.object.name)}">${esc(o.object.name)}</span>
    <div class="chart-bar-bg"><div class="chart-bar" style="width:${w}%;background:${color}"></div></div>
    <span class="chart-val" style="color:${color}">${cc}</span>
  </div>`;
  }).join('\n  ')}
</div>

${topRules.length > 0 ? `
<h2>Top Rules by Hit Count</h2>
<div class="chart">
  ${topRules.map(([ruleId, count]) => {
    const w = Math.round((count / maxRule) * 100);
    return `<div class="chart-row">
    <span class="chart-label" title="${esc(ruleId)}">${esc(ruleId)}</span>
    <div class="chart-bar-bg"><div class="chart-bar" style="width:${w}%;background:var(--accent)"></div></div>
    <span class="chart-val">${count}</span>
  </div>`;
  }).join('\n  ')}
</div>` : '<p style="color:var(--ok);margin-top:12px">No findings — clean schema!</p>'}

</body>
</html>`;
}

function emptyHtml(message: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
  body { background: var(--vscode-editor-background, #1e1e1e);
         color: var(--vscode-descriptionForeground, #888);
         font-family: var(--vscode-font-family, sans-serif);
         display: flex; align-items: center; justify-content: center;
         height: 100vh; margin: 0; font-size: 14px; text-align: center; }
</style>
</head><body><p>${esc(message)}</p></body></html>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
