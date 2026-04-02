/**
 * LaneProgress — per-lane progress bars with tool name and task status.
 */

import React from "react";

interface TaskEvent {
  type: string;
  taskId?: string;
  agentTag?: string;
  toolName?: string;
  lane?: number;
  durationMs?: number;
  error?: string;
}

interface Props {
  events: TaskEvent[];
}

interface LaneInfo {
  lane: number;
  tasks: Map<string, { status: string; toolName?: string; durationMs?: number }>;
}

export function LaneProgress({ events }: Props) {
  const lanes = new Map<number, LaneInfo>();

  for (const event of events) {
    if (!event.taskId || event.lane === undefined) continue;

    if (!lanes.has(event.lane)) {
      lanes.set(event.lane, { lane: event.lane, tasks: new Map() });
    }

    const laneInfo = lanes.get(event.lane)!;

    if (event.type === "task.started") {
      laneInfo.tasks.set(event.taskId, { status: "running", toolName: event.toolName });
    } else if (event.type === "task.completed") {
      const existing = laneInfo.tasks.get(event.taskId);
      laneInfo.tasks.set(event.taskId, {
        ...existing,
        status: "completed",
        durationMs: event.durationMs,
      });
    } else if (event.type === "task.failed") {
      const existing = laneInfo.tasks.get(event.taskId);
      laneInfo.tasks.set(event.taskId, { ...existing, status: "failed" });
    }
  }

  const sortedLanes = [...lanes.values()].sort((a, b) => a.lane - b.lane);

  if (sortedLanes.length === 0) {
    return <div style={{ fontFamily: "monospace", color: "#666" }}>No active lanes</div>;
  }

  return (
    <div style={{ fontFamily: "monospace" }}>
      <h2>Ensemble Lanes</h2>
      {sortedLanes.map((lane) => {
        const tasks = [...lane.tasks.entries()];
        const completed = tasks.filter(([, t]) => t.status === "completed").length;
        const total = tasks.length;
        const pct = total > 0 ? (completed / total) * 100 : 0;

        return (
          <div key={lane.lane} style={{ marginBottom: "12px" }}>
            <div>Lane {lane.lane}: {completed}/{total} tasks</div>
            <div
              style={{
                background: "#333",
                borderRadius: "4px",
                height: "20px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  background: completed === total ? "#4caf50" : "#2196f3",
                  width: `${pct}%`,
                  height: "100%",
                  transition: "width 0.3s",
                }}
              />
            </div>
            <div style={{ fontSize: "12px", color: "#999" }}>
              {tasks.map(([id, t]) => (
                <span key={id} style={{ marginRight: "8px" }}>
                  {id}:{t.status === "completed" ? "✅" : t.status === "failed" ? "❌" : "🔄"}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
