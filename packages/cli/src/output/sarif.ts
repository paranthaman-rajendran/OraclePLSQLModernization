/**
 * SARIF 2.1.0 output formatter.
 *
 * SARIF (Static Analysis Results Interchange Format) is the standard format
 * consumed by GitHub Code Scanning, Azure DevOps, and other CI platforms.
 *
 * Spec: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 */

import type { AnalysisResult } from '@plsql-analyzer/analysis';
import type { Finding } from '@plsql-analyzer/shared';

export interface SarifLog {
  $schema: string;
  version: '2.1.0';
  runs: SarifRun[];
}

interface SarifRun {
  tool: { driver: SarifDriver };
  results: SarifResult[];
  artifacts?: SarifArtifact[];
}

interface SarifDriver {
  name: string;
  version: string;
  informationUri: string;
  rules: SarifRule[];
}

interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  fullDescription?: { text: string };
  helpUri?: string;
  properties?: { tags: string[]; precision: string; 'problem.severity': string };
}

interface SarifResult {
  ruleId: string;
  level: 'error' | 'warning' | 'note' | 'none';
  message: { text: string };
  locations?: SarifLocation[];
  relatedLocations?: SarifLocation[];
  partialFingerprints?: Record<string, string>;
}

interface SarifLocation {
  physicalLocation?: {
    artifactLocation: { uri: string; uriBaseId?: string };
    region?: { startLine: number; startColumn?: number };
  };
  logicalLocations?: Array<{ name: string; kind: string }>;
}

interface SarifArtifact {
  location: { uri: string };
  description?: { text: string };
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildSarif(result: AnalysisResult): SarifLog {
  const allFindings: Finding[] = [...result.findings, ...result.grantFindings];

  // Collect unique rules referenced in findings
  const ruleMap = new Map<string, SarifRule>();
  for (const f of allFindings) {
    if (!ruleMap.has(f.ruleId)) {
      ruleMap.set(f.ruleId, buildRule(f));
    }
  }

  const sarifResults: SarifResult[] = allFindings.map(f => ({
    ruleId: f.ruleId,
    level: severityToLevel(f.severity),
    message: {
      text: f.suggestion ? `${f.message} Suggestion: ${f.suggestion}` : f.message,
    },
    locations: [objectLocation(f)],
    partialFingerprints: { primaryLocationLineHash: f.id },
  }));

  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'plsql-analyze',
            version: '0.1.0',
            informationUri: 'https://github.com/plsql-analyzer',
            rules: [...ruleMap.values()],
          },
        },
        results: sarifResults,
      },
    ],
  };
}

export function printSarifReport(result: AnalysisResult): void {
  process.stdout.write(JSON.stringify(buildSarif(result), null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function severityToLevel(severity: Finding['severity']): SarifResult['level'] {
  switch (severity) {
    case 'ERROR':   return 'error';
    case 'WARNING': return 'warning';
    case 'INFO':    return 'note';
    case 'HINT':    return 'none';
  }
}

function objectLocation(f: Finding): SarifLocation {
  // Map objectId (connectionId:schema.name:type) to a logical location
  const parts  = f.objectId.split(':');
  const objPart = parts[1] ?? f.objectId;          // schema.name
  const type    = parts[2] ?? 'OBJECT';

  return {
    physicalLocation: {
      artifactLocation: { uri: `oracle://${objPart.replace('.', '/')}` },
      region: {
        startLine: f.location.line,
        startColumn: f.location.column,
      },
    },
    logicalLocations: [{ name: objPart, kind: type.toLowerCase() }],
  };
}

const RULE_DESCRIPTIONS: Record<string, { name: string; desc: string }> = {
  'PLSQL-Q001': { name: 'CyclomaticComplexity',   desc: 'Cyclomatic complexity exceeds threshold' },
  'PLSQL-Q002': { name: 'NestingDepth',            desc: 'Block nesting depth exceeds threshold' },
  'PLSQL-Q003': { name: 'ParameterCount',          desc: 'Parameter count exceeds threshold' },
  'PLSQL-Q004': { name: 'RoutineLength',           desc: 'Routine executable lines exceed threshold' },
  'PLSQL-Q005': { name: 'CommentRatio',            desc: 'Comment coverage is below minimum' },
  'PLSQL-S001': { name: 'SqlInjection',            desc: 'Dynamic SQL built with string concatenation' },
  'PLSQL-S002': { name: 'HardcodedCredentials',    desc: 'String literal matches credential pattern' },
  'PLSQL-S003': { name: 'ExcessiveGrants',         desc: 'Dangerous or overly broad privilege grant' },
  'PLSQL-S004': { name: 'ExceptionSuppression',    desc: 'WHEN OTHERS handler suppresses exceptions' },
  'ORACLE-COMPILE': { name: 'CompilationError',    desc: 'Oracle PL/SQL compilation error' },
};

function buildRule(f: Finding): SarifRule {
  const meta = RULE_DESCRIPTIONS[f.ruleId];
  return {
    id: f.ruleId,
    name: meta?.name ?? f.ruleId,
    shortDescription: { text: meta?.desc ?? f.message },
    properties: {
      tags: [f.category],
      precision: 'medium',
      'problem.severity': f.severity.toLowerCase(),
    },
    ...(f.cweId ? { helpUri: `https://cwe.mitre.org/data/definitions/${f.cweId.replace('CWE-', '')}.html` } : {}),
  };
}
