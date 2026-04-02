/**
 * PipelineView — stage visualization with current/completed/failed states.
 */

import React from "react";

interface StageEvent {
  type: string;
  stageType?: string;
  status?: string;
  durationMs?: number;
  toolName?: string;
}

interface Props {
  events: StageEvent[];
}

const STAGE_ORDER = [
  "specify",
  "review-spec",
  "plan",
  "review-plan",
  "contracts",
  "tasks",
  "review-tasks",
  "implement",
  "validate",
];

function getStageStatus(
  stageType: string,
  events: StageEvent[],
): { status: string; durationMs?: number; toolName?: string } {
  const stageEvents = events.filter(
    (e) => e.stageType === stageType,
  );

  const completed = stageEvents.find((e) => e.type === "stage.completed");
  if (completed) {
    return { status: completed.status ?? "approved", durationMs: completed.durationMs, toolName: completed.toolName };
  }

  const started = stageEvents.find((e) => e.type === "stage.started");
  if (started) {
    return { status: "running", toolName: started.toolName };
  }

  const rejected = stageEvents.find((e) => e.type === "stage.rejected");
  if (rejected) {
    return { status: "rejected" };
  }

  return { status: "pending" };
}

const STATUS_EMOJI: Record<string, string> = {
  pending: "⏳",
  running: "🔄",
  approved: "✅",
  rejected: "❌",
  failed: "💥",
};

export function PipelineView({ events }: Props) {
  return (
    <div style={{ fontFamily: "monospace" }}>
      <h2>Pipeline Stages</h2>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>#</th>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>Stage</th>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>Status</th>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>Tool</th>
            <th style={{ textAlign: "right", padding: "4px 8px" }}>Duration</th>
          </tr>
        </thead>
        <tbody>
          {STAGE_ORDER.map((stage, idx) => {
            const info = getStageStatus(stage, events);
            return (
              <tr key={stage} style={{ borderBottom: "1px solid #333" }}>
                <td style={{ padding: "4px 8px" }}>{idx + 1}</td>
                <td style={{ padding: "4px 8px" }}>{stage}</td>
                <td style={{ padding: "4px 8px" }}>
                  {STATUS_EMOJI[info.status] ?? "?"} {info.status}
                </td>
                <td style={{ padding: "4px 8px" }}>{info.toolName ?? "—"}</td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>
                  {info.durationMs ? `${(info.durationMs / 1000).toFixed(1)}s` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
