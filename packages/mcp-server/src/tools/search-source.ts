import { executeQuery } from '../oracle/connection.js';
import { SQL } from '../oracle/queries.js';
import type { SearchSourceInput, SearchSourceOutput, SearchHitSchema } from '@plsql-analyzer/shared';
import type { z } from 'zod';

type SearchHit = z.infer<typeof SearchHitSchema>;

interface HitRow { SCHEMA_NAME: string; NAME: string; TYPE: string; LINE: number; TEXT: string }
interface CountRow { CNT: number }

export async function searchSource(input: SearchSourceInput): Promise<SearchSourceOutput> {
  // Convert query to Oracle LIKE pattern
  const likeQuery = `%${input.query}%`;
  const maxResults = input.maxResults ?? 50;

  const binds: Record<string, unknown> = { query: likeQuery, max_results: maxResults };
  if (input.schema) binds['schema'] = input.schema.toUpperCase();

  const sql = input.schema ? SQL.SEARCH_SOURCE : SQL.SEARCH_SOURCE_ALL_SCHEMAS;
  const countSql = input.schema ? SQL.COUNT_SEARCH_SOURCE : undefined;

  const [hitRows, countRows] = await Promise.all([
    executeQuery<HitRow>(input.connectionId, sql, binds),
    countSql
      ? executeQuery<CountRow>(input.connectionId, countSql, { schema: binds['schema'], query: likeQuery })
      : Promise.resolve([] as CountRow[]),
  ]);

  const hits: SearchHit[] = hitRows.map(r => ({
    schema: r.SCHEMA_NAME,
    name: r.NAME,
    type: r.TYPE as SearchHit['type'],
    line: r.LINE,
    text: (r.TEXT ?? '').trimEnd(),
  }));

  const totalCount = countRows[0]?.CNT ?? hits.length;

  return {
    hits,
    totalCount,
    truncated: hits.length >= maxResults && totalCount > maxResults,
  };
}
