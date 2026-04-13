/**
 * Structured logger for the MCP server.
 * CRITICAL: All output goes to stderr ONLY.
 * stdout is reserved exclusively for MCP JSON-RPC messages.
 * All strings pass through sanitize() before writing.
 */

import { sanitize, sanitizeError } from './sanitize.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = (process.env['LOG_LEVEL'] as LogLevel | undefined) ?? 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (LEVELS[level] < LEVELS[currentLevel]) return;

  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg: sanitize(message),
  };

  if (context) {
    // Sanitize each context value individually
    for (const [k, v] of Object.entries(context)) {
      entry[k] = typeof v === 'string' ? sanitize(v) : v;
    }
  }

  process.stderr.write(JSON.stringify(entry) + '\n');
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => write('debug', msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => write('info', msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => write('warn', msg, ctx),
  error: (msg: string, error?: unknown, ctx?: Record<string, unknown>) => {
    const errStr = error !== undefined ? sanitizeError(error) : undefined;
    write('error', msg, { ...ctx, ...(errStr ? { error: errStr } : {}) });
  },
};
