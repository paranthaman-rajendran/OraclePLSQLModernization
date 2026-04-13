/**
 * Resolves the bundled MCP server path and builds the StdioClientTransport.
 *
 * SECURITY: Only the minimal set of ORACLE_* environment variables is
 * forwarded to the child process. The full extension process.env is NOT
 * inherited — this prevents VS Code tokens or other IDE secrets from
 * leaking into the Oracle server process.
 */

import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as vscode from 'vscode';
import * as path from 'path';

export interface ServerEnv {
  ORACLE_USER?: string;
  ORACLE_PASSWORD?: string;
  ORACLE_CONNECT_STRING?: string;
  ORACLE_HOST?: string;
  ORACLE_PORT?: string;
  ORACLE_SERVICE?: string;
  ORACLE_WALLET_DIR?: string;
  TNS_ADMIN?: string;
  VAULT_ADDR?: string;
  VAULT_TOKEN?: string;
  VAULT_SECRET_PATH?: string;
  AZURE_KEYVAULT_URI?: string;
  AZURE_KEYVAULT_SECRET_NAME?: string;
  AWS_SECRETS_MANAGER_ARN?: string;
  AWS_SECRETS_MANAGER_REGION?: string;
  LOG_LEVEL?: string;
  NODE_ENV?: string;
}

export function createTransport(
  extensionContext: vscode.ExtensionContext,
  serverEnv: ServerEnv = {},
): StdioClientTransport {
  const serverPath = extensionContext.asAbsolutePath(
    path.join('dist', 'mcp-server', 'index.js'),
  );

  const config = vscode.workspace.getConfiguration('plsqlAnalyzer');
  const logLevel = config.get<string>('logLevel', 'info');

  // Build minimal env — only whitelisted ORACLE_* vars + LOG_LEVEL
  const minimalEnv: Record<string, string> = {
    LOG_LEVEL: logLevel,
    NODE_ENV: process.env['NODE_ENV'] ?? 'production',
  };

  // Add wallet path from VS Code settings if configured
  const walletPath = config.get<string>('oracle.walletPath', '');
  if (walletPath) {
    minimalEnv['ORACLE_WALLET_DIR'] = walletPath;
  }

  // Merge caller-provided credentials (from SecretStorage)
  for (const [key, value] of Object.entries(serverEnv)) {
    if (value !== undefined) {
      minimalEnv[key] = value;
    }
  }

  return new StdioClientTransport({
    command: 'node',
    args: [serverPath],
    env: minimalEnv,
  });
}
