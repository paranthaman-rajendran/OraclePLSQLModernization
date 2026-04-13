import { executeQuery } from '../oracle/connection.js';
import { SQL } from '../oracle/queries.js';
import type { GetDbLinksInput, GetDbLinksOutput } from '@plsql-analyzer/shared';

interface DbLinkRow { OWNER: string; NAME: string; HOST: string; USERNAME: string }

export async function getDbLinks(input: GetDbLinksInput): Promise<GetDbLinksOutput> {
  const sql = input.schema ? SQL.GET_DB_LINKS : SQL.GET_DB_LINKS_ALL;
  const binds = input.schema ? { schema: input.schema.toUpperCase() } : {};
  const rows = await executeQuery<DbLinkRow>(input.connectionId, sql, binds);

  return {
    dbLinks: rows.map(r => ({
      owner: r.OWNER,
      name: r.NAME,
      host: r.HOST ?? '',
      username: r.USERNAME ?? '',
    })),
  };
}
