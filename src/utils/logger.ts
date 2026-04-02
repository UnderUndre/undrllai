/**
 * Structured logger via pino.
 * All logging goes through this — no console.log anywhere.
 */

import pino from "pino";

export const logger = pino({
  name: "orch",
  level: process.env["ORCH_LOG_LEVEL"] ?? "info",
  // No transport — pino writes JSON to stdout by default.
  // For human-readable dev output: ORCH_LOG_LEVEL=debug | pino-pretty
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = pino.Logger;

export function createChildLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}
