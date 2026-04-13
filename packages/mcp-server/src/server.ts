/**
 * MCP Server — tool dispatch layer.
 * Registers all 14 tools with the MCP SDK Server instance.
 * Each tool:
 *   1. Validates input via Zod (from shared/mcp-contracts)
 *   2. Executes Oracle query
 *   3. Returns JSON result
 *   4. On error: logs sanitized message, returns MCP error response
 *
 * SECURITY: Credentials never appear in tool arguments or results.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { MCP_TOOL_SCHEMAS } from '@plsql-analyzer/shared';
import { logger } from './util/logger.js';
import { sanitizeError } from './util/sanitize.js';
import { closeAllPools } from './oracle/connection.js';
import { resolveCredentials } from './credentials/resolver.js';
import { getPool } from './oracle/connection.js';

// Tool implementations
import { listSchemas } from './tools/list-schemas.js';
import { listObjects } from './tools/list-objects.js';
import { getObjectSource } from './tools/get-object-source.js';
import { getPackageSpec } from './tools/get-package-spec.js';
import { getObjectDependencies } from './tools/get-object-dependencies.js';
import { getObjectReferences } from './tools/get-object-references.js';
import { listTables } from './tools/list-tables.js';
import { getTableDetail } from './tools/get-table-detail.js';
import { listViews } from './tools/list-views.js';
import { getInvalidObjects } from './tools/get-invalid-objects.js';
import { getGrants } from './tools/get-grants.js';
import { getDbLinks } from './tools/get-db-links.js';
import { searchSource } from './tools/search-source.js';
import { getCompileErrors } from './tools/get-compile-errors.js';

/** Build MCP Tool metadata for tool discovery */
function buildToolDefs(): Tool[] {
  return [
    {
      name: 'list_schemas',
      description: 'List all accessible Oracle schemas/owners in the connected database.',
      inputSchema: { type: 'object', properties: { connectionId: { type: 'string' }, includeSystem: { type: 'boolean' } }, required: ['connectionId'] },
    },
    {
      name: 'list_objects',
      description: 'List all PL/SQL objects in a schema (procedures, functions, packages, triggers, types).',
      inputSchema: { type: 'object', properties: { connectionId: { type: 'string' }, schema: { type: 'string' }, objectType: { type: 'string' } }, required: ['connectionId', 'schema'] },
    },
    {
      name: 'get_object_source',
      description: 'Fetch the full PL/SQL source code (DDL) for a named object.',
      inputSchema: { type: 'object', properties: { connectionId: { type: 'string' }, schema: { type: 'string' }, name: { type: 'string' }, type: { type: 'string' } }, required: ['connectionId', 'schema', 'name', 'type'] },
    },
    {
      name: 'get_package_spec',
      description: 'Fetch the package specification and optionally the body for a named package.',
      inputSchema: { type: 'object', properties: { connectionId: { type: 'string' }, schema: { type: 'string' }, name: { type: 'string' } }, required: ['connectionId', 'schema', 'name'] },
    },
    {
      name: 'get_object_dependencies',
      description: 'Return all objects that a given object depends on (direct or transitive).',
      inputSchema: { type: 'object', properties: { connectionId: { type: 'string' }, schema: { type: 'string' }, name: { type: 'string' }, type: { type: 'string' }, transitive: { type: 'boolean' } }, required: ['connectionId', 'schema', 'name', 'type'] },
    },
    {
      name: 'get_object_references',
      description: 'Return all objects that reference (call or use) a given object.',
      inputSchema: { type: 'object', properties: { connectionId: { type: 'string' }, schema: { type: 'string' }, name: { type: 'string' }, type: { type: 'string' } }, required: ['connectionId', 'schema', 'name', 'type'] },
    },
    {
      name: 'list_tables',
      description: 'List all tables in a schema with column count and comments.',
      inputSchema: { type: 'object', properties: { connectionId: { type: 'string' }, schema: { type: 'string' } }, required: ['connectionId', 'schema'] },
    },
    {
      name: 'get_table_detail',
      description: 'Return full detail for a table: columns, PKs, FKs, indexes, and comments.',
      inputSchema: { type: 'object', properties: { connectionId: { type: 'string' }, schema: { type: 'string' }, name: { type: 'string' } }, required: ['connectionId', 'schema', 'name'] },
    },
    {
      name: 'list_views',
      description: 'List all views in a schema with their defining SQL.',
      inputSchema: { type: 'object', properties: { connectionId: { type: 'string' }, schema: { type: 'string' } }, required: ['connectionId', 'schema'] },
    },
    {
      name: 'get_invalid_objects',
      description: 'Return all objects currently marked INVALID in ALL_OBJECTS.',
      inputSchema: { type: 'object', properties: { connectionId: { type: 'string' }, schema: { type: 'string' } }, required: ['connectionId'] },
    },
    {
      name: 'get_grants',
      description: 'Return all GRANT statements for a schema — used for privilege analysis.',
      inputSchema: { type: 'object', properties: { connectionId: { type: 'string' }, schema: { type: 'string' } }, required: ['connectionId', 'schema'] },
    },
    {
      name: 'get_db_links',
      description: 'Return all database links — used for cross-database dependency tracking.',
      inputSchema: { type: 'object', properties: { connectionId: { type: 'string' }, schema: { type: 'string' } }, required: ['connectionId'] },
    },
    {
      name: 'search_source',
      description: 'Full-text search across all PL/SQL source in the database.',
      inputSchema: { type: 'object', properties: { connectionId: { type: 'string' }, schema: { type: 'string' }, query: { type: 'string' }, objectType: { type: 'string' }, maxResults: { type: 'number' } }, required: ['connectionId', 'query'] },
    },
    {
      name: 'get_compile_errors',
      description: 'Return current compilation errors from ALL_ERRORS for any object.',
      inputSchema: { type: 'object', properties: { connectionId: { type: 'string' }, schema: { type: 'string' }, name: { type: 'string' }, type: { type: 'string' } }, required: ['connectionId', 'schema', 'name', 'type'] },
    },
    {
      name: 'connect',
      description: 'Establish an Oracle connection for the given connectionId. Credentials resolved from env/dotenv/wallet/vault.',
      inputSchema: { type: 'object', properties: { connectionId: { type: 'string' }, alias: { type: 'string' } }, required: ['connectionId', 'alias'] },
    },
    {
      name: 'disconnect',
      description: 'Close the Oracle connection pool for a connectionId.',
      inputSchema: { type: 'object', properties: { connectionId: { type: 'string' } }, required: ['connectionId'] },
    },
  ];
}

