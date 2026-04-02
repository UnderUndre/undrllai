/**
 * Zod schemas for orch.config.yaml validation.
 * Covers tools, pipeline, ensemble, defaults sections.
 */

import { z } from "zod";

const toolStrengthSchema = z.enum([
  "backend",
  "frontend",
  "database",
  "review",
  "spec",
  "security",
  "devops",
]);

const toolProviderSchema = z.enum(["anthropic", "google", "alibaba", "github", "local"]);

const toolConfigSchema = z.object({
  command: z.string().min(1),
  headlessFlags: z.array(z.string()).default([]),
  strengths: z.array(toolStrengthSchema).default([]),
  priority: z.number().int().min(0).default(99),
  provider: toolProviderSchema,
  enabled: z.boolean().default(true),
  healthCheckPrompt: z.string().optional(),
});

const pipelineConfigSchema = z.object({
  specify: z.string(),
  "review-spec": z.string(),
  plan: z.string(),
  "review-plan": z.string(),
  contracts: z.string(),
  tasks: z.string(),
  "review-tasks": z.string(),
});

const ensembleConfigSchema = z.object({
  "[BE]": z.string(),
  "[FE]": z.string(),
  "[DB]": z.string(),
  "[OPS]": z.string(),
  "[E2E]": z.string(),
  "[SEC]": z.string(),
});

const defaultsSchema = z.object({
  maxRetries: z.number().int().min(1).max(10).default(3),
  timeouts: z
    .object({
      implementation: z.number().int().min(30).default(300),
      review: z.number().int().min(30).default(120),
    })
    .default({}),
  buildCommand: z.string().default("npm run build"),
  validateCommand: z.string().default("npx tsc --noEmit"),
});

export const orchConfigSchema = z.object({
  version: z.literal(1),
  defaults: defaultsSchema.default({}),
  pipeline: pipelineConfigSchema,
  ensemble: ensembleConfigSchema,
  tools: z.record(z.string(), toolConfigSchema).refine(
    (tools) => Object.keys(tools).length > 0,
    { message: "At least one tool must be configured" },
  ),
});

export type ValidatedOrchConfig = z.infer<typeof orchConfigSchema>;

/**
 * Validate that all tool references in pipeline and ensemble point to defined tools.
 */
export function validateToolReferences(config: ValidatedOrchConfig): string[] {
  const toolNames = new Set(Object.keys(config.tools));
  const errors: string[] = [];

  for (const [stage, tool] of Object.entries(config.pipeline)) {
    if (!toolNames.has(tool)) {
      errors.push(`pipeline.${stage} references unknown tool "${tool}"`);
    }
  }

  for (const [agent, tool] of Object.entries(config.ensemble)) {
    if (!toolNames.has(tool)) {
      errors.push(`ensemble.${agent} references unknown tool "${tool}"`);
    }
  }

  return errors;
}
