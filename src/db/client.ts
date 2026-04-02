/**
 * SQLite client wrapper with WAL mode, transaction helper, and typed queries.
 * Uses better-sqlite3 (synchronous API — ideal for CLI tools).
 */

import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { logger } from "../utils/logger.js";
import { AppError } from "../utils/errors.js";

const log = logger.child({ module: "db" });

const DB_DIR = join(homedir(), ".orch");
const DB_PATH = join(DB_DIR, "orch.db");

let _db: Database.Database | null = null;

function getSchemaPath(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return join(currentDir, "schema.sql");
}

export function getDb(): Database.Database {
  if (_db) return _db;

  if (!existsSync(DB_DIR)) {
    mkdirSync(DB_DIR, { recursive: true });
  }

  log.info({ path: DB_PATH }, "opening database");
  _db = new Database(DB_PATH);

  // Enable WAL mode for concurrent read/write
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  // Initialize schema
  const schemaPath = getSchemaPath();
  if (existsSync(schemaPath)) {
    const schema = readFileSync(schemaPath, "utf-8");
    // Filter out PRAGMA lines (already set above) and execute DDL
    const ddl = schema
      .split("\n")
      .filter((line) => !line.trim().startsWith("PRAGMA"))
      .join("\n");
    _db.exec(ddl);
    log.info("schema initialized");
  }

  return _db;
}

/**
 * Run multiple operations in a single transaction.
 * Rolls back on error, commits on success.
 */
export function transaction<T>(fn: (db: Database.Database) => T): T {
  const db = getDb();
  const txn = db.transaction(() => fn(db));
  try {
    return txn();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ error: message }, "transaction failed");
    throw AppError.dbError("transaction", message);
  }
}

/**
 * Close the database connection. Call on shutdown.
 */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
    log.info("database closed");
  }
}

/**
 * Get database path (for diagnostics).
 */
export function getDbPath(): string {
  return DB_PATH;
}
