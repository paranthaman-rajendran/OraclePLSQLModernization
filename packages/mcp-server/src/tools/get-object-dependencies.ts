import { executeQuery } from '../oracle/connection.js';
import { SQL } from '../oracle/queries.js';
import type {
  GetObjectDependenciesInput,
  GetObjectDependenciesOutput,
  DependencyEdgeSchema,
} from '@plsql-analyzer/shared';
import type { z } from 'zod';

type DependencyEdge = z.infer<typeof DependencyEdgeSchema>;

interface DepRow {
  FROM_SCHEMA: string; FROM_NAME: string; FROM_TYPE: string;
  TO_SCHEMA: string; TO_NAME: string; TO_TYPE: string;
  DB_LINK: string | null;
}

export async function getObjectDependencies(
  input: GetObjectDependenciesInput,
): Promise<GetObjectDependenciesOutput> {
  const sql = input.transitive
    ? SQL.GET_DEPENDENCIES_TRANSITIVE
    : SQL.GET_DEPENDENCIES_DIRECT;

  const rows = await executeQuery<DepRow>(input.connectionId, sql, {
    schema: input.schema.toUpperCase(),
    name: input.name.toUpperCase(),
    type: input.type,
  });

  const edges: DependencyEdge[] = rows.map(r => ({
    fromSchema: r.FROM_SCHEMA,
    fromName: r.FROM_NAME,
    fromType: r.FROM_TYPE as DependencyEdge['fromType'],
    toSchema: r.TO_SCHEMA,
    toName: r.TO_NAME,
    toType: r.TO_TYPE as DependencyEdge['toType'],
    ...(r.DB_LINK ? { dbLink: r.DB_LINK } : {}),
  }));

  // Detect circular dependencies: check if the target object appears as a dependency
  // of one of its own dependencies
  const hasCircularDependency = detectCircular(edges, input.schema, input.name, input.type);

  return { edges, hasCircularDependency };
}

function detectCircular(
  edges: DependencyEdge[],
  fromSchema: string,
  fromName: string,
  fromType: string,
): boolean {
  return edges.some(
    e =>
      e.toSchema.toUpperCase() === fromSchema.toUpperCase() &&
      e.toName.toUpperCase() === fromName.toUpperCase() &&
      e.toType.toUpperCase() === fromType.toUpperCase(),
  );
}
