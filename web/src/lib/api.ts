/**
 * API client for REST endpoints.
 */

const BASE_URL = "/api";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export interface RunSummary {
  id: string;
  description: string;
  status: string;
  createdAt: string;
  completedAt?: string;
}

export interface ToolInfo {
  name: string;
  command: string;
  strengths: string[];
  priority: number;
  provider: string;
  enabled: boolean;
}

export const api = {
  listRuns: () => fetchJson<{ runs: RunSummary[] }>("/runs"),
  getRun: (id: string) => fetchJson<RunSummary>(`/runs/${id}`),
  createRun: (description: string) =>
    fetchJson<{ runId: string }>("/runs", {
      method: "POST",
      body: JSON.stringify({ description }),
    }),
  listTools: () => fetchJson<{ tools: ToolInfo[] }>("/tools"),
};
