/**
 * CRUD operations for the `stages` table.
 */

import { getDb } from "./client.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../utils/errors.js";
import type { Stage, StageStatus, StageType } from "../types.js";

const log = logger.child({ module: "db:stages" });

interface StageRow {
  id: string;
  run_id: string;
  type: string;
  tool_name: string;
  status: string;
  prompt: string | null;
  output_path: string | null;
  attempt: number;
  process_id: number | null;
  duration_ms: number | null;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
}

function rowToStage(row: StageRow): Stage {
  return {
    id: row.id,
    runId: row.run_id,
    type: row.type as StageType,
    toolName: row.tool_name,
    status: row.status as StageStatus,
    prompt: row.prompt ?? "",
    outputPath: row.output_path ?? undefined,
    attempt: row.attempt,
    processId: row.process_id ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    error: row.error ?? undefined,
  };
}

export interface CreateStageInput {
  id: string;
  runId: string;
  type: StageType;
  toolName: string;
  prompt: string;
  attempt?: number;
}

export function createStage(stage: CreateStageInput): void {
  const db = getDb();
  const now = new Date().toISOString();
  try {
    db.prepare(
      `INSERT INTO stages (id, run_id, type, tool_name, status, prompt, attempt, started_at)
       VALUES (?, ?, ?, ?, 'running', ?, ?, ?)`,
    ).run(
      stage.id,
      stage.runId,
      stage.type,
      stage.toolName,
      stage.prompt,
      stage.attempt ?? 1,
      now,
    );
    log.info({ stageId: stage.id, type: stage.type }, "stage created");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw AppError.dbError("createStage", message);
  }
}

export function updateStageStatus(id: string, status: StageStatus, error?: string): void {
  const db = getDb();
  try {
    const result = db
      .prepare(`UPDATE stages SET status = ?, error = ? WHERE id = ?`)
      .run(status, error ?? null, id);
    if (result.changes === 0) {
      throw AppError.dbError("updateStageStatus", `stage not found: ${id}`);
    }
    log.info({ stageId: id, status }, "stage status updated");
  } catch (err: unknown) {
    if (err instanceof AppError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw AppError.dbError("updateStageStatus", message);
  }
}

export function completeStage(
  id: string,
  status: StageStatus,
  durationMs: number,
  outputPath?: string,
): void {
  const db = getDb();
  const now = new Date().toISOString();
  try {
    const result = db
      .prepare(
        `UPDATE stages SET status = ?, duration_ms = ?, output_path = ?, completed_at = ? WHERE id = ?`,
      )
      .run(status, durationMs, outputPath ?? null, now, id);
    if (result.changes === 0) {
      throw AppError.dbError("completeStage", `stage not found: ${id}`);
    }
    log.info({ stageId: id, status, durationMs }, "stage completed");
  } catch (err: unknown) {
    if (err instanceof AppError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw AppError.dbError("completeStage", message);
  }
}

export function listStagesByRun(runId: string): Stage[] {
  const db = getDb();
  try {
    const rows = db
      .prepare(`SELECT * FROM stages WHERE run_id = ? ORDER BY started_at ASC`)
      .all(runId) as StageRow[];
    return rows.map(rowToStage);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw AppError.dbError("listStagesByRun", message);
  }
}
