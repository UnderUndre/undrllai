/**
 * Hono HTTP server with CORS for Web UI API.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { runsRouter } from "./routes/runs.js";
import { eventsRouter } from "./routes/events.js";
import { toolsRouter } from "./routes/tools.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ module: "api" });

export function createApp(): Hono {
  const app = new Hono();

  app.use("/*", cors());

  // Routes
  app.route("/api/runs", runsRouter);
  app.route("/api/runs", eventsRouter);
  app.route("/api/tools", toolsRouter);

  // Health check
  app.get("/api/health", (c) => c.json({ status: "ok" }));

  return app;
}

export function startApiServer(port: number = 3001): void {
  const app = createApp();

  serve({ fetch: app.fetch, port }, () => {
    log.info({ port }, "API server started");
  });
}
