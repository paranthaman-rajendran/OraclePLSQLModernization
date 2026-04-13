/**
 * Core domain interfaces — finalized before any other package is implemented.
 * Both mcp-server and vscode-extension import exclusively from here.
 * No runtime dependencies — compile-time types only in this file.
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export type PLSQLObjectType =
  | 'PACKAGE'
  | 'PACKAGE BODY'
  | 'PROCEDURE'
  | 'FUNCTION'
  | 'TRIGGER'
  | 'TYPE'
  | 'TYPE BODY'
  | 'VIEW'
  | 'SEQUENCE'
  | 'SYNONYM';

export type ObjectStatus = 'VALID' | 'INVALID' | 'COMPILED WITH WARNINGS';

export type FindingCategory = 'QUALITY' | 'SECURITY' | 'PERFORMANCE' | 'MAINTAINABILITY';

export type FindingSeverity = 'ERROR' | 'WARNING' | 'INFO' | 'HINT';

export type EdgeType = 'CALLS' | 'REFERENCES' | 'GRANTS' | 'DB_LINK' | 'BODY_OF';

// ---------------------------------------------------------------------------
// Source location
// ---------------------------------------------------------------------------

export interface SourceLocation {
  readonly line: number;
  readonly column: number;
  readonly endLine?: number;
  readonly endColumn?: number;
}

// ---------------------------------------------------------------------------
// Compilation errors (from ALL_ERRORS)
// ---------------------------------------------------------------------------

export interface CompilationError {
  readonly line: number;
  readonly column: number;
  readonly severity: 'ERROR' | 'WARNING';
  readonly message: string;
  readonly attribute: string;
}

// ---------------------------------------------------------------------------
// Core object model
// ---------------------------------------------------------------------------

/**
 * Represents one named PL/SQL object in the database.
 * `source` is populated on-demand and must never be persisted or logged.
 */
export interface PLSQLObject {
  /** Stable key: `${connectionId}:${schema}.${name}:${type}` */
  readonly id: string;
  readonly connectionId: string;
  readonly schema: string;
  readonly name: string;
  readonly type: PLSQLObjectType;
  readonly status: ObjectStatus;
  readonly lastDdlTime: Date;
  readonly sourceLines: number;
  /** In-memory only during analysis. Never store, log, or serialize. */
  source?: string;
  readonly compilationErrors: CompilationError[];
}

// ---------------------------------------------------------------------------
// Dependency / call graph
// ---------------------------------------------------------------------------

export interface CallEdge {
  readonly fromId: string;
  readonly toId: string;
  readonly edgeType: EdgeType;
  readonly referencedViaDbLink?: string;
}

export interface CallGraph {
  readonly objectId: string;
  readonly edges: CallEdge[];
  readonly computedAt: Date;
  readonly hasCircularDependency: boolean;
}

// ---------------------------------------------------------------------------
// Table metadata (fetched via MCP, used for DML cross-reference)
// ---------------------------------------------------------------------------

export interface ColumnDef {
  readonly name: string;
  readonly dataType: string;
  readonly nullable: boolean;
  readonly defaultValue?: string;
  readonly comments?: string;
}

export interface TableDetail {
  readonly schema: string;
  readonly name: string;
  readonly columns: ColumnDef[];
  readonly primaryKeyColumns: string[];
  readonly foreignKeys: ForeignKey[];
  readonly indexes: IndexDef[];
  readonly comments?: string;
}

export interface ForeignKey {
  readonly name: string;
  readonly columns: string[];
  readonly referencedTable: string;
  readonly referencedColumns: string[];
  readonly onDelete?: 'CASCADE' | 'SET NULL' | 'NO ACTION';
}

export interface IndexDef {
  readonly name: string;
  readonly columns: string[];
  readonly unique: boolean;
  readonly type: 'NORMAL' | 'BITMAP' | 'FUNCTION-BASED';
}

// ---------------------------------------------------------------------------
// Analysis findings
// ---------------------------------------------------------------------------

/**
 * A single static analysis result.
 * `id` is a deterministic hash of (ruleId + objectId + line) so the same
 * finding compares equal across snapshots taken at different times.
 */
export interface Finding {
  /** Deterministic hash: stable across snapshots */
  readonly id: string;
  readonly objectId: string;
  readonly ruleId: string;
  readonly category: FindingCategory;
  readonly severity: FindingSeverity;
  readonly message: string;
  readonly suggestion?: string;
  readonly location: SourceLocation;
  /** CWE identifier for security findings */
  readonly cweId?: string;
  /** Estimated remediation effort in minutes */
  readonly effortMinutes?: number;
}

// ---------------------------------------------------------------------------
// Quality metrics
// ---------------------------------------------------------------------------

export interface CouplingScore {
  readonly fanIn: number;   // number of objects that call this one
  readonly fanOut: number;  // number of objects this one calls
}

export interface Metric {
  readonly objectId: string;
  readonly snapshotId: string;
  readonly computedAt: Date;
  readonly cyclomaticComplexity: number;
  readonly cognitiveComplexity: number;
  readonly linesOfCode: number;
  readonly executableLines: number;
  readonly commentRatio: number;        // 0–1
  readonly nestingDepth: number;
  readonly parameterCount: number;
  readonly coupling: CouplingScore;
  readonly duplicateBlockCount: number;
}

// ---------------------------------------------------------------------------
// Refactoring risk
// ---------------------------------------------------------------------------

export interface RefactoringRisk {
  readonly objectId: string;
  /** 0–100 composite score */
  readonly score: number;
  readonly complexityFactor: number;
  readonly couplingFactor: number;
  readonly coverageGapFactor: number;
  readonly topFindings: string[];  // finding ids driving the score
}

// ---------------------------------------------------------------------------
// Snapshot (point-in-time capture for diff and history)
// ---------------------------------------------------------------------------

export interface SnapshotSummary {
  readonly errorCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
  readonly avgCyclomaticComplexity: number;
  readonly invalidObjectCount: number;
  readonly securityFindingCount: number;
  readonly totalObjects: number;
}

export interface Snapshot {
  /** UUID v4 */
  readonly id: string;
  readonly connectionId: string;
  readonly label: string;
  readonly capturedAt: Date;
  readonly objectCount: number;
  readonly findingCount: number;
  /** Phase 3: SHA of associated git commit */
  readonly gitRef?: string;
  readonly summary: SnapshotSummary;
}

// ---------------------------------------------------------------------------
// Connection profile (metadata only — no credentials)
// ---------------------------------------------------------------------------

export interface ConnectionProfile {
  /** User-visible alias, e.g. "prod-readonly" */
  readonly id: string;
  readonly label: string;
  readonly host: string;
  readonly port: number;
  readonly serviceName: string;
  readonly username: string;
  /** Which credential source resolved this connection — logged without the value */
  readonly credentialSource?: 'env' | 'dotenv' | 'wallet' | 'vault' | 'secretStorage';
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

export interface ConnectionState {
  readonly profile: ConnectionProfile;
  readonly status: ConnectionStatus;
  readonly error?: string;
  readonly connectedAt?: Date;
}

// ---------------------------------------------------------------------------
// Result type for graceful degradation
// ---------------------------------------------------------------------------

export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
