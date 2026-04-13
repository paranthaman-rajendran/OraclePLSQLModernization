/**
 * Exception suppression detection — FR-4.4
 * Flags WHEN OTHERS handlers that swallow exceptions without re-raising.
 *
 * CWE-390: Detection of Error Condition Without Action
 */

import type { AnalysisRule, RuleConfig } from '../rule-registry.js';
import { findingId } from '../rule-registry.js';
import type { ParsedObject } from '../../parser/ast-types.js';
import type { Finding } from '@plsql-analyzer/shared';

export const exceptionSuppressionRule: AnalysisRule = {
  id: 'PLSQL-S004',
  category: 'SECURITY',

  run(obj: ParsedObject, _config: RuleConfig): Finding[] {
    const findings: Finding[] = [];
    const objectId = `${obj.schema}.${obj.name}:${obj.type}`;

    for (const handler of obj.metrics.exceptionHandlers) {
      if (!handler.suppressesExceptions) continue;

      const severity: Finding['severity'] = handler.isNullHandler ? 'ERROR' : 'WARNING';

      findings.push({
        id: findingId('PLSQL-S004', objectId, handler.range.start.line),
        objectId,
        ruleId: 'PLSQL-S004',
        category: 'SECURITY',
        severity,
        message: handler.isNullHandler
          ? `WHEN OTHERS handler at line ${handler.range.start.line} silently swallows all exceptions (body is NULL). This hides failures and makes debugging impossible.`
          : `WHEN OTHERS handler at line ${handler.range.start.line} does not re-raise the exception. Errors may be silently suppressed.`,
        suggestion: 'Add RAISE or RAISE_APPLICATION_ERROR(-20001, SQLERRM) to re-raise the exception. At minimum, log the error with DBMS_OUTPUT or an audit table before swallowing.',
        location: handler.range.start,
        cweId: 'CWE-390',
        effortMinutes: 20,
      });
    }

    return findings;
  },
};
