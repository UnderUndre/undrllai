/**
 * Ensemble engine — parallel tool dispatch per lane with worktree isolation.
 * Spawns AI tools in parallel across git worktrees, respects dependency graph.
 */

import { spawnTool } from "../process/spawner.js";
import { createWorktree as gitCreateWorktree } from "../utils/git.js";
import { eventBus } from "../events/bus.js";
import { logger } from "../utils/logger.js";
import { identifyParallelGroups } from "./scheduler.js";
import type { ToolRegistry } from "../registry/tool-registry.js";
import type {
  OrchConfig,
  RuntimeTask,
  ParsedTask,
  DependencyGraph,
  EnsembleResult,
  EnsembleConfig,
  AgentTag,
} from "../types.js";

const log = logger.child({ module: "ensemble" });

export interface EnsembleContext {
  runId: string;
  projectDir: string;
  config: OrchConfig;
  registry: ToolRegistry;
  tasks: ParsedTask[];
  graph: DependencyGraph;
  contextFiles: string[];
  onTaskUpdate?: (task: RuntimeTask) => void;
}

/**
 * Execute ensemble — parallel implementation across worktrees.
 */
export async function executeEnsemble(ctx: EnsembleContext): Promise<EnsembleResult> {
  const { runId, projectDir, config, registry, tasks, graph, contextFiles } = ctx;
  const startTime = Date.now();

  log.info({ runId, taskCount: tasks.length }, "ensemble starting");

  // Initialize runtime tasks
  const runtimeTasks = new Map<string, RuntimeTask>();
  for (const task of tasks) {
    const toolName = resolveToolForAgent(config.ensemble, task.agentTag);
    runtimeTasks.set(task.id, {
      ...task,
      runId,
      toolName,
      status: "pending",
      lane: 0,
      blockedBy: [],
    });
  }

  // Get parallel groups from scheduler
  const allIds = tasks.map((t) => t.id);
  const groups = identifyParallelGroups(graph, allIds);

  log.info({ groupCount: groups.length }, "execution groups identified");

  // Execute group by group (groups are sync barriers)
  for (let groupIdx = 0; groupIdx < groups.length; groupIdx++) {
    const group = groups[groupIdx]!;
    log.info({ group: groupIdx + 1, tasks: group }, "executing group");

    // Check for blocked tasks
    const readyTasks = group.filter((id) => {
      const task = runtimeTasks.get(id);
      return task && task.status === "pending";
    });

    if (readyTasks.length === 0) {
      log.warn({ group: groupIdx + 1 }, "no ready tasks in group — skipping");
      continue;
    }

    // Execute tasks in this group in parallel
    // IMPORTANT: Worktree creation is SERIALIZED to avoid git index.lock conflicts
    const worktreePaths = new Map<string, string>();

    for (const taskId of readyTasks) {
      const task = runtimeTasks.get(taskId)!;
      const worktreePath = `${projectDir}/.orch-worktrees/${runId}/${taskId}`;
      const branch = `orch/${runId}/${taskId}`;

      try {
        await gitCreateWorktree(projectDir, worktreePath, branch);
        worktreePaths.set(taskId, worktreePath);
        task.worktreePath = worktreePath;
      } catch (err: unknown) {
        task.status = "failed";
        task.error = err instanceof Error ? err.message : String(err);
        task.completedAt = new Date().toISOString();
        cascadeBlock(taskId, runtimeTasks, graph);
        ctx.onTaskUpdate?.(task);
        continue;
      }
    }

    // Now dispatch all tools in parallel
    const promises = readyTasks
      .filter((id) => worktreePaths.has(id))
      .map(async (taskId) => {
        const task = runtimeTasks.get(taskId)!;
        const worktreePath = worktreePaths.get(taskId)!;

        task.status = "running";
        task.startedAt = new Date().toISOString();
        ctx.onTaskUpdate?.(task);

        eventBus.emitEvent({
          type: "task.started",
          timestamp: new Date().toISOString(),
          runId,
          taskId,
          agentTag: task.agentTag,
          toolName: task.toolName,
          lane: task.lane,
          worktreePath,
        });

        try {
          const tool = registry.getTool(task.toolName);
          const prompt = buildTaskPrompt(task, contextFiles);

          const result = await spawnTool({
            tool,
            prompt,
            cwd: worktreePath,
            timeoutMs: config.defaults.timeouts.implementation * 1000,
            systemPrompt: buildScopeInstructions(task),
          });

          task.durationMs = result.durationMs;
          task.processId = result.pid;

          if (result.exitCode !== 0) {
            throw new Error(`Exit code: ${result.exitCode}\n${result.stderr}`);
          }

          task.status = "completed";
          task.completedAt = new Date().toISOString();

          eventBus.emitEvent({
            type: "task.completed",
            timestamp: new Date().toISOString(),
            runId,
            taskId,
            agentTag: task.agentTag,
            durationMs: task.durationMs ?? 0,
          });
        } catch (err: unknown) {
          task.status = "failed";
          task.error = err instanceof Error ? err.message : String(err);
          task.completedAt = new Date().toISOString();

          const blocked = cascadeBlock(taskId, runtimeTasks, graph);

          eventBus.emitEvent({
            type: "task.failed",
            timestamp: new Date().toISOString(),
            runId,
            taskId,
            agentTag: task.agentTag,
            error: task.error,
            cascadeBlocked: blocked,
          });
        }

        ctx.onTaskUpdate?.(task);
      });

    await Promise.all(promises);
  }

  const allTasks = [...runtimeTasks.values()];
  const lanes = groups.map((group, idx) => ({
    number: idx + 1,
    agentFlow: group.map((id) => runtimeTasks.get(id)?.agentTag ?? "?").join(" + "),
    taskIds: group,
    blockedBy: "",
  }));

  return {
    tasks: allTasks,
    lanes,
    mergeResult: { success: false, branch: "", conflicts: [], validationPassed: false },
    totalDurationMs: Date.now() - startTime,
  };
}

