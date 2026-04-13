/**
 * Zod schemas for all 14 MCP tool inputs and outputs.
 * A single schema declaration produces both runtime validation (MCP boundary)
 * and TypeScript types via z.infer<>.
 *
 * Used by:
 * - mcp-server: validates tool arguments before executing Oracle queries
 * - vscode-extension McpClient: validates tool responses before returning typed objects
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

export const SchemaNameSchema = z.string().min(1).max(128);
export const ObjectNameSchema = z.string().min(1).max(128);

export const ObjectTypeSchema = z.enum([
  'PACKAGE',
  'PACKAGE BODY',
  'PROCEDURE',
  'FUNCTION',
  'TRIGGER',
  'TYPE',
  'TYPE BODY',
  'VIEW',
  'SEQUENCE',
  'SYNONYM',
]);

export const ObjectStatusSchema = z.enum(['VALID', 'INVALID', 'COMPILED WITH WARNINGS']);

// ---------------------------------------------------------------------------
// FR-1.1  list_schemas
// ---------------------------------------------------------------------------

export const ListSchemasInputSchema = z.object({
  connectionId: z.string().min(1),
  includeSystem: z.boolean().default(false),
});
export type ListSchemasInput = z.infer<typeof ListSchemasInputSchema>;

export const SchemaInfoSchema = z.object({
  name: z.string(),
  objectCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime().optional(),
});
export const ListSchemasOutputSchema = z.object({
  schemas: z.array(SchemaInfoSchema),
});
export type ListSchemasOutput = z.infer<typeof ListSchemasOutputSchema>;

// ---------------------------------------------------------------------------
// FR-1.2  list_objects
// ---------------------------------------------------------------------------

export const ListObjectsInputSchema = z.object({
  connectionId: z.string().min(1),
  schema: SchemaNameSchema,
  objectType: ObjectTypeSchema.optional(),
});
export type ListObjectsInput = z.infer<typeof ListObjectsInputSchema>;

export const ObjectSummarySchema = z.object({
  schema: z.string(),
  name: z.string(),
  type: ObjectTypeSchema,
  status: ObjectStatusSchema,
  lastDdlTime: z.string().datetime(),
  sourceLines: z.number().int().nonnegative(),
});
export const ListObjectsOutputSchema = z.object({
  objects: z.array(ObjectSummarySchema),
});
export type ListObjectsOutput = z.infer<typeof ListObjectsOutputSchema>;

// ---------------------------------------------------------------------------
// FR-1.3  get_object_source
// ---------------------------------------------------------------------------

export const GetObjectSourceInputSchema = z.object({
  connectionId: z.string().min(1),
  schema: SchemaNameSchema,
  name: ObjectNameSchema,
  type: ObjectTypeSchema,
});
export type GetObjectSourceInput = z.infer<typeof GetObjectSourceInputSchema>;

export const GetObjectSourceOutputSchema = z.object({
  schema: z.string(),
  name: z.string(),
  type: ObjectTypeSchema,
  source: z.string(),
  lineCount: z.number().int().positive(),
});
export type GetObjectSourceOutput = z.infer<typeof GetObjectSourceOutputSchema>;

// ---------------------------------------------------------------------------
// FR-1.4  get_package_spec
// ---------------------------------------------------------------------------

export const GetPackageSpecInputSchema = z.object({
  connectionId: z.string().min(1),
  schema: SchemaNameSchema,
  name: ObjectNameSchema,
});
export type GetPackageSpecInput = z.infer<typeof GetPackageSpecInputSchema>;

export const GetPackageSpecOutputSchema = z.object({
  schema: z.string(),
  name: z.string(),
  spec: z.string(),
  body: z.string().optional(),
});
export type GetPackageSpecOutput = z.infer<typeof GetPackageSpecOutputSchema>;

// ---------------------------------------------------------------------------
// FR-1.5  get_object_dependencies
// ---------------------------------------------------------------------------

export const GetObjectDependenciesInputSchema = z.object({
  connectionId: z.string().min(1),
  schema: SchemaNameSchema,
  name: ObjectNameSchema,
  type: ObjectTypeSchema,
  transitive: z.boolean().default(false),
});
export type GetObjectDependenciesInput = z.infer<typeof GetObjectDependenciesInputSchema>;

export const DependencyEdgeSchema = z.object({
  fromSchema: z.string(),
  fromName: z.string(),
  fromType: ObjectTypeSchema,
  toSchema: z.string(),
  toName: z.string(),
  toType: ObjectTypeSchema,
  dbLink: z.string().optional(),
});
export const GetObjectDependenciesOutputSchema = z.object({
  edges: z.array(DependencyEdgeSchema),
  hasCircularDependency: z.boolean(),
});
export type GetObjectDependenciesOutput = z.infer<typeof GetObjectDependenciesOutputSchema>;

// ---------------------------------------------------------------------------
// FR-1.6  get_object_references
// ---------------------------------------------------------------------------

export const GetObjectReferencesInputSchema = z.object({
  connectionId: z.string().min(1),
  schema: SchemaNameSchema,
  name: ObjectNameSchema,
  type: ObjectTypeSchema,
});
export type GetObjectReferencesInput = z.infer<typeof GetObjectReferencesInputSchema>;

export const GetObjectReferencesOutputSchema = z.object({
  referencedBy: z.array(DependencyEdgeSchema),
});
export type GetObjectReferencesOutput = z.infer<typeof GetObjectReferencesOutputSchema>;

// ---------------------------------------------------------------------------
// FR-1.7  list_tables
// ---------------------------------------------------------------------------

export const ListTablesInputSchema = z.object({
  connectionId: z.string().min(1),
  schema: SchemaNameSchema,
});
export type ListTablesInput = z.infer<typeof ListTablesInputSchema>;

export const TableSummarySchema = z.object({
  schema: z.string(),
  name: z.string(),
  columnCount: z.number().int().nonnegative(),
  rowCount: z.number().int().nonnegative().optional(),
  comments: z.string().optional(),
});
export const ListTablesOutputSchema = z.object({
  tables: z.array(TableSummarySchema),
});
export type ListTablesOutput = z.infer<typeof ListTablesOutputSchema>;

// ---------------------------------------------------------------------------
// FR-1.8  get_table_detail
// ---------------------------------------------------------------------------

export const GetTableDetailInputSchema = z.object({
  connectionId: z.string().min(1),
  schema: SchemaNameSchema,
  name: ObjectNameSchema,
});
export type GetTableDetailInput = z.infer<typeof GetTableDetailInputSchema>;

export const ColumnDefSchema = z.object({
  name: z.string(),
  dataType: z.string(),
  nullable: z.boolean(),
  defaultValue: z.string().optional(),
  comments: z.string().optional(),
});
export const ForeignKeySchema = z.object({
  name: z.string(),
  columns: z.array(z.string()),
  referencedTable: z.string(),
  referencedColumns: z.array(z.string()),
  onDelete: z.enum(['CASCADE', 'SET NULL', 'NO ACTION']).optional(),
});
export const IndexDefSchema = z.object({
  name: z.string(),
  columns: z.array(z.string()),
  unique: z.boolean(),
  type: z.enum(['NORMAL', 'BITMAP', 'FUNCTION-BASED']),
});
export const GetTableDetailOutputSchema = z.object({
  schema: z.string(),
  name: z.string(),
  columns: z.array(ColumnDefSchema),
  primaryKeyColumns: z.array(z.string()),
  foreignKeys: z.array(ForeignKeySchema),
  indexes: z.array(IndexDefSchema),
  comments: z.string().optional(),
});
export type GetTableDetailOutput = z.infer<typeof GetTableDetailOutputSchema>;

// ---------------------------------------------------------------------------
// FR-1.9  list_views
// ---------------------------------------------------------------------------

export const ListViewsInputSchema = z.object({
  connectionId: z.string().min(1),
  schema: SchemaNameSchema,
});
export type ListViewsInput = z.infer<typeof ListViewsInputSchema>;

export const ViewSummarySchema = z.object({
  schema: z.string(),
  name: z.string(),
  text: z.string(),
});
export const ListViewsOutputSchema = z.object({
  views: z.array(ViewSummarySchema),
});
export type ListViewsOutput = z.infer<typeof ListViewsOutputSchema>;

// ---------------------------------------------------------------------------
// FR-1.10  get_invalid_objects
// ---------------------------------------------------------------------------

export const GetInvalidObjectsInputSchema = z.object({
  connectionId: z.string().min(1),
  schema: SchemaNameSchema.optional(),
});
export type GetInvalidObjectsInput = z.infer<typeof GetInvalidObjectsInputSchema>;

export const GetInvalidObjectsOutputSchema = z.object({
  objects: z.array(ObjectSummarySchema),
});
export type GetInvalidObjectsOutput = z.infer<typeof GetInvalidObjectsOutputSchema>;

// ---------------------------------------------------------------------------
// FR-1.11  get_grants
// ---------------------------------------------------------------------------

export const GetGrantsInputSchema = z.object({
  connectionId: z.string().min(1),
  schema: SchemaNameSchema,
});
export type GetGrantsInput = z.infer<typeof GetGrantsInputSchema>;

export const GrantRecordSchema = z.object({
  grantee: z.string(),
  owner: z.string(),
  objectName: z.string(),
  privilege: z.string(),
  grantable: z.boolean(),
  hierarchy: z.boolean(),
});
export const SysPrivRecordSchema = z.object({
  grantee: z.string(),
  privilege: z.string(),
  adminOption: z.boolean(),
});
export const GetGrantsOutputSchema = z.object({
  objectGrants: z.array(GrantRecordSchema),
  systemPrivileges: z.array(SysPrivRecordSchema),
});
export type GetGrantsOutput = z.infer<typeof GetGrantsOutputSchema>;

// ---------------------------------------------------------------------------
// FR-1.12  get_db_links
// ---------------------------------------------------------------------------

export const GetDbLinksInputSchema = z.object({
  connectionId: z.string().min(1),
  schema: SchemaNameSchema.optional(),
});
export type GetDbLinksInput = z.infer<typeof GetDbLinksInputSchema>;

export const DbLinkSchema = z.object({
  owner: z.string(),
  name: z.string(),
  host: z.string(),
  username: z.string(),
});
export const GetDbLinksOutputSchema = z.object({
  dbLinks: z.array(DbLinkSchema),
});
export type GetDbLinksOutput = z.infer<typeof GetDbLinksOutputSchema>;

// ---------------------------------------------------------------------------
// FR-1.13  search_source
// ---------------------------------------------------------------------------

export const SearchSourceInputSchema = z.object({
  connectionId: z.string().min(1),
  schema: SchemaNameSchema.optional(),
  query: z.string().min(1).max(500),
  objectType: ObjectTypeSchema.optional(),
  maxResults: z.number().int().min(1).max(500).default(50),
});
export type SearchSourceInput = z.infer<typeof SearchSourceInputSchema>;

export const SearchHitSchema = z.object({
  schema: z.string(),
  name: z.string(),
  type: ObjectTypeSchema,
  line: z.number().int().positive(),
  text: z.string(),
});
export const SearchSourceOutputSchema = z.object({
  hits: z.array(SearchHitSchema),
  totalCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
export type SearchSourceOutput = z.infer<typeof SearchSourceOutputSchema>;

// ---------------------------------------------------------------------------
// FR-1.14  get_compile_errors
// ---------------------------------------------------------------------------

export const GetCompileErrorsInputSchema = z.object({
  connectionId: z.string().min(1),
  schema: SchemaNameSchema,
  name: ObjectNameSchema,
  type: ObjectTypeSchema,
});
export type GetCompileErrorsInput = z.infer<typeof GetCompileErrorsInputSchema>;

export const CompileErrorSchema = z.object({
  line: z.number().int().nonnegative(),
  column: z.number().int().nonnegative(),
  severity: z.enum(['ERROR', 'WARNING']),
  message: z.string(),
  attribute: z.string(),
});
export const GetCompileErrorsOutputSchema = z.object({
  errors: z.array(CompileErrorSchema),
});
export type GetCompileErrorsOutput = z.infer<typeof GetCompileErrorsOutputSchema>;

// ---------------------------------------------------------------------------
// Tool name → schema mapping (used by server dispatcher and client wrapper)
// ---------------------------------------------------------------------------

export const MCP_TOOL_SCHEMAS = {
  list_schemas: { input: ListSchemasInputSchema, output: ListSchemasOutputSchema },
  list_objects: { input: ListObjectsInputSchema, output: ListObjectsOutputSchema },
  get_object_source: { input: GetObjectSourceInputSchema, output: GetObjectSourceOutputSchema },
  get_package_spec: { input: GetPackageSpecInputSchema, output: GetPackageSpecOutputSchema },
  get_object_dependencies: { input: GetObjectDependenciesInputSchema, output: GetObjectDependenciesOutputSchema },
  get_object_references: { input: GetObjectReferencesInputSchema, output: GetObjectReferencesOutputSchema },
  list_tables: { input: ListTablesInputSchema, output: ListTablesOutputSchema },
  get_table_detail: { input: GetTableDetailInputSchema, output: GetTableDetailOutputSchema },
  list_views: { input: ListViewsInputSchema, output: ListViewsOutputSchema },
  get_invalid_objects: { input: GetInvalidObjectsInputSchema, output: GetInvalidObjectsOutputSchema },
  get_grants: { input: GetGrantsInputSchema, output: GetGrantsOutputSchema },
  get_db_links: { input: GetDbLinksInputSchema, output: GetDbLinksOutputSchema },
  search_source: { input: SearchSourceInputSchema, output: SearchSourceOutputSchema },
  get_compile_errors: { input: GetCompileErrorsInputSchema, output: GetCompileErrorsOutputSchema },
} as const;

export type McpToolName = keyof typeof MCP_TOOL_SCHEMAS;
