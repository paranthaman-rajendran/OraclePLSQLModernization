import { executeQuery } from '../oracle/connection.js';
import { SQL } from '../oracle/queries.js';
import type { GetObjectSourceInput, GetObjectSourceOutput } from '@plsql-analyzer/shared';

interface SourceRow { TEXT: string }

export async function getObjectSource(input: GetObjectSourceInput): Promise<GetObjectSourceOutput> {
  const rows = await executeQuery<SourceRow>(input.connectionId, SQL.GET_OBJECT_SOURCE, {
    schema: input.schema.toUpperCase(),
    name: input.name.toUpperCase(),
    type: input.type,
  });

  const source = rows.map(r => r.TEXT).join('');

  return {
    schema: input.schema,
    name: input.name,
    type: input.type,
    source,
    lineCount: rows.length,
  };
}
