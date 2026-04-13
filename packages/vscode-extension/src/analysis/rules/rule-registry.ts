/**
 * Rule registry — re-exports from @plsql-analyzer/analysis.
 * The vscode-specific getRuleConfig() has moved to analysis-engine.ts.
 */

export {
  type AnalysisRule,
  type RuleConfig,
  DEFAULT_RULE_CONFIG,
  findingId,
} from '@plsql-analyzer/analysis';
