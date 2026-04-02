/**
 * Tool registry — manages available CLI tools, health checks, and selection.
 */

import { spawnTool } from "../process/spawner.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../utils/errors.js";
import type { OrchConfig, ToolConfig, ToolHealthResult } from "../types.js";

const log = logger.child({ module: "registry" });

export class ToolRegistry {
  private readonly tools: Map<string, ToolConfig>;

  constructor(config: OrchConfig) {
    this.tools = new Map();
    for (const [name, tool] of Object.entries(config.tools)) {
      this.tools.set(name, { ...tool, name });
    }
    log.info({ tools: [...this.tools.keys()] }, "registry initialized");
  }

  /**
   * Get a tool config by name.
   */
  getTool(name: string): ToolConfig {
    const tool = this.tools.get(name);
    if (!tool) {
      throw AppError.toolNotFound(name);
    }
    return tool;
  }

  /**
   * Get all enabled tools.
   */
  getEnabledTools(): ToolConfig[] {
    return [...this.tools.values()].filter((t) => t.enabled);
  }

  /**
   * List all tools (enabled + disabled).
   */
  listTools(): ToolConfig[] {
    return [...this.tools.values()].sort((a, b) => a.priority - b.priority);
  }

  /**
   * Health check — spawn tool with a test prompt, measure response time.
   */
  async healthCheck(name: string): Promise<ToolHealthResult> {
    const tool = this.getTool(name);
    const prompt = tool.healthCheckPrompt ?? 'Reply with exactly "OK" and nothing else.';

    log.info({ tool: name }, "running health check");
    const startedAt = Date.now();

    try {
      const result = await spawnTool({
        tool,
        prompt,
        cwd: process.cwd(),
        timeoutMs: 30_000,
      });

      const responseTimeMs = Date.now() - startedAt;
      const available = result.exitCode === 0;

      log.info({ tool: name, available, responseTimeMs }, "health check complete");

      return {
        name,
        available,
        responseTimeMs,
        error: available ? undefined : `Exit code: ${result.exitCode}`,
      };
    } catch (err: unknown) {
      const responseTimeMs = Date.now() - startedAt;
      const error = err instanceof Error ? err.message : String(err);

      log.warn({ tool: name, error }, "health check failed");

      return {
        name,
        available: false,
        responseTimeMs,
        error,
      };
    }
  }

  /**
   * Run health checks on all enabled tools.
   */
  async healthCheckAll(): Promise<ToolHealthResult[]> {
    const enabled = this.getEnabledTools();
    return Promise.all(enabled.map((t) => this.healthCheck(t.name)));
  }
}
