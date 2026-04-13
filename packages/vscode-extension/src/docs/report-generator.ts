/**
 * Report generator — produces a self-contained HTML analysis report
 * from an AnalysisResult.
 *
 * The generated file has no external dependencies (CSS and JS are inlined).
 * Tables are sortable client-side via a tiny inline script.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { AnalysisResult, AnalyzedObject } from '../analysis/analysis-engine.js';
import type { Finding } from '@plsql-analyzer/shared';

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Prompt the user for a save location and write the HTML report.
 * Returns the URI on success, undefined if the user cancelled.
 */
export async function exportHtmlReport(result: AnalysisResult): Promise<vscode.Uri | undefined> {
  const defaultName = `plsql-report-${result.schema}-${yyyymmdd()}.html`;
  const uri = await vscode.window.showSaveDialog({
    filters: { 'HTML Report': ['html'] },
    defaultUri: vscode.Uri.file(defaultName),
  });
  if (!uri) return undefined;

  const html = buildReport(result);
  fs.writeFileSync(uri.fsPath, html, 'utf-8');

  const action = await vscode.window.showInformationMessage(
    `Report saved: ${path.basename(uri.fsPath)}`,
    'Open in Browser',
  );
  if (action === 'Open in Browser') {
    await vscode.env.openExternal(uri);
  }
  return uri;
}

// ---------------------------------------------------------------------------
// Report builder
// ---------------------------------------------------------------------------

