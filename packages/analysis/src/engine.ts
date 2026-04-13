/**
 * Analysis Engine — portable, vscode-free implementation.
 *
 * Orchestrates: fetch → parse → rules → metrics → coupling
 *
 * All vscode-specific concerns (logger impl, rule config from settings)
 * are injected by callers:
 *   - `log` parameter (defaults to no-op)
 *   - `config` parameter (defaults to DEFAULT_RULE_CONFIG)
 */

import type { Finding, Metric, PLSQLObject } from '@plsql-analyzer/shared';
import { v4 as uuidv4 } from 'uuid';
import { parsePlsql } from './parser/plsql-parser.js';
import { DEFAULT_RULE_CONFIG, type RuleConfig } from './rules/rule-registry.js';
import { cyclomaticComplexityRule } from './rules/quality/cyclomatic-complexity.js';
import { nestingDepthRule } from './rules/quality/nesting-depth.js';
import { parameterCountRule } from './rules/quality/parameter-count.js';
import { routineLengthRule } from './rules/quality/routine-length.js';
import { commentRatioRule } from './rules/quality/comment-ratio.js';
import { sqlInjectionRule } from './rules/security/sql-injection.js';
import { hardcodedCredentialsRule } from './rules/security/hardcoded-credentials.js';
import { exceptionSuppressionRule } from './rules/security/exception-suppression.js';
import { analyzeGrants } from './rules/security/excessive-grants.js';
import { noopLogger, type Logger } from './logger.js';
import type { ParsedObject } from './parser/ast-types.js';

// ---------------------------------------------------------------------------
// Minimal client interface (implemented by McpClient in the extension
// and by CliMcpClient in the CLI package)
// ---------------------------------------------------------------------------

export interface AnalysisClient {
  listObjects(input: { connectionId: string; schema: string }): Promise<{
    objects: Array<{ name: string; type: string }>;
  }>;

  getObjectSource(input: {
    connectionId: string;
    schema: string;
    name: string;
    type: string;
  }): Promise<{ source: string; lineCount: number }>;

  getCompileErrors(input: {
    connectionId: string;
    schema: string;
    name: string;
    type: string;
  }): Promise<{
    errors: Array<{ line: number; column: number; severity: 'ERROR' | 'WARNING'; message: string; attribute: string }>;
  }>;

  getObjectReferences(input: {
    connectionId: string;
    schema: string;
    name: string;
    type: string;
  }): Promise<{
    referencedBy: Array<{ fromSchema: string; fromName: string; fromType: string; toSchema: string; toName: string; toType: string }>;
  }>;

  getGrants(input: { connectionId: string; schema: string }): Promise<{
    objectGrants: Array<{ grantee: string; objectName: string; privilege: string; grantable: boolean }>;
    systemPrivileges: Array<{ grantee: string; privilege: string; adminOption: boolean }>;
  }>;
}

// ---------------------------------------------------------------------------
// Public result types
// ---------------------------------------------------------------------------

export interface AnalysisResult {
  readonly snapshotId: string;
  readonly connectionId: string;
  readonly schema: string;
  readonly objects: AnalyzedObject[];
  readonly findings: Finding[];
  readonly metrics: Metric[];
  readonly grantFindings: Finding[];
  readonly durationMs: number;
  readonly errors: Array<{ objectName: string; error: string }>;
}

export interface AnalyzedObject {
  readonly object: PLSQLObject;
  readonly parsed: ParsedObject;
  readonly findings: Finding[];
  readonly metric: Metric;
  readonly callerCount: number;
  readonly calleeCount: number;
}

/** Optional set of `name:type` keys to limit analysis to changed objects */
export type ChangedObjectSet = Set<string> | undefined;

const QUALITY_RULES = [
  cyclomaticComplexityRule,
  nestingDepthRule,
  parameterCountRule,
  routineLengthRule,
  commentRatioRule,
];

const SECURITY_RULES = [
  sqlInjectionRule,
  hardcodedCredentialsRule,
  exceptionSuppressionRule,
];

const ALL_RULES = [...QUALITY_RULES, ...SECURITY_RULES];
const CONCURRENCY = 5;

// ---------------------------------------------------------------------------
// Schema-level analysis
// ---------------------------------------------------------------------------

