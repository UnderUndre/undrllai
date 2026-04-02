/**
 * DependencyGraph — visual node list with status-based coloring.
 * Simple text-based visualization (full graph viz would need d3/dagre).
 */

import React from "react";

interface TaskNode {
  id: string;
  status: "pending" | "running" | "completed" | "failed" | "blocked";
  agentTag: string;
}

interface Props {
  tasks: TaskNode[];
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#666",
  running: "#2196f3",
  completed: "#4caf50",
  failed: "#f44336",
  blocked: "#ff9800",
};

export function DependencyGraph({ tasks }: Props) {
  if (tasks.length === 0) {
    return <div style={{ fontFamily: "monospace", color: "#666" }}>No tasks</div>;
  }

  return (
    <div style={{ fontFamily: "monospace" }}>
      <h2>Task Status</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {tasks.map((task) => (
          <div
            key={task.id}
            style={{
              padding: "6px 10px",
              borderRadius: "4px",
              background: STATUS_COLORS[task.status] ?? "#333",
              color: "#fff",
              fontSize: "12px",
              minWidth: "60px",
              textAlign: "center",
            }}
          >
            <div style={{ fontWeight: "bold" }}>{task.id}</div>
            <div style={{ fontSize: "10px" }}>{task.agentTag}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: "8px", fontSize: "12px", color: "#999" }}>
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <span key={status} style={{ marginRight: "12px" }}>
            <span style={{ color }}>●</span> {status}
          </span>
        ))}
      </div>
    </div>
  );
}
