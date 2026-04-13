/**
 * Credential resolver — chain-of-responsibility pattern.
 * Tries providers in priority order, stopping at first success.
 *
 * Priority:
 *   1. Environment variables (EnvProvider)
 *   2. .env file (DotenvProvider)
 *   3. Oracle Wallet (WalletProvider)
 *   4. External vault (VaultProvider — stubs in Phase 0)
 *
 * SECURITY invariants:
 * - Credentials never passed through MCP tool calls
 * - Audit log records WHICH source resolved, never the credential value
 * - All log writes pass through sanitize()
 */

import { logger } from '../util/logger.js';
import { CredentialResolutionError } from '../util/error.js';
import { canResolveFromEnv, resolveFromEnv } from './providers/env.js';
import { canResolveFromDotenv, resolveFromDotenv } from './providers/dotenv.js';
import { canResolveFromWallet, resolveFromWallet } from './providers/wallet.js';
import { canResolveFromVault, resolveFromVault } from './providers/vault.js';
import type { CredentialContext, OracleCredentials } from './types.js';

export async function resolveCredentials(ctx: CredentialContext): Promise<OracleCredentials> {
  const attempted: string[] = [];

  // 1. Environment variables
  if (canResolveFromEnv()) {
    try {
      const creds = resolveFromEnv(ctx);
      logger.info('Credential resolution succeeded', {
        connectionId: ctx.connectionId,
        source: 'env',
      });
      return creds;
    } catch (err) {
      attempted.push('env');
      logger.warn('Env provider failed', { connectionId: ctx.connectionId, error: String(err) });
    }
  } else {
    attempted.push('env (not configured)');
  }

  // 2. .env file
  if (canResolveFromDotenv()) {
    try {
      const creds = resolveFromDotenv(ctx);
      logger.info('Credential resolution succeeded', {
        connectionId: ctx.connectionId,
        source: 'dotenv',
      });
      return creds;
    } catch (err) {
      attempted.push('dotenv');
      logger.warn('Dotenv provider failed', { connectionId: ctx.connectionId, error: String(err) });
    }
  } else {
    attempted.push('dotenv (not configured)');
  }

  // 3. Oracle Wallet
  if (canResolveFromWallet()) {
    try {
      const creds = resolveFromWallet(ctx);
      logger.info('Credential resolution succeeded', {
        connectionId: ctx.connectionId,
        source: 'wallet',
      });
      return creds;
    } catch (err) {
      attempted.push('wallet');
      logger.warn('Wallet provider failed', { connectionId: ctx.connectionId, error: String(err) });
    }
  } else {
    attempted.push('wallet (not configured)');
  }

  // 4. External vault
  if (canResolveFromVault()) {
    try {
      const creds = await resolveFromVault(ctx);
      logger.info('Credential resolution succeeded', {
        connectionId: ctx.connectionId,
        source: 'vault',
      });
      return creds;
    } catch (err) {
      attempted.push('vault');
      logger.warn('Vault provider failed', { connectionId: ctx.connectionId, error: String(err) });
    }
  } else {
    attempted.push('vault (not configured)');
  }

  throw new CredentialResolutionError(
    `Could not resolve credentials for connection "${ctx.alias}" (id: ${ctx.connectionId}). ` +
    `Attempted providers: ${attempted.join(', ')}. ` +
    `Set ORACLE_USER + ORACLE_PASSWORD environment variables or create a .env file.`,
    attempted,
  );
}
