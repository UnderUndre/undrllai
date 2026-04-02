/**
 * SSE endpoint — GET /api/runs/:id/events
 */

import { Hono } from "hono";
import { createEventStream } from "../sse.js";

export const eventsRouter = new Hono();

eventsRouter.get("/:id/events", (c) => {
  const runId = c.req.param("id");
  const stream = createEventStream(runId);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});
