import type { AnalysisRule, RuleConfig } from '../rule-registry.js';
import { findingId } from '../rule-registry.js';
import type { ParsedObject } from '../../parser/ast-types.js';
import type { Finding } from '@plsql-analyzer/shared';

export const nestingDepthRule: AnalysisRule = {
  id: 'PLSQL-Q002',
  category: 'QUALITY',

  run(obj: ParsedObject, config: RuleConfig): Finding[] {
    const depth = obj.metrics.maxNestingDepth;
    if (depth <= config.maxNestingDepth) return [];

    const objectId = `${obj.schema}.${obj.name}:${obj.type}`;
    return [{
      id: findingId('PLSQL-Q002', objectId, obj.range.start.line),
      objectId,
      ruleId: 'PLSQL-Q002',
      category: 'QUALITY',
      severity: 'WARNING',
      message: `Block nesting depth is ${depth} (threshold: ${config.maxNestingDepth}). Deep nesting reduces readability and testability.`,
      suggestion: 'Extract deeply nested blocks into named procedures. Use early-return or guard clauses to reduce nesting.',
      location: { line: obj.range.start.line, column: obj.range.start.column },
      effortMinutes: 30,
    }];
  },
};
