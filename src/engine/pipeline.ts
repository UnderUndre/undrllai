/**
 * Pipeline engine — sequential stage execution with quality gates.
 * Stages: specify → review-spec → plan → review-plan → contracts → tasks → review-tasks
 * Reviews can REJECT → retry up to maxRetries.
 *
 * Speckit integration:
 * - Resume mode (--from): skip stages whose artifacts already exist
 * - Template injection: use .specify/templates/* as system prompts for generation stages
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { v4 as uuid } from "uuid";
import { spawnTool } from "../process/spawner.js";
import { filterOutput, filterStreamJson } from "../process/output-filter.js";
import { parseReviewOutput } from "../parsers/review-parser.js";
import { eventBus } from "../events/bus.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../utils/errors.js";
import type { ToolRegistry } from "../registry/tool-registry.js";
import type {
  OrchConfig,
  Stage,
  StageType,
  PipelineResult,
  PipelineConfig,
} from "../types.js";

const log = logger.child({ module: "pipeline" });

/** Ordered pipeline stages */
const PIPELINE_STAGES: StageType[] = [
  "specify",
  "review-spec",
  "plan",
  "review-plan",
  "contracts",
  "tasks",
  "review-tasks",
];

const REVIEW_STAGES = new Set<StageType>(["review-spec", "review-plan", "review-tasks"]);

/** Map generation stages to the artifact file they produce */
const STAGE_ARTIFACT_FILES: Partial<Record<StageType, string>> = {
  specify: "spec.md",
  plan: "plan.md",
  contracts: "contracts/",
  tasks: "tasks.md",
};

/** Map speckit template files to generation stages */
const SPECKIT_TEMPLATES: Partial<Record<StageType, string>> = {
  specify: "spec-template.md",
  plan: "plan-template.md",
  tasks: "tasks-template.md",
};

/** Review stages and the generation stage they guard */
const REVIEW_TO_GEN: Partial<Record<StageType, StageType>> = {
  "review-spec": "specify",
  "review-plan": "plan",
  "review-tasks": "tasks",
};

export interface PipelineContext {
  runId: string;
  description: string;
  projectDir: string;
  config: OrchConfig;
  registry: ToolRegistry;
  /** Resume from this stage — skip all prior stages (uses existing artifacts) */
  fromStage?: StageType;
  /** Directory with existing speckit artifacts (e.g. specs/001-orchestrator/) */
  specDir?: string;
  /** DB callbacks for persistence (optional, injected from CLI/MCP layer) */
  onStageCreate?: (stage: Stage) => void;
  onStageUpdate?: (stage: Stage) => void;
}

/**
 * Detect existing speckit artifacts and determine resume point.
 */
function detectExistingArtifacts(
  specDir: string,
  artifacts: PipelineResult["artifacts"],
): StageType | null {
  // Check in reverse order — find the latest existing artifact
  const checks: Array<{ file: string; stage: StageType; update: () => void }> = [
    {
      file: "tasks.md",
      stage: "review-tasks",
      update: () => { artifacts.tasksPath = join(specDir, "tasks.md"); },
    },
    {
      file: "plan.md",
      stage: "contracts",
      update: () => { artifacts.planPath = join(specDir, "plan.md"); },
    },
    {
      file: "spec.md",
      stage: "plan",
      update: () => { artifacts.specPath = join(specDir, "spec.md"); },
    },
  ];

  for (const check of checks) {
    if (existsSync(join(specDir, check.file))) {
      check.update();
      log.info({ specDir, artifact: check.file, resumeFrom: check.stage }, "existing artifact detected");
      // Continue checking — populate ALL existing artifacts
    }
  }

  // Find the furthest resume point
  if (artifacts.tasksPath) return "review-tasks";
  if (artifacts.planPath) return "contracts";
  if (artifacts.specPath) return "plan";

  return null;
}

/**
 * Try to load a speckit template for a generation stage.
 * Searches: projectDir/.specify/templates/, then walks up to repo root.
 */
