/**
 * Review output parser — extracts APPROVE/REJECT decision and feedback.
 * Expected format: first line is "APPROVE" or "REJECT", rest is feedback.
 */

import { logger } from "../utils/logger.js";
import type { ReviewResult } from "../types.js";

const log = logger.child({ module: "review-parser" });

/**
 * Parse review output from a CLI tool.
 * Expects first meaningful line to be APPROVE or REJECT.
 * Everything after is feedback.
 */
export function parseReviewOutput(
  raw: string,
  toolName: string,
  durationMs: number,
): ReviewResult {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);

  if (lines.length === 0) {
    log.warn({ toolName }, "empty review output — defaulting to REJECT");
    return {
      decision: "REJECT",
      feedback: "Empty review output — no decision provided",
      toolName,
      durationMs,
    };
  }

  const firstLine = lines[0]!.toUpperCase();
  const feedback = lines.slice(1).join("\n").trim();

  if (firstLine.startsWith("APPROVE")) {
    log.info({ toolName, feedback: feedback.slice(0, 100) }, "review: APPROVE");
    return {
      decision: "APPROVE",
      feedback: feedback || "Approved without additional feedback",
      toolName,
      durationMs,
    };
  }

  if (firstLine.startsWith("REJECT")) {
    log.info({ toolName, feedback: feedback.slice(0, 100) }, "review: REJECT");
    return {
      decision: "REJECT",
      feedback: feedback || "Rejected without specific feedback",
      toolName,
      durationMs,
    };
  }

  // First line is neither APPROVE nor REJECT — treat as REJECT with full output as feedback
  log.warn({ toolName, firstLine }, "malformed review output — defaulting to REJECT");
  return {
    decision: "REJECT",
    feedback: `Malformed review output (expected APPROVE/REJECT on first line):\n${raw}`,
    toolName,
    durationMs,
  };
}
