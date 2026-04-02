/**
 * CRUD operations for the `tasks` table.
 *
 * Note: `blocked_by` is stored as JSON text in SQLite,
 * and `filePaths` from ParsedTask is not persisted (defaults to []).
 */

import { getDb, transaction } from "./client.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../utils/errors.js";
import type { RuntimeTask, TaskStatus, AgentTag } from "../types.js";

const log = logger.child({ module: "db:tasks" });

interface TaskRow {
  id: string;
  run_id: string;
  agent_tag: string;
  story_label: string | null;
  description: string;
  tool_name: string | null;
  status: string;
  worktree_path: string | null;
  process_id: number | null;
  lane: number | null;
  blocked_by: string | null;
  duration_ms: number | null;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
}

function rowToTask(row: TaskRow): RuntimeTask {
  return {
    id: row.id,
    runId: row.run_id,
    agentTag: row.agent_tag as AgentTag,
    storyLabel: row.story_label ?? undefined,
    description: row.description,
    filePaths: [],
    toolName: row.tool_name ?? "",
    status: row.status as TaskStatus,
    worktreePath: row.worktree_path ?? undefined,
    processId: row.process_id ?? undefined,
    lane: row.lane ?? 0,
    blockedBy: row.blocked_by ? (JSON.parse(row.blocked_by) as string[]) : [],
    durationMs: row.duration_ms ?? undefined,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    error: row.error ?? undefined,
  };
}

export interface CreateTaskInput {
  id: string;
  runId: string;
  agentTag: AgentTag;
  storyLabel?: string;
  description: string;
  toolName: string;
  lane: number;
  blockedBy: string[];
}

export function createTask(task: CreateTaskInput): void {
  const db = getDb();
  const now = new Date().toISOString();
  try {
    db.prepare(
      `INSERT INTO tasks (id, run_id, agent_tag, story_label, description, tool_name, status, lane, blocked_by, started_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    ).run(
      task.id,
      task.runId,
      task.agentTag,
      task.storyLabel ?? null,
      task.description,
      task.toolName,
      task.lane,
      JSON.stringify(task.blockedBy),
      now,
    );
    log.info({ taskId: task.id, agentTag: task.agentTag }, "task created");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw AppError.dbError("createTask", message);
  }
}

export function updateTaskStatus(id: string, status: TaskStatus, error?: string): void {
  const db = getDb();
  try {
    const result = db
      .prepare(`UPDATE tasks SET status = ?, error = ? WHERE id = ?`)
      .run(status, error ?? null, id);
    if (result.changes === 0) {
      throw AppError.dbError("updateTaskStatus", `task not found: ${id}`);
    }
    log.info({ taskId: id, status }, "task status updated");
  } catch (err: unknown) {
    if (err instanceof AppError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw AppError.dbError("updateTaskStatus", message);
  }
}

export function completeTask(id: string, durationMs: number): void {
  const db = getDb();
  const now = new Date().toISOString();
  try {
    const result = db
      .prepare(
        `UPDATE tasks SET status = 'completed', duration_ms = ?, completed_at = ? WHERE id = ?`,
      )
      .run(durationMs, now, id);
    if (result.changes === 0) {
      throw AppError.dbError("completeTask", `task not found: ${id}`);
    }
    log.info({ taskId: id, durationMs }, "task completed");
  } catch (err: unknown) {
    if (err instanceof AppError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw AppError.dbError("completeTask", message);
  }
}

export function cascadeBlock(failedTaskId: string, dependentIds: string[]): void {
  if (dependentIds.length === 0) return;

  transaction((db) => {
    const stmt = db.prepare(`UPDATE tasks SET status = 'blocked', error = ? WHERE id = ?`);
    const reason = `blocked by failed task ${failedTaskId}`;
    for (const depId of dependentIds) {
      stmt.run(reason, depId);
    }
    log.info(
      { failedTaskId, blockedCount: dependentIds.length },
      "cascaded block to dependent tasks",
    );
  });
}

export function getTask(id: string): RuntimeTask | null {
  const db = getDb();
  try {
    const row = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as TaskRow | undefined;
    return row ? rowToTask(row) : null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw AppError.dbError("getTask", message);
  }
}

export function listTasksByRun(runId: string): RuntimeTask[] {
  const db = getDb();
  try {
    const rows = db
      .prepare(`SELECT * FROM tasks WHERE run_id = ? ORDER BY lane ASC, started_at ASC`)
      .all(runId) as TaskRow[];
    return rows.map(rowToTask);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw AppError.dbError("listTasksByRun", message);
  }
}