function resolveToolForAgent(ensemble: EnsembleConfig, agentTag: AgentTag): string {
  const key = agentTag as keyof EnsembleConfig;
  return ensemble[key] ?? "claude";
}

function buildTaskPrompt(task: RuntimeTask, contextFiles: string[]): string {
  const parts = [
    `Implement task ${task.id}: ${task.description}`,
  ];

  if (contextFiles.length > 0) {
    parts.push(`\nReference these files for context: ${contextFiles.join(", ")}`);
  }

  if (task.filePaths.length > 0) {
    parts.push(`\nFiles to create/modify: ${task.filePaths.join(", ")}`);
  }

  return parts.join("\n");
}

function buildScopeInstructions(task: RuntimeTask): string {
  return [
    "ORCHESTRATOR INSTRUCTIONS",
    "========================",
    `You are implementing task ${task.id} in an isolated git worktree.`,
    `Agent role: ${task.agentTag}`,
    "Rules:",
    "- Only modify files listed in the task description",
    "- Do NOT modify any files in the contracts/ directory (read-only)",
    "- Commit your changes before exiting",
    "- If you encounter an error, describe it clearly and exit with non-zero code",
  ].join("\n");
}

/**
 * Cascade-block all tasks that depend on a failed task.
 * Returns list of blocked task IDs.
 */
function cascadeBlock(
  failedId: string,
  tasks: Map<string, RuntimeTask>,
  graph: DependencyGraph,
): string[] {
  const blocked: string[] = [];
  const toVisit = [failedId];
  const visited = new Set<string>();

  while (toVisit.length > 0) {
    const current = toVisit.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);

    // Find all tasks that depend on current
    for (const edge of graph.edges) {
      if (edge.from.includes(current)) {
        for (const dependent of edge.to) {
          const task = tasks.get(dependent);
          if (task && task.status === "pending") {
            task.status = "blocked";
            task.blockedBy = [...(task.blockedBy ?? []), failedId];
            blocked.push(dependent);
            toVisit.push(dependent);
          }
        }
      }
    }
  }

  if (blocked.length > 0) {
    log.warn({ failedId, blocked }, "cascade-blocked tasks");
  }

  return blocked;
}
