/**
 * Rule registry — maps rule IDs to implementations.
 * Deliberately has NO dependency on VS Code — config is passed in by callers.
 */

import type { ParsedObject } from '../parser/ast-types.js';
import type { Finding } from '@plsql-analyzer/shared';

export interface AnalysisRule {
  readonly id: string;
  readonly category: Finding['category'];
  run(obj: ParsedObject, config: RuleConfig): Finding[];
}

export interface RuleConfig {
  readonly maxComplexityWarning: number;
  readonly maxComplexityError: number;
  readonly maxNestingDepth: number;
  readonly maxParameterCount: number;
  readonly maxRoutineLines: number;
}

/** Safe defaults — identical to the VS Code extension's setting defaults */
export const DEFAULT_RULE_CONFIG: RuleConfig = {
  maxComplexityWarning: 10,
  maxComplexityError: 20,
  maxNestingDepth: 4,
  maxParameterCount: 7,
  maxRoutineLines: 200,
};

/** Build a deterministic finding ID from rule + object + line */
export function findingId(ruleId: string, objectId: string, line: number): string {
  const raw = `${ruleId}:${objectId}:${line}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (Math.imul(31, hash) + raw.charCodeAt(i)) | 0;
  }
  return `f-${Math.abs(hash).toString(16).padStart(8, '0')}`;
}
