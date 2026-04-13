/**
 * Priority 1: Environment variable credential provider.
 * Reads ORACLE_USER, ORACLE_PASSWORD, ORACLE_CONNECT_STRING (or HOST/PORT/SERVICE).
 */

import { registerSecret } from '../../util/sanitize.js';
import type { CredentialContext, OracleCredentials } from '../types.js';

export function canResolveFromEnv(): boolean {
  return !!(process.env['ORACLE_USER'] && process.env['ORACLE_PASSWORD']);
}

export function resolveFromEnv(_ctx: CredentialContext): OracleCredentials {
  const username = process.env['ORACLE_USER'] ?? '';
  const password = process.env['ORACLE_PASSWORD'] ?? '';
  const connectString = process.env['ORACLE_CONNECT_STRING'];
  const host = process.env['ORACLE_HOST'] ?? 'localhost';
  const port = parseInt(process.env['ORACLE_PORT'] ?? '1521', 10);
  const serviceName = process.env['ORACLE_SERVICE'] ?? process.env['ORACLE_SID'] ?? 'ORCL';
  const walletLocation = process.env['ORACLE_WALLET_DIR'] ?? process.env['TNS_ADMIN'];

  // Register secrets for log scrubbing
  if (password) registerSecret(password);

  return {
    host,
    port,
    serviceName,
    username,
    password,
    connectString,
    walletLocation,
    credentialSource: 'env',
  };
}
