import { executeQuery } from '../oracle/connection.js';
import { SQL } from '../oracle/queries.js';
import type {
  GetObjectReferencesInput,
  GetObjectReferencesOutput,
  DependencyEdgeSchema,
} from '@plsql-analyzer/shared';
import type { z } from 'zod';

type DependencyEdge = z.infer<typeof DependencyEdgeSchema>;

interface DepRow {
  FROM_SCHEMA: string; FROM_NAME: string; FROM_TYPE: string;
  TO_SCHEMA: string; TO_NAME: string; TO_TYPE: string;
  DB_LINK: string | null;
}

export async function getObjectReferences(
  input: GetObjectReferencesInput,
): Promise<GetObjectReferencesOutput> {
  const rows = await executeQuery<DepRow>(input.connectionId, SQL.GET_REFERENCES, {
    schema: input.schema.toUpperCase(),
    name: input.name.toUpperCase(),
    type: input.type,
  });

  const referencedBy: DependencyEdge[] = rows.map(r => ({
    fromSchema: r.FROM_SCHEMA,
    fromName: r.FROM_NAME,
    fromType: r.FROM_TYPE as DependencyEdge['fromType'],
    toSchema: r.TO_SCHEMA,
    toName: r.TO_NAME,
    toType: r.TO_TYPE as DependencyEdge['toType'],
    ...(r.DB_LINK ? { dbLink: r.DB_LINK } : {}),
  }));

  return { referencedBy };
}
