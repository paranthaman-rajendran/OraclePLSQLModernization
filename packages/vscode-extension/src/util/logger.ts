/**
 * VS Code Output Channel logger.
 * Writes to "PL/SQL Analyzer" output channel — visible in the Output panel.
 */

import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

export function initLogger(ctx: vscode.ExtensionContext): void {
  channel = vscode.window.createOutputChannel('PL/SQL Analyzer');
  ctx.subscriptions.push(channel);
}

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

function write(level: LogLevel, message: string, detail?: string): void {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${message}${detail ? `\n  ${detail}` : ''}`;
  if (channel) {
    channel.appendLine(line);
  }
}

export const logger = {
  debug: (msg: string, detail?: string) => write('DEBUG', msg, detail),
  info: (msg: string, detail?: string) => write('INFO', msg, detail),
  warn: (msg: string, detail?: string) => write('WARN', msg, detail),
  error: (msg: string, error?: unknown) => {
    const detail = error instanceof Error
      ? `${error.message}${error.stack ? '\n' + error.stack : ''}`
      : error !== undefined ? String(error) : undefined;
    write('ERROR', msg, detail);
  },
  show: () => channel?.show(true),
};
