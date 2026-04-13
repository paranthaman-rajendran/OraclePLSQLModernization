import { executeQuery } from '../oracle/connection.js';
import { SQL } from '../oracle/queries.js';
import type { ListViewsInput, ListViewsOutput } from '@plsql-analyzer/shared';

interface ViewRow { SCHEMA_NAME: string; NAME: string; TEXT: string }

export async function listViews(input: ListViewsInput): Promise<ListViewsOutput> {
  const rows = await executeQuery<ViewRow>(input.connectionId, SQL.LIST_VIEWS, {
    schema: input.schema.toUpperCase(),
  });
  return { views: rows.map(r => ({ schema: r.SCHEMA_NAME, name: r.NAME, text: r.TEXT ?? '' })) };
}
