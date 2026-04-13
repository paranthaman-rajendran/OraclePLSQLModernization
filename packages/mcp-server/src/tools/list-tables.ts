import { executeQuery } from '../oracle/connection.js';
import { SQL } from '../oracle/queries.js';
import type { ListTablesInput, ListTablesOutput } from '@plsql-analyzer/shared';

interface TableRow {
  SCHEMA_NAME: string;
  NAME: string;
  COLUMN_COUNT: number;
  COMMENTS: string | null;
}

export async function listTables(input: ListTablesInput): Promise<ListTablesOutput> {
  const rows = await executeQuery<TableRow>(input.connectionId, SQL.LIST_TABLES, {
    schema: input.schema.toUpperCase(),
  });

  return {
    tables: rows.map(r => ({
      schema: r.SCHEMA_NAME,
      name: r.NAME,
      columnCount: r.COLUMN_COUNT ?? 0,
      ...(r.COMMENTS ? { comments: r.COMMENTS } : {}),
    })),
  };
}
