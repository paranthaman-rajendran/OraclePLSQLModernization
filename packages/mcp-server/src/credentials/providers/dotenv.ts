/**
 * Priority 2: .env file credential provider.
 * Walks up the directory tree to find a .env file.
 * Uses dotenv.parse() — never dotenv.config() which pollutes process.env.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { parse as parseDotenv } from 'dotenv';
import { registerSecret } from '../../util/sanitize.js';
import { logger } from '../../util/logger.js';
import type { CredentialContext, OracleCredentials } from '../types.js';

/** Walk up from cwd until we find .env, stopping at .git or package.json root */
function findDotEnvFile(): string | undefined {
  let dir = process.cwd();
  const maxDepth = 10;

  for (let i = 0; i < maxDepth; i++) {
    const candidate = resolve(dir, '.env');
    try {
      readFileSync(candidate);  // throws if not found
      return candidate;
    } catch {
      // not found at this level
    }

    const parent = dirname(dir);
    if (parent === dir) break;  // filesystem root

    // Stop if this directory has a .git or package.json (project boundary)
    try {
      readFileSync(resolve(dir, '.git'));
      break;
    } catch { /* no .git here */ }
    try {
      readFileSync(resolve(dir, 'package.json'));
      // keep going — monorepo roots have package.json at every level
    } catch { /* no package.json */ }

    dir = parent;
  }

  return undefined;
}

export function canResolveFromDotenv(): boolean {
  const path = findDotEnvFile();
  if (!path) return false;
  try {
    const content = readFileSync(path, 'utf8');
    const env = parseDotenv(content);
    return !!(env['ORACLE_USER'] && env['ORACLE_PASSWORD']);
  } catch {
    return false;
  }
}

export function resolveFromDotenv(ctx: CredentialContext): OracleCredentials {
  const path = findDotEnvFile();
  if (!path) {
    throw new Error('No .env file found');
  }

  const content = readFileSync(path, 'utf8');
  const env = parseDotenv(content);

  const username = env['ORACLE_USER'] ?? '';
  const password = env['ORACLE_PASSWORD'] ?? '';
  const connectString = env['ORACLE_CONNECT_STRING'];
  const host = env['ORACLE_HOST'] ?? 'localhost';
  const port = parseInt(env['ORACLE_PORT'] ?? '1521', 10);
  const serviceName = env['ORACLE_SERVICE'] ?? env['ORACLE_SID'] ?? 'ORCL';
  const walletLocation = env['ORACLE_WALLET_DIR'] ?? env['TNS_ADMIN'];

  if (!username || !password) {
    throw new Error('ORACLE_USER or ORACLE_PASSWORD missing in .env file');
  }

  // Register secrets for log scrubbing (never log the path content)
  if (password) registerSecret(password);

  logger.info('Credentials resolved from .env', {
    connectionId: ctx.connectionId,
    credentialSource: 'dotenv',
    // path logged without content
    dotenvPath: path,
  });

  return {
    host,
    port,
    serviceName,
    username,
    password,
    connectString,
    walletLocation,
    credentialSource: 'dotenv',
  };
}
