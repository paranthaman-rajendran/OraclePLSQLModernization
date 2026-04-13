import type { AnalysisRule, RuleConfig } from '../rule-registry.js';
import { findingId } from '../rule-registry.js';
import type { ParsedObject } from '../../parser/ast-types.js';
import type { Finding } from '@plsql-analyzer/shared';

export const cyclomaticComplexityRule: AnalysisRule = {
  id: 'PLSQL-Q001',
  category: 'QUALITY',

  run(obj: ParsedObject, config: RuleConfig): Finding[] {
    const cc = obj.metrics.cyclomaticComplexity;
    const objectId = `${obj.schema}.${obj.name}:${obj.type}`;

    if (cc > config.maxComplexityError) {
      return [{
        id: findingId('PLSQL-Q001', objectId, obj.range.start.line),
        objectId,
        ruleId: 'PLSQL-Q001',
        category: 'QUALITY',
        severity: 'ERROR',
        message: `Cyclomatic complexity is ${cc} (threshold: ${config.maxComplexityError}). This object is extremely difficult to test and maintain.`,
        suggestion: `Break this ${obj.type.toLowerCase()} into smaller, focused routines. Consider extracting groups of related logic into separate procedures or functions.`,
        location: { line: obj.range.start.line, column: obj.range.start.column },
        effortMinutes: Math.round(cc * 15),
      }];
    }

    if (cc > config.maxComplexityWarning) {
      return [{
        id: findingId('PLSQL-Q001', objectId, obj.range.start.line),
        objectId,
        ruleId: 'PLSQL-Q001',
        category: 'QUALITY',
        severity: 'WARNING',
        message: `Cyclomatic complexity is ${cc} (threshold: ${config.maxComplexityWarning}). Consider simplifying.`,
        suggestion: `Extract nested IF/CASE blocks into helper procedures. Aim for complexity ≤ ${config.maxComplexityWarning}.`,
        location: { line: obj.range.start.line, column: obj.range.start.column },
        effortMinutes: Math.round(cc * 10),
      }];
    }

    return [];
  },
};
