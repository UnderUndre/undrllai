/**
 * CRUD operations for the `runs` table.
 */

import { getDb } from "./client.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../utils/errors.js";
import type { Run, RunStatus } from "../types.js";

const log = logger.child({ module: "db:runs" });

interface RunRow {
  id: string;
  description: string;
  status: string;
  config_snapshot: string | null;
  project_dir: string;
  result_branch: string | null;
  created_at: string;
  completed_at: string | null;
  error: string | null;
}

function rowToRun(row: RunRow): Run {
  return {
    id: row.id,
    description: row.description,
    status: row.status as RunStatus,
    configSnapshot: row.config_snapshot ?? "",
    projectDir: row.project_dir,
    resultBranch: row.result_branch ?? undefined,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
    error: row.error ?? undefined,
  };
}

export function createRun(
  id: string,
  description: string,
  configSnapshot: string,
  projectDir: string,
): void {
  const db = getDb();
  const now = new Date().toISOString();
  try {
    db.prepare(
      `INSERT INTO runs (id, description, status, config_snapshot, project_dir, created_at)
       VALUES (?, ?, 'pending', ?, ?, ?)`,
    ).run(id, description, configSnapshot, projectDir, now);
    log.info({ runId: id }, "run created");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw AppError.dbError("createRun", message);
  }
}

export function updateRunStatus(id: string, status: RunStatus, error?: string): void {
  const db = getDb();
  try {
    const result = db
      .prepare(`UPDATE runs SET status = ?, error = ? WHERE id = ?`)
      .run(status, error ?? null, id);
    if (result.changes === 0) throw AppError.runNotFound(id);
    log.info({ runId: id, status }, "run status updated");
  } catch (err: unknown) {
    if (err instanceof AppError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw AppError.dbError("updateRunStatus", message);
  }
}

export function completeRun(id: string, resultBranch?: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  try {
    const result = db
      .prepare(
        `UPDATE runs SET status = 'completed', result_branch = ?, completed_at = ? WHERE id = ?`,
      )
      .run(resultBranch ?? null, now, id);
    if (result.changes === 0) throw AppError.runNotFound(id);
    log.info({ runId: id, resultBranch }, "run completed");
  } catch (err: unknown) {
    if (err instanceof AppError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw AppError.dbError("completeRun", message);
  }
}

export function getRun(id: string): Run | null {
  const db = getDb();
  try {
    const row = db.prepare(`SELECT * FROM runs WHERE id = ?`).get(id) as RunRow | undefined;
    return row ? rowToRun(row) : null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw AppError.dbError("getRun", message);
  }
}

export function listRuns(projectDir?: string): Run[] {
  const db = getDb();
  try {
    const rows = projectDir
      ? (db
          .prepare(`SELECT * FROM runs WHERE project_dir = ? ORDER BY created_at DESC`)
          .all(projectDir) as RunRow[])
      : (db.prepare(`SELECT * FROM runs ORDER BY created_at DESC`).all() as RunRow[]);
    return rows.map(rowToRun);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw AppError.dbError("listRuns", message);
  }
}
