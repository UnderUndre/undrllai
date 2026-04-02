/**
 * RunHistory — list of completed runs with summary stats.
 */

import React, { useEffect, useState } from "react";
import { api, type RunSummary } from "../lib/api.js";

export function RunHistory() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listRuns()
      .then((data) => setRuns(data.runs))
      .catch(() => setRuns([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={{ fontFamily: "monospace" }}>Loading runs...</div>;
  }

  if (runs.length === 0) {
    return (
      <div style={{ fontFamily: "monospace", color: "#666" }}>
        No runs yet. Start one with <code>orch run "description"</code>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "monospace" }}>
      <h2>Run History</h2>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>ID</th>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>Description</th>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>Status</th>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>Created</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} style={{ borderBottom: "1px solid #333" }}>
              <td style={{ padding: "4px 8px", fontFamily: "monospace" }}>
                {run.id.slice(0, 8)}
              </td>
              <td style={{ padding: "4px 8px" }}>{run.description}</td>
              <td style={{ padding: "4px 8px" }}>{run.status}</td>
              <td style={{ padding: "4px 8px" }}>{run.createdAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
