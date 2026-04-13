/**
 * In-memory connection registry.
 * Fires ConnectionsChangedEvent when the set of connections or their states change.
 * Does NOT hold any credential values.
 */

import * as vscode from 'vscode';
import type { ConnectionState, ConnectionProfile } from '@plsql-analyzer/shared';
import type { McpClient } from '../mcp/client.js';
import type { McpServerManager } from '../mcp/server-manager.js';
import type { SecretStorageAdapter } from '../credentials/secret-storage.js';
import { logger } from '../util/logger.js';

export class ConnectionManager implements vscode.Disposable {
  private readonly connections = new Map<string, ConnectionState>();
  private _onConnectionsChanged = new vscode.EventEmitter<void>();
  readonly onConnectionsChanged = this._onConnectionsChanged.event;

  private activeConnectionId: string | undefined;

  constructor(
    private readonly serverManager: McpServerManager,
    private readonly secretStorage: SecretStorageAdapter,
  ) {}

  getAll(): ConnectionState[] {
    return [...this.connections.values()];
  }

  getActive(): ConnectionState | undefined {
    return this.activeConnectionId
      ? this.connections.get(this.activeConnectionId)
      : undefined;
  }

  getActiveConnectionId(): string | undefined {
    return this.activeConnectionId;
  }

  /**
   * Load all saved connection profiles from SecretStorage into memory.
   * Called once during extension activation.
   */
  async loadSaved(): Promise<void> {
    const saved = await this.secretStorage.loadAllConnections();
    for (const meta of saved) {
      const profile: ConnectionProfile = {
        id: meta.id,
        label: meta.label,
        host: meta.host,
        port: meta.port,
        serviceName: meta.serviceName,
        username: meta.username,
      };
      this.connections.set(meta.id, { profile, status: 'disconnected' });
    }
    if (saved.length > 0) {
      this._onConnectionsChanged.fire();
    }
  }

  /**
   * Connect to a saved connection by ID.
   * Retrieves password from SecretStorage, passes to MCP server via env, then clears it.
   */
  async connect(connectionId: string, mcpClient: McpClient): Promise<void> {
    const state = this.connections.get(connectionId);
    if (!state) throw new Error(`Connection "${connectionId}" not found`);

    this.setState(connectionId, 'connecting');

    try {
      // Retrieve password from SecretStorage — use immediately, do not retain
      const password = await this.secretStorage.loadPassword(connectionId);
      const { profile } = state;

      // Ensure MCP server is running with credentials injected
      await this.serverManager.restart({
        ORACLE_USER: profile.username,
        ORACLE_PASSWORD: password ?? '',
        ORACLE_HOST: profile.host,
        ORACLE_PORT: String(profile.port),
        ORACLE_SERVICE: profile.serviceName,
      });

      // Tell the MCP server to open the pool for this connectionId
      const result = await mcpClient.connect(connectionId, profile.label);

      this.setState(connectionId, 'connected', undefined, result.source as ConnectionProfile['credentialSource']);
      this.activeConnectionId = connectionId;

      logger.info(`Connected to "${profile.label}"`, `Credential source: ${result.source}`);
    } catch (error) {
      this.setState(connectionId, 'error', String(error));
      throw error;
    }
  }

  async disconnect(connectionId: string, mcpClient: McpClient): Promise<void> {
    const state = this.connections.get(connectionId);
    if (!state) return;

    try {
      await mcpClient.disconnect(connectionId);
    } catch { /* best effort */ }

    this.setState(connectionId, 'disconnected');
    if (this.activeConnectionId === connectionId) {
      this.activeConnectionId = undefined;
    }
  }

  addConnection(profile: ConnectionProfile): void {
    this.connections.set(profile.id, { profile, status: 'disconnected' });
    this._onConnectionsChanged.fire();
  }

  removeConnection(connectionId: string): void {
    this.connections.delete(connectionId);
    if (this.activeConnectionId === connectionId) {
      this.activeConnectionId = undefined;
    }
    this._onConnectionsChanged.fire();
  }

  dispose(): void {
    this._onConnectionsChanged.dispose();
  }

  private setState(
    id: string,
    status: ConnectionState['status'],
    error?: string,
    credentialSource?: ConnectionProfile['credentialSource'],
  ): void {
    const existing = this.connections.get(id);
    if (!existing) return;

    this.connections.set(id, {
      profile: credentialSource
        ? { ...existing.profile, credentialSource }
        : existing.profile,
      status,
      ...(error ? { error } : {}),
      ...(status === 'connected' ? { connectedAt: new Date() } : {}),
    });
    this._onConnectionsChanged.fire();
  }
}
