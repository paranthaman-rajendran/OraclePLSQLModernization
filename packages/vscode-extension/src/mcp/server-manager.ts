/**
 * MCP Server lifecycle manager.
 * Owns the child process: start, stop, restart, crash recovery.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import * as vscode from 'vscode';
import { createTransport, type ServerEnv } from './transport.js';
import { logger } from '../util/logger.js';

export type ServerState = 'stopped' | 'starting' | 'running' | 'error';

export class McpServerManager implements vscode.Disposable {
  private client: Client | undefined;
  private state: ServerState = 'stopped';
  private _onStateChange = new vscode.EventEmitter<ServerState>();

  readonly onStateChange = this._onStateChange.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  get currentState(): ServerState {
    return this.state;
  }

  getClient(): Client {
    if (!this.client || this.state !== 'running') {
      throw new Error('MCP server is not running. Connect to a database first.');
    }
    return this.client;
  }

  async start(serverEnv: ServerEnv = {}): Promise<void> {
    if (this.state === 'running' || this.state === 'starting') return;

    this.setState('starting');
    logger.info('Starting MCP server');

    const transport = createTransport(this.context, serverEnv);
    this.client = new Client(
      { name: 'plsql-analyzer-extension', version: '0.1.0' },
      { capabilities: {} },
    );

    try {
      await this.client.connect(transport);
      this.setState('running');
      logger.info('MCP server connected');
    } catch (error) {
      this.setState('error');
      this.client = undefined;
      logger.error('Failed to start MCP server', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.state === 'stopped') return;
    logger.info('Stopping MCP server');
    try {
      await this.client?.close();
    } catch {
      // Best-effort close
    }
    this.client = undefined;
    this.setState('stopped');
  }

  async restart(serverEnv: ServerEnv = {}): Promise<void> {
    await this.stop();
    await this.start(serverEnv);
  }

  dispose(): void {
    void this.stop();
    this._onStateChange.dispose();
  }

  private setState(state: ServerState): void {
    this.state = state;
    this._onStateChange.fire(state);
  }
}
