/**
 * Typed EventBus using eventemitter3.
 * Engine emits events → SSE endpoint and CLI consume them.
 */

import { EventEmitter } from "eventemitter3";
import type { OrchEvent } from "./types.js";

export type { OrchEvent };

/**
 * All events are emitted with their `type` field as the event name.
 * Subscribe to "*" for all events (SSE consumers).
 * Subscribe to specific event types like "run.started" for targeted handling.
 */
interface EventMap {
  [eventType: string]: [OrchEvent];
}

class OrchEventBus extends EventEmitter<EventMap> {
  /**
   * Emit a typed event. Also emits on "*" wildcard for SSE subscribers.
   */
  emitEvent(event: OrchEvent): void {
    this.emit(event.type, event);
    this.emit("*", event);
  }
}

/** Singleton event bus for the orchestrator */
export const eventBus = new OrchEventBus();
