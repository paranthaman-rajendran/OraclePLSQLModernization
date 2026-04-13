/**
 * TreeDataProvider for the Connections sidebar panel.
 * Shows: Connection → Schemas → Object Types → Named Objects
 */

import * as vscode from 'vscode';
import type { ConnectionManager } from './connection-manager.js';
import type { McpClient } from '../mcp/client.js';
import type { ConnectionState } from '@plsql-analyzer/shared';

type NodeKind = 'connection' | 'schema' | 'objectType' | 'object';

export class ConnectionNode extends vscode.TreeItem {
  readonly kind: NodeKind;

  constructor(
    kind: NodeKind,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly connectionId: string,
    public readonly schema?: string,
    public readonly objectType?: string,
    public readonly objectName?: string,
  ) {
    super(label, collapsibleState);
    this.kind = kind;
  }
}

export class ConnectionTreeProvider
  implements vscode.TreeDataProvider<ConnectionNode>, vscode.Disposable
{
  private _onDidChangeTreeData = new vscode.EventEmitter<ConnectionNode | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly getMcpClient: () => McpClient,
  ) {
    connectionManager.onConnectionsChanged(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ConnectionNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ConnectionNode): Promise<ConnectionNode[]> {
    if (!element) {
      return this.getConnectionNodes();
    }
    if (element.kind === 'connection' && element.contextValue === 'connection-connected') {
      return this.getSchemaNodes(element.connectionId);
    }
    if (element.kind === 'schema' && element.schema) {
      return this.getObjectTypeNodes(element.connectionId, element.schema);
    }
    if (element.kind === 'objectType' && element.schema && element.objectType) {
      return this.getObjectNodes(element.connectionId, element.schema, element.objectType);
    }
    return [];
  }

  private getConnectionNodes(): ConnectionNode[] {
    return this.connectionManager.getAll().map(state => {
      const icon = this.connectionIcon(state.status);
      const node = new ConnectionNode(
        'connection',
        state.profile.label,
        state.status === 'connected'
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
        state.profile.id,
      );
      node.description = `${state.profile.username}@${state.profile.host}:${state.profile.port}/${state.profile.serviceName}`;
      node.iconPath = new vscode.ThemeIcon(icon);
      node.contextValue = `connection-${state.status}`;
      node.tooltip = state.error
        ? `Error: ${state.error}`
        : `Status: ${state.status}`;
      return node;
    });
  }

  private async getSchemaNodes(connectionId: string): Promise<ConnectionNode[]> {
    try {
      const client = this.getMcpClient();
      const result = await client.listSchemas({ connectionId, includeSystem: false });
      return result.schemas.map(s => {
        const node = new ConnectionNode(
          'schema',
          s.name,
          vscode.TreeItemCollapsibleState.Collapsed,
          connectionId,
          s.name,
        );
        node.description = `${s.objectCount} objects`;
        node.iconPath = new vscode.ThemeIcon('database');
        node.contextValue = 'schema';
        return node;
      });
    } catch {
      return [];
    }
  }

  private async getObjectTypeNodes(connectionId: string, schema: string): Promise<ConnectionNode[]> {
    const types = ['PACKAGE', 'PROCEDURE', 'FUNCTION', 'TRIGGER', 'TYPE', 'VIEW'];
    try {
      const client = this.getMcpClient();
      const result = await client.listObjects({ connectionId, schema });
      const typeCounts = new Map<string, number>();
      for (const obj of result.objects) {
        typeCounts.set(obj.type, (typeCounts.get(obj.type) ?? 0) + 1);
      }
      return types
        .filter(t => typeCounts.has(t))
        .map(t => {
          const node = new ConnectionNode(
            'objectType',
            t,
            vscode.TreeItemCollapsibleState.Collapsed,
            connectionId,
            schema,
            t,
          );
          node.description = String(typeCounts.get(t) ?? 0);
          node.iconPath = new vscode.ThemeIcon(objectTypeIcon(t));
          node.contextValue = 'objectType';
          return node;
        });
    } catch {
      return [];
    }
  }

  private async getObjectNodes(
    connectionId: string,
    schema: string,
    objectType: string,
  ): Promise<ConnectionNode[]> {
    try {
      const client = this.getMcpClient();
      const result = await client.listObjects({
        connectionId,
        schema,
        objectType: objectType as Parameters<McpClient['listObjects']>[0]['objectType'],
      });
      return result.objects
        .filter(o => o.type === objectType)
        .map(o => {
          const node = new ConnectionNode(
            'object',
            o.name,
            vscode.TreeItemCollapsibleState.None,
            connectionId,
            schema,
            objectType,
            o.name,
          );
          node.iconPath = new vscode.ThemeIcon(
            o.status === 'VALID' ? objectTypeIcon(o.type) : 'warning',
          );
          node.description = o.status !== 'VALID' ? o.status : undefined;
          node.contextValue = 'plsqlObject';
          node.command = {
            command: 'plsql-analyzer.analyzeObject',
            title: 'Analyze',
            arguments: [connectionId, schema, o.name, o.type],
          };
          return node;
        });
    } catch {
      return [];
    }
  }

  private connectionIcon(status: ConnectionState['status']): string {
    switch (status) {
      case 'connected': return 'circle-filled';
      case 'connecting': return 'loading~spin';
      case 'error': return 'error';
      default: return 'circle-outline';
    }
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}

function objectTypeIcon(type: string): string {
  switch (type) {
    case 'PACKAGE':
    case 'PACKAGE BODY': return 'symbol-namespace';
    case 'PROCEDURE': return 'symbol-method';
    case 'FUNCTION': return 'symbol-function';
    case 'TRIGGER': return 'zap';
    case 'TYPE':
    case 'TYPE BODY': return 'symbol-class';
    case 'VIEW': return 'eye';
    default: return 'symbol-misc';
  }
}