function loadSpeckitTemplate(projectDir: string, stageType: StageType): string | null {
  const templateFile = SPECKIT_TEMPLATES[stageType];
  if (!templateFile) return null;

  const searchPaths = [
    join(projectDir, ".specify", "templates", templateFile),
    // Walk up one level (monorepo root)
    join(projectDir, "..", ".specify", "templates", templateFile),
    join(projectDir, "..", "..", ".specify", "templates", templateFile),
  ];

  for (const path of searchPaths) {
    if (existsSync(path)) {
      const content = readFileSync(path, "utf-8");
      log.info({ stageType, templatePath: path }, "speckit template loaded");
      return content;
    }
  }

  return null;
}

/**
 * Execute the pipeline for a run.
 * Supports resume mode — skips stages whose artifacts already exist.
 */
export async function executePipeline(ctx: PipelineContext): Promise<PipelineResult> {
  const { runId, description, projectDir, config, registry } = ctx;
  const stages: Stage[] = [];
  const artifacts: PipelineResult["artifacts"] = { contractPaths: [] };
  const startTime = Date.now();

  // --- Resume mode: detect existing artifacts ---
  let skipUntil: StageType | null = ctx.fromStage ?? null;

  if (ctx.specDir) {
    const detected = detectExistingArtifacts(ctx.specDir, artifacts);
    if (detected && !skipUntil) {
      skipUntil = detected;
      log.info({ specDir: ctx.specDir, resumeFrom: detected }, "auto-resume from existing speckit artifacts");
    }
  }

  log.info({ runId, description, skipUntil: skipUntil ?? "none" }, "pipeline starting");

  let skipping = !!skipUntil;

  for (const stageType of PIPELINE_STAGES) {
    // --- Skip logic ---
    if (skipping) {
      if (stageType === skipUntil) {
        skipping = false;
        // If this is a review stage and artifact already exists, skip it too
        if (REVIEW_STAGES.has(stageType)) {
          const genStage = REVIEW_TO_GEN[stageType];
          if (genStage) {
            const artifactFile = STAGE_ARTIFACT_FILES[genStage];
            const specDir = ctx.specDir ?? projectDir;
            if (artifactFile && existsSync(join(specDir, artifactFile))) {
              log.info({ stageType }, "skipping review — artifact already exists");
              continue;
            }
          }
        }
      } else {
        log.info({ stageType }, "skipping stage (resume mode)");
        continue;
      }
    }

    const toolName = config.pipeline[stageType as keyof PipelineConfig];
    if (!toolName) {
      log.warn({ stageType }, "no tool assigned — skipping stage");
      continue;
    }

    const tool = registry.getTool(toolName);
    const maxRetries = config.defaults.maxRetries;
    let attempt = 1;
    let approved = false;

    // --- Load speckit template for system prompt injection ---
    const template = loadSpeckitTemplate(projectDir, stageType);

    while (attempt <= maxRetries && !approved) {
      const stageId = uuid();
      const stage: Stage = {
        id: stageId,
        runId,
        type: stageType,
        toolName,
        status: "running",
        prompt: buildStagePrompt(stageType, description, artifacts, ctx.specDir),
        attempt,
        startedAt: new Date().toISOString(),
      };

      stages.push(stage);
      ctx.onStageCreate?.(stage);

      eventBus.emitEvent({
        type: "stage.started",
        timestamp: new Date().toISOString(),
        runId,
        stageId,
        stageType,
        toolName,
        attempt,
      });

      const timeoutMs = REVIEW_STAGES.has(stageType)
        ? config.defaults.timeouts.review * 1000
        : config.defaults.timeouts.implementation * 1000;

      try {
        const result = await spawnTool({
          tool,
          prompt: stage.prompt,
          cwd: projectDir,
          timeoutMs,
          systemPrompt: template ?? undefined,
        });

        stage.durationMs = result.durationMs;
        stage.processId = result.pid;

        // TODO: Make output format a ToolConfig property (e.g. outputFormat: "stream-json" | "text" | "json")
        // instead of hardcoding provider check. See Gemini review #9.
        const lines = tool.provider === "anthropic"
          ? filterStreamJson(result.stdout)
          : filterOutput(result.stdout);
        const output = lines.join("\n");

        for (const line of lines) {
          eventBus.emitEvent({
            type: "stage.output",
            timestamp: new Date().toISOString(),
            runId,
            stageId,
            line,
          });
        }

        if (result.exitCode !== 0) {
          throw AppError.stageFailed(stageId, stageType, `Exit code: ${result.exitCode}\n${result.stderr}`);
        }

        if (REVIEW_STAGES.has(stageType)) {
          const review = parseReviewOutput(output, toolName, result.durationMs);

          if (review.decision === "APPROVE") {
            stage.status = "approved";
            approved = true;
          } else {
            stage.status = "rejected";
            stage.error = review.feedback;

            eventBus.emitEvent({
              type: "stage.rejected",
              timestamp: new Date().toISOString(),
              runId,
              stageId,
              stageType,
              feedback: review.feedback,
              attempt,
              maxRetries,
            });

            log.warn({ stageType, attempt, maxRetries, feedback: review.feedback.slice(0, 200) }, "stage rejected");
            attempt++;
            continue;
          }
        } else {
          stage.status = "approved";
          approved = true;
        }

        stage.completedAt = new Date().toISOString();
        stage.outputPath = getArtifactPath(stageType, projectDir);
        updateArtifacts(artifacts, stageType, stage.outputPath);

        eventBus.emitEvent({
          type: "stage.completed",
          timestamp: new Date().toISOString(),
          runId,
          stageId,
          stageType,
          status: stage.status,
          durationMs: stage.durationMs ?? 0,
          outputPath: stage.outputPath,
        });

        ctx.onStageUpdate?.(stage);
      } catch (err: unknown) {
        stage.status = "failed";
        stage.error = err instanceof Error ? err.message : String(err);
        stage.completedAt = new Date().toISOString();
        ctx.onStageUpdate?.(stage);

        throw err instanceof AppError ? err : AppError.stageFailed(stageId, stageType, stage.error);
      }
    }

    if (!approved) {
      throw AppError.stageRejected(
        stages[stages.length - 1]?.id ?? "",
        stageType,
        `Rejected after ${maxRetries} attempts`,
      );
    }
  }

  return {
    stages,
    artifacts,
    totalDurationMs: Date.now() - startTime,
  };
}

