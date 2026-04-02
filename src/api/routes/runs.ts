/**
 * Runs API routes — GET /api/runs, POST /api/runs, GET /api/runs/:id
 */

import { Hono } from "hono";
import { z } from "zod";

export const runsRouter = new Hono();

const createRunSchema = z.object({
  description: z.string().min(1),
  projectDir: z.string().optional(),
  dryRun: z.boolean().optional(),
});

runsRouter.get("/", (c) => {
  // TODO: wire to DB when ready
  return c.json({ runs: [], message: "DB integration pending" });
});

runsRouter.get("/:id", (c) => {
  const id = c.req.param("id");
  // TODO: wire to DB
  return c.json({ id, message: "DB integration pending" });
});

runsRouter.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = createRunSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues }, 400);
  }

  // TODO: wire to pipeline execution
  return c.json({
    runId: "pending",
    status: "accepted",
    message: "Run creation pending full integration",
  }, 202);
});
