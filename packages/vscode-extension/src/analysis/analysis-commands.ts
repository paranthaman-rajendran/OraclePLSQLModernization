/**
 * Analysis command handlers.
 * Registers analyzeSchema and analyzeObject with progress notifications.
 * Updates DiagnosticsManager, CodeLensProvider, and HoverProvider after each run.
 */

import * as vscode from 'vscode';
import type { McpClient } from '../mcp/client.js';
import type { DiagnosticsManager } from './diagnostics.js';
import type { PlsqlCodeLensProvider } from './code-lens.js';
import type { PlsqlHoverProvider } from './hover.js';
import { analyzeSchema, analyzeObject } from './analysis-engine.js';
import { buildObjectUri } from './diagnostics.js';
import { logger } from '../util/logger.js';
import type { AnalyzedObject, AnalysisResult } from './analysis-engine.js';
import type { Finding } from '@plsql-analyzer/shared';

/** State that persists across analysis runs */
export interface AnalysisState {
  lastResult: Map<string, AnalyzedObject>;  // objectId → analyzed
  activeConnectionId: string | undefined;
  activeSchema: string | undefined;
}

export function createAnalysisState(): AnalysisState {
  return {
    lastResult: new Map(),
    activeConnectionId: undefined,
    activeSchema: undefined,
  };
}

