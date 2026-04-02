/**
 * Contract generation phase — spawns a tool to generate TypeScript interfaces
 * from the plan/data-model, then locks the contract files as read-only.
 */

import { chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { v4 as uuid } from "uuid";
import { spawnTool } from "../process/spawner.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../utils/errors.js";
import type { ToolRegistry } from "../registry/tool-registry.js";
import type { OrchConfig } from "../types.js";

const log = logger.child({ module: "contracts" });

export interface ContractResult {
  id: string;
  filePaths: string[];
  generatedBy: string;
  lockedAt: string;
}

export interface ContractContext {
  runId: string;
  projectDir: string;
  config: OrchConfig;
  registry: ToolRegistry;
  planPath: string;
}

/**
 * Generate contracts from the plan, then lock them read-only.
 */
export async function generateContracts(ctx: ContractContext): Promise<ContractResult> {
  const { runId, projectDir, config, registry, planPath } = ctx;
  const toolName = config.pipeline.contracts;
  const tool = registry.getTool(toolName);

  log.info({ runId, toolName, planPath }, "generating contracts");

  const prompt = [
    `Generate TypeScript interface contracts based on the implementation plan at ${planPath}.`,
    "Create interfaces for all API endpoints, data models, and service boundaries.",
    "Write the contracts to a contracts/ directory.",
    "Each contract file should be self-contained with proper imports.",
  ].join("\n");

  const result = await spawnTool({
    tool,
    prompt,
    cwd: projectDir,
    timeoutMs: config.defaults.timeouts.implementation * 1000,
  });

  if (result.exitCode !== 0) {
    throw AppError.stageFailed("contracts", "contracts", `Tool exited with code ${result.exitCode}`);
  }

  const contractsDir = join(projectDir, "contracts");
  const contractFiles: string[] = [];

  if (existsSync(contractsDir)) {
    // Find generated contract files
    const { readdirSync } = await import("node:fs");
    const files = readdirSync(contractsDir);
    for (const file of files) {
      if (file.endsWith(".ts") || file.endsWith(".json")) {
        const filePath = join(contractsDir, file);
        contractFiles.push(filePath);

        // Lock as read-only (chmod 444)
        try {
          chmodSync(filePath, 0o444);
          log.info({ file }, "contract locked (read-only)");
        } catch (err: unknown) {
          // chmod may fail on Windows — log but don't fail
          log.warn({ file, error: (err as Error).message }, "failed to set read-only (non-fatal on Windows)");
        }
      }
    }
  }

  const lockedAt = new Date().toISOString();

  log.info({ contractCount: contractFiles.length, lockedAt }, "contracts generated and locked");

  return {
    id: uuid(),
    filePaths: contractFiles,
    generatedBy: toolName,
    lockedAt,
  };
}
