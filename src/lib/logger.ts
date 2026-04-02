// @ts-nocheck — typing deferred (matches server.ts convention)
/**
 * Structured JSON logging for purmemo MCP server.
 * All log output goes to stderr (keeps stdout clean for MCP protocol).
 */

export function logStructured(level, message, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    message,
    ...context
  };
  console.error(JSON.stringify(entry));
}

export const structuredLog = {
  info: (msg, ctx = {}) => logStructured('info', msg, ctx),
  warn: (msg, ctx = {}) => logStructured('warn', msg, ctx),
  error: (msg, ctx = {}) => logStructured('error', msg, ctx),
  debug: (msg, ctx = {}) => logStructured('debug', msg, ctx)
};
