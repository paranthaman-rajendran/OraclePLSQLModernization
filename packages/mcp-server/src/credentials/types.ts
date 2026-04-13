/**
 * Credential types — used internally by the MCP server only.
 * These types NEVER flow into MCP tool parameters or responses.
 */

export type CredentialSource = 'env' | 'dotenv' | 'wallet' | 'vault' | 'secretStorage';

/**
 * Resolved Oracle credentials.
 * Held in memory only for the duration of pool creation.
 * Never serialized, logged, or passed through MCP protocol.
 */
export interface OracleCredentials {
  readonly host: string;
  readonly port: number;
  readonly serviceName: string;
  readonly username: string;
  readonly password: string;
  /** Pre-built connect string (overrides host/port/serviceName if provided) */
  readonly connectString?: string;
  readonly walletLocation?: string;
  readonly walletPassword?: string;
  /** Which provider resolved these credentials — logged without the values */
  readonly credentialSource: CredentialSource;
}

export interface CredentialContext {
  /** Identifier for the connection being established — NOT a credential value */
  readonly connectionId: string;
  /** Human-readable alias for logging */
  readonly alias: string;
}
