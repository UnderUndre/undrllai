/**
 * Tools API route — GET /api/tools
 */

import { Hono } from "hono";
import { loadConfig } from "../../config/loader.js";
import { ToolRegistry } from "../../registry/tool-registry.js";

export const toolsRouter = new Hono();

toolsRouter.get("/", (c) => {
  try {
    const config = loadConfig();
    const registry = new ToolRegistry(config);
    const tools = registry.listTools().map((t) => ({
      name: t.name,
      command: t.command,
      strengths: t.strengths,
      priority: t.priority,
      provider: t.provider,
      enabled: t.enabled,
    }));
    return c.json({ tools });
  } catch (err: unknown) {
    return c.json({
      error: err instanceof Error ? err.message : "Failed to load config",
    }, 500);
  }
});
