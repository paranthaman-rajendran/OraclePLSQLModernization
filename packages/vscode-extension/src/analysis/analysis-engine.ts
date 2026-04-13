/**
 * Analysis Engine — VS Code extension adapter.
 *
 * Re-exports the portable @plsql-analyzer/analysis engine and bridges:
 *   - McpClient  → AnalysisClient interface
 *   - vscode logger → Logger interface
 *   - vscode workspace config → RuleConfig
 *
 * All analysis logic lives in @plsql-analyzer/analysis.
 */

import * as vscode from 'vscode';
import {
  analyzeSchema as _analyzeSchema,
  analyzeObject as _analyzeObject,
  DEFAULT_RULE_CONFIG,
  type AnalysisClient,
  type RuleConfig,
} from '@plsql-analyzer/analysis';
import type { McpClient } from '../mcp/client.js';
import { logger } from '../util/logger.js';

// Re-export types that consumers of this module depend on
export type {
  AnalysisResult,
  AnalyzedObject,
  ChangedObjectSet,
} from '@plsql-analyzer/analysis';

// ---------------------------------------------------------------------------
// McpClient → AnalysisClient bridge
// ---------------------------------------------------------------------------

function bridgeClient(client: McpClient): AnalysisClient {
  return {
    listObjects: (input) => client.listObjects(input),
    getObjectSource: (input) => client.getObjectSource(input as Parameters<McpClient['getObjectSource']>[0]),
    getCompileErrors: (input) => client.getCompileErrors(input as Parameters<McpClient['getCompileErrors']>[0]),
    getObjectReferences: (input) => client.getObjectReferences(input as Parameters<McpClient['getObjectReferences']>[0]),
    getGrants: (input) => client.getGrants(input),
  };
}

// ---------------------------------------------------------------------------
// vscode config → RuleConfig
// ---------------------------------------------------------------------------

function getRuleConfig(): RuleConfig {
  const cfg = vscode.workspace.getConfiguration('plsqlAnalyzer');
  return {
    maxComplexityWarning: cfg.get<number>('maxComplexityWarning', DEFAULT_RULE_CONFIG.maxComplexityWarning),
    maxComplexityError: cfg.get<number>('maxComplexityError', DEFAULT_RULE_CONFIG.maxComplexityError),
    maxNestingDepth: cfg.get<number>('maxNestingDepth', DEFAULT_RULE_CONFIG.maxNestingDepth),
    maxParameterCount: cfg.get<number>('maxParameterCount', DEFAULT_RULE_CONFIG.maxParameterCount),
    maxRoutineLines: cfg.get<number>('maxRoutineLines', DEFAULT_RULE_CONFIG.maxRoutineLines),
  };
}

// ---------------------------------------------------------------------------
// vscode Logger adapter
// ---------------------------------------------------------------------------

const vsCodeLogger = {
  debug: (msg: string, detail?: string) => logger.debug(msg, detail),
  info:  (msg: string, detail?: string) => logger.info(msg, detail),
  warn:  (msg: string, detail?: string) => logger.warn(msg, detail),
  error: (msg: string, err?: unknown)   => logger.error(msg, err),
};

// ---------------------------------------------------------------------------
// Public API — same signatures as before so no callers change
// ---------------------------------------------------------------------------

export function analyzeSchema(
  connectionId: string,
  schema: string,
  client: McpClient,
  onProgress?: (done: number, total: number, currentObject: string) => void,
  changedObjects?: Set<string>,
) {
  return _analyzeSchema(connectionId, schema, bridgeClient(client), {
    onProgress,
    changedObjects,
    config: getRuleConfig(),
    log: vsCodeLogger,
  });
}

export function analyzeObject(
  connectionId: string,
  schema: string,
  name: string,
  type: string,
  client: McpClient,
  snapshotId: string,
  objectId: string,
) {
  return _analyzeObject(
    connectionId, schema, name, type,
    bridgeClient(client),
    snapshotId,
    getRuleConfig(),
    vsCodeLogger,
  );
}
