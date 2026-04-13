/**
 * Typed error hierarchy for the MCP server.
 * All messages must be sanitized before reaching logs (handled by logger).
 */

export class OracleConnectionError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'OracleConnectionError';
  }
}

export class CredentialResolutionError extends Error {
  constructor(
    message: string,
    public readonly attemptedProviders: string[],
  ) {
    super(message);
    this.name = 'CredentialResolutionError';
  }
}

export class McpToolError extends Error {
  constructor(
    message: string,
    public readonly toolName: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'McpToolError';
  }
}

export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`Not yet implemented: ${feature}`);
    this.name = 'NotImplementedError';
  }
}
