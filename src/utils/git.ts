/**
 * Git utility functions for worktree and branch management.
 *
 * SECURITY: Uses execa() with argument arrays, NOT execaCommand() with
 * string concatenation, to prevent shell injection via branch names or paths.
 */

import { execa } from "execa";
import { AppError } from "./errors.js";
import { logger } from "./logger.js";

const log = logger.child({ module: "git" });

interface GitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function git(args: string[], cwd?: string): Promise<GitResult> {
  try {
    const result = await execa("git", args, {
      cwd,
      timeout: 30_000,
      reject: false,
    });
    if (result.exitCode !== 0 && result.exitCode !== undefined) {
      throw { stderr: result.stderr, exitCode: result.exitCode };
    }
    return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode ?? 0 };
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; exitCode?: number; message?: string };
    log.error({ args, cwd, error: error.stderr ?? error.message }, "git command failed");
    throw AppError.worktreeFailed(
      cwd ?? ".",
      error.stderr ?? error.message ?? "Unknown git error",
    );
  }
}

export async function createWorktree(
  repoDir: string,
  worktreePath: string,
  branch: string,
): Promise<void> {
  log.info({ worktreePath, branch }, "creating worktree");
  await git(["worktree", "add", worktreePath, "-b", branch], repoDir);
}

export async function removeWorktree(repoDir: string, worktreePath: string): Promise<void> {
  log.info({ worktreePath }, "removing worktree");
  await git(["worktree", "remove", worktreePath, "--force"], repoDir);
}

export async function listWorktrees(repoDir: string): Promise<string[]> {
  const result = await git(["worktree", "list", "--porcelain"], repoDir);
  return result.stdout
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.replace("worktree ", ""));
}

export async function mergeBranch(
  repoDir: string,
  sourceBranch: string,
  targetBranch: string,
): Promise<{ success: boolean; conflicts: string[] }> {
  log.info({ sourceBranch, targetBranch }, "merging branch");
  await git(["checkout", targetBranch], repoDir);

  try {
    await git(
      ["merge", sourceBranch, "--no-ff", "-m", `merge: ${sourceBranch} into ${targetBranch}`],
      repoDir,
    );
    return { success: true, conflicts: [] };
  } catch {
    const statusResult = await git(["diff", "--name-only", "--diff-filter=U"], repoDir);
    const conflicts = statusResult.stdout.split("\n").filter(Boolean);
    return { success: false, conflicts };
  }
}

export async function createBranch(repoDir: string, branch: string): Promise<void> {
  await git(["checkout", "-b", branch], repoDir);
}

export async function checkoutBranch(repoDir: string, branch: string): Promise<void> {
  await git(["checkout", branch], repoDir);
}

export async function getCurrentBranch(repoDir: string): Promise<string> {
  const result = await git(["rev-parse", "--abbrev-ref", "HEAD"], repoDir);
  return result.stdout.trim();
}

export async function isCleanWorkingTree(repoDir: string): Promise<boolean> {
  const result = await git(["status", "--porcelain"], repoDir);
  return result.stdout.trim() === "";
}

export async function pruneWorktrees(repoDir: string): Promise<void> {
  await git(["worktree", "prune"], repoDir);
}
