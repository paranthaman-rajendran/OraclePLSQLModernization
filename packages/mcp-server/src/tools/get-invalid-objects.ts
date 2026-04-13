import { executeQuery } from '../oracle/connection.js';
import { SQL } from '../oracle/queries.js';
import type { GetInvalidObjectsInput, GetInvalidObjectsOutput, ObjectSummarySchema } from '@plsql-analyzer/shared';
import type { z } from 'zod';

type ObjectSummary = z.infer<typeof ObjectSummarySchema>;

interface ObjectRow {
  SCHEMA_NAME: string; NAME: string; TYPE: string;
  STATUS: string; LAST_DDL_TIME: string; SOURCE_LINES: number;
}

export async function getInvalidObjects(input: GetInvalidObjectsInput): Promise<GetInvalidObjectsOutput> {
  const sql = input.schema ? SQL.GET_INVALID_OBJECTS_BY_SCHEMA : SQL.GET_INVALID_OBJECTS_ALL;
  const binds = input.schema ? { schema: input.schema.toUpperCase() } : {};
  const rows = await executeQuery<ObjectRow>(input.connectionId, sql, binds);

  const objects: ObjectSummary[] = rows.map(r => ({
    schema: r.SCHEMA_NAME,
    name: r.NAME,
    type: r.TYPE as ObjectSummary['type'],
    status: (r.STATUS ?? 'INVALID') as ObjectSummary['status'],
    lastDdlTime: r.LAST_DDL_TIME ?? new Date().toISOString(),
    sourceLines: r.SOURCE_LINES ?? 0,
  }));

  return { objects };
}