export async function analyzeSchema(
  connectionId: string,
  schema: string,
  client: AnalysisClient,
  options: {
    onProgress?: (done: number, total: number, currentObject: string) => void;
    changedObjects?: ChangedObjectSet;
    config?: Partial<RuleConfig>;
    log?: Logger;
  } = {},
): Promise<AnalysisResult> {
  const { onProgress, changedObjects, log = noopLogger } = options;
  const config: RuleConfig = { ...DEFAULT_RULE_CONFIG, ...options.config };
  const start = Date.now();
  const snapshotId = uuidv4();
  const errors: Array<{ objectName: string; error: string }> = [];

  const listResult = await client.listObjects({ connectionId, schema });
  const analyzableTypes = new Set([
    'PROCEDURE', 'FUNCTION', 'PACKAGE', 'PACKAGE BODY', 'TRIGGER', 'TYPE', 'TYPE BODY',
  ]);
  let candidates = listResult.objects.filter(o => analyzableTypes.has(o.type));

  if (changedObjects) {
    const before = candidates.length;
    candidates = candidates.filter(o => changedObjects.has(`${o.name}:${o.type}`));
    log.info(`Incremental: analyzing ${candidates.length}/${before} changed objects`);
  }

  log.info(`Analyzing schema "${schema}"`, `${candidates.length} objects`);

  const grantsResult = await client.getGrants({ connectionId, schema }).catch(() => ({
    objectGrants: [],
    systemPrivileges: [],
  }));

  const analyzed = await runWithConcurrency(
    candidates,
    CONCURRENCY,
    async (obj, idx) => {
      onProgress?.(idx, candidates.length, obj.name);
      return analyzeObject(connectionId, schema, obj.name, obj.type, client, snapshotId, config, log);
    },
    errors,
    log,
  );

  await enrichWithCouplingData(analyzed, connectionId, schema, client, log);

  const grantFindings = analyzeGrants(schema, grantsResult, `${schema}::schema`, 1);
  const allFindings = analyzed.flatMap(a => a.findings);
  const allMetrics = analyzed.map(a => a.metric);

  log.info(
    `Analysis complete`,
    `${allFindings.length} findings, ${errors.length} errors, ${Date.now() - start}ms`,
  );

  return {
    snapshotId,
    connectionId,
    schema,
    objects: analyzed,
    findings: allFindings,
    metrics: allMetrics,
    grantFindings,
    durationMs: Date.now() - start,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Single-object analysis
// ---------------------------------------------------------------------------

export async function analyzeObject(
  connectionId: string,
  schema: string,
  name: string,
  type: string,
  client: AnalysisClient,
  snapshotId: string,
  config: RuleConfig = DEFAULT_RULE_CONFIG,
  log: Logger = noopLogger,
): Promise<AnalyzedObject> {
  const sourceResult = await client.getObjectSource({ connectionId, schema, name, type });

  const compileErrors = await client.getCompileErrors({ connectionId, schema, name, type })
    .catch(() => ({ errors: [] }));

  const plsqlObject: PLSQLObject = {
    id: `${connectionId}:${schema}.${name}:${type}`,
    connectionId,
    schema,
    name,
    type: type as PLSQLObject['type'],
    status: compileErrors.errors.some(e => e.severity === 'ERROR') ? 'INVALID' : 'VALID',
    lastDdlTime: new Date(),
    sourceLines: sourceResult.lineCount,
    compilationErrors: compileErrors.errors,
  };

  const parseResult = parsePlsql(sourceResult.source, schema, name, type);
  if (parseResult.errors.length > 0) {
    log.warn(`Parse warnings for ${schema}.${name}`, parseResult.errors.map(e => e.message).join('; '));
  }

  const parsed = parseResult.objects[0];
  if (!parsed) throw new Error(`Parser returned no objects for ${schema}.${name}`);

  const findings: Finding[] = [];

  for (const rule of ALL_RULES) {
    try {
      findings.push(...rule.run(parsed, config));
    } catch (err) {
      log.warn(`Rule ${rule.id} failed on ${name}`, String(err));
    }
  }

  for (const ce of compileErrors.errors) {
    findings.push({
      id: `ce-${schema}-${name}-${ce.line}`,
      objectId: plsqlObject.id,
      ruleId: 'ORACLE-COMPILE',
      category: 'QUALITY',
      severity: ce.severity === 'ERROR' ? 'ERROR' : 'WARNING',
      message: ce.message,
      suggestion: 'Fix the compilation error to make this object valid.',
      location: { line: ce.line, column: ce.column },
    });
  }

  const metric: Metric = {
    objectId: plsqlObject.id,
    snapshotId,
    computedAt: new Date(),
    cyclomaticComplexity: parsed.metrics.cyclomaticComplexity,
    cognitiveComplexity: parsed.metrics.cyclomaticComplexity,
    linesOfCode: parsed.metrics.linesOfCode,
    executableLines: parsed.metrics.executableLines,
    commentRatio: parsed.metrics.commentLines / Math.max(parsed.metrics.executableLines, 1),
    nestingDepth: parsed.metrics.maxNestingDepth,
    parameterCount: parsed.parameters.length,
    coupling: { fanIn: 0, fanOut: parsed.metrics.procedureCalls.length },
    duplicateBlockCount: 0,
  };

  return {
    object: plsqlObject,
    parsed,
    findings,
    metric,
    callerCount: 0,
    calleeCount: parsed.metrics.procedureCalls.length,
  };
}

// ---------------------------------------------------------------------------
// Coupling enrichment (fan-in via getObjectReferences)
// ---------------------------------------------------------------------------

async function enrichWithCouplingData(
  analyzed: AnalyzedObject[],
  connectionId: string,
  schema: string,
  client: AnalysisClient,
  log: Logger,
): Promise<void> {
  const fanInMap = new Map<string, number>();

  for (const a of analyzed) {
    try {
      const refs = await client.getObjectReferences({
        connectionId,
        schema,
        name: a.object.name,
        type: a.object.type,
      });
      fanInMap.set(a.object.id, refs.referencedBy.length);
    } catch {
      // best-effort
    }
  }

  for (const a of analyzed) {
    const fanIn = fanInMap.get(a.object.id) ?? 0;
    (a.metric as { coupling: { fanIn: number; fanOut: number } }).coupling = {
      fanIn,
      fanOut: a.metric.coupling.fanOut,
    };
    (a as { callerCount: number }).callerCount = fanIn;
  }
}

// ---------------------------------------------------------------------------
// Concurrency helper
// ---------------------------------------------------------------------------

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  errors: Array<{ objectName: string; error: string }>,
  log: Logger,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      const item = items[i];
      if (!item) continue;
      try {
        results.push(await fn(item, i));
      } catch (e) {
        const name = (item as { name?: string }).name ?? String(i);
        errors.push({ objectName: name, error: e instanceof Error ? e.message : String(e) });
        log.warn(`Skipping ${name}`, String(e));
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
