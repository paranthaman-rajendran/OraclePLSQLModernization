import { executeQuery } from '../oracle/connection.js';
import { SQL } from '../oracle/queries.js';
import type { GetCompileErrorsInput, GetCompileErrorsOutput } from '@plsql-analyzer/shared';

interface ErrorRow {
  LINE: number; COL: number;
  SEVERITY: string; MESSAGE: string; ATTRIBUTE: string;
}

export async function getCompileErrors(input: GetCompileErrorsInput): Promise<GetCompileErrorsOutput> {
  const rows = await executeQuery<ErrorRow>(input.connectionId, SQL.GET_COMPILE_ERRORS, {
    schema: input.schema.toUpperCase(),
    name: input.name.toUpperCase(),
    type: input.type,
  });

  return {
    errors: rows.map(r => ({
      line: r.LINE ?? 0,
      column: r.COL ?? 1,
      severity: (r.SEVERITY === 'WARNING' ? 'WARNING' : 'ERROR') as 'ERROR' | 'WARNING',
      message: r.MESSAGE ?? '',
      attribute: r.ATTRIBUTE ?? '',
    })),
  };
}
