/**
 * SSE emitter helper — bridges EventBus to Server-Sent Events stream.
 */

import { eventBus, type OrchEvent } from "../events/bus.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ module: "sse" });

/**
 * Create an SSE stream that emits all events for a specific run.
 */
export function createEventStream(runId: string): ReadableStream {
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      function onEvent(event: OrchEvent): void {
        if (event.runId !== runId) return;

        const data = `data: ${JSON.stringify(event)}\n\n`;
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // Stream closed
          cleanup();
        }
      }

      function cleanup(): void {
        eventBus.removeListener("*", onEvent);
        log.debug({ runId }, "SSE stream closed");
      }

      eventBus.on("*", onEvent);
      log.debug({ runId }, "SSE stream opened");

      // Send initial keepalive
      controller.enqueue(encoder.encode(": keepalive\n\n"));
    },
  });
}
