/**
 * Credential scrubber — MUST wrap every string written to stderr/logs.
 * This is the single choke point that prevents credentials from appearing
 * in any log output, error messages, or diagnostic data.
 *
 * Patterns redacted:
 * - Oracle connection strings (Easy Connect: host:port/service)
 * - PASSWORD= patterns in TNS descriptors
 * - Common credential key=value patterns
 * - Wallet file paths
 * - Anything matching ORACLE_PASSWORD env var value (injected at startup)
 */

const REDACTED = '[REDACTED]';

/** Sensitive string patterns to mask */
const PATTERNS: RegExp[] = [
  // Easy Connect strings: user/pass@host:port/service
  /\b\w+\/[^@\s]+@[\w.-]+(?::\d+)?\/\w+/gi,
  // TNS PASSWORD= (case-insensitive)
  /\bPASSWORD\s*=\s*["']?[^\s"')]+["']?/gi,
  // Generic key=value for sensitive keys
  /\b(?:password|passwd|pwd|secret|token|credential|key)\s*[=:]\s*["']?[^\s"',)]+["']?/gi,
  // Oracle Wallet paths (contains .sso or .p12)
  /[^\s]*(?:cwallet\.sso|ewallet\.p12|ewallet\.pem)[^\s]*/gi,
  // Connection strings with @ symbol that look like credentials
  /[\w.%+-]+:[^@\s]+@[\w.-]+/g,
];

/** Runtime-injected sensitive values (set once at startup) */
const injectedSecrets = new Set<string>();

/**
 * Register a runtime secret value to be redacted from all log output.
 * Call once per credential at resolution time. The value is never stored
 * beyond this Set.
 */
export function registerSecret(value: string): void {
  if (value.length > 3) {
    injectedSecrets.add(value);
  }
}

/**
 * Scrub a string before writing to any log output.
 * Returns the sanitized string with all credential patterns replaced.
 */
export function sanitize(input: string): string {
  let result = input;

  // Redact registered runtime secrets first (exact match)
  for (const secret of injectedSecrets) {
    result = result.replaceAll(secret, REDACTED);
  }

  // Redact pattern-matched credentials
  for (const pattern of PATTERNS) {
    result = result.replace(pattern, REDACTED);
  }

  return result;
}

/**
 * Sanitize an Error object — strips credentials from message and stack.
 */
export function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    const msg = sanitize(error.message);
    const stack = error.stack ? sanitize(error.stack) : '';
    return stack ? `${msg}\n${stack}` : msg;
  }
  return sanitize(String(error));
}
