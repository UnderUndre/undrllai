/**
 * SSE Event types — implemented from specs/001-orchestrator/contracts/events.ts
 */

import type { RunStatus, StageType, StageStatus, AgentTag } from "../types.js";

export interface BaseEvent {
  timestamp: string;
  runId: string;
}

export interface RunStartedEvent extends BaseEvent {
  type: "run.started";
  description: string;
  toolAssignments: Record<string, string>;
}

export interface RunStatusChangedEvent extends BaseEvent {
  type: "run.status_changed";
  from: RunStatus;
  to: RunStatus;
}

export interface RunCompletedEvent extends BaseEvent {
  type: "run.completed";
  totalDurationMs: number;
  resultBranch: string;
  summary: {
    tasksCompleted: number;
    tasksFailed: number;
    tasksBlocked: number;
  };
}

export interface RunFailedEvent extends BaseEvent {
  type: "run.failed";
  error: string;
  failedAt: string;
}

export interface StageStartedEvent extends BaseEvent {
  type: "stage.started";
  stageId: string;
  stageType: StageType;
  toolName: string;
  attempt: number;
}

export interface StageOutputEvent extends BaseEvent {
  type: "stage.output";
  stageId: string;
  line: string;
}

export interface StageCompletedEvent extends BaseEvent {
  type: "stage.completed";
  stageId: string;
  stageType: StageType;
  status: StageStatus;
  durationMs: number;
  outputPath?: string;
}

export interface StageRejectedEvent extends BaseEvent {
  type: "stage.rejected";
  stageId: string;
  stageType: StageType;
  feedback: string;
  attempt: number;
  maxRetries: number;
}

export interface TaskStartedEvent extends BaseEvent {
  type: "task.started";
  taskId: string;
  agentTag: AgentTag;
  toolName: string;
  lane: number;
  worktreePath: string;
}

export interface TaskOutputEvent extends BaseEvent {
  type: "task.output";
  taskId: string;
  line: string;
}

export interface TaskCompletedEvent extends BaseEvent {
  type: "task.completed";
  taskId: string;
  agentTag: AgentTag;
  durationMs: number;
}

export interface TaskFailedEvent extends BaseEvent {
  type: "task.failed";
  taskId: string;
  agentTag: AgentTag;
  error: string;
  cascadeBlocked: string[];
}

export interface MergeStartedEvent extends BaseEvent {
  type: "merge.started";
  worktrees: string[];
}

export interface MergeConflictEvent extends BaseEvent {
  type: "merge.conflict";
  filePath: string;
  worktreeA: string;
  worktreeB: string;
}

export interface MergeCompletedEvent extends BaseEvent {
  type: "merge.completed";
  branch: string;
  conflictsResolved: number;
}

export interface ValidationStartedEvent extends BaseEvent {
  type: "validation.started";
  command: string;
}

export interface ValidationCompletedEvent extends BaseEvent {
  type: "validation.completed";
  passed: boolean;
  output?: string;
}

export type OrchEvent =
  | RunStartedEvent
  | RunStatusChangedEvent
  | RunCompletedEvent
  | RunFailedEvent
  | StageStartedEvent
  | StageOutputEvent
  | StageCompletedEvent
  | StageRejectedEvent
  | TaskStartedEvent
  | TaskOutputEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  | MergeStartedEvent
  | MergeConflictEvent
  | MergeCompletedEvent
  | ValidationStartedEvent
  | ValidationCompletedEvent;
