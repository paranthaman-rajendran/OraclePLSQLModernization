/**
 * VS Code Extension entry point — Phase 3.
 *
 * activate() startup order:
 *   1. Initialize logger (Output Channel)
 *   2. Build service graph (MCP manager, SecretStorage, ConnectionManager, McpClient)
 *   3. Load saved connections from SecretStorage
 *   4. Open SQLite store + SnapshotManager
 *   5. Register TreeViews (Connections, Schema Explorer, Refactoring Backlog)
 *   6. Register Phase 1 analysis providers (Diagnostics, Code Lens, Hover)
 *   7. Register all commands (connection + analysis + Phase 2 + Phase 3)
 *   8. Status bar item
 */

import * as vscode from 'vscode';
import { McpServerManager } from './mcp/server-manager.js';
import { McpClient } from './mcp/client.js';
import { SecretStorageAdapter } from './credentials/secret-storage.js';
import { ConnectionManager } from './connections/connection-manager.js';
import { ConnectionTreeProvider } from './connections/connection-tree.js';
import { registerConnectionCommands } from './connections/connection-commands.js';
import { DiagnosticsManager, PLSQL_SCHEME } from './analysis/diagnostics.js';
import { PlsqlCodeLensProvider } from './analysis/code-lens.js';
import { PlsqlHoverProvider } from './analysis/hover.js';
import { registerAnalysisCommands, createAnalysisState } from './analysis/analysis-commands.js';
import { SqliteStore } from './storage/sqlite-store.js';
import { SnapshotManager } from './storage/snapshot.js';
import { GraphPanel } from './graph/graph-panel.js';
import { buildSchemaGraph, buildObjectGraph } from './graph/dependency-graph.js';
import { DashboardPanel } from './views/dashboard-panel.js';
import { BacklogTreeProvider } from './views/backlog-tree.js';
import { exportHtmlReport } from './docs/report-generator.js';
import { createTicketFromFinding } from './integrations/issue-tracker.js';
import { initLogger, logger } from './util/logger.js';
import type { AnalysisResult } from './analysis/analysis-engine.js';

