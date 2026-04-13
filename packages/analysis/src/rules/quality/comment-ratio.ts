import type { AnalysisRule, RuleConfig } from '../rule-registry.js';
import { findingId } from '../rule-registry.js';
import type { ParsedObject } from '../../parser/ast-types.js';
import type { Finding } from '@plsql-analyzer/shared';

export const commentRatioRule: AnalysisRule = {
  id: 'PLSQL-Q005',
  category: 'MAINTAINABILITY',

  run(obj: ParsedObject, _config: RuleConfig): Finding[] {
    const { linesOfCode, commentLines, executableLines } = obj.metrics;
    if (linesOfCode < 20) return [];  // too small to matter

    const ratio = commentLines / Math.max(executableLines, 1);
    if (ratio >= 0.05) return [];  // 5% comment coverage is acceptable

    const objectId = `${obj.schema}.${obj.name}:${obj.type}`;
    return [{
      id: findingId('PLSQL-Q005', objectId, obj.range.start.line),
      objectId,
      ruleId: 'PLSQL-Q005',
      category: 'MAINTAINABILITY',
      severity: 'INFO',
      message: `"${obj.name}" has low comment coverage (${Math.round(ratio * 100)}%). Documentation helps maintainers understand business logic.`,
      suggestion: 'Add inline comments explaining WHY (business rationale), not WHAT (which is visible from the code).',
      location: { line: obj.range.start.line, column: obj.range.start.column },
      effortMinutes: 20,
    }];
  },
};
