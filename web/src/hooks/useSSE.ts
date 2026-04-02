/**
 * useSSE hook — consumes Server-Sent Events with auto-reconnection.
 */

import { useState, useEffect, useCallback, useRef } from "react";

interface UseSSEOptions {
  url: string;
  enabled?: boolean;
  retryIntervalMs?: number;
}

export function useSSE<T>(options: UseSSEOptions) {
  const { url, enabled = true, retryIntervalMs = 3000 } = options;
  const [events, setEvents] = useState<T[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (!enabled) return;

    const source = new EventSource(url);
    sourceRef.current = source;

    source.onopen = () => {
      setConnected(true);
      setError(null);
    };

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as T;
        setEvents((prev) => [...prev, data]);
      } catch {
        // Non-JSON message (keepalive)
      }
    };

    source.onerror = () => {
      setConnected(false);
      source.close();
      setError("Connection lost — reconnecting...");

      setTimeout(connect, retryIntervalMs);
    };
  }, [url, enabled, retryIntervalMs]);

  useEffect(() => {
    connect();
    return () => {
      sourceRef.current?.close();
    };
  }, [connect]);

  const clear = useCallback(() => setEvents([]), []);

  return { events, connected, error, clear };
}
