/**
 * VS Code SecretStorage adapter — Priority 5 in credential resolution chain.
 *
 * SECURITY design:
 * - Connection metadata (host, port, service, username) stored as JSON under key
 *   `plsql-analyzer.conn.<id>`
 * - Password stored separately under key `plsql-analyzer.pw.<id>`
 * - Two-key design: if the metadata blob is ever accidentally serialized,
 *   it contains no secret material.
 * - Passwords never held in variables beyond the scope of SecretStorage reads.
 */

import * as vscode from 'vscode';

export interface StoredConnectionMeta {
  readonly id: string;
  readonly label: string;
  readonly host: string;
  readonly port: number;
  readonly serviceName: string;
  readonly username: string;
}

const CONN_KEY_PREFIX = 'plsql-analyzer.conn.';
const PW_KEY_PREFIX = 'plsql-analyzer.pw.';
const INDEX_KEY = 'plsql-analyzer.connections.index';

export class SecretStorageAdapter {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  /** Store connection metadata (non-sensitive) */
  async saveConnectionMeta(meta: StoredConnectionMeta): Promise<void> {
    await this.secrets.store(CONN_KEY_PREFIX + meta.id, JSON.stringify(meta));

    // Update index
    const index = await this.getConnectionIndex();
    if (!index.includes(meta.id)) {
      index.push(meta.id);
      await this.secrets.store(INDEX_KEY, JSON.stringify(index));
    }
  }

  /** Store password separately from metadata */
  async savePassword(connectionId: string, password: string): Promise<void> {
    await this.secrets.store(PW_KEY_PREFIX + connectionId, password);
  }

  /** Load connection metadata (never contains password) */
  async loadConnectionMeta(connectionId: string): Promise<StoredConnectionMeta | undefined> {
    const raw = await this.secrets.get(CONN_KEY_PREFIX + connectionId);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as StoredConnectionMeta;
    } catch {
      return undefined;
    }
  }

  /** Load password — caller must not retain beyond immediate use */
  async loadPassword(connectionId: string): Promise<string | undefined> {
    return this.secrets.get(PW_KEY_PREFIX + connectionId);
  }

  /** Delete a connection and its password */
  async deleteConnection(connectionId: string): Promise<void> {
    await Promise.all([
      this.secrets.delete(CONN_KEY_PREFIX + connectionId),
      this.secrets.delete(PW_KEY_PREFIX + connectionId),
    ]);

    const index = await this.getConnectionIndex();
    const updated = index.filter(id => id !== connectionId);
    await this.secrets.store(INDEX_KEY, JSON.stringify(updated));
  }

  /** List all saved connection IDs */
  async getConnectionIndex(): Promise<string[]> {
    const raw = await this.secrets.get(INDEX_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  }

  /** Load all saved connection metadata (no passwords) */
  async loadAllConnections(): Promise<StoredConnectionMeta[]> {
    const index = await this.getConnectionIndex();
    const results = await Promise.all(index.map(id => this.loadConnectionMeta(id)));
    return results.filter((r): r is StoredConnectionMeta => r !== undefined);
  }
}
