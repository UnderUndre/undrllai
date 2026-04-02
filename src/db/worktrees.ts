/**
 * CRUD operations for the `worktrees` table.
 */

import { getDb } from "./client.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../utils/errors.js";

const log = logger.child({ module: "db:worktrees" });

export type WorktreeStatus = "active" | "completed" | "failed" | "abandoned";

export interface Worktree {
  id: string;
  runId: string;
  taskId: string | null;
  path: string;
  branch: string;
  status: WorktreeStatus;
  createdAt: string;
  removedAt?: string;
}

interface WorktreeRow {
  id: string;
  run_id: string;
  task_id: string | null;
  path: string;
  branch: string;
  status: string;
  created_at: string;
  removed_at: string | null;
}

function rowToWorktree(row: WorktreeRow): Worktree {
  return {
    id: row.id,
    runId: row.run_id,
    taskId: row.task_id,
    path: row.path,
    branch: row.branch,
    status: row.status as WorktreeStatus,
    createdAt: row.created_at,
    removedAt: row.removed_at ?? undefined,
  };
}

export function createWorktreeRecord(
  id: string,
  runId: string,
  taskId: string,
  path: string,
  branch: string,
): void {
  const db = getDb();
  const now = new Date().toISOString();
  try {
    db.prepare(
      `INSERT INTO worktrees (id, run_id, task_id, path, branch, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?)`,
    ).run(id, runId, taskId, path, branch, now);
    log.info({ worktreeId: id, branch }, "worktree record created");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw AppError.dbError("createWorktreeRecord", message);
  }
}

export function updateWorktreeStatus(id: string, status: WorktreeStatus): void {
  const db = getDb();
  const removedAt = status !== "active" ? new Date().toISOString() : null;
  try {
    const result = db
      .prepare(`UPDATE worktrees SET status = ?, removed_at = COALESCE(removed_at, ?) WHERE id = ?`)
      .run(status, removedAt, id);
    if (result.changes === 0) {
      throw AppError.dbError("updateWorktreeStatus", `worktree not found: ${id}`);
    }
    log.info({ worktreeId: id, status }, "worktree status updated");
  } catch (err: unknown) {
    if (err instanceof AppError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw AppError.dbError("updateWorktreeStatus", message);
  }
}

export function listActiveWorktrees(runId?: string): Worktree[] {
  const db = getDb();
  try {
    const rows = runId
      ? (db
          .prepare(
            `SELECT * FROM worktrees WHERE status = 'active' AND run_id = ? ORDER BY created_at ASC`,
          )
          .all(runId) as WorktreeRow[])
      : (db
          .prepare(`SELECT * FROM worktrees WHERE status = 'active' ORDER BY created_at ASC`)
          .all() as WorktreeRow[]);
    return rows.map(rowToWorktree);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw AppError.dbError("listActiveWorktrees", message);
  }
}

export function listOrphanWorktrees(maxAgeHours: number): Worktree[] {
  const db = getDb();
  try {
    const cutoff = new Date(Date.now() - maxAgeHours * 3600_000).toISOString();
    const rows = db
      .prepare(
        `SELECT * FROM worktrees
         WHERE status = 'active' AND created_at < ?
         ORDER BY created_at ASC`,
      )
      .all(cutoff) as WorktreeRow[];
    return rows.map(rowToWorktree);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw AppError.dbError("listOrphanWorktrees", message);
  }
}