function buildStagePrompt(
  stageType: StageType,
  description: string,
  artifacts: PipelineResult["artifacts"],
  specDir?: string,
): string {
  // If specDir provided, use absolute paths to existing artifacts
  const specPath = artifacts.specPath ?? (specDir ? join(specDir, "spec.md") : "spec.md");
  const planPath = artifacts.planPath ?? (specDir ? join(specDir, "plan.md") : "plan.md");
  const tasksPath = artifacts.tasksPath ?? (specDir ? join(specDir, "tasks.md") : "tasks.md");

  switch (stageType) {
    case "specify":
      return `Create a detailed specification for: ${description}`;
    case "review-spec":
      return `Review the specification at ${specPath}. Reply APPROVE on the first line if it's good, or REJECT followed by feedback.`;
    case "plan":
      return `Create an implementation plan based on the specification at ${specPath}`;
    case "review-plan":
      return `Review the implementation plan at ${planPath}. Reply APPROVE or REJECT followed by feedback.`;
    case "contracts":
      return `Generate TypeScript interfaces/contracts based on the plan at ${planPath}`;
    case "tasks":
      return `Generate a tasks.md with dependency graph based on the plan at ${planPath}`;
    case "review-tasks":
      return `Review the task breakdown at ${tasksPath}. Reply APPROVE or REJECT followed by feedback.`;
    default:
      return description;
  }
}

function getArtifactPath(stageType: StageType, _projectDir: string): string {
  return STAGE_ARTIFACT_FILES[stageType] ?? "";
}

function updateArtifacts(
  artifacts: PipelineResult["artifacts"],
  stageType: StageType,
  outputPath?: string,
): void {
  if (!outputPath) return;
  switch (stageType) {
    case "specify":
      artifacts.specPath = outputPath;
      break;
    case "plan":
      artifacts.planPath = outputPath;
      break;
    case "tasks":
      artifacts.tasksPath = outputPath;
      break;
    case "contracts":
      artifacts.contractPaths.push(outputPath);
      break;
  }
}
