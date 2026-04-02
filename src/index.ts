#!/usr/bin/env node
/**
 * CLI entry point — orch command.
 * Wires all modules together: config → registry → pipeline → ensemble → merge.
 */

import { Command } from "commander";
import { v4 as uuid } from "uuid";
import { loadConfig } from "./config/loader.js";
import { ToolRegistry } from "./registry/tool-registry.js";
import { executePipeline } from "./engine/pipeline.js";
import { executeEnsemble } from "./engine/ensemble.js";
import { mergeWorktrees } from "./engine/merger.js";
import { parseTasks, parseDependencyGraph } from "./parsers/tasks-parser.js";
import { cleanupRunWorktrees, gcWorktrees } from "./worktree/manager.js";
import { closeDb } from "./db/client.js";
import { logger } from "./utils/logger.js";
import { AppError } from "./utils/errors.js";
import type { OrchConfig } from "./types.js";

const log = logger.child({ module: "cli" });

const program = new Command();

program
  .name("orch")
  .description("Multi-model AI orchestrator — coordinate AI coding assistants through speckit pipelines")
  .version("0.1.0");

// --- orch run ---
program
  .command("run")
  .description("Start a new orchestration run")
  .argument("<description>", "Task description for AI tools")
  .option("--dry-run", "Show execution plan without running", false)
  .option("--tools <list>", "Comma-separated tool override list")
  .option("--from <stage>", "Resume from stage: specify|plan|contracts|tasks|review-tasks")
  .option("--spec-dir <path>", "Path to existing speckit artifacts (e.g. specs/001-feature/)")
  .action(async (description: string, opts: { dryRun: boolean; tools?: string; from?: string; specDir?: string }) => {
    const config = loadConfig(process.cwd());
    const registry = new ToolRegistry(config);

    if (opts.dryRun) {
      printDryRun(config);
      return;
    }

    const runId = uuid();
    log.info({ runId, description }, "starting run");

    try {
      // Phase 1: Pipeline (specify → review → plan → review → ...)
      log.info("phase: pipeline");
      const pipelineResult = await executePipeline({
        runId,
        description,
        projectDir: process.cwd(),
        config,
        registry,
        fromStage: opts.from as import("./types.js").StageType | undefined,
        specDir: opts.specDir,
      });

      // Phase 2: Parse generated tasks
      const tasksPath = pipelineResult.artifacts.tasksPath;
      if (!tasksPath) {
        throw AppError.runFailed(runId, "Pipeline did not generate tasks.md");
      }

      const tasks = parseTasks(tasksPath);
      const graph = parseDependencyGraph(tasksPath);

      // Phase 3: Ensemble (parallel implementation)
      log.info("phase: ensemble");
      const ensembleResult = await executeEnsemble({
        runId,
        projectDir: process.cwd(),
        config,
        registry,
        tasks,
        graph,
        contextFiles: [
          pipelineResult.artifacts.specPath,
          pipelineResult.artifacts.planPath,
          ...pipelineResult.artifacts.contractPaths,
        ].filter(Boolean) as string[],
      });

      // Phase 4: Merge
      log.info("phase: merge");
      const mergeResult = await mergeWorktrees({
        runId,
        projectDir: process.cwd(),
        config,
        tasks: ensembleResult.tasks,
      });

      // Cleanup worktrees
      await cleanupRunWorktrees(process.cwd(), runId);

      // Report
      const completed = ensembleResult.tasks.filter((t) => t.status === "completed").length;
      const failed = ensembleResult.tasks.filter((t) => t.status === "failed").length;
      const blocked = ensembleResult.tasks.filter((t) => t.status === "blocked").length;

      log.info({
        runId,
        completed,
        failed,
        blocked,
        merged: mergeResult.success,
        branch: mergeResult.branch,
      }, "run complete");

      process.stdout.write(`\n[complete] Run ${runId}\n`);
      process.stdout.write(`  Tasks: ${completed} completed, ${failed} failed, ${blocked} blocked\n`);
      process.stdout.write(`  Branch: ${mergeResult.branch}\n`);
      process.stdout.write(`  Validation: ${mergeResult.validationPassed ? "PASSED" : "FAILED"}\n`);
    } catch (err: unknown) {
      log.error({ runId, error: err }, "run failed");
      process.stderr.write(`[error] ${err instanceof Error ? err.message : String(err)}\n`);
      process.exitCode = 1;
    }
  });

