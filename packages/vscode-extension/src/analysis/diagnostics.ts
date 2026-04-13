/**
 * Converts Finding[] into VS Code DiagnosticCollection entries.
 * Findings appear in the Problems panel and as inline gutter decorations.
 *
 * Key design decisions:
 * - DiagnosticCollection is keyed by a virtual URI scheme `plsql-object://`
 *   since PL/SQL objects live in the database, not the local filesystem.
 * - When the user opens a PL/SQL document (fetched via the extension), the
 *   URI matches and diagnostics appear inline.
 * - Source: `"PL/SQL Analyzer"` so findings are distinguishable from other linters.
 */

import * as vscode from 'vscode';
import type { Finding } from '@plsql-analyzer/shared';

export const DIAGNOSTIC_COLLECTION_NAME = 'plsql-analyzer';
export const PLSQL_SCHEME = 'plsql-object';

export class DiagnosticsManager implements vscode.Disposable {
  private readonly collection: vscode.DiagnosticCollection;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_COLLECTION_NAME);
  }

  /**
   * Publish findings for a single object.
   * objectUri should be built via `buildObjectUri()`.
   */
  publishFindings(objectUri: vscode.Uri, findings: Finding[]): void {
    const diagnostics = findings.map(findingToDiagnostic);
    this.collection.set(objectUri, diagnostics);
  }

  /**
   * Publish findings for all objects in a schema analysis result.
   */
  publishSchemaFindings(
    schema: string,
    findingsByObject: Map<string, Finding[]>,
  ): void {
    this.collection.clear();
    for (const [objectId, findings] of findingsByObject) {
      const uri = buildObjectUri(objectId);
      const diagnostics = findings.map(findingToDiagnostic);
      this.collection.set(uri, diagnostics);
    }
  }

  /** Remove all diagnostics */
  clear(): void {
    this.collection.clear();
  }

  /** Remove diagnostics for one object */
  clearObject(objectUri: vscode.Uri): void {
    this.collection.delete(objectUri);
  }

  dispose(): void {
    this.collection.dispose();
  }
}

// ---------------------------------------------------------------------------
// URI helpers
// ---------------------------------------------------------------------------

/**
 * Build a virtual URI for a PL/SQL database object.
 * Format: plsql-object://{connectionId}/{schema}/{type}/{name}
 * Example: plsql-object://conn-1/HR/PROCEDURE/GET_EMPLOYEE
 */
export function buildObjectUri(objectId: string): vscode.Uri {
  // objectId format: connectionId:schema.name:type
  const parts = objectId.split(':');
  const connectionId = parts[0] ?? 'unknown';
  const nameSchemaRaw = parts[1] ?? '';
  const type = parts[2] ?? 'UNKNOWN';

  const dotIdx = nameSchemaRaw.indexOf('.');
  const schema = dotIdx >= 0 ? nameSchemaRaw.slice(0, dotIdx) : 'UNKNOWN';
  const name = dotIdx >= 0 ? nameSchemaRaw.slice(dotIdx + 1) : nameSchemaRaw;

  return vscode.Uri.from({
    scheme: PLSQL_SCHEME,
    authority: connectionId,
    path: `/${schema}/${type}/${name}`,
  });
}

export function parseObjectUri(uri: vscode.Uri): { connectionId: string; schema: string; type: string; name: string } | undefined {
  if (uri.scheme !== PLSQL_SCHEME) return undefined;
  const segments = uri.path.split('/').filter(Boolean);
  if (segments.length < 3) return undefined;
  return {
    connectionId: uri.authority,
    schema: segments[0] ?? '',
    type: segments[1] ?? '',
    name: segments[2] ?? '',
  };
}

// ---------------------------------------------------------------------------
// Finding → Diagnostic conversion
// ---------------------------------------------------------------------------

function findingToDiagnostic(finding: Finding): vscode.Diagnostic {
  const range = new vscode.Range(
    new vscode.Position(Math.max(0, finding.location.line - 1), Math.max(0, finding.location.column - 1)),
    new vscode.Position(
      Math.max(0, (finding.location.endLine ?? finding.location.line) - 1),
      Math.max(0, (finding.location.endColumn ?? finding.location.column + 80) - 1),
    ),
  );

  const severity = mapSeverity(finding.severity);
  const diagnostic = new vscode.Diagnostic(range, finding.message, severity);

  diagnostic.source = 'PL/SQL Analyzer';
  diagnostic.code = finding.ruleId;

  if (finding.suggestion) {
    // Append suggestion as part of the message (relatedInformation is for file references)
    diagnostic.message = `${finding.message}\n\n💡 ${finding.suggestion}`;
  }

  if (finding.cweId) {
    diagnostic.tags = []; // no built-in CWE tag in VS Code
    diagnostic.code = { value: finding.ruleId, target: vscode.Uri.parse(`https://cwe.mitre.org/data/definitions/${finding.cweId.replace('CWE-', '')}.html`) };
  }

  return diagnostic;
}

function mapSeverity(severity: Finding['severity']): vscode.DiagnosticSeverity {
  switch (severity) {
    case 'ERROR': return vscode.DiagnosticSeverity.Error;
    case 'WARNING': return vscode.DiagnosticSeverity.Warning;
    case 'INFO': return vscode.DiagnosticSeverity.Information;
    case 'HINT': return vscode.DiagnosticSeverity.Hint;
  }
}
