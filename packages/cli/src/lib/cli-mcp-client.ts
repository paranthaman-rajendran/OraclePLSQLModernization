/**
 * CLI MCP client — spawns the plsql-mcp-server subprocess and communicates
 * via the stdio transport, then wraps it in the AnalysisClient interface.
 *
 * Connection is established once; the subprocess is kept alive for the
 * duration of the CLI command.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as path from 'path';
import * as fs from 'fs';
import { z } from 'zod';
import type { AnalysisClient } from '@plsql-analyzer/analysis';
import {
  MCP_TOOL_SCHEMAS,
  type GetObjectSourceInput,
  type GetObjectReferencesInput,
  type GetCompileErrorsInput,
} from '@plsql-analyzer/shared';
import type { CliConfig } from './config.js';

// ---------------------------------------------------------------------------
// Resolve mcp-server binary path
// ---------------------------------------------------------------------------

function findMcpServerBin(): string {
  // Try common locations relative to the CLI dist/index.js
  const candidates = [
    path.resolve(import.meta.dirname ?? '', '../../mcp-server/dist/index.js'),
    path.resolve(import.meta.dirname ?? '', '../../../mcp-server/dist/index.js'),
    // Also try if installed as a sibling package
    path.resolve(process.cwd(), 'node_modules/@plsql-analyzer/mcp-server/dist/index.js'),
    // Fallback: rely on PATH
    'plsql-mcp-server',
  ];

  for (const p of candidates) {
    if (p === 'plsql-mcp-server') return p; // PATH lookup — always last resort
    if (fs.existsSync(p)) return p;
  }
  return 'plsql-mcp-server';
}

// ---------------------------------------------------------------------------
// CliMcpClient
// ---------------------------------------------------------------------------

export class CliMcpClient implements AnalysisClient {
  private client: Client;
  private connectionId: string;

  private constructor(client: Client, connectionId: string) {
    this.client = client;
    this.connectionId = connectionId;
  }

  /** Start the MCP server subprocess, connect, and authenticate to Oracle */
  static async create(config: CliConfig): Promise<CliMcpClient> {
    const mcpBin = findMcpServerBin();

    const transport = new StdioClientTransport({
      command: mcpBin === 'plsql-mcp-server' ? 'plsql-mcp-server' : 'node',
      args: mcpBin === 'plsql-mcp-server' ? [] : [mcpBin],
      env: {
        // Pass Oracle credentials via env — never CLI args (shell history risk)
        ...process.env,
        ORACLE_HOST:     config.host,
        ORACLE_PORT:     String(config.port),
        ORACLE_SERVICE:  config.serviceName,
        ORACLE_USER:     config.username,
        ORACLE_PASSWORD: config.password,
      },
    });

    const client = new Client(
      { name: 'plsql-analyze-cli', version: '0.1.0' },
      { capabilities: {} },
    );

    await client.connect(transport);

    // Authenticate — reuse the connect tool
    const connectionId = `cli-${Date.now()}`;
    const result = await client.callTool({
      name: 'connect',
      arguments: { connectionId, alias: config.schema },
    });

    const textContent = result.content.find(c => c.type === 'text');
    if (textContent?.type === 'text') {
      const resp = JSON.parse(textContent.text) as { connected: boolean; source: string };
      if (!resp.connected) {
        throw new Error(`Oracle connection failed. source=${resp.source}`);
      }
    }

    return new CliMcpClient(client, connectionId);
  }

  async disconnect(): Promise<void> {
    await this.client.callTool({ name: 'disconnect', arguments: { connectionId: this.connectionId } });
    await this.client.close();
  }

  // ---------------------------------------------------------------------------
  // AnalysisClient implementation
  // ---------------------------------------------------------------------------

  async listObjects(input: { connectionId?: string; schema: string }) {
    return this.call('list_objects', { connectionId: this.connectionId, ...input });
  }

  async getObjectSource(input: Omit<GetObjectSourceInput, 'connectionId'> & { connectionId?: string }) {
    return this.call('get_object_source', { connectionId: this.connectionId, ...input } as GetObjectSourceInput);
  }

  async getCompileErrors(input: Omit<GetCompileErrorsInput, 'connectionId'> & { connectionId?: string }) {
    return this.call('get_compile_errors', { connectionId: this.connectionId, ...input } as GetCompileErrorsInput);
  }

  async getObjectReferences(input: Omit<GetObjectReferencesInput, 'connectionId'> & { connectionId?: string }) {
    return this.call('get_object_references', { connectionId: this.connectionId, ...input } as GetObjectReferencesInput);
  }

  async getGrants(input: { connectionId?: string; schema: string }) {
    return this.call('get_grants', { connectionId: this.connectionId, ...input });
  }

  // ---------------------------------------------------------------------------
  // Generic tool call with Zod validation
  // ---------------------------------------------------------------------------

  private async call<K extends keyof typeof MCP_TOOL_SCHEMAS>(
    toolName: K,
    input: z.infer<(typeof MCP_TOOL_SCHEMAS)[K]['input']>,
  ): Promise<z.infer<(typeof MCP_TOOL_SCHEMAS)[K]['output']>> {
    const result = await this.client.callTool({
      name: toolName as string,
      arguments: input as Record<string, unknown>,
    });

    const textContent = result.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error(`MCP tool "${toolName}" returned no text content`);
    }

    const parsed = JSON.parse(textContent.text) as unknown;

    if (parsed && typeof parsed === 'object' && 'error' in parsed) {
      throw new Error(String((parsed as { error: unknown }).error));
    }

    const schema = MCP_TOOL_SCHEMAS[toolName].output as z.ZodType<z.infer<(typeof MCP_TOOL_SCHEMAS)[K]['output']>>;
    const validated = schema.safeParse(parsed);
    if (!validated.success) {
      throw new Error(`MCP validation failed for "${toolName}": ${validated.error.message}`);
    }

    return validated.data;
  }
}
