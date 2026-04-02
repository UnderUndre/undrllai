/**
 * Output filter — strip ANSI codes, cursor movement, spinner redraws.
 * Converts raw CLI output into clean, parseable lines.
 *
 * Includes LineBuffer for incremental stream processing — chunks arriving
 * mid-JSON-line are accumulated until a full \n-terminated line is available.
 */

import stripAnsi from "strip-ansi";

/**
 * Regex patterns for non-content output that should be removed.
 * These appear in interactive CLI tool output even in headless mode.
 */
const CURSOR_PATTERNS = [
  /\x1b\[\d*[ABCD]/, // cursor movement
  /\x1b\[\d*[JK]/, // erase display/line
  /\x1b\[\d*;\d*[Hf]/, // cursor position
  /\x1b\[\?25[hl]/, // cursor show/hide
  /\x1b\[s/, // save cursor
  /\x1b\[u/, // restore cursor
  /\r(?!\n)/, // carriage return without newline (spinner redraws)
];

const SPINNER_PATTERNS = [
  /^[\s]*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⣾⣽⣻⢿⡿⣟⣯⣷|\\\/\-]+[\s]*$/, // common spinners
  /^[\s]*\.{1,5}[\s]*$/, // bare dots (progress indicator)
  /^\s*$/, // empty lines
];

/**
 * Strip ANSI codes and cursor/spinner artifacts from a single line.
 */
function cleanLine(line: string): string {
  let cleaned = stripAnsi(line);

  for (const pattern of CURSOR_PATTERNS) {
    cleaned = cleaned.replace(new RegExp(pattern.source, "g"), "");
  }

  return cleaned.trim();
}

/**
 * Check if a line is semantic content (not a spinner or empty decoration).
 */
function isSemanticLine(line: string): boolean {
  if (line.length === 0) return false;

  for (const pattern of SPINNER_PATTERNS) {
    if (pattern.test(line)) return false;
  }

  return true;
}

/**
 * Process raw COMPLETE output into clean, semantic lines.
 * Use only when you have the full stdout (e.g. after process exits).
 * For streaming chunks, use LineBuffer instead.
 */
export function filterOutput(raw: string): string[] {
  return raw
    .split("\n")
    .map(cleanLine)
    .filter(isSemanticLine);
}

/**
 * Extract semantic content from COMPLETE stream-json output (Claude Code format).
 * Each line is a JSON object with type + content fields.
 * Use only when you have the full stdout. For streaming, use LineBuffer.
 */
export function filterStreamJson(raw: string): string[] {
  const lines: string[] = [];

  for (const line of raw.split("\n")) {
    const parsed = tryParseJsonLine(line);
    if (parsed !== null) {
      lines.push(parsed);
    }
  }

  return lines;
}

/**
 * Try to parse a single JSON line from stream-json format.
 * Returns cleaned semantic content or null.
 */
function tryParseJsonLine(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;

    // Claude Code stream-json format
    if (parsed["type"] === "assistant" && typeof parsed["content"] === "string") {
      const cleaned = cleanLine(parsed["content"] as string);
      return isSemanticLine(cleaned) ? cleaned : null;
    }

    // Result messages
    if (parsed["type"] === "result" && typeof parsed["result"] === "string") {
      const cleaned = cleanLine(parsed["result"] as string);
      return isSemanticLine(cleaned) ? cleaned : null;
    }

    return null;
  } catch {
    // Not JSON — treat as plain text
    const cleaned = cleanLine(trimmed);
    return isSemanticLine(cleaned) ? cleaned : null;
  }
}

/**
 * Accumulating line buffer for incremental stream processing.
 *
 * Problem: `stdout.on('data')` delivers arbitrary byte chunks. A single JSON
 * line like `{"type":"assistant","content":"..."}` can arrive split across
 * multiple chunks. Splitting on \n mid-chunk loses partial lines.
 *
 * Solution: buffer incomplete trailing data until the next \n arrives.
 *
 * Usage:
 *   const buf = new LineBuffer(isStreamJson);
 *   proc.stdout.on('data', (chunk) => {
 *     for (const line of buf.push(chunk.toString())) {
 *       eventBus.emitEvent({ type: 'stage.output', line, ... });
 *     }
 *   });
 *   // After process exits, flush any remaining partial line:
 *   for (const line of buf.flush()) { ... }
 */
export class LineBuffer {
  private remainder = "";
  private readonly streamJson: boolean;

  constructor(streamJson: boolean = false) {
    this.streamJson = streamJson;
  }

  /**
   * Feed a raw chunk. Returns an array of complete, cleaned, semantic lines.
   */
  push(chunk: string): string[] {
    const data = this.remainder + chunk;
    const parts = data.split("\n");

    // Last element is either "" (chunk ended with \n) or an incomplete line
    this.remainder = parts.pop() ?? "";

    const results: string[] = [];
    for (const part of parts) {
      const line = this.processLine(part);
      if (line !== null) {
        results.push(line);
      }
    }
    return results;
  }

  /**
   * Flush any remaining buffered data (call after process exits).
   */
  flush(): string[] {
    if (!this.remainder) return [];
    const line = this.processLine(this.remainder);
    this.remainder = "";
    return line !== null ? [line] : [];
  }

  private processLine(raw: string): string | null {
    if (this.streamJson) {
      return tryParseJsonLine(raw);
    }
    const cleaned = cleanLine(raw);
    return isSemanticLine(cleaned) ? cleaned : null;
  }
}
