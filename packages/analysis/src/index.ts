/**
 * @plsql-analyzer/analysis — public API
 */

// Engine + types
export {
  analyzeSchema,
  analyzeObject,
  type AnalysisResult,
  type AnalyzedObject,
  type AnalysisClient,
  type ChangedObjectSet,
} from './engine.js';

// Parser
export { parsePlsql } from './parser/plsql-parser.js';
export type { ParsedObject, ParsedObjectMetrics } from './parser/ast-types.js';

// Rules
export {
  type AnalysisRule,
  type RuleConfig,
  DEFAULT_RULE_CONFIG,
  findingId,
} from './rules/rule-registry.js';

// Logger
export {
  type Logger,
  noopLogger,
  consoleLogger,
} from './logger.js';
