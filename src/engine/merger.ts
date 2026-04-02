/**
 * Merger — merges worktree branches into a result branch, runs build validation.
 */

import { execaCommand } from "execa";
import {
  mergeBranch,
  createBranch,
  checkoutBranch,
  getCurrentBranch,
} from "../utils/git.js";
import { eventBus } from "../events/bus.js";
import { logger } from "../utils/logger.js";
import type { OrchConfig, MergeResult, RuntimeTask } from "../types.js";

const log = logger.child({ module: "merger" });

export interface MergeContext {
  runId: string;
  projectDir: string;
  config: OrchConfig;
  tasks: RuntimeTask[];
  baseBranch?: string;
}

/**
 * Merge all completed task worktree branches into a result branch.
 * Then run build validation.
 */
export async function mergeWorktrees(ctx: MergeContext): Promise<MergeResult> {
  const { runId, projectDir, config, tasks } = ctx;
  const resultBranch = `orch/run-${runId.slice(0, 8)}`;

  // Get completed tasks with worktree paths (they have branches to merge)
  const completedTasks = tasks.filter(
    (t) => t.status === "completed" && t.worktreePath,
  );

  if (completedTasks.length === 0) {
    log.warn({ runId }, "no completed tasks to merge");
    return {
      success: false,
      branch: resultBranch,
      conflicts: [],
      validationPassed: false,
      validationOutput: "No completed tasks to merge",
    };
  }

  const worktreeBranches = completedTasks.map((t) => `orch/${runId}/${t.id}`);

  eventBus.emitEvent({
    type: "merge.started",
    timestamp: new Date().toISOString(),
    runId,
    worktrees: worktreeBranches,
  });

  log.info({ runId, branches: worktreeBranches }, "starting merge");

  // Save current branch
  const originalBranch = ctx.baseBranch ?? (await getCurrentBranch(projectDir));

  // Create result branch from the base
  try {
    await createBranch(projectDir, resultBranch);
  } catch {
    // Branch might already exist — try checkout
    await checkoutBranch(projectDir, resultBranch);
  }

  const conflicts: MergeResult["conflicts"] = [];

  // Merge each worktree branch sequentially
  for (const branch of worktreeBranches) {
    const result = await mergeBranch(projectDir, branch, resultBranch);

    if (!result.success) {
      for (const file of result.conflicts) {
        conflicts.push({
          filePath: file,
          worktreeA: resultBranch,
          worktreeB: branch,
          resolved: false,
        });

        eventBus.emitEvent({
          type: "merge.conflict",
          timestamp: new Date().toISOString(),
          runId,
          filePath: file,
          worktreeA: resultBranch,
          worktreeB: branch,
        });
      }
    }
  }

  if (conflicts.length > 0) {
    log.error({ conflictCount: conflicts.length }, "merge conflicts detected");
    // Checkout back to original branch
    await checkoutBranch(projectDir, originalBranch);
    return {
      success: false,
      branch: resultBranch,
      conflicts,
      validationPassed: false,
    };
  }

  // Run build validation
  const validation = await runValidation(runId, projectDir, config.defaults.validateCommand);

  eventBus.emitEvent({
    type: "merge.completed",
    timestamp: new Date().toISOString(),
    runId,
    branch: resultBranch,
    conflictsResolved: 0,
  });

  // Checkout back to original branch
  await checkoutBranch(projectDir, originalBranch);

  return {
    success: validation.passed,
    branch: resultBranch,
    conflicts: [],
    validationPassed: validation.passed,
    validationOutput: validation.output,
  };
}

async function runValidation(
  runId: string,
  cwd: string,
  command: string,
): Promise<{ passed: boolean; output: string }> {
  eventBus.emitEvent({
    type: "validation.started",
    timestamp: new Date().toISOString(),
    runId,
    command,
  });

  log.info({ command }, "running build validation");

  try {
    const result = await execaCommand(command, {
      cwd,
      timeout: 120_000,
      reject: false,
    });

    const passed = result.exitCode === 0;
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");

    eventBus.emitEvent({
      type: "validation.completed",
      timestamp: new Date().toISOString(),
      runId,
      passed,
      output: output.slice(0, 2000),
    });

    log.info({ passed, exitCode: result.exitCode }, "validation complete");

    return { passed, output };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ error: message }, "validation command failed");
    return { passed: false, output: message };
  }
}