// --- orch status ---
program
  .command("status")
  .description("Show run status")
  .argument("[run-id]", "Run ID (shows latest if omitted)")
  .action((_runId?: string) => {
    process.stdout.write("Status command not yet connected to DB\n");
  });

// --- orch tools list ---
program
  .command("tools")
  .description("Manage AI tools")
  .command("list")
  .description("List registered tools")
  .action(() => {
    const config = loadConfig(process.cwd());
    const registry = new ToolRegistry(config);
    const tools = registry.listTools();

    process.stdout.write("\nRegistered Tools:\n");
    for (const tool of tools) {
      const status = tool.enabled ? "✓" : "✗";
      process.stdout.write(`  ${status} ${tool.name} (${tool.provider}) — priority: ${tool.priority}\n`);
      process.stdout.write(`    command: ${tool.command}\n`);
      process.stdout.write(`    strengths: ${tool.strengths.join(", ")}\n`);
    }
  });

// --- orch tools test ---
program
  .command("tools")
  .command("test")
  .description("Health-check a tool")
  .argument("<name>", "Tool name to test")
  .action(async (name: string) => {
    const config = loadConfig(process.cwd());
    const registry = new ToolRegistry(config);
    const result = await registry.healthCheck(name);

    if (result.available) {
      process.stdout.write(`${name} ✓ (healthy, ${result.responseTimeMs}ms)\n`);
    } else {
      process.stdout.write(`${name} ✗ (${result.error})\n`);
      process.exitCode = 1;
    }
  });

// --- orch config ---
const configCmd = program.command("config").description("Manage configuration");

configCmd
  .command("get")
  .argument("<key>", "Config key (dot notation)")
  .action((key: string) => {
    const config = loadConfig(process.cwd());
    const value = getNestedValue(config, key);
    process.stdout.write(`${key} = ${JSON.stringify(value)}\n`);
  });

// --- orch cleanup ---
program
  .command("cleanup")
  .description("Remove orphaned worktrees")
  .option("--force", "Remove all worktrees including active", false)
  .option("--max-age <hours>", "Max age in hours for orphan detection", "24")
  .action(async (opts: { force: boolean; maxAge: string }) => {
    const removed = await gcWorktrees(process.cwd(), parseInt(opts.maxAge, 10));
    process.stdout.write(`Removed ${removed} orphaned worktrees\n`);
  });

// --- orch stats ---
program
  .command("stats")
  .description("Show per-tool performance metrics")
  .action(() => {
    process.stdout.write("Stats command requires metrics collection (Phase 5)\n");
  });

// --- orch nuke ---
program
  .command("nuke")
  .description("Hard reset — drop all data, remove all worktrees, reset DB")
  .action(async () => {
    process.stdout.write("Nuke command — removing all worktrees and resetting DB\n");
    await gcWorktrees(process.cwd(), 0);
    closeDb();
    const { unlinkSync, existsSync } = await import("node:fs");
    const dbPath = (await import("./db/client.js")).getDbPath();
    for (const suffix of ["", "-wal", "-shm"]) {
      const file = dbPath + suffix;
      if (existsSync(file)) {
        unlinkSync(file);
        process.stdout.write(`  Deleted: ${file}\n`);
      }
    }
    process.stdout.write("Done. All data wiped.\n");
  });

// --- Graceful shutdown ---
function setupShutdownHandlers(): void {
  const shutdown = async (signal: string) => {
    log.info({ signal }, "shutting down gracefully");
    closeDb();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

function printDryRun(config: OrchConfig): void {
  process.stdout.write("\nPipeline Plan:\n");
  const stages = ["specify", "review-spec", "plan", "review-plan", "contracts", "tasks", "review-tasks"] as const;
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i]!;
    const tool = config.pipeline[stage];
    process.stdout.write(`  ${i + 1}. ${stage.padEnd(14)} → ${tool}\n`);
  }

  process.stdout.write("\nEnsemble Plan (based on task agent tags):\n");
  for (const [agent, tool] of Object.entries(config.ensemble)) {
    process.stdout.write(`  ${agent.padEnd(8)} → ${tool}\n`);
  }

  process.stdout.write("\nNo processes spawned (dry-run mode).\n");
}

function getNestedValue(obj: unknown, path: string): unknown {
  return path.split(".").reduce((acc: unknown, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

setupShutdownHandlers();
program.parse();
