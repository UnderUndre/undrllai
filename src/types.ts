/**
 * Core types — implemented from specs/001-orchestrator/contracts/
 * All type definitions for the orchestrator live here.
 */

// --- Tool Registry (from contracts/tool-registry.ts) ---

export type ToolStrength =
  | "backend"
  | "frontend"
  | "database"
  | "review"
  | "spec"
  | "security"
  | "devops";

export type ToolProvider = "anthropic" | "google" | "alibaba" | "github" | "local";

export type AgentTag = "[SETUP]" | "[DB]" | "[BE]" | "[FE]" | "[OPS]" | "[E2E]" | "[SEC]";

export const AGENT_TAGS: AgentTag[] = [
  "[SETUP]",
  "[DB]",
  "[BE]",
  "[FE]",
  "[OPS]",
  "[E2E]",
  "[SEC]",
];

export interface ToolConfig {
  name: string;
  command: string;
  headlessFlags: string[];
  strengths: ToolStrength[];
  priority: number;
  provider: ToolProvider;
  enabled: boolean;
  healthCheckPrompt?: string;
}

export interface ToolHealthResult {
  name: string;
  available: boolean;
  responseTimeMs: number;
  error?: string;
}

export interface PipelineConfig {
  specify: string;
  "review-spec": string;
  plan: string;
  "review-plan": string;
  contracts: string;
  tasks: string;
  "review-tasks": string;
}

export interface EnsembleConfig {
  "[BE]": string;
  "[FE]": string;
  "[DB]": string;
  "[OPS]": string;
  "[E2E]": string;
  "[SEC]": string;
}

export interface OrchConfig {
  version: number;
  defaults: {
    maxRetries: number;
    timeouts: {
      implementation: number;
      review: number;
    };
    buildCommand: string;
    validateCommand: string;
  };
  pipeline: PipelineConfig;
  ensemble: EnsembleConfig;
  tools: Record<string, ToolConfig>;
}

// --- Run Engine (from contracts/run-engine.ts) ---

export type RunStatus =
  | "pending"
  | "pipeline"
  | "contracts"
  | "ensemble"
  | "merging"
  | "validating"
  | "completed"
  | "failed";

export type StageType =
  | "specify"
  | "review-spec"
  | "plan"
  | "review-plan"
  | "contracts"
  | "tasks"
  | "review-tasks"
  | "implement"
  | "validate";

export type StageStatus = "pending" | "running" | "approved" | "rejected" | "failed";

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "blocked";

export interface Run {
  id: string;
  description: string;
  status: RunStatus;
  configSnapshot: string;
  projectDir: string;
  resultBranch?: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

export interface Stage {
  id: string;
  runId: string;
  type: StageType;
  toolName: string;
  status: StageStatus;
  prompt: string;
  outputPath?: string;
  attempt: number;
  processId?: number;
  durationMs?: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface ParsedTask {
  id: string;
  agentTag: AgentTag;
  storyLabel?: string;
  description: string;
  filePaths: string[];
}

export interface RuntimeTask extends ParsedTask {
  runId: string;
  toolName: string;
  status: TaskStatus;
  worktreePath?: string;
  processId?: number;
  lane: number;
  blockedBy: string[];
  durationMs?: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface DependencyEdge {
  from: string[];
  to: string[];
}

export interface DependencyGraph {
  edges: DependencyEdge[];
  roots: string[];
  criticalPath: string[];
}

export interface ParallelLane {
  number: number;
  agentFlow: string;
  taskIds: string[];
  blockedBy: string;
}

export interface PipelineResult {
  stages: Stage[];
  artifacts: {
    specPath?: string;
    planPath?: string;
    tasksPath?: string;
    contractPaths: string[];
  };
  totalDurationMs: number;
}

export interface EnsembleResult {
  tasks: RuntimeTask[];
  lanes: ParallelLane[];
  mergeResult: MergeResult;
  totalDurationMs: number;
}

export interface MergeResult {
  success: boolean;
  branch: string;
  conflicts: MergeConflict[];
  validationPassed: boolean;
  validationOutput?: string;
}

export interface MergeConflict {
  filePath: string;
  worktreeA: string;
  worktreeB: string;
  resolved: boolean;
  resolvedBy?: string;
}

export interface ReviewResult {
  decision: "APPROVE" | "REJECT";
  feedback: string;
  toolName: string;
  durationMs: number;
}
