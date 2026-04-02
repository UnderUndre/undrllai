/**
 * Process watchdog — monitors spawned tools for hangs and rate limits.
 * Kills processes that produce no stdout for too long.
 */

import treeKill from "tree-kill";
import { logger } from "../utils/logger.js";

const log = logger.child({ module: "watchdog" });

const RATE_LIMIT_PATTERNS = [
  /rate.?limit/i,
  /429/,
  /too many requests/i,
  /quota exceeded/i,
  /throttled/i,
];

export interface WatchdogOptions {
  /** PID to monitor */
  pid: number;
  /** Tool name (for logging) */
  toolName: string;
  /** Max seconds of silence before kill (default: 60) */
  silenceTimeoutSec?: number;
  /** Callback when rate limit detected in stderr */
  onRateLimit?: (message: string) => void;
  /** Callback when silence timeout triggers kill */
  onSilenceKill?: () => void;
}

export class Watchdog {
  private readonly pid: number;
  private readonly toolName: string;
  private readonly silenceTimeoutMs: number;
  private readonly onRateLimit?: (message: string) => void;
  private readonly onSilenceKill?: () => void;
  private lastActivityAt: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private killed = false;

  constructor(options: WatchdogOptions) {
    this.pid = options.pid;
    this.toolName = options.toolName;
    this.silenceTimeoutMs = (options.silenceTimeoutSec ?? 60) * 1000;
    this.onRateLimit = options.onRateLimit;
    this.onSilenceKill = options.onSilenceKill;
    this.lastActivityAt = Date.now();
  }

  /**
   * Start monitoring. Checks for silence every 5 seconds.
   */
  start(): void {
    if (this.timer) return;

    log.info({ pid: this.pid, tool: this.toolName, silenceTimeoutMs: this.silenceTimeoutMs }, "watchdog started");

    this.timer = setInterval(() => {
      const silenceMs = Date.now() - this.lastActivityAt;
      if (silenceMs >= this.silenceTimeoutMs && !this.killed) {
        log.warn(
          { pid: this.pid, tool: this.toolName, silenceMs },
          "silence timeout — killing process tree",
        );
        this.kill();
        this.onSilenceKill?.();
      }
    }, 5_000);
  }

  /**
   * Report activity (call on each stdout/stderr line).
   */
  reportActivity(): void {
    this.lastActivityAt = Date.now();
  }

  /**
   * Check stderr line for rate limit indicators.
   */
  checkStderr(line: string): void {
    for (const pattern of RATE_LIMIT_PATTERNS) {
      if (pattern.test(line)) {
        log.warn({ pid: this.pid, tool: this.toolName, line }, "rate limit detected");
        this.onRateLimit?.(line);
        return;
      }
    }
  }

  /**
   * Kill the monitored process tree.
   */
  kill(): void {
    if (this.killed) return;
    this.killed = true;
    this.stop();

    log.info({ pid: this.pid, tool: this.toolName }, "killing process tree");
    treeKill(this.pid, "SIGKILL", (err) => {
      if (err) {
        log.warn({ pid: this.pid, error: err.message }, "tree-kill failed (process may have already exited)");
      }
    });
  }

  /**
   * Stop monitoring (cleanup timer).
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Whether the process was killed by this watchdog.
   */
  wasKilled(): boolean {
    return this.killed;
  }
}
