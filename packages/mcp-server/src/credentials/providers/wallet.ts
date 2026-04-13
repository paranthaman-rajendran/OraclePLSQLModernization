/**
 * Priority 3: Oracle Wallet credential provider.
 * Reads wallet location from ORACLE_WALLET_DIR or TNS_ADMIN env vars,
 * or from the oracle.walletPath VS Code setting passed via env.
 */

import { existsSync } from 'fs';
import { resolve } from 'path';
import { logger } from '../../util/logger.js';
import { NotImplementedError } from '../../util/error.js';
import type { CredentialContext, OracleCredentials } from '../types.js';

function findWalletPath(): string | undefined {
  const candidates = [
    process.env['ORACLE_WALLET_DIR'],
    process.env['TNS_ADMIN'],
    process.env['ORACLE_WALLET_LOCATION'],
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const abs = resolve(candidate);
    if (existsSync(abs)) {
      // Validate it looks like an Oracle Wallet
      if (existsSync(resolve(abs, 'cwallet.sso')) || existsSync(resolve(abs, 'ewallet.p12'))) {
        return abs;
      }
    }
  }

  return undefined;
}

export function canResolveFromWallet(): boolean {
  return findWalletPath() !== undefined;
}

export function resolveFromWallet(ctx: CredentialContext): OracleCredentials {
  const walletPath = findWalletPath();
  if (!walletPath) {
    throw new Error('Oracle Wallet not found');
  }

  // node-oracledb Thin mode wallet support:
  // Set TNS_ADMIN to the wallet directory and use the wallet for auth.
  // The actual username/password come from the wallet — we pass empty strings
  // and let oracledb read from cwallet.sso.
  const username = process.env['ORACLE_USER'] ?? '';
  const connectString = process.env['ORACLE_CONNECT_STRING'] ?? process.env['ORACLE_TNS_NAME'] ?? '';
  const host = process.env['ORACLE_HOST'] ?? 'localhost';
  const port = parseInt(process.env['ORACLE_PORT'] ?? '1521', 10);
  const serviceName = process.env['ORACLE_SERVICE'] ?? 'ORCL';

  if (!connectString && !host) {
    throw new NotImplementedError(
      'Wallet provider requires ORACLE_CONNECT_STRING or ORACLE_HOST to be set',
    );
  }

  logger.info('Credentials resolved from Oracle Wallet', {
    connectionId: ctx.connectionId,
    credentialSource: 'wallet',
    // walletPath logged — it is not a credential, just a directory path
    walletPath,
  });

  return {
    host,
    port,
    serviceName,
    username,
    password: '',         // wallet handles auth
    connectString,
    walletLocation: walletPath,
    credentialSource: 'wallet',
  };
}
