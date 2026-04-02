/**
 * Scope guard — restricts what a spawned tool can do in its worktree.
 * Generates ORCHESTRATOR_INSTRUCTIONS.md and optionally locks contract files.
 */

import { writeFileSync, chmodSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../utils/logger.js";

const log = logger.child({ module: "scope-guard" });

const INSTRUCTIONS_FILE = "ORCHESTRATOR_INSTRUCTIONS.md";

/**
 * Set up scope guard for a worktree.
 * - Writes ORCHESTRATOR_INSTRUCTIONS.md
 * - Locks contracts/ as read-only
 */
export function setupScopeGuard(
  worktreePath: string,
  taskId: string,
  agentTag: string,
  description: string,
  contractPaths: string[] = [],
): void {
  // Generate instructions file
  const instructions = generateInstructions(taskId, agentTag, description);
  const instructionsPath = join(worktreePath, INSTRUCTIONS_FILE);
  writeFileSync(instructionsPath, instructions, "utf-8");
  log.debug({ worktreePath, taskId }, "wrote ORCHESTRATOR_INSTRUCTIONS.md");

  // Lock contract files as read-only
  for (const contractPath of contractPaths) {
    const fullPath = join(worktreePath, contractPath);
    if (existsSync(fullPath)) {
      try {
        chmodSync(fullPath, 0o444);
      } catch {
        // chmod may fail on Windows — non-fatal
      }
    }
  }

  // Also lock any contracts/ directory in the worktree
  const contractsDir = join(worktreePath, "contracts");
  if (existsSync(contractsDir)) {
    try {
      const files = readdirSync(contractsDir);
      for (const file of files) {
        chmodSync(join(contractsDir, file), 0o444);
      }
      log.debug({ contractsDir, fileCount: files.length }, "locked contract files");
    } catch {
      // Non-fatal on Windows
    }
  }
}

function generateInstructions(
  taskId: string,
  agentTag: string,
  description: string,
): string {
  return `# Orchestrator Instructions

> **DO NOT MODIFY OR DELETE THIS FILE**

## Your Assignment

- **Task ID**: ${taskId}
- **Agent Role**: ${agentTag}
- **Description**: ${description}

## Rules

1. **Only modify files related to your task** — do not touch unrelated code
2. **Contracts are READ-ONLY** — files in \`contracts/\` must not be modified
3. **Commit your work** before exiting — use a descriptive commit message
4. **Report errors clearly** — if something fails, describe the error and exit with non-zero code
5. **Do not install new packages** — use only what is already in package.json
6. **Follow the project's coding standards** — TypeScript strict mode, no \`any\`, structured logging

## Context

You are working in an isolated git worktree. Your changes will be merged into the main result branch
after all parallel tasks complete. Other agents may be working on different tasks simultaneously in
their own worktrees.

## On Completion

Ensure:
- All files compile without TypeScript errors
- Your code follows the interfaces defined in contracts/
- Changes are committed to this worktree's branch
`;
}
