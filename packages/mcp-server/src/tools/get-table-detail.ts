import { executeQuery } from '../oracle/connection.js';
import { SQL } from '../oracle/queries.js';
import type {
  GetTableDetailInput,
  GetTableDetailOutput,
  ColumnDefSchema,
  ForeignKeySchema,
  IndexDefSchema,
} from '@plsql-analyzer/shared';
import type { z } from 'zod';

type ColumnDef = z.infer<typeof ColumnDefSchema>;
type ForeignKey = z.infer<typeof ForeignKeySchema>;
type IndexDef = z.infer<typeof IndexDefSchema>;

interface ColRow { NAME: string; DATA_TYPE: string; NULLABLE: number; DEFAULT_VALUE: string | null }
interface ColCommentRow { NAME: string; COMMENTS: string | null }
interface ConstraintRow {
  NAME: string; CONSTRAINT_TYPE: string; REF_SCHEMA: string | null;
  R_CONSTRAINT_NAME: string | null; DELETE_RULE: string | null;
  COLUMN_NAME: string; POSITION: number;
}
interface IndexRow { NAME: string; UNIQUENESS: string; TYPE: string; COLUMN_NAME: string; COLUMN_POSITION: number }

export async function getTableDetail(input: GetTableDetailInput): Promise<GetTableDetailOutput> {
  const binds = { schema: input.schema.toUpperCase(), name: input.name.toUpperCase() };

  const [colRows, colComments, constraintRows, indexRows] = await Promise.all([
    executeQuery<ColRow>(input.connectionId, SQL.GET_TABLE_COLUMNS, binds),
    executeQuery<ColCommentRow>(input.connectionId, SQL.GET_TABLE_COMMENTS, binds),
    executeQuery<ConstraintRow>(input.connectionId, SQL.GET_TABLE_CONSTRAINTS, binds),
    executeQuery<IndexRow>(input.connectionId, SQL.GET_TABLE_INDEXES, binds),
  ]);

  // Build comment lookup
  const commentMap = new Map(colComments.map(c => [c.NAME, c.COMMENTS ?? '']));

  const columns: ColumnDef[] = colRows.map(r => ({
    name: r.NAME,
    dataType: r.DATA_TYPE,
    nullable: r.NULLABLE === 1,
    ...(r.DEFAULT_VALUE ? { defaultValue: r.DEFAULT_VALUE.trim() } : {}),
    ...(commentMap.get(r.NAME) ? { comments: commentMap.get(r.NAME) } : {}),
  }));

  // Extract primary key columns
  const pkColumns = constraintRows
    .filter(r => r.CONSTRAINT_TYPE === 'P')
    .sort((a, b) => a.POSITION - b.POSITION)
    .map(r => r.COLUMN_NAME);

  // Build foreign keys
  const fkMap = new Map<string, ForeignKey & { columns: string[] }>();
  for (const r of constraintRows.filter(c => c.CONSTRAINT_TYPE === 'R')) {
    if (!fkMap.has(r.NAME)) {
      fkMap.set(r.NAME, {
        name: r.NAME,
        columns: [],
        referencedTable: r.R_CONSTRAINT_NAME ?? '',
        referencedColumns: [],
        ...(r.DELETE_RULE && r.DELETE_RULE !== 'NO ACTION'
          ? { onDelete: r.DELETE_RULE as ForeignKey['onDelete'] }
          : {}),
      });
    }
    fkMap.get(r.NAME)!.columns.push(r.COLUMN_NAME);
  }
  const foreignKeys: ForeignKey[] = [...fkMap.values()];

  // Build indexes
  const idxMap = new Map<string, { name: string; cols: string[]; unique: boolean; type: string }>();
  for (const r of indexRows) {
    if (!idxMap.has(r.NAME)) {
      idxMap.set(r.NAME, { name: r.NAME, cols: [], unique: r.UNIQUENESS === 'UNIQUE', type: r.TYPE });
    }
    idxMap.get(r.NAME)!.cols.push(r.COLUMN_NAME);
  }
  const indexes: IndexDef[] = [...idxMap.values()].map(i => ({
    name: i.name,
    columns: i.cols,
    unique: i.unique,
    type: i.type as IndexDef['type'],
  }));

  return {
    schema: input.schema,
    name: input.name,
    columns,
    primaryKeyColumns: pkColumns,
    foreignKeys,
    indexes,
  };
}
