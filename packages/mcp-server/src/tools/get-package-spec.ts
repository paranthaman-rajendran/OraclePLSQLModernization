import { executeQuery } from '../oracle/connection.js';
import { SQL } from '../oracle/queries.js';
import type { GetPackageSpecInput, GetPackageSpecOutput } from '@plsql-analyzer/shared';

interface SourceRow { TEXT: string }

export async function getPackageSpec(input: GetPackageSpecInput): Promise<GetPackageSpecOutput> {
  const [specRows, bodyRows] = await Promise.all([
    executeQuery<SourceRow>(input.connectionId, SQL.GET_PACKAGE_SPEC, {
      schema: input.schema.toUpperCase(),
      name: input.name.toUpperCase(),
      type: 'PACKAGE',
    }),
    executeQuery<SourceRow>(input.connectionId, SQL.GET_PACKAGE_SPEC, {
      schema: input.schema.toUpperCase(),
      name: input.name.toUpperCase(),
      type: 'PACKAGE BODY',
    }),
  ]);

  const spec = specRows.map(r => r.TEXT).join('');
  const body = bodyRows.length > 0 ? bodyRows.map(r => r.TEXT).join('') : undefined;

  return { schema: input.schema, name: input.name, spec, ...(body ? { body } : {}) };
}
