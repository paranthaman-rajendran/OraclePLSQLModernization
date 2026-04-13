/**
 * Typed MCP client — single integration seam between the extension and Oracle.
 * All Phase 1 and Phase 2 features call through this class.
 *
 * Pattern per method:
 *   1. Call sdk.callTool({ name, arguments: input })
 *   2. Parse response text through Zod schema from shared/mcp-contracts
 *   3. Return typed domain object or throw McpValidationError
 *
 * No `any` types escape this class boundary.
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { z } from 'zod';
import {
  MCP_TOOL_SCHEMAS,
  type ListSchemasInput, type ListSchemasOutput,
  type ListObjectsInput, type ListObjectsOutput,
  type GetObjectSourceInput, type GetObjectSourceOutput,
  type GetPackageSpecInput, type GetPackageSpecOutput,
  type GetObjectDependenciesInput, type GetObjectDependenciesOutput,
  type GetObjectReferencesInput, type GetObjectReferencesOutput,
  type ListTablesInput, type ListTablesOutput,
  type GetTableDetailInput, type GetTableDetailOutput,
  type ListViewsInput, type ListViewsOutput,
  type GetInvalidObjectsInput, type GetInvalidObjectsOutput,
  type GetGrantsInput, type GetGrantsOutput,
  type GetDbLinksInput, type GetDbLinksOutput,
  type SearchSourceInput, type SearchSourceOutput,
  type GetCompileErrorsInput, type GetCompileErrorsOutput,
} from '@plsql-analyzer/shared';

export class McpValidationError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly issues: z.ZodIssue[],
  ) {
    super(`MCP tool "${toolName}" response validation failed: ${issues.map(i => i.message).join(', ')}`);
    this.name = 'McpValidationError';
  }
}

export class McpServerUnavailableError extends Error {
  constructor() {
    super('MCP server is unavailable. Start a connection first.');
    this.name = 'McpServerUnavailableError';
  }
}

type ToolSchemas = typeof MCP_TOOL_SCHEMAS;

export class McpClient {
  constructor(private readonly getClient: () => Client) {}

  private async call<K extends keyof ToolSchemas>(
    toolName: K,
    input: z.infer<ToolSchemas[K]['input']>,
  ): Promise<z.infer<ToolSchemas[K]['output']>> {
    let client: Client;
    try {
      client = this.getClient();
    } catch {
      throw new McpServerUnavailableError();
    }

    const result = await client.callTool({ name: toolName as string, arguments: input as Record<string, unknown> });

    const textContent = result.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new McpValidationError(toolName as string, [{ code: 'custom', path: [], message: 'No text content in tool response' }]);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(textContent.text);
    } catch {
      throw new McpValidationError(toolName as string, [{ code: 'custom', path: [], message: 'Tool response is not valid JSON' }]);
    }

    if (parsed && typeof parsed === 'object' && 'error' in parsed) {
      throw new Error(String((parsed as { error: unknown }).error));
    }

    const schema = MCP_TOOL_SCHEMAS[toolName].output as z.ZodType<z.infer<ToolSchemas[K]['output']>>;
    const validated = schema.safeParse(parsed);
    if (!validated.success) {
      throw new McpValidationError(toolName as string, validated.error.issues);
    }

    return validated.data;
  }

  async connect(connectionId: string, alias: string): Promise<{ connected: boolean; source: string }> {
    const client = this.getClient();
    const result = await client.callTool({ name: 'connect', arguments: { connectionId, alias } });
    const textContent = result.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') throw new Error('Connect returned no response');
    return JSON.parse(textContent.text) as { connected: boolean; source: string };
  }

  async disconnect(connectionId: string): Promise<void> {
    const client = this.getClient();
    await client.callTool({ name: 'disconnect', arguments: { connectionId } });
  }

  listSchemas(input: ListSchemasInput): Promise<ListSchemasOutput> {
    return this.call('list_schemas', input);
  }

  listObjects(input: ListObjectsInput): Promise<ListObjectsOutput> {
    return this.call('list_objects', input);
  }

  getObjectSource(input: GetObjectSourceInput): Promise<GetObjectSourceOutput> {
    return this.call('get_object_source', input);
  }

  getPackageSpec(input: GetPackageSpecInput): Promise<GetPackageSpecOutput> {
    return this.call('get_package_spec', input);
  }

  getObjectDependencies(input: GetObjectDependenciesInput): Promise<GetObjectDependenciesOutput> {
    return this.call('get_object_dependencies', input);
  }

  getObjectReferences(input: GetObjectReferencesInput): Promise<GetObjectReferencesOutput> {
    return this.call('get_object_references', input);
  }

  listTables(input: ListTablesInput): Promise<ListTablesOutput> {
    return this.call('list_tables', input);
  }

  getTableDetail(input: GetTableDetailInput): Promise<GetTableDetailOutput> {
    return this.call('get_table_detail', input);
  }

  listViews(input: ListViewsInput): Promise<ListViewsOutput> {
    return this.call('list_views', input);
  }

  getInvalidObjects(input: GetInvalidObjectsInput): Promise<GetInvalidObjectsOutput> {
    return this.call('get_invalid_objects', input);
  }

  getGrants(input: GetGrantsInput): Promise<GetGrantsOutput> {
    return this.call('get_grants', input);
  }

  getDbLinks(input: GetDbLinksInput): Promise<GetDbLinksOutput> {
    return this.call('get_db_links', input);
  }

  searchSource(input: SearchSourceInput): Promise<SearchSourceOutput> {
    return this.call('search_source', input);
  }

  getCompileErrors(input: GetCompileErrorsInput): Promise<GetCompileErrorsOutput> {
    return this.call('get_compile_errors', input);
  }
}
