import type { AnalysisRule, RuleConfig } from '../rule-registry.js';
import { findingId } from '../rule-registry.js';
import type { ParsedObject } from '../../parser/ast-types.js';
import type { Finding } from '@plsql-analyzer/shared';

export const parameterCountRule: AnalysisRule = {
  id: 'PLSQL-Q003',
  category: 'QUALITY',

  run(obj: ParsedObject, config: RuleConfig): Finding[] {
    const count = obj.parameters.length;
    if (count <= config.maxParameterCount) return [];
    if (obj.type === 'PACKAGE' || obj.type === 'PACKAGE BODY' || obj.type === 'TRIGGER') return [];

    const objectId = `${obj.schema}.${obj.name}:${obj.type}`;
    return [{
      id: findingId('PLSQL-Q003', objectId, obj.range.start.line),
      objectId,
      ruleId: 'PLSQL-Q003',
      category: 'QUALITY',
      severity: 'WARNING',
      message: `${obj.type} "${obj.name}" has ${count} parameters (threshold: ${config.maxParameterCount}).`,
      suggestion: 'Consider grouping related parameters into a record type or reducing the number of parameters by splitting responsibilities.',
      location: { line: obj.range.start.line, column: obj.range.start.column },
      effortMinutes: 45,
    }];
  },
};
