/**
 * Tool spawner — uses execa v9 for headless CLI tool execution.
 * Spawns AI tools (claude, gemini, etc.) with proper flags and captures output.
 *
 * SECURITY: Uses execa() with argument arrays, NOT execaCommand() with string
 * concatenation, to prevent shell injection via prompt contents.
 */

import { execa } from "execa";
import type { ResultPromise } from "execa";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import type { ToolConfig } from "../types.js";

const log = logger.child({ module: "spawner" });

export interface SpawnOptions {
  tool: ToolConfig;
  prompt: string;
  cwd: string;
  timeoutMs?: number;
  systemPrompt?: string;
  env?: Record<string, string>;
}

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  pid?: number;
}

export interface RunningProcess {
  pid: number;
  toolName: string;
  promise: ResultPromise;
  startedAt: number;
}

/**
 * Build argument array for a tool invocation.
 * Each element is a separate argv entry — no shell parsing, no injection risk.
 */
function buildArgs(options: SpawnOptions): string[] {
  const { tool, prompt, systemPrompt } = options;
  const args = [...tool.headlessFlags];

  // Append system prompt if tool supports it (Claude-specific)
  if (systemPrompt && tool.provider === "anthropic") {
    args.push("--append-system-prompt", systemPrompt);
  }

  // Prompt goes last as a raw string — execa passes it as a single argv element
  args.push(prompt);

  return args;
}

/** Common execa options shared between sync and streaming spawn. */
function baseExecaOptions(options: SpawnOptions) {
  return {
    cwd: options.cwd,
    timeout: options.timeoutMs ?? 300_000,
    reject: false as const,
    stripFinalNewline: true as const,
    env: {
      ...process.env,
      ...options.env,
      // Ensure tools don't try to be interactive
      CI: "true",
      TERM: "dumb",
    },
  };
}

/**
 * Spawn a CLI tool and wait for completion.
 * Returns structured output with timing.
 */
export async function spawnTool(options: SpawnOptions): Promise<SpawnResult> {
  const { tool } = options;
  const args = buildArgs(options);

  log.info({ tool: tool.name, cwd: options.cwd, timeoutMs: options.timeoutMs }, "spawning tool");
  log.debug({ command: tool.command, args }, "full command");

  const startedAt = Date.now();

  try {
    const result = await execa(tool.command, args, baseExecaOptions(options));

    const durationMs = Date.now() - startedAt;
    // execa v9 Result type doesn't expose pid in strict mode, but it's there at runtime
    const pid = (result as unknown as { pid?: number }).pid;

    log.info(
      { tool: tool.name, exitCode: result.exitCode, durationMs, pid },
      "tool completed",
    );

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode ?? 0,
      durationMs,
      pid,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("timed out")) {
      throw AppError.toolTimeout(tool.name, options.timeoutMs ?? 300_000);
    }

    throw AppError.toolSpawnFailed(tool.name, message);
  }
}

/**
 * Spawn a tool and return a handle for streaming / watchdog monitoring.
 * Does NOT await completion — caller manages the process lifecycle.
 */
export function spawnToolStreaming(options: SpawnOptions): RunningProcess {
  const { tool } = options;
  const args = buildArgs(options);

  log.info({ tool: tool.name, cwd: options.cwd }, "spawning tool (streaming)");

  const proc = execa(tool.command, args, baseExecaOptions(options));

  return {
    pid: proc.pid ?? 0,
    toolName: tool.name,
    promise: proc,
    startedAt: Date.now(),
  };
}
