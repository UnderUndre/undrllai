/**
 * ToolLeaderboard — per-tool metrics table with sorting.
 */

import React, { useEffect, useState } from "react";

interface ToolMetric {
  toolName: string;
  stageType: string;
  avgDurationMs: number;
  successRate: number;
  totalRuns: number;
}

interface Props {
  metrics?: ToolMetric[];
}

export function ToolLeaderboard({ metrics: propMetrics }: Props) {
  const [metrics, setMetrics] = useState<ToolMetric[]>(propMetrics ?? []);
  const [sortBy, setSortBy] = useState<"successRate" | "avgDurationMs">("successRate");

  useEffect(() => {
    if (propMetrics) setMetrics(propMetrics);
  }, [propMetrics]);

  const sorted = [...metrics].sort((a, b) => {
    if (sortBy === "successRate") return b.successRate - a.successRate;
    return a.avgDurationMs - b.avgDurationMs;
  });

  if (sorted.length === 0) {
    return (
      <div style={{ fontFamily: "monospace", color: "#666" }}>
        No metrics yet. Run some orchestrations first.
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "monospace" }}>
      <h2>Tool Leaderboard</h2>
      <div style={{ marginBottom: "8px" }}>
        Sort by:{" "}
        <button
          onClick={() => setSortBy("successRate")}
          style={{
            background: sortBy === "successRate" ? "#2196f3" : "#333",
            color: "#eee",
            border: "none",
            padding: "4px 8px",
            borderRadius: "4px",
            cursor: "pointer",
            marginRight: "4px",
          }}
        >
          Success Rate
        </button>
        <button
          onClick={() => setSortBy("avgDurationMs")}
          style={{
            background: sortBy === "avgDurationMs" ? "#2196f3" : "#333",
            color: "#eee",
            border: "none",
            padding: "4px 8px",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Speed
        </button>
      </div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>Tool</th>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>Stage</th>
            <th style={{ textAlign: "right", padding: "4px 8px" }}>Success</th>
            <th style={{ textAlign: "right", padding: "4px 8px" }}>Avg Time</th>
            <th style={{ textAlign: "right", padding: "4px 8px" }}>Runs</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m, idx) => (
            <tr key={`${m.toolName}-${m.stageType}-${idx}`} style={{ borderBottom: "1px solid #333" }}>
              <td style={{ padding: "4px 8px" }}>{m.toolName}</td>
              <td style={{ padding: "4px 8px" }}>{m.stageType}</td>
              <td style={{ padding: "4px 8px", textAlign: "right" }}>
                {(m.successRate * 100).toFixed(0)}%
              </td>
              <td style={{ padding: "4px 8px", textAlign: "right" }}>
                {(m.avgDurationMs / 1000).toFixed(1)}s
              </td>
              <td style={{ padding: "4px 8px", textAlign: "right" }}>{m.totalRuns}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
