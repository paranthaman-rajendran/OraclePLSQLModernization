/**
 * Command handlers for connection management.
 * Wires UI prompts → SecretStorage → ConnectionManager → MCP server.
 */

import * as vscode from 'vscode';
import type { ConnectionManager } from './connection-manager.js';
import type { SecretStorageAdapter } from '../credentials/secret-storage.js';
import type { McpClient } from '../mcp/client.js';
import type { ConnectionTreeProvider } from './connection-tree.js';
import { promptForConnection } from '../credentials/credential-ui.js';
import { logger } from '../util/logger.js';

export function registerConnectionCommands(
  ctx: vscode.ExtensionContext,
  connectionManager: ConnectionManager,
  secretStorage: SecretStorageAdapter,
  getMcpClient: () => McpClient,
  treeProvider: ConnectionTreeProvider,
): void {
  ctx.subscriptions.push(

    vscode.commands.registerCommand('plsql-analyzer.addConnection', async () => {
      const result = await promptForConnection();
      if (!result) return;

      const { meta, password } = result;

      await secretStorage.saveConnectionMeta(meta);
      await secretStorage.savePassword(meta.id, password);

      connectionManager.addConnection({
        id: meta.id,
        label: meta.label,
        host: meta.host,
        port: meta.port,
        serviceName: meta.serviceName,
        username: meta.username,
      });

      const connect = await vscode.window.showInformationMessage(
        `Connection "${meta.label}" added.`,
        'Connect Now',
      );
      if (connect === 'Connect Now') {
        await executeConnect(meta.id, connectionManager, getMcpClient);
      }
    }),

    vscode.commands.registerCommand('plsql-analyzer.connect', async (node?: { connectionId?: string }) => {
      const connections = connectionManager.getAll();
      if (connections.length === 0) {
        const add = await vscode.window.showWarningMessage(
          'No connection profiles configured.',
          'Add Connection',
        );
        if (add) await vscode.commands.executeCommand('plsql-analyzer.addConnection');
        return;
      }

      let connectionId = node?.connectionId;
      if (!connectionId) {
        const pick = await vscode.window.showQuickPick(
          connections.map(c => ({ label: c.profile.label, id: c.profile.id })),
          { placeHolder: 'Select a connection to activate' },
        );
        connectionId = pick?.id;
      }
      if (!connectionId) return;

      await executeConnect(connectionId, connectionManager, getMcpClient);
    }),

    vscode.commands.registerCommand('plsql-analyzer.testConnection', async (node?: { connectionId?: string }) => {
      const connectionId = node?.connectionId ?? connectionManager.getActiveConnectionId();
      if (!connectionId) {
        void vscode.window.showWarningMessage('No connection selected.');
        return;
      }
      try {
        const client = getMcpClient();
        const result = await client.listSchemas({ connectionId, includeSystem: false });
        void vscode.window.showInformationMessage(
          `Connection OK — found ${result.schemas.length} schemas.`,
        );
      } catch (error) {
        void vscode.window.showErrorMessage(`Connection test failed: ${String(error)}`);
      }
    }),

    vscode.commands.registerCommand('plsql-analyzer.removeConnection', async (node?: { connectionId?: string }) => {
      const connectionId = node?.connectionId;
      if (!connectionId) return;

      const state = connectionManager.getAll().find(c => c.profile.id === connectionId);
      if (!state) return;

      const confirm = await vscode.window.showWarningMessage(
        `Remove connection "${state.profile.label}"? This will delete saved credentials.`,
        { modal: true },
        'Remove',
      );
      if (confirm !== 'Remove') return;

      if (state.status === 'connected') {
        await connectionManager.disconnect(connectionId, getMcpClient());
      }
      await secretStorage.deleteConnection(connectionId);
      connectionManager.removeConnection(connectionId);
      treeProvider.refresh();
    }),

  );
}

async function executeConnect(
  connectionId: string,
  connectionManager: ConnectionManager,
  getMcpClient: () => McpClient,
): Promise<void> {
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Connecting to Oracle...', cancellable: false },
    async () => {
      try {
        await connectionManager.connect(connectionId, getMcpClient());
        void vscode.window.showInformationMessage('Connected to Oracle database.');
      } catch (error) {
        logger.error('Connection failed', error);
        void vscode.window.showErrorMessage(`Connection failed: ${String(error)}`);
      }
    },
  );
}
