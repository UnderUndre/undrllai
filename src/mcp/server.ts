/**
 * MCP server — exposes orchestrator tools via Model Context Protocol.
 * Uses StdioServerTransport for Claude Code integration.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { loadConfig } from "../config/loader.js";
import { ToolRegistry } from "../registry/tool-registry.js";
import { executePipeline } from "../engine/pipeline.js";
import { gcWorktrees } from "../worktree/manager.js";
import { logger } from "../utils/logger.js";
import {
  orchRunSchema,
  orchToolsListSchema,
  orchCleanupSchema,
} from "./tools.js";

const log = logger.child({ module: "mcp" });

/**
 * Create and start the MCP server.
 */
export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: "orch",
    version: "0.1.0",
  });

  // --- orch.run ---
  server.tool(
    "orch_run",
    "Start a new AI orchestration run",
    {
      description: z.string().describe("Task description for AI tools"),
      projectDir: z.string().optional().describe("Project directory (defaults to cwd)"),
      dryRun: z.boolean().optional().describe("Show plan without executing"),
    },
    async (args) => {
      const input = orchRunSchema.parse(args);

      if (input.dryRun) {
        const config = loadConfig(input.projectDir ?? process.cwd());
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              runId: "dry-run",
              status: "dry-run",
              message: "Pipeline plan generated (no processes spawned)",
              pipeline: config.pipeline,
              ensemble: config.ensemble,
            }, null, 2),
          }],
        };
      }

      const config = loadConfig(input.projectDir ?? process.cwd());
      const registry = new ToolRegistry(config);
      const runId = uuid();

      try {
        await executePipeline({
          runId,
          description: input.description,
          projectDir: input.projectDir ?? process.cwd(),
          config,
          registry,
        });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              runId,
              status: "pipeline_complete",
              message: "Pipeline stages completed. Ensemble execution pending.",
            }),
          }],
        };
      } catch (err: unknown) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              runId,
              status: "failed",
              message: err instanceof Error ? err.message : String(err),
            }),
          }],
        };
      }
    },
  );

  // --- orch.status ---
  server.tool(
    "orch_status",
    "Get orchestration run status",
    {
      runId: z.string().optional().describe("Run ID (latest if omitted)"),
    },
    async (_args) => {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            message: "Status tracking requires DB integration (coming soon)",
          }),
        }],
      };
    },
  );

  // --- orch.tools_list ---
  server.tool(
    "orch_tools_list",
    "List registered AI tools",
    {
      healthCheck: z.boolean().optional().describe("Include health check results"),
    },
    async (args) => {
      const input = orchToolsListSchema.parse(args);
      const config = loadConfig(process.cwd());
      const registry = new ToolRegistry(config);

      const tools = registry.listTools().map((t) => ({
        name: t.name,
        command: t.command,
        strengths: t.strengths,
        priority: t.priority,
        provider: t.provider,
        enabled: t.enabled,
      }));

      if (input.healthCheck) {
        const results = await registry.healthCheckAll();
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ tools, healthResults: results }, null, 2),
          }],
        };
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ tools }, null, 2),
        }],
      };
    },
  );

  // --- orch.cleanup ---
  server.tool(
    "orch_cleanup",
    "Remove orphaned worktrees",
    {
      force: z.boolean().optional().describe("Remove all worktrees"),
      maxAgeHours: z.number().optional().describe("Max age in hours"),
    },
    async (args) => {
      const input = orchCleanupSchema.parse(args);
      const removed = await gcWorktrees(process.cwd(), input.maxAgeHours);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ removed, message: `Removed ${removed} orphaned worktrees` }),
        }],
      };
    },
  );

  // Connect via stdio
  const transport = new StdioServerTransport();
  log.info("MCP server starting on stdio");
  await server.connect(transport);
}
