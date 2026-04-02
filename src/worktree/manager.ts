/**
 * Worktree manager — create, symlink deps, cleanup, orphan GC.
 * IMPORTANT: Worktree creation is serialized to avoid git index.lock conflicts.
 */

import { existsSync, mkdirSync, symlinkSync, readdirSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  createWorktree as gitCreateWorktree,
  removeWorktree as gitRemoveWorktree,
  pruneWorktrees,
} from "../utils/git.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ module: "worktree" });

const WORKTREE_DIR = ".orch-worktrees";

export interface WorktreeInfo {
  path: string;
  branch: string;
  taskId: string;
  runId: string;
  createdAt: Date;
}

/**
 * Create a worktree for a task. Symlinks node_modules for speed.
 * MUST be called sequentially (not in parallel) to avoid index.lock.
 */
export async function createTaskWorktree(
  projectDir: string,
  runId: string,
  taskId: string,
): Promise<WorktreeInfo> {
  const worktreeBase = join(projectDir, WORKTREE_DIR, runId);
  const worktreePath = join(worktreeBase, taskId);
  const branch = `orch/${runId}/${taskId}`;

  if (!existsSync(worktreeBase)) {
    mkdirSync(worktreeBase, { recursive: true });
  }

  log.info({ worktreePath, branch }, "creating task worktree");

  await gitCreateWorktree(projectDir, worktreePath, branch);

  // Symlink node_modules if it exists in the project
  const sourceNodeModules = join(projectDir, "node_modules");
  const targetNodeModules = join(worktreePath, "node_modules");
  if (existsSync(sourceNodeModules) && !existsSync(targetNodeModules)) {
    try {
      symlinkSync(sourceNodeModules, targetNodeModules, "junction");
      log.debug({ worktreePath }, "symlinked node_modules");
    } catch (err: unknown) {
      log.warn({ error: (err as Error).message }, "failed to symlink node_modules (non-fatal)");
    }
  }

  return {
    path: worktreePath,
    branch,
    taskId,
    runId,
    createdAt: new Date(),
  };
}

/**
 * Remove a single worktree and its branch.
 */
export async function removeTaskWorktree(
  projectDir: string,
  worktreePath: string,
): Promise<void> {
  log.info({ worktreePath }, "removing worktree");

  try {
    await gitRemoveWorktree(projectDir, worktreePath);
  } catch (err: unknown) {
    // Force-remove the directory if git worktree remove fails
    log.warn({ error: (err as Error).message }, "git worktree remove failed, force-removing directory");
    if (existsSync(worktreePath)) {
      rmSync(worktreePath, { recursive: true, force: true });
    }
  }
}

/**
 * Clean up all worktrees for a specific run.
 */
export async function cleanupRunWorktrees(
  projectDir: string,
  runId: string,
): Promise<number> {
  const runDir = join(projectDir, WORKTREE_DIR, runId);
  let removed = 0;

  if (!existsSync(runDir)) return 0;

  const entries = readdirSync(runDir);
  for (const entry of entries) {
    const worktreePath = join(runDir, entry);
    try {
      await removeTaskWorktree(projectDir, worktreePath);
      removed++;
    } catch (err: unknown) {
      log.warn({ worktreePath, error: (err as Error).message }, "failed to remove worktree");
    }
  }

  // Remove the run directory
  if (existsSync(runDir)) {
    rmSync(runDir, { recursive: true, force: true });
  }

  await pruneWorktrees(projectDir);

  log.info({ runId, removed }, "run worktrees cleaned up");
  return removed;
}

/**
 * Find orphaned worktrees older than maxAgeHours.
 */
export async function findOrphanWorktrees(
  projectDir: string,
  maxAgeHours: number = 24,
): Promise<string[]> {
  const worktreeDir = join(projectDir, WORKTREE_DIR);
  if (!existsSync(worktreeDir)) return [];

  const orphans: string[] = [];
  const now = Date.now();
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

  const runDirs = readdirSync(worktreeDir);
  for (const runDir of runDirs) {
    const runPath = join(worktreeDir, runDir);
    const stat = statSync(runPath);
    if (!stat.isDirectory()) continue;

    const age = now - stat.mtimeMs;
    if (age > maxAgeMs) {
      orphans.push(runPath);
    }
  }

  log.info({ orphanCount: orphans.length, maxAgeHours }, "orphan scan complete");
  return orphans;
}

/**
 * Garbage collect — remove all orphaned worktrees.
 */
export async function gcWorktrees(
  projectDir: string,
  maxAgeHours: number = 24,
): Promise<number> {
  const orphans = await findOrphanWorktrees(projectDir, maxAgeHours);

  for (const orphan of orphans) {
    try {
      rmSync(orphan, { recursive: true, force: true });
      log.info({ path: orphan }, "orphan worktree removed");
    } catch (err: unknown) {
      log.warn({ path: orphan, error: (err as Error).message }, "failed to remove orphan");
    }
  }

  await pruneWorktrees(projectDir);

  return orphans.length;
}
