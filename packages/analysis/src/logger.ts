/**
 * Logger interface used throughout the analysis engine.
 * Callers supply an implementation — vscode Output Channel, console, or no-op.
 *
 * Default export is a silent no-op logger so the engine can be used
 * without wiring up any logging infrastructure.
 */

export interface Logger {
  debug(message: string, detail?: string): void;
  info(message: string, detail?: string): void;
  warn(message: string, detail?: string): void;
  error(message: string, error?: unknown): void;
}

/** Silent no-op — used when no logger is provided */
export const noopLogger: Logger = {
  debug: () => undefined,
  info:  () => undefined,
  warn:  () => undefined,
  error: () => undefined,
};

/** Console-based logger for CLI use */
export const consoleLogger: Logger = {
  debug: (msg, detail) => detail ? console.debug(`[DBG] ${msg}`, detail) : console.debug(`[DBG] ${msg}`),
  info:  (msg, detail) => detail ? console.info(`[INF] ${msg}`, detail)  : console.info(`[INF] ${msg}`),
  warn:  (msg, detail) => detail ? console.warn(`[WRN] ${msg}`, detail)  : console.warn(`[WRN] ${msg}`),
  error: (msg, err)    => {
    const detail = err instanceof Error
      ? `${err.message}${err.stack ? '\n' + err.stack : ''}`
      : err !== undefined ? String(err) : '';
    console.error(`[ERR] ${msg}${detail ? '\n  ' + detail : ''}`);
  },
};
