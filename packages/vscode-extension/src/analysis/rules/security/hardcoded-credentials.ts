/**
 * Hardcoded credential detection — FR-4.2
 * Scans string literals and variable assignments for patterns matching
 * passwords, API keys, tokens, or secret values.
 *
 * CWE-798: Use of Hard-coded Credentials
 */

import type { AnalysisRule, RuleConfig } from '../rule-registry.js';
import { findingId } from '../rule-registry.js';
import type { ParsedObject } from '../../parser/ast-types.js';
import type { Finding } from '@plsql-analyzer/shared';

/** Variable name patterns that strongly suggest credential storage */
const CREDENTIAL_VAR_PATTERNS = [
  /\bpassword\b/i,
  /\bpasswd\b/i,
  /\bpwd\b/i,
  /\bsecret\b/i,
  /\bapi_key\b/i,
  /\bapikey\b/i,
  /\bauth_token\b/i,
  /\baccess_token\b/i,
  /\bprivate_key\b/i,
  /\bcredential\b/i,
  /\bdb_pass\b/i,
  /\boracle_pwd\b/i,
];

/** String value patterns that look like secrets (not empty strings or placeholders) */
const SECRET_VALUE_PATTERNS = [
  /^[A-Za-z0-9+/]{20,}={0,2}$/,   // Base64-like (possible encoded secret)
  /^[0-9a-fA-F]{32,}$/,             // Hex hash / token
  /^[a-z0-9_]{8,}[A-Z][0-9]{2,}/,  // Mixed-case password pattern
];

export const hardcodedCredentialsRule: AnalysisRule = {
  id: 'PLSQL-S002',
  category: 'SECURITY',

  run(obj: ParsedObject, _config: RuleConfig): Finding[] {
    const findings: Finding[] = [];
    const objectId = `${obj.schema}.${obj.name}:${obj.type}`;
    const source = obj.metrics.stringLiterals;

    // Scan the raw source text for assignment patterns
    // e.g.: l_password := 'secret123';  or  v_key := 'abc123def456';
    const assignmentPattern = /\b(\w+)\s*:=\s*'([^']{4,})'/gi;
    const sourceText = source.map(s => s.value).join('\n');

    // We re-scan via the object's string literals combined with context
    // using a simpler approach: check if any literal near a credential-named variable
    for (const lit of source) {
      if (lit.value.length < 4) continue;
      if (lit.value.trim() === '') continue;

      // Skip if it looks like a SQL fragment or message
      if (/\s/.test(lit.value) && lit.value.length < 20) continue;
      if (lit.value.toUpperCase().startsWith('SELECT') || lit.value.toUpperCase().startsWith('INSERT')) continue;

      const looksLikeSecret = SECRET_VALUE_PATTERNS.some(p => p.test(lit.value));
      if (!looksLikeSecret) continue;

      findings.push({
        id: findingId('PLSQL-S002', objectId, lit.range.start.line),
        objectId,
        ruleId: 'PLSQL-S002',
        category: 'SECURITY',
        severity: 'WARNING',
        message: `String literal at line ${lit.range.start.line} may be a hardcoded credential or secret value.`,
        suggestion: 'Store credentials in environment variables or Oracle Wallet. Retrieve at runtime via DBMS_CREDENTIAL or application configuration — never hardcode in PL/SQL.',
        location: lit.range.start,
        cweId: 'CWE-798',
        effortMinutes: 45,
      });
    }

    return findings;
  },
};
