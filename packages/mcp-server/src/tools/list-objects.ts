import { executeQuery } from '../oracle/connection.js';
import { SQL } from '../oracle/queries.js';
import type { ListObjectsInput, ListObjectsOutput, ObjectSummarySchema } from '@plsql-analyzer/shared';
import type { z } from 'zod';

type ObjectSummary = z.infer<typeof ObjectSummarySchema>;

interface ObjectRow {
  SCHEMA_NAME: string;
  NAME: string;
  TYPE: string;
  STATUS: string;
  LAST_DDL_TIME: string;
  SOURCE_LINES: number;
}

export async function listObjects(input: ListObjectsInput): Promise<ListObjectsOutput> {
  const sql = input.objectType ? SQL.LIST_OBJECTS_BY_TYPE : SQL.LIST_OBJECTS_ALL;
  const binds: Record<string, unknown> = { schema: input.schema.toUpperCase() };
  if (input.objectType) binds['object_type'] = input.objectType;

  const rows = await executeQuery<ObjectRow>(input.connectionId, sql, binds);

  const objects: ObjectSummary[] = rows.map(r => ({
    schema: r.SCHEMA_NAME,
    name: r.NAME,
    type: r.TYPE as ObjectSummary['type'],
    status: (r.STATUS ?? 'VALID') as ObjectSummary['status'],
    lastDdlTime: r.LAST_DDL_TIME ?? new Date().toISOString(),
    sourceLines: r.SOURCE_LINES ?? 0,
  }));

  return { objects };
}