let serverManager: McpServerManager | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // 1. Logger
  initLogger(context);
  logger.info('PL/SQL Analyzer activating (Phase 3)');

  // 2. Core services
  serverManager = new McpServerManager(context);
  context.subscriptions.push(serverManager);

  const secretStorage = new SecretStorageAdapter(context.secrets);
  const mcpClient = new McpClient(() => serverManager!.getClient());
  const connectionManager = new ConnectionManager(serverManager, secretStorage);
  context.subscriptions.push(connectionManager);

  // 3. Load saved connections
  await connectionManager.loadSaved();

  // 4. SQLite store + snapshot manager
  const sqliteStore = new SqliteStore();
  sqliteStore.open(context.globalStorageUri);
  context.subscriptions.push(sqliteStore);

  const snapshotManager = new SnapshotManager(sqliteStore);

  // Last analysis result — shared between Phase 2/3 commands
  let lastAnalysisResult: AnalysisResult | undefined;

  // 5. TreeViews
  const connectionTree = new ConnectionTreeProvider(connectionManager, () => mcpClient);
  context.subscriptions.push(connectionTree);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('plsqlConnections', connectionTree),
  );

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('plsqlSchemaExplorer', {
      getTreeItem: (e: vscode.TreeItem) => e,
      getChildren: () => [],
    }),
  );

  // Refactoring Backlog TreeView — Phase 3
  const backlogTree = new BacklogTreeProvider();
  context.subscriptions.push(backlogTree);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('plsqlRefactoringBacklog', backlogTree),
  );

  // 6. Phase 1 analysis providers
  const diagnosticsManager = new DiagnosticsManager();
  context.subscriptions.push(diagnosticsManager);

  const codeLensProvider = new PlsqlCodeLensProvider();
  context.subscriptions.push(codeLensProvider);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: PLSQL_SCHEME },
      codeLensProvider,
    ),
  );

  const hoverProvider = new PlsqlHoverProvider();
  context.subscriptions.push(hoverProvider);
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      [
        { scheme: PLSQL_SCHEME },
        { language: 'plsql' },
        { language: 'sql' },
      ],
      hoverProvider,
    ),
  );

  // 7. Commands

  registerConnectionCommands(
    context,
    connectionManager,
    secretStorage,
    () => mcpClient,
    connectionTree,
  );

  const analysisState = createAnalysisState();

  registerAnalysisCommands(
    context,
    () => mcpClient,
    () => {
      const active = connectionManager.getActive();
      if (!active || active.status !== 'connected') return undefined;
      return {
        connectionId: active.profile.id,
        schema: analysisState.activeSchema ?? active.profile.username.toUpperCase(),
      };
    },
    diagnosticsManager,
    codeLensProvider,
    hoverProvider,
    analysisState,
    // Phase 2/3 callback: runs after every successful schema analysis
    (result: AnalysisResult) => {
      lastAnalysisResult = result;

      // Save snapshot
      try {
        snapshotManager.saveAnalysisResult(result);
      } catch (err) {
        logger.warn('Snapshot save failed (non-fatal)', err);
      }

      // Update backlog
      backlogTree.update(result);

      // Refresh dashboard if already open
      DashboardPanel.updateIfOpen(result);
    },
  );

  // ── Phase 2 commands ───────────────────────────────────────────────────────

  // showDependencies — Cytoscape graph
  context.subscriptions.push(
    vscode.commands.registerCommand('plsql-analyzer.showDependencies', async () => {
      const conn = getActiveConn(connectionManager, analysisState);
      if (!conn) { void vscode.window.showWarningMessage('No active Oracle connection.'); return; }

      const panel = GraphPanel.open(context.extensionUri);

      if (!lastAnalysisResult || lastAnalysisResult.objects.length === 0) {
        void vscode.window.showInformationMessage(
          'No analysis results yet — run Analyze Schema first (Ctrl+Shift+A).',
        );
        return;
      }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Building dependency graph…', cancellable: false },
        async () => {
          const elements = await buildSchemaGraph(
            conn.connectionId, conn.schema, lastAnalysisResult!.objects, mcpClient,
          );
          panel.loadGraph(elements, conn.schema);
        },
      );
    }),
  );

  // showObjectDependencies — neighbourhood graph for one object
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'plsql-analyzer.showObjectDependencies',
      async (connectionId: string, schema: string, name: string, type: string) => {
        const panel = GraphPanel.open(context.extensionUri);
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: `Graph: ${name}`, cancellable: false },
          async () => {
            const elements = await buildObjectGraph(connectionId, schema, name, type, mcpClient);
            panel.loadGraph(elements, `${name} (${type})`);
          },
        );
      },
    ),
  );

  // showDashboard
  context.subscriptions.push(
    vscode.commands.registerCommand('plsql-analyzer.showDashboard', () => {
      const panel = DashboardPanel.open();
      if (lastAnalysisResult) {
        panel.update(lastAnalysisResult);
      } else {
        panel.showEmpty();
      }
    }),
  );

  // exportReport
  context.subscriptions.push(
    vscode.commands.registerCommand('plsql-analyzer.exportReport', async () => {
      if (!lastAnalysisResult) {
        void vscode.window.showWarningMessage('No analysis results. Run Analyze Schema first (Ctrl+Shift+A).');
        return;
      }
      await exportHtmlReport(lastAnalysisResult);
    }),
  );

  // ── Phase 3 commands ───────────────────────────────────────────────────────

  // createTicket — create JIRA / Linear ticket from a finding (called from backlog tree)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'plsql-analyzer.createTicket',
      async (findingId: string) => {
        if (!lastAnalysisResult) {
          void vscode.window.showWarningMessage('No analysis results available.');
          return;
        }

        const allFindings = [...lastAnalysisResult.findings, ...lastAnalysisResult.grantFindings];
        const finding = allFindings.find(f => f.id === findingId);
        const object  = lastAnalysisResult.objects.find(o =>
          finding && o.findings.some(f => f.id === finding.id),
        );

        if (!finding || !object) {
          void vscode.window.showWarningMessage(`Finding ${findingId} not found in last analysis.`);
          return;
        }

        await createTicketFromFinding(finding, object, context.secrets);
      },
    ),
  );

  // configureJira — store JIRA credentials in SecretStorage
  context.subscriptions.push(
    vscode.commands.registerCommand('plsql-analyzer.configureJira', async () => {
      const email = await vscode.window.showInputBox({
        prompt: 'Atlassian account email',
        placeHolder: 'you@company.com',
      });
      if (!email) return;

      const token = await vscode.window.showInputBox({
        prompt: 'JIRA API token (from id.atlassian.com/manage-profile/security/api-tokens)',
        password: true,
      });
      if (!token) return;

      await context.secrets.store('plsqlAnalyzer.jira.email', email);
      await context.secrets.store('plsqlAnalyzer.jira.apiToken', token);
      void vscode.window.showInformationMessage('JIRA credentials stored securely.');
    }),
  );

  // configureLinear
  context.subscriptions.push(
    vscode.commands.registerCommand('plsql-analyzer.configureLinear', async () => {
      const apiKey = await vscode.window.showInputBox({
        prompt: 'Linear API key (from linear.app/settings/api)',
        password: true,
      });
      if (!apiKey) return;

      await context.secrets.store('plsqlAnalyzer.linear.apiKey', apiKey);
      void vscode.window.showInformationMessage('Linear API key stored securely.');
    }),
  );

  // clearBacklog — reset the refactoring backlog
  context.subscriptions.push(
    vscode.commands.registerCommand('plsql-analyzer.clearBacklog', () => {
      backlogTree.clear();
    }),
  );

  // 8. Status bar
  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusItem.command = 'plsql-analyzer.connect';
  context.subscriptions.push(statusItem);

  serverManager.onStateChange(state => {
    switch (state) {
      case 'running':
        statusItem.text = '$(database) PL/SQL: Connected';
        statusItem.tooltip = 'PL/SQL Analyzer — MCP server running. Ctrl+Shift+A to analyze.';
        statusItem.backgroundColor = undefined;
        break;
      case 'starting':
        statusItem.text = '$(loading~spin) PL/SQL: Connecting…';
        statusItem.backgroundColor = undefined;
        break;
      case 'error':
        statusItem.text = '$(error) PL/SQL: Error';
        statusItem.tooltip = 'PL/SQL Analyzer — MCP server error. Click to reconnect.';
        statusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        break;
      default:
        statusItem.text = '$(database) PL/SQL: Disconnected';
        statusItem.tooltip = 'PL/SQL Analyzer — Click to connect to Oracle';
        statusItem.backgroundColor = undefined;
    }
    statusItem.show();
  });

  statusItem.text = '$(database) PL/SQL: Disconnected';
  statusItem.show();

  logger.info('PL/SQL Analyzer activated — Phase 3 ready');
}

export async function deactivate(): Promise<void> {
  logger.info('PL/SQL Analyzer deactivating');
  if (serverManager) await serverManager.stop();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getActiveConn(
  connectionManager: ConnectionManager,
  analysisState: ReturnType<typeof createAnalysisState>,
) {
  const active = connectionManager.getActive();
  if (!active || active.status !== 'connected') return undefined;
  return {
    connectionId: active.profile.id,
    schema: analysisState.activeSchema ?? active.profile.username.toUpperCase(),
  };
}