export function createMcpServer(): Server {
  const server = new Server(
    { name: 'plsql-analyzer-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: buildToolDefs(),
  }));

  // Dispatch tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name: toolName, arguments: args } = request.params;
    const input = args ?? {};

    logger.debug('Tool called', { tool: toolName });

    try {
      const result = await dispatchTool(toolName, input as Record<string, unknown>);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    } catch (error) {
      const msg = sanitizeError(error);
      logger.error('Tool execution failed', error, { tool: toolName });
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: msg }) }],
        isError: true,
      };
    }
  });

  return server;
}

async function dispatchTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  // Validate input against Zod schema from shared contracts
  const toolSchemas = MCP_TOOL_SCHEMAS as Record<string, { input: { parse: (v: unknown) => unknown } }>;

  switch (name) {
    case 'connect': {
      const { connectionId, alias } = args as { connectionId: string; alias: string };
      const creds = await resolveCredentials({ connectionId, alias });
      await getPool(connectionId, creds);
      return { connected: true, source: creds.credentialSource };
    }
    case 'disconnect': {
      const { connectionId } = args as { connectionId: string };
      const { closePool } = await import('./oracle/connection.js');
      await closePool(connectionId);
      return { disconnected: true };
    }
    case 'list_schemas': {
      const input = toolSchemas['list_schemas']!.input.parse(args);
      return listSchemas(input as Parameters<typeof listSchemas>[0]);
    }
    case 'list_objects': {
      const input = toolSchemas['list_objects']!.input.parse(args);
      return listObjects(input as Parameters<typeof listObjects>[0]);
    }
    case 'get_object_source': {
      const input = toolSchemas['get_object_source']!.input.parse(args);
      return getObjectSource(input as Parameters<typeof getObjectSource>[0]);
    }
    case 'get_package_spec': {
      const input = toolSchemas['get_package_spec']!.input.parse(args);
      return getPackageSpec(input as Parameters<typeof getPackageSpec>[0]);
    }
    case 'get_object_dependencies': {
      const input = toolSchemas['get_object_dependencies']!.input.parse(args);
      return getObjectDependencies(input as Parameters<typeof getObjectDependencies>[0]);
    }
    case 'get_object_references': {
      const input = toolSchemas['get_object_references']!.input.parse(args);
      return getObjectReferences(input as Parameters<typeof getObjectReferences>[0]);
    }
    case 'list_tables': {
      const input = toolSchemas['list_tables']!.input.parse(args);
      return listTables(input as Parameters<typeof listTables>[0]);
    }
    case 'get_table_detail': {
      const input = toolSchemas['get_table_detail']!.input.parse(args);
      return getTableDetail(input as Parameters<typeof getTableDetail>[0]);
    }
    case 'list_views': {
      const input = toolSchemas['list_views']!.input.parse(args);
      return listViews(input as Parameters<typeof listViews>[0]);
    }
    case 'get_invalid_objects': {
      const input = toolSchemas['get_invalid_objects']!.input.parse(args);
      return getInvalidObjects(input as Parameters<typeof getInvalidObjects>[0]);
    }
    case 'get_grants': {
      const input = toolSchemas['get_grants']!.input.parse(args);
      return getGrants(input as Parameters<typeof getGrants>[0]);
    }
    case 'get_db_links': {
      const input = toolSchemas['get_db_links']!.input.parse(args);
      return getDbLinks(input as Parameters<typeof getDbLinks>[0]);
    }
    case 'search_source': {
      const input = toolSchemas['search_source']!.input.parse(args);
      return searchSource(input as Parameters<typeof searchSource>[0]);
    }
    case 'get_compile_errors': {
      const input = toolSchemas['get_compile_errors']!.input.parse(args);
      return getCompileErrors(input as Parameters<typeof getCompileErrors>[0]);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export { closeAllPools };
