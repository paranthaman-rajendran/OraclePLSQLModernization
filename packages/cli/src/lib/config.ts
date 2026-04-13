/**
 * CLI configuration loader.
 *
 * Resolution order (highest → lowest priority):
 *   1. CLI flags (passed in by commands)
 *   2. Environment variables: PLSQL_HOST, PLSQL_PORT, PLSQL_SERVICE, PLSQL_USER, PLSQL_PASSWORD
 *   3. .plsql-analyzer.json in the current working directory
 *   4. .env file (via dotenv)
 *
 * Config file schema (.plsql-analyzer.json):
 * {
 *   "host": "localhost",
 *   "port": 1521,
 *   "serviceName": "ORCL",
 *   "username": "MYSCHEMA",
 *   "password": "...",        // optional — prefer env var
 *   "schema": "MYSCHEMA",    // defaults to username.toUpperCase()
 *   "rules": {
 *     "maxComplexityWarning": 10,
 *     "maxComplexityError": 20,
 *     "maxNestingDepth": 4,
 *     "maxParameterCount": 7,
 *     "maxRoutineLines": 200
 *   },
 *   "failOn": "error",       // "error" | "warning" | "none" — CI exit code behaviour
 *   "format": "text"         // "text" | "json" | "sarif"
 * }
 */

import * as fs from 'fs';
import * as path from 'path';
import { config as loadDotenv } from 'dotenv';
import type { RuleConfig } from '@plsql-analyzer/analysis';

export interface CliConfig {
  host: string;
  port: number;
  serviceName: string;
  username: string;
  password: string;
  schema: string;
  rules: Partial<RuleConfig>;
  failOn: 'error' | 'warning' | 'none';
  format: 'text' | 'json' | 'sarif';
}

export interface PartialCliConfig extends Partial<Omit<CliConfig, 'rules'>> {
  rules?: Partial<RuleConfig>;
}

/** Load and merge config from all sources. Throws if required fields are missing. */
export function loadConfig(overrides: PartialCliConfig = {}): CliConfig {
  // Load .env silently
  loadDotenv({ override: false });

  // Read .plsql-analyzer.json if present
  const fileConfig = readConfigFile();

  const merged: CliConfig = {
    host:        overrides.host        ?? fileConfig.host        ?? env('PLSQL_HOST',     'localhost'),
    port:        overrides.port        ?? fileConfig.port        ?? parseInt(env('PLSQL_PORT', '1521'), 10),
    serviceName: overrides.serviceName ?? fileConfig.serviceName ?? env('PLSQL_SERVICE',  'ORCL'),
    username:    overrides.username    ?? fileConfig.username    ?? env('PLSQL_USER',     ''),
    password:    overrides.password    ?? fileConfig.password    ?? env('PLSQL_PASSWORD', ''),
    schema:      overrides.schema      ?? fileConfig.schema      ?? '',
    rules: { ...(fileConfig.rules ?? {}), ...(overrides.rules ?? {}) },
    failOn:  overrides.failOn  ?? fileConfig.failOn  ?? 'error',
    format:  overrides.format  ?? fileConfig.format  ?? 'text',
  };

  if (!merged.schema) {
    merged.schema = merged.username.toUpperCase();
  }

  const missing: string[] = [];
  if (!merged.username) missing.push('username (PLSQL_USER)');
  if (!merged.password) missing.push('password (PLSQL_PASSWORD)');
  if (missing.length) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}.\nUse env vars or .plsql-analyzer.json`);
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readConfigFile(): PartialCliConfig {
  const filePath = path.join(process.cwd(), '.plsql-analyzer.json');
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as PartialCliConfig;
  } catch (err) {
    console.warn(`Warning: could not parse .plsql-analyzer.json: ${String(err)}`);
    return {};
  }
}

function env(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}
