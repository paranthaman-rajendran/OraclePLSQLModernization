/**
 * Oracle connection pool factory — Thin mode only.
 * node-oracledb Thin mode requires no Oracle Client installation.
 *
 * SECURITY: This module never logs connection strings or passwords.
 * The pool is keyed by connectionId; credentials are consumed here
 * and never stored beyond the pool creation call.
 */

import oracledb from 'node-oracledb';
import { logger } from '../util/logger.js';
import { OracleConnectionError } from '../util/error.js';
import type { OracleCredentials } from '../credentials/types.js';

// Ensure Thin mode — never call initOracleClientWithArgs
oracledb.initOracleClient(); // no-op in Thin mode; ensures Thin is active

export interface PoolConfig {
  readonly min?: number;
  readonly max?: number;
  readonly increment?: number;
  readonly pingInterval?: number;
  readonly stmtCacheSize?: number;
}

const DEFAULT_POOL_CONFIG: Required<PoolConfig> = {
  min: 1,
  max: 5,
  increment: 1,
  pingInterval: 60,
  stmtCacheSize: 30,
};

/** Registry of active connection pools keyed by connectionId */
const pools = new Map<string, oracledb.Pool>();

/**
 * Create or return an existing pool for the given connectionId.
 * Credentials are used once to create the pool and not retained.
 */
export async function getPool(
  connectionId: string,
  credentials: OracleCredentials,
  config: PoolConfig = {},
): Promise<oracledb.Pool> {
  const existing = pools.get(connectionId);
  if (existing) {
    return existing;
  }

  const merged = { ...DEFAULT_POOL_CONFIG, ...config };

  logger.info('Creating Oracle connection pool', {
    connectionId,
    host: credentials.host,
    port: credentials.port,
    serviceName: credentials.serviceName,
    credentialSource: credentials.credentialSource,
    // password and username are intentionally omitted
  });

  try {
    const pool = await oracledb.createPool({
      user: credentials.username,
      password: credentials.password,
      connectString: buildConnectString(credentials),
      poolMin: merged.min,
      poolMax: merged.max,
      poolIncrement: merged.increment,
      poolPingInterval: merged.pingInterval,
      stmtCacheSize: merged.stmtCacheSize,
      poolAlias: connectionId,
    });

    pools.set(connectionId, pool);
    logger.info('Oracle pool created', { connectionId, poolMin: merged.min, poolMax: merged.max });
    return pool;
  } catch (error) {
    throw new OracleConnectionError(
      `Failed to create pool for connection "${connectionId}"`,
      error,
    );
  }
}

/**
 * Execute a query using a connection from the specified pool.
 * Always releases the connection back to the pool.
 */
export async function executeQuery<T extends Record<string, unknown>>(
  connectionId: string,
  sql: string,
  binds: Record<string, unknown> = {},
): Promise<T[]> {
  const pool = pools.get(connectionId);
  if (!pool) {
    throw new OracleConnectionError(`No pool for connectionId "${connectionId}". Connect first.`);
  }

  let connection: oracledb.Connection | undefined;
  try {
    connection = await pool.getConnection();
    const result = await connection.execute<T>(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      fetchArraySize: 200,
    });
    return (result.rows ?? []) as T[];
  } finally {
    if (connection) {
      await connection.close().catch(() => { /* best-effort close */ });
    }
  }
}

/** Close and remove the pool for a given connectionId */
export async function closePool(connectionId: string): Promise<void> {
  const pool = pools.get(connectionId);
  if (!pool) return;
  try {
    await pool.close(10); // 10s drain timeout
    pools.delete(connectionId);
    logger.info('Oracle pool closed', { connectionId });
  } catch (error) {
    logger.error('Error closing pool', error, { connectionId });
  }
}

/** Close all pools (called on server shutdown) */
export async function closeAllPools(): Promise<void> {
  await Promise.allSettled([...pools.keys()].map(closePool));
}

/** Build an Easy Connect string from credentials */
function buildConnectString(creds: OracleCredentials): string {
  if (creds.connectString) {
    return creds.connectString;
  }
  return `${creds.host}:${creds.port}/${creds.serviceName}`;
}
