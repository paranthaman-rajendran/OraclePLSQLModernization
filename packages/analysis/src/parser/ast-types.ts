/**
 * PL/SQL Abstract Syntax Tree node types.
 * These are produced by the parser and consumed by analysis rules.
 * Designed to cover the structures needed for Phase 1 analysis without
 * requiring a full grammar — completeness is added incrementally.
 */

export type NodeKind =
  | 'Unit'
  | 'Package'
  | 'PackageBody'
  | 'Procedure'
  | 'Function'
  | 'Trigger'
  | 'TypeSpec'
  | 'TypeBody'
  | 'Parameter'
  | 'Block'
  | 'Declaration'
  | 'IfStatement'
  | 'ElsifClause'
  | 'ElseClause'
  | 'CaseStatement'
  | 'WhenClause'
  | 'LoopStatement'
  | 'WhileLoop'
  | 'ForLoop'
  | 'CursorForLoop'
  | 'ExceptionHandler'
  | 'RaiseStatement'
  | 'DynamicSql'          // EXECUTE IMMEDIATE
  | 'StaticDml'           // INSERT/UPDATE/DELETE/SELECT
  | 'ProcedureCall'
  | 'FunctionCall'
  | 'Assignment'
  | 'ReturnStatement'
  | 'NullStatement'
  | 'StringLiteral'
  | 'NumberLiteral'
  | 'Identifier'
  | 'Concatenation';

export interface Position {
  line: number;    // 1-based
  column: number;  // 1-based
}

export interface Range {
  start: Position;
  end: Position;
}

export interface AstNode {
  readonly kind: NodeKind;
  readonly range: Range;
  readonly children: AstNode[];
}

// ---------------------------------------------------------------------------
// Top-level compilation unit
// ---------------------------------------------------------------------------

export interface UnitNode extends AstNode {
  readonly kind: 'Unit';
  readonly objects: TopLevelObject[];
}

export type TopLevelObject =
  | PackageNode
  | PackageBodyNode
  | ProcedureNode
  | FunctionNode
  | TriggerNode
  | TypeSpecNode;

// ---------------------------------------------------------------------------
// Package
// ---------------------------------------------------------------------------

export interface PackageNode extends AstNode {
  readonly kind: 'Package';
  readonly schema: string;
  readonly name: string;
  readonly procedures: ProcedureNode[];
  readonly functions: FunctionNode[];
}

export interface PackageBodyNode extends AstNode {
  readonly kind: 'PackageBody';
  readonly schema: string;
  readonly name: string;
  readonly procedures: ProcedureNode[];
  readonly functions: FunctionNode[];
  readonly initBlock?: BlockNode;
}

// ---------------------------------------------------------------------------
// Procedure / Function
// ---------------------------------------------------------------------------

export interface ParameterNode extends AstNode {
  readonly kind: 'Parameter';
  readonly name: string;
  readonly direction: 'IN' | 'OUT' | 'IN OUT';
  readonly dataType: string;
  readonly hasDefault: boolean;
}

export interface ProcedureNode extends AstNode {
  readonly kind: 'Procedure';
  readonly name: string;
  readonly parameters: ParameterNode[];
  readonly body: BlockNode;
  readonly isForwardDeclaration: boolean;
}

export interface FunctionNode extends AstNode {
  readonly kind: 'Function';
  readonly name: string;
  readonly parameters: ParameterNode[];
  readonly returnType: string;
  readonly body: BlockNode;
  readonly isForwardDeclaration: boolean;
}

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

export interface TriggerNode extends AstNode {
  readonly kind: 'Trigger';
  readonly name: string;
  readonly timing: 'BEFORE' | 'AFTER' | 'INSTEAD OF';
  readonly events: string[];
  readonly tableName: string;
  readonly body: BlockNode;
}

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

export interface TypeSpecNode extends AstNode {
  readonly kind: 'TypeSpec';
  readonly name: string;
}

// ---------------------------------------------------------------------------
// Block (BEGIN...END)
// ---------------------------------------------------------------------------

export interface DeclarationNode extends AstNode {
  readonly kind: 'Declaration';
  readonly name: string;
  readonly dataType: string;
  readonly isUsed: boolean;  // set by dead-code rule
}

export interface BlockNode extends AstNode {
  readonly kind: 'Block';
  readonly declarations: DeclarationNode[];
  readonly statements: StatementNode[];
  readonly exceptionHandlers: ExceptionHandlerNode[];
  readonly maxNestingDepth: number;
}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

