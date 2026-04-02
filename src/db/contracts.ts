/**
 * CRUD operations for the `contracts` table.
 */

import { getDb } from "./client.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../utils/errors.js";

const log = logger.child({ module: "db:contracts" });

export type ContractFormat = "typescript" | "openapi";

export interface Contract {
  id: string;
  runId: string;
  format: ContractFormat;
  filePath: string;
  generatedBy: string;
  lockedAt?: string;
}

interface ContractRow {
  id: string;
  run_id: string;
  format: string;
  file_path: string;
  generated_by: string;
  locked_at: string | null;
}

function rowToContract(row: ContractRow): Contract {
  return {
    id: row.id,
    runId: row.run_id,
    format: row.format as ContractFormat,
    filePath: row.file_path,
    generatedBy: row.generated_by,
    lockedAt: row.locked_at ?? undefined,
  };
}

export function createContract(
  id: string,
  runId: string,
  format: ContractFormat,
  filePath: string,
  generatedBy: string,
): void {
  const db = getDb();
  try {
    db.prepare(
      `INSERT INTO contracts (id, run_id, format, file_path, generated_by)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, runId, format, filePath, generatedBy);
    log.info({ contractId: id, format }, "contract created");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw AppError.dbError("createContract", message);
  }
}

export function lockContract(id: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  try {
    const result = db
      .prepare(`UPDATE contracts SET locked_at = ? WHERE id = ? AND locked_at IS NULL`)
      .run(now, id);
    if (result.changes === 0) {
      throw AppError.dbError("lockContract", `contract not found or already locked: ${id}`);
    }
    log.info({ contractId: id }, "contract locked");
  } catch (err: unknown) {
    if (err instanceof AppError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw AppError.dbError("lockContract", message);
  }
}

export function getContractsByRun(runId: string): Contract[] {
  const db = getDb();
  try {
    const rows = db
      .prepare(`SELECT * FROM contracts WHERE run_id = ?`)
      .all(runId) as ContractRow[];
    return rows.map(rowToContract);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw AppError.dbError("getContractsByRun", message);
  }
}
