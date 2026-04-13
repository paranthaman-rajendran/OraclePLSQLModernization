import { executeQuery } from '../oracle/connection.js';
import { SQL } from '../oracle/queries.js';
import type { ListSchemasInput, ListSchemasOutput } from '@plsql-analyzer/shared';

interface SchemaRow {
  NAME: string;
  OBJECT_COUNT: number;
  CREATED_AT: string | null;
}

export async function listSchemas(input: ListSchemasInput): Promise<ListSchemasOutput> {
  const sql = input.includeSystem ? SQL.LIST_SCHEMAS_ALL : SQL.LIST_SCHEMAS_NON_SYSTEM;
  const rows = await executeQuery<SchemaRow>(input.connectionId, sql);

  return {
    schemas: rows.map(r => ({
      name: r.NAME,
      objectCount: r.OBJECT_COUNT ?? 0,
      ...(r.CREATED_AT ? { createdAt: r.CREATED_AT } : {}),
    })),
  };
}
