/**
 * Typed application error classes.
 * Use AppError.xxx() static factories instead of raw `throw new Error()`.
 */

export type ErrorCode =
  | "CONFIG_INVALID"
  | "CONFIG_NOT_FOUND"
  | "TOOL_NOT_FOUND"
  | "TOOL_UNHEALTHY"
  | "TOOL_TIMEOUT"
  | "TOOL_SPAWN_FAILED"
  | "RUN_NOT_FOUND"
  | "RUN_FAILED"
  | "STAGE_FAILED"
  | "STAGE_REJECTED"
  | "TASK_FAILED"
  | "TASK_BLOCKED"
  | "MERGE_CONFLICT"
  | "MERGE_FAILED"
  | "VALIDATION_FAILED"
  | "WORKTREE_FAILED"
  | "DB_ERROR"
  | "PARSE_ERROR"
  | "INTERNAL";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly context?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.context = context;
  }

  static configInvalid(message: string, context?: Record<string, unknown>): AppError {
    return new AppError("CONFIG_INVALID", message, context);
  }

  static configNotFound(path: string): AppError {
    return new AppError("CONFIG_NOT_FOUND", `Config file not found: ${path}`, { path });
  }

  static toolNotFound(name: string): AppError {
    return new AppError("TOOL_NOT_FOUND", `Tool not found: ${name}`, { name });
  }

  static toolUnhealthy(name: string, error: string): AppError {
    return new AppError("TOOL_UNHEALTHY", `Tool unhealthy: ${name} — ${error}`, { name, error });
  }

  static toolTimeout(name: string, timeoutMs: number): AppError {
    return new AppError("TOOL_TIMEOUT", `Tool timed out after ${timeoutMs}ms: ${name}`, {
      name,
      timeoutMs,
    });
  }

  static toolSpawnFailed(name: string, error: string): AppError {
    return new AppError("TOOL_SPAWN_FAILED", `Failed to spawn tool: ${name} — ${error}`, {
      name,
      error,
    });
  }

  static runNotFound(id: string): AppError {
    return new AppError("RUN_NOT_FOUND", `Run not found: ${id}`, { id });
  }

  static runFailed(id: string, error: string): AppError {
    return new AppError("RUN_FAILED", `Run failed: ${id} — ${error}`, { id, error });
  }

  static stageFailed(stageId: string, stageType: string, error: string): AppError {
    return new AppError("STAGE_FAILED", `Stage failed: ${stageType} (${stageId}) — ${error}`, {
      stageId,
      stageType,
      error,
    });
  }

  static stageRejected(stageId: string, stageType: string, feedback: string): AppError {
    return new AppError(
      "STAGE_REJECTED",
      `Stage rejected: ${stageType} (${stageId}) — ${feedback}`,
      { stageId, stageType, feedback },
    );
  }

  static taskFailed(taskId: string, error: string): AppError {
    return new AppError("TASK_FAILED", `Task failed: ${taskId} — ${error}`, { taskId, error });
  }

  static taskBlocked(taskId: string, blockedBy: string[]): AppError {
    return new AppError(
      "TASK_BLOCKED",
      `Task blocked: ${taskId} — waiting on ${blockedBy.join(", ")}`,
      { taskId, blockedBy },
    );
  }

  static mergeConflict(filePath: string): AppError {
    return new AppError("MERGE_CONFLICT", `Merge conflict in: ${filePath}`, { filePath });
  }

  static mergeFailed(error: string): AppError {
    return new AppError("MERGE_FAILED", `Merge failed: ${error}`, { error });
  }

  static validationFailed(command: string, output: string): AppError {
    return new AppError("VALIDATION_FAILED", `Validation failed: ${command}`, { command, output });
  }

  static worktreeFailed(path: string, error: string): AppError {
    return new AppError("WORKTREE_FAILED", `Worktree operation failed: ${path} — ${error}`, {
      path,
      error,
    });
  }

  static dbError(operation: string, error: string): AppError {
    return new AppError("DB_ERROR", `Database error during ${operation}: ${error}`, {
      operation,
      error,
    });
  }

  static parseError(source: string, error: string): AppError {
    return new AppError("PARSE_ERROR", `Parse error in ${source}: ${error}`, { source, error });
  }

  static internal(message: string): AppError {
    return new AppError("INTERNAL", message);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
    };
  }
}
