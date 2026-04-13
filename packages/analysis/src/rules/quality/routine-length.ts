import type { AnalysisRule, RuleConfig } from '../rule-registry.js';
import { findingId } from '../rule-registry.js';
import type { ParsedObject } from '../../parser/ast-types.js';
import type { Finding } from '@plsql-analyzer/shared';

export const routineLengthRule: AnalysisRule = {
  id: 'PLSQL-Q004',
  category: 'QUALITY',

  run(obj: ParsedObject, config: RuleConfig): Finding[] {
    if (obj.type === 'PACKAGE' || obj.type === 'PACKAGE BODY') return [];

    const lines = obj.metrics.executableLines;
    if (lines <= config.maxRoutineLines) return [];

    const objectId = `${obj.schema}.${obj.name}:${obj.type}`;
    return [{
      id: findingId('PLSQL-Q004', objectId, obj.range.start.line),
      objectId,
      ruleId: 'PLSQL-Q004',
      category: 'MAINTAINABILITY',
      severity: 'WARNING',
      message: `${obj.type} "${obj.name}" has ${lines} executable lines (threshold: ${config.maxRoutineLines}).`,
      suggestion: 'Break this routine into smaller, focused procedures or functions. Each routine should do one thing well.',
      location: { line: obj.range.start.line, column: obj.range.start.column },
      effortMinutes: 60,
    }];
  },
};