export type StatementNode =
  | IfStatementNode
  | CaseStatementNode
  | LoopStatementNode
  | WhileLoopNode
  | ForLoopNode
  | ExceptionHandlerNode
  | DynamicSqlNode
  | StaticDmlNode
  | ProcedureCallNode
  | AssignmentNode
  | ReturnStatementNode
  | NullStatementNode
  | RaiseStatementNode;

export interface IfStatementNode extends AstNode {
  readonly kind: 'IfStatement';
  readonly condition: string;
  readonly thenBlock: BlockNode;
  readonly elsifClauses: ElsifNode[];
  readonly elseBlock?: BlockNode;
}

export interface ElsifNode extends AstNode {
  readonly kind: 'ElsifClause';
  readonly condition: string;
  readonly block: BlockNode;
}

export interface CaseStatementNode extends AstNode {
  readonly kind: 'CaseStatement';
  readonly expression?: string;
  readonly whenClauses: WhenClauseNode[];
  readonly elseBlock?: BlockNode;
}

export interface WhenClauseNode extends AstNode {
  readonly kind: 'WhenClause';
  readonly value: string;
  readonly block: BlockNode;
}

export interface LoopStatementNode extends AstNode {
  readonly kind: 'LoopStatement';
  readonly body: BlockNode;
}

export interface WhileLoopNode extends AstNode {
  readonly kind: 'WhileLoop';
  readonly condition: string;
  readonly body: BlockNode;
}

export interface ForLoopNode extends AstNode {
  readonly kind: 'ForLoop';
  readonly variable: string;
  readonly lower: string;
  readonly upper: string;
  readonly body: BlockNode;
}

export interface ExceptionHandlerNode extends AstNode {
  readonly kind: 'ExceptionHandler';
  /** 'OTHERS' or specific exception name(s) */
  readonly exceptionNames: string[];
  readonly body: BlockNode;
  /** True when the handler only contains NULL */
  readonly isNullHandler: boolean;
  /** True when WHEN OTHERS with no RAISE or RAISE_APPLICATION_ERROR */
  readonly suppressesExceptions: boolean;
}

export interface DynamicSqlNode extends AstNode {
  readonly kind: 'DynamicSql';
  readonly sqlExpression: string;
  /** True when the SQL string is built via concatenation (potential injection) */
  readonly hasConcatenation: boolean;
  /** True when bind variables (:x) are used */
  readonly hasBindVariables: boolean;
}

export interface StaticDmlNode extends AstNode {
  readonly kind: 'StaticDml';
  readonly dmlType: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'MERGE';
  readonly targetTable?: string;
}

export interface ProcedureCallNode extends AstNode {
  readonly kind: 'ProcedureCall';
  readonly name: string;
  readonly schemaQualified?: string;
}

export interface AssignmentNode extends AstNode {
  readonly kind: 'Assignment';
  readonly target: string;
  readonly value: string;
  /** True if the value contains a string literal matching credential patterns */
  readonly mayContainCredential: boolean;
}

export interface ReturnStatementNode extends AstNode {
  readonly kind: 'ReturnStatement';
  readonly expression?: string;
}

export interface NullStatementNode extends AstNode {
  readonly kind: 'NullStatement';
}

export interface RaiseStatementNode extends AstNode {
  readonly kind: 'RaiseStatement';
  readonly exceptionName?: string;
}

// ---------------------------------------------------------------------------
// Metrics computed directly during parsing
// ---------------------------------------------------------------------------

export interface ParsedObjectMetrics {
  readonly linesOfCode: number;
  readonly executableLines: number;
  readonly commentLines: number;
  readonly blankLines: number;
  readonly maxNestingDepth: number;
  readonly cyclomaticComplexity: number;
  readonly procedureCalls: ProcedureCallNode[];
  readonly dynamicSqlNodes: DynamicSqlNode[];
  readonly exceptionHandlers: ExceptionHandlerNode[];
  readonly stringLiterals: Array<{ value: string; range: Range }>;
}

export interface ParsedObject {
  readonly schema: string;
  readonly name: string;
  readonly type: string;
  readonly range: Range;
  readonly parameters: ParameterNode[];
  readonly returnType?: string;
  readonly node: TopLevelObject;
  readonly metrics: ParsedObjectMetrics;
}
