#!/usr/bin/env node
/**
 * MCP Server entry point.
 * Connects the MCP Server to stdio transport.
 *
 * CRITICAL: stdout is reserved exclusively for MCP JSON-RPC messages.
 * ALL diagnostic output (logs, errors) goes to stderr ONLY via logger.ts.
 * console.log is intentionally avoided throughout this server.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer, closeAllPools } from './server.js';
import { logger } from './util/logger.js';

async function main(): Promise<void> {
  logger.info('PL/SQL Analyzer MCP Server starting', { version: '0.1.0' });

  const server = createMcpServer();
  const transport = new StdioServerTransport();

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down`);
    try {
      await closeAllPools();
      await server.close();
    } catch (err) {
      logger.error('Error during shutdown', err);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', err);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', reason);
    process.exit(1);
  });

  await server.connect(transport);
  logger.info('MCP Server connected on stdio — ready');
}

main().catch((err) => {
  // Last-resort error: write to stderr directly since logger may not be initialized
  process.stderr.write(`Fatal error starting MCP server: ${String(err)}\n`);
  process.exit(1);
});