export function registerAnalysisCommands(
  ctx: vscode.ExtensionContext,
  getMcpClient: () => McpClient,
  getActiveConnection: () => { connectionId: string; schema: string } | undefined,
  diagnostics: DiagnosticsManager,
  codeLens: PlsqlCodeLensProvider,
  hover: PlsqlHoverProvider,
  state: AnalysisState,
  onSchemaAnalysisComplete?: (result: AnalysisResult) => void,
): void {

  // ── analyzeSchema ─────────────────────────────────────────────────────────
  ctx.subscriptions.push(
    vscode.commands.registerCommand('plsql-analyzer.analyzeSchema', async () => {
      const conn = getActiveConnection();
      if (!conn) {
        const connect = await vscode.window.showWarningMessage(
          'No active Oracle connection. Connect first.',
          'Connect',
        );
        if (connect) await vscode.commands.executeCommand('plsql-analyzer.connect');
        return;
      }

      const { connectionId, schema } = conn;

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Analyzing schema "${schema}"`,
          cancellable: false,
        },
        async (progress) => {
          progress.report({ message: 'Fetching object list...' });

          try {
            const result = await analyzeSchema(
              connectionId,
              schema,
              getMcpClient(),
              (done, total, currentObject) => {
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                progress.report({
                  increment: total > 0 ? 100 / total : 0,
                  message: `(${done}/${total}) ${currentObject}`,
                });
              },
            );

            // Update caches
            state.lastResult.clear();
            for (const a of result.objects) {
              state.lastResult.set(a.object.id, a);
            }
            state.activeConnectionId = connectionId;
            state.activeSchema = schema;

            // Publish diagnostics
            const findingsByObject = new Map<string, Finding[]>();
            for (const a of result.objects) {
              findingsByObject.set(a.object.id, a.findings);
            }
            diagnostics.publishSchemaFindings(schema, findingsByObject);

            // Publish grant findings under schema-level URI
            if (result.grantFindings.length > 0) {
              const schemaUri = buildObjectUri(`${connectionId}:${schema}.:SCHEMA`);
              diagnostics.publishFindings(schemaUri, result.grantFindings);
            }

            // Update Code Lens and Hover
            codeLens.updateCache(result.objects);
            hover.updateCache(result.objects);
            hover.setContext(connectionId, schema);

            // Notify Phase 2 consumers (snapshot, dashboard, graph)
            onSchemaAnalysisComplete?.(result);

            // Summary notification
            const totalFindings = result.findings.length + result.grantFindings.length;
            const errorCount = result.findings.filter(f => f.severity === 'ERROR').length;
            const warnCount = result.findings.filter(f => f.severity === 'WARNING').length;
            const errMsg = result.errors.length > 0 ? ` (${result.errors.length} objects failed to parse)` : '';

            const summary = `Schema analysis complete: ${result.objects.length} objects, ${totalFindings} findings (${errorCount} errors, ${warnCount} warnings)${errMsg}. ${Math.round(result.durationMs / 1000)}s`;
            logger.info(summary);

            if (errorCount > 0) {
              void vscode.window.showWarningMessage(summary, 'Open Problems').then(action => {
                if (action) void vscode.commands.executeCommand('workbench.action.problems.focus');
              });
            } else {
              void vscode.window.showInformationMessage(summary);
            }

          } catch (error) {
            logger.error('Schema analysis failed', error);
            void vscode.window.showErrorMessage(`Analysis failed: ${String(error)}`);
          }
        },
      );
    }),
  );

  // ── analyzeObject ─────────────────────────────────────────────────────────
  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      'plsql-analyzer.analyzeObject',
      async (
        connectionIdArg?: string,
        schemaArg?: string,
        nameArg?: string,
        typeArg?: string,
      ) => {
        const conn = getActiveConnection();
        const connectionId = connectionIdArg ?? conn?.connectionId;
        const schema = schemaArg ?? conn?.schema;

        if (!connectionId || !schema) {
          void vscode.window.showWarningMessage('No active Oracle connection.');
          return;
        }

        // If no explicit object, try to determine from active editor
        let name = nameArg;
        let type = typeArg;

        if (!name) {
          const editor = vscode.window.activeTextEditor;
          if (!editor) {
            void vscode.window.showWarningMessage('No object selected and no active editor.');
            return;
          }
          // Try to detect object name from document URI or title
          const uriParts = editor.document.uri.path.split('/');
          name = uriParts[uriParts.length - 1] ?? '';
          type = uriParts[uriParts.length - 2] ?? 'PROCEDURE';
        }

        if (!name) return;

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Analyzing ${type ?? ''} "${name}"`,
            cancellable: false,
          },
          async () => {
            try {
              const analyzed = await analyzeObject(
                connectionId,
                schema,
                name!,
                type ?? 'PROCEDURE',
                getMcpClient(),
                'adhoc',
                `${connectionId}:${schema}.${name}:${type}`,
              );

              // Update state
              state.lastResult.set(analyzed.object.id, analyzed);

              // Publish diagnostics
              const uri = buildObjectUri(analyzed.object.id);
              diagnostics.publishFindings(uri, analyzed.findings);

              // Update Code Lens and Hover for this object only
              const allAnalyzed = [...state.lastResult.values()];
              codeLens.updateCache(allAnalyzed);
              hover.updateCache(allAnalyzed);

              const errorCount = analyzed.findings.filter(f => f.severity === 'ERROR').length;
              const warnCount = analyzed.findings.filter(f => f.severity === 'WARNING').length;
              void vscode.window.showInformationMessage(
                `"${name}": Complexity ${analyzed.metric.cyclomaticComplexity} · ${analyzed.findings.length} finding${analyzed.findings.length !== 1 ? 's' : ''} (${errorCount} errors, ${warnCount} warnings)`,
              );

            } catch (error) {
              logger.error(`Object analysis failed for ${name}`, error);
              void vscode.window.showErrorMessage(`Analysis failed: ${String(error)}`);
            }
          },
        );
      },
    ),
  );

  // ── refreshSchema ─────────────────────────────────────────────────────────
  ctx.subscriptions.push(
    vscode.commands.registerCommand('plsql-analyzer.refreshSchema', async () => {
      diagnostics.clear();
      codeLens.clearCache();
      hover.clearCache();
      state.lastResult.clear();
      void vscode.window.showInformationMessage('Analysis cache cleared. Run Analyze Schema to refresh.');
    }),
  );
}