function buildReport(result: AnalysisResult): string {
  const allFindings: Finding[] = [...result.findings, ...result.grantFindings];
  const errorCount   = allFindings.filter(f => f.severity === 'ERROR').length;
  const warnCount    = allFindings.filter(f => f.severity === 'WARNING').length;
  const infoCount    = allFindings.filter(f => f.severity === 'INFO').length;
  const secCount     = allFindings.filter(f => f.category === 'SECURITY').length;
  const invalidCount = result.objects.filter(o => o.object.status !== 'VALID').length;
  const avgCC = result.metrics.length > 0
    ? (result.metrics.reduce((s, m) => s + m.cyclomaticComplexity, 0) / result.metrics.length).toFixed(1)
    : '—';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PL/SQL Analysis Report — ${esc(result.schema)}</title>
<style>
  :root {
    --bg: #1e1e1e; --surface: #252526; --border: #3c3c3c;
    --fg: #d4d4d4; --muted: #888; --accent: #0e639c;
    --error: #f48771; --warn: #dcdcaa; --info: #9cdcfe; --ok: #4ec9b0;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--fg); font: 13px/1.5 'Segoe UI', sans-serif; padding: 24px; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .meta { color: var(--muted); font-size: 12px; margin-bottom: 24px; }
  h2 { font-size: 15px; margin: 28px 0 12px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }

  /* Summary cards */
  .cards { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px; }
  .card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
    padding: 12px 18px; min-width: 120px; text-align: center;
  }
  .card .num { font-size: 28px; font-weight: bold; }
  .card .lbl { font-size: 11px; color: var(--muted); margin-top: 2px; }
  .card.error .num { color: var(--error); }
  .card.warn  .num { color: var(--warn); }
  .card.info  .num { color: var(--info); }
  .card.sec   .num { color: #c586c0; }
  .card.ok    .num { color: var(--ok); }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--border); }
  th { background: var(--surface); cursor: pointer; user-select: none; white-space: nowrap; }
  th:hover { color: var(--ok); }
  tr:hover td { background: rgba(255,255,255,0.04); }
  .badge {
    display: inline-block; padding: 1px 7px; border-radius: 3px; font-size: 10px;
    font-weight: bold; text-transform: uppercase;
  }
  .badge-ERROR   { background: #5a1d1d; color: var(--error); }
  .badge-WARNING { background: #4a3900; color: var(--warn); }
  .badge-INFO    { background: #1b3a54; color: var(--info); }
  .badge-SECURITY { background: #3d1f56; color: #c586c0; }
  .badge-QUALITY  { background: #1d3a2f; color: var(--ok); }
  .num-right { text-align: right; }
  .bar-cell { width: 120px; }
  .bar { height: 8px; background: var(--accent); border-radius: 2px; }

  /* Section toggle */
  details summary { cursor: pointer; padding: 4px 0; }
  details summary::-webkit-details-marker { color: var(--ok); }
</style>
</head>
<body>

<h1>PL/SQL Analysis Report</h1>
<p class="meta">Schema: <strong>${esc(result.schema)}</strong> &nbsp;|&nbsp; Generated: ${new Date().toLocaleString()} &nbsp;|&nbsp; Duration: ${(result.durationMs / 1000).toFixed(1)}s</p>

<h2>Summary</h2>
<div class="cards">
  <div class="card"><div class="num">${result.objects.length}</div><div class="lbl">Objects analysed</div></div>
  <div class="card error"><div class="num">${errorCount}</div><div class="lbl">Errors</div></div>
  <div class="card warn"><div class="num">${warnCount}</div><div class="lbl">Warnings</div></div>
  <div class="card info"><div class="num">${infoCount}</div><div class="lbl">Info</div></div>
  <div class="card sec"><div class="num">${secCount}</div><div class="lbl">Security</div></div>
  <div class="card ok"><div class="num">${avgCC}</div><div class="lbl">Avg Complexity</div></div>
  <div class="card error"><div class="num">${invalidCount}</div><div class="lbl">Invalid Objects</div></div>
</div>

<h2>Findings (${allFindings.length})</h2>
${buildFindingsTable(allFindings)}

<h2>Object Metrics (${result.objects.length})</h2>
${buildMetricsTable(result.objects)}

${result.errors.length > 0 ? `
<h2>Parse Errors (${result.errors.length})</h2>
<table id="tbl-errors">
  <thead><tr><th>Object</th><th>Error</th></tr></thead>
  <tbody>
  ${result.errors.map(e => `<tr><td>${esc(e.objectId)}</td><td>${esc(e.error)}</td></tr>`).join('\n  ')}
  </tbody>
</table>` : ''}

<script>
// Minimal sortable tables
document.querySelectorAll('table').forEach(tbl => {
  const tbody = tbl.querySelector('tbody');
  if (!tbody) return;
  tbl.querySelectorAll('th').forEach((th, colIdx) => {
    let asc = true;
    th.addEventListener('click', () => {
      const rows = [...tbody.querySelectorAll('tr')];
      rows.sort((a, b) => {
        const av = a.cells[colIdx]?.textContent?.trim() ?? '';
        const bv = b.cells[colIdx]?.textContent?.trim() ?? '';
        const an = parseFloat(av), bn = parseFloat(bv);
        const cmp = isNaN(an) || isNaN(bn) ? av.localeCompare(bv) : an - bn;
        return asc ? cmp : -cmp;
      });
      asc = !asc;
      rows.forEach(r => tbody.appendChild(r));
    });
  });
});
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Table builders
// ---------------------------------------------------------------------------

function buildFindingsTable(findings: Finding[]): string {
  if (findings.length === 0) {
    return '<p style="color:var(--ok)">No findings — schema looks clean!</p>';
  }

  const rows = findings
    .slice()
    .sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity))
    .map(f => `<tr>
      <td><span class="badge badge-${esc(f.severity)}">${esc(f.severity)}</span></td>
      <td><span class="badge badge-${esc(f.category)}">${esc(f.category)}</span></td>
      <td>${esc(f.ruleId)}</td>
      <td>${esc(f.objectId.split('.')[1]?.split(':')[0] ?? f.objectId)}</td>
      <td class="num-right">${f.location.line}</td>
      <td>${esc(f.message)}</td>
      <td>${f.suggestion ? esc(f.suggestion) : ''}</td>
    </tr>`)
    .join('\n');

  return `<table id="tbl-findings">
  <thead><tr>
    <th>Severity</th><th>Category</th><th>Rule</th>
    <th>Object</th><th>Line</th><th>Message</th><th>Suggestion</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>`;
}

function buildMetricsTable(objects: AnalyzedObject[]): string {
  if (objects.length === 0) return '<p style="color:var(--muted)">No objects.</p>';

  const maxCC = Math.max(...objects.map(o => o.metric.cyclomaticComplexity), 1);
  const rows = objects
    .slice()
    .sort((a, b) => b.metric.cyclomaticComplexity - a.metric.cyclomaticComplexity)
    .map(o => {
      const cc = o.metric.cyclomaticComplexity;
      const barW = Math.round((cc / maxCC) * 100);
      const ccColor = cc >= 20 ? 'var(--error)' : cc >= 10 ? 'var(--warn)' : 'var(--ok)';
      return `<tr>
        <td>${esc(o.object.name)}</td>
        <td>${esc(o.object.type)}</td>
        <td class="num-right" style="color:${ccColor}">${cc}</td>
        <td class="bar-cell"><div class="bar" style="width:${barW}%;background:${ccColor}"></div></td>
        <td class="num-right">${o.metric.linesOfCode}</td>
        <td class="num-right">${o.metric.nestingDepth}</td>
        <td class="num-right">${o.metric.parameterCount}</td>
        <td class="num-right">${o.metric.coupling.fanIn}</td>
        <td class="num-right">${o.metric.coupling.fanOut}</td>
        <td class="num-right">${o.findings.length}</td>
        <td>${o.object.status !== 'VALID' ? `<span class="badge badge-ERROR">${esc(o.object.status)}</span>` : ''}</td>
      </tr>`;
    })
    .join('\n');

  return `<table id="tbl-metrics">
  <thead><tr>
    <th>Object</th><th>Type</th><th>CC</th><th style="min-width:120px"></th>
    <th>LOC</th><th>Nesting</th><th>Params</th><th>Fan-in</th><th>Fan-out</th>
    <th>Findings</th><th>Status</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function severityOrder(s: string): number {
  return s === 'ERROR' ? 0 : s === 'WARNING' ? 1 : 2;
}

function yyyymmdd(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}
