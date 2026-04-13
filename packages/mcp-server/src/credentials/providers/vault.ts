/**
 * Priority 4: External Secret Manager credential provider.
 * Supports HashiCorp Vault, Azure Key Vault, AWS Secrets Manager.
 *
 * Phase 0: stubs that detect presence of configuration.
 * Phase 1: full implementation.
 */

import { logger } from '../../util/logger.js';
import { NotImplementedError } from '../../util/error.js';
import { registerSecret } from '../../util/sanitize.js';
import type { CredentialContext, OracleCredentials } from '../types.js';

type VaultProvider = 'hashicorp' | 'azure' | 'aws';

function detectVaultProvider(): VaultProvider | undefined {
  if (process.env['VAULT_ADDR'] && process.env['VAULT_TOKEN']) return 'hashicorp';
  if (process.env['AZURE_KEYVAULT_URI']) return 'azure';
  if (process.env['AWS_SECRETS_MANAGER_ARN'] || process.env['AWS_SECRETS_MANAGER_REGION']) return 'aws';
  return undefined;
}

export function canResolveFromVault(): boolean {
  return detectVaultProvider() !== undefined;
}

export async function resolveFromVault(ctx: CredentialContext): Promise<OracleCredentials> {
  const provider = detectVaultProvider();

  logger.info('Attempting vault credential resolution', {
    connectionId: ctx.connectionId,
    vaultProvider: provider,
  });

  switch (provider) {
    case 'hashicorp':
      return resolveFromHashiCorpVault(ctx);
    case 'azure':
      return resolveFromAzureKeyVault(ctx);
    case 'aws':
      return resolveFromAwsSecretsManager(ctx);
    default:
      throw new Error('No vault provider configured');
  }
}

async function resolveFromHashiCorpVault(_ctx: CredentialContext): Promise<OracleCredentials> {
  const addr = process.env['VAULT_ADDR'] ?? '';
  const secretPath = process.env['VAULT_SECRET_PATH'] ?? '';

  if (!secretPath) {
    throw new Error('VAULT_SECRET_PATH must be set for HashiCorp Vault credential resolution');
  }

  // Phase 1: implement actual Vault HTTP call
  // GET {VAULT_ADDR}/v1/{VAULT_SECRET_PATH}
  // Headers: X-Vault-Token: process.env['VAULT_TOKEN']
  throw new NotImplementedError(`HashiCorp Vault provider (addr: ${addr}, path: ${secretPath})`);
}

async function resolveFromAzureKeyVault(_ctx: CredentialContext): Promise<OracleCredentials> {
  const uri = process.env['AZURE_KEYVAULT_URI'] ?? '';
  const secretName = process.env['AZURE_KEYVAULT_SECRET_NAME'] ?? '';

  if (!secretName) {
    throw new Error('AZURE_KEYVAULT_SECRET_NAME must be set for Azure Key Vault credential resolution');
  }

  // Phase 1: implement using @azure/keyvault-secrets + @azure/identity
  throw new NotImplementedError(`Azure Key Vault provider (uri: ${uri})`);
}

async function resolveFromAwsSecretsManager(_ctx: CredentialContext): Promise<OracleCredentials> {
  const arn = process.env['AWS_SECRETS_MANAGER_ARN'] ?? '';
  const region = process.env['AWS_SECRETS_MANAGER_REGION'] ?? 'us-east-1';

  if (!arn) {
    throw new Error('AWS_SECRETS_MANAGER_ARN must be set for AWS Secrets Manager credential resolution');
  }

  // Phase 1: implement using @aws-sdk/client-secrets-manager
  throw new NotImplementedError(`AWS Secrets Manager provider (region: ${region})`);
}

/** Parse a secret JSON blob (standard format: { username, password, host, port, serviceName }) */
export function parseSecretJson(
  secretJson: string,
  source: 'vault',
): OracleCredentials {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(secretJson) as Record<string, unknown>;
  } catch {
    throw new Error('Secret value is not valid JSON');
  }

  const username = String(parsed['username'] ?? parsed['user'] ?? '');
  const password = String(parsed['password'] ?? parsed['pwd'] ?? '');
  const host = String(parsed['host'] ?? 'localhost');
  const port = Number(parsed['port'] ?? 1521);
  const serviceName = String(parsed['serviceName'] ?? parsed['service'] ?? 'ORCL');
  const connectString = parsed['connectString'] ? String(parsed['connectString']) : undefined;

  if (!username || !password) {
    throw new Error('Secret JSON missing required fields: username, password');
  }

  registerSecret(password);

  return { username, password, host, port, serviceName, connectString, credentialSource: source };
}
