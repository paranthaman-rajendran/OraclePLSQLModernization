/**
 * SQL Injection detection — FR-4.1
 * Flags EXECUTE IMMEDIATE statements where the SQL string is built
 * by concatenating unsanitized values (||) without bind variables.
 *
 * CWE-89: Improper Neutralization of Special Elements used in an SQL Command
 */

import type { AnalysisRule, RuleConfig } from '../rule-registry.js';
import { findingId } from '../rule-registry.js';
import type { ParsedObject } from '../../parser/ast-types.js';
import type { Finding } from '@plsql-analyzer/shared';

export const sqlInjectionRule: AnalysisRule = {
  id: 'PLSQL-S001',
  category: 'SECURITY',

  run(obj: ParsedObject, _config: RuleConfig): Finding[] {
    const findings: Finding[] = [];
    const objectId = `${obj.schema}.${obj.name}:${obj.type}`;

    for (const dynSql of obj.metrics.dynamicSqlNodes) {
      if (!dynSql.hasConcatenation) continue;

      // Concatenation is only risky if there are no bind variables and it looks
      // like user-supplied input (variable name contains: input, param, val, arg, user, etc.)
      const lowerExpr = dynSql.sqlExpression.toLowerCase();
      const riskIndicators = [
        'input', 'param', 'arg', 'user', 'name', 'value', 'val', 'str',
        'text', 'data', 'filter', 'where', 'cond', 'search', 'query',
      ];
      const hasRiskIndicator = riskIndicators.some(r => lowerExpr.includes(r));

      const severity: Finding['severity'] = !dynSql.hasBindVariables && hasRiskIndicator
        ? 'ERROR'
        : 'WARNING';

      findings.push({
        id: findingId('PLSQL-S001', objectId, dynSql.range.start.line),
        objectId,
        ruleId: 'PLSQL-S001',
        category: 'SECURITY',
        severity,
        message: `Dynamic SQL built with string concatenation (||) may be vulnerable to SQL injection.${dynSql.hasBindVariables ? ' Bind variables detected — verify all inputs are bound.' : ' No bind variables found.'}`,
        suggestion: 'Replace string concatenation with bind variables (`:param`). Use `DBMS_ASSERT.SQL_OBJECT_NAME` for identifiers that cannot be bound.',
        location: dynSql.range.start,
        cweId: 'CWE-89',
        effortMinutes: 30,
      });
    }

    return findings;
  },
};
