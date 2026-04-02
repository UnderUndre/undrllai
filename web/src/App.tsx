/**
 * App — main layout connecting all dashboard components.
 */

import React, { useState } from "react";
import { PipelineView } from "./components/PipelineView.js";
import { LaneProgress } from "./components/LaneProgress.js";
import { DependencyGraph } from "./components/DependencyGraph.js";
import { RunHistory } from "./components/RunHistory.js";
import { useSSE } from "./hooks/useSSE.js";

interface OrchEvent {
  type: string;
  runId: string;
  timestamp: string;
  [key: string]: unknown;
}

export function App() {
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const { events, connected } = useSSE<OrchEvent>({
    url: activeRunId ? `/api/runs/${activeRunId}/events` : "",
    enabled: !!activeRunId,
  });

  return (
    <div
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "20px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        background: "#1a1a1a",
        color: "#eee",
        minHeight: "100vh",
      }}
    >
      <header style={{ marginBottom: "24px", borderBottom: "1px solid #333", paddingBottom: "12px" }}>
        <h1 style={{ margin: 0, fontSize: "24px" }}>
          Orch Dashboard
          {connected && (
            <span style={{ fontSize: "12px", color: "#4caf50", marginLeft: "12px" }}>
              ● Connected
            </span>
          )}
        </h1>
        <div style={{ marginTop: "8px" }}>
          <input
            type="text"
            placeholder="Enter Run ID to monitor..."
            style={{
              padding: "6px 12px",
              background: "#333",
              border: "1px solid #555",
              borderRadius: "4px",
              color: "#eee",
              width: "300px",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setActiveRunId((e.target as HTMLInputElement).value);
              }
            }}
          />
        </div>
      </header>

      <div style={{ display: "grid", gap: "24px" }}>
        <section>
          <PipelineView events={events} />
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
          <LaneProgress events={events} />
          <DependencyGraph tasks={[]} />
        </section>

        <section>
          <RunHistory />
        </section>
      </div>
    </div>
  );
}
