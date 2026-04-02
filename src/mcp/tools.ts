/**
 * MCP tool definitions with Zod input schemas.
 */

import { z } from "zod";

export const orchRunSchema = z.object({
  description: z.string().min(1, "Description is required"),
  projectDir: z.string().optional(),
  dryRun: z.boolean().optional().default(false),
  toolOverrides: z.record(z.string()).optional(),
});

export const orchStatusSchema = z.object({
  runId: z.string().optional(),
});

export const orchDispatchTaskSchema = z.object({
  runId: z.string(),
  taskId: z.string().regex(/^T\d{3}$/, "Task ID must be T followed by 3 digits"),
  toolName: z.string().optional(),
});

export const orchMergeSchema = z.object({
  runId: z.string(),
  force: z.boolean().optional().default(false),
});

export const orchToolsListSchema = z.object({
  healthCheck: z.boolean().optional().default(false),
});

export const orchCleanupSchema = z.object({
  force: z.boolean().optional().default(false),
  maxAgeHours: z.number().optional().default(24),
});
