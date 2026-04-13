/**
 * Excessive privilege detection — FR-4.3
 * Flags objects that receive or grant wildcard / dangerous privileges.
 * This rule receives grant data from the MCP server (separate from source analysis).
 *
 * CWE-269: Improper Privilege Management
 */

import type { AnalysisRule, RuleConfig } from '../rule-registry.js';
import { findingId } from '../rule-registry.js';
import type { ParsedObject } from '../../parser/ast-types.js';
import type { Finding } from '@plsql-analyzer/shared';
import type { GetGrantsOutput } from '@plsql-analyzer/shared';

/** Dangerous system privileges that warrant an ERROR-level finding */
const DANGEROUS_SYS_PRIVS = new Set([
  'DBA',
  'SYSDBA',
  'SYSOPER',
  'CREATE ANY TABLE',
  'DROP ANY TABLE',
  'EXECUTE ANY PROCEDURE',
  'ALTER ANY TABLE',
  'DROP ANY PROCEDURE',
  'SELECT ANY TABLE',
  'SELECT ANY DICTIONARY',
  'CREATE ANY PROCEDURE',
  'GRANT ANY PRIVILEGE',
  'GRANT ANY ROLE',
  'EXEMPT ACCESS POLICY',
]);

/** Object-level privileges considered overly permissive when granted broadly */
const BROAD_OBJECT_PRIVS = new Set(['EXECUTE', 'ALTER', 'DEBUG', 'DELETE', 'INSERT', 'UPDATE']);

export const excessiveGrantsRule: AnalysisRule = {
  id: 'PLSQL-S003',
  category: 'SECURITY',

  run(obj: ParsedObject, _config: RuleConfig): Finding[] {
    // Grant data is not available from source parse — handled in analyzeGrants()
    return [];
  },
};

/**
 * Separate function called by the analysis engine when grant data is available.
 * Returns findings for dangerous grants in the schema.
 */
export function analyzeGrants(
  schema: string,
  grants: GetGrantsOutput,
  objectId: string,
  line: number,
): Finding[] {
  const findings: Finding[] = [];

  for (const sysPriv of grants.systemPrivileges) {
    const privUpper = sysPriv.privilege.toUpperCase();
    if (DANGEROUS_SYS_PRIVS.has(privUpper)) {
      findings.push({
        id: findingId('PLSQL-S003', objectId, line),
        objectId,
        ruleId: 'PLSQL-S003',
        category: 'SECURITY',
        severity: 'ERROR',
        message: `Schema "${schema}" has dangerous system privilege "${sysPriv.privilege}" granted to "${sysPriv.grantee}".`,
        suggestion: 'Review whether this privilege is necessary. Apply the principle of least privilege — grant only the minimum rights needed.',
        location: { line, column: 1 },
        cweId: 'CWE-269',
        effortMinutes: 60,
      });
    }
  }

  for (const grant of grants.objectGrants) {
    if (grant.grantable) {
      findings.push({
        id: findingId('PLSQL-S003-g', `${objectId}:${grant.grantee}:${grant.privilege}`, line),
        objectId,
        ruleId: 'PLSQL-S003',
        category: 'SECURITY',
        severity: 'WARNING',
        message: `Privilege "${grant.privilege}" on "${grant.objectName}" is granted to "${grant.grantee}" WITH GRANT OPTION — grantee can further propagate this privilege.`,
        suggestion: 'Remove WITH GRANT OPTION unless this grantee explicitly needs to delegate access. Uncontrolled grant chains can lead to privilege escalation.',
        location: { line, column: 1 },
        cweId: 'CWE-269',
        effortMinutes: 30,
      });
    }
  }

  return findings;
}
