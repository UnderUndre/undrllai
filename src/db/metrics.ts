/**
 * ToolMetrics aggregation queries — avg duration, success rate, per stage type.
 */

import { getDb } from "./client.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ module: "db:metrics" });

export interface ToolMetric {
  toolName: string;
  stageType: string;
  avgDurationMs: number;
  successRate: number;
  totalRuns: number;
  lastUpdated: string;
}

export interface ToolRecommendation {
  stageType: string;
  bestTool: string;
  successRate: number;
  avgDurationMs: number;
}

/**
 * Record a stage/task completion metric.
 */
export function recordMetric(
  toolName: string,
  stageType: string,
  durationMs: number,
  success: boolean,
): void {
  const db = getDb();

  const existing = db
    .prepare("SELECT * FROM tool_metrics WHERE tool_name = ? AND stage_type = ?")
    .get(toolName, stageType) as ToolMetric | undefined;

  if (existing) {
    const newTotal = existing.totalRuns + 1;
    const newAvg =
      (existing.avgDurationMs * existing.totalRuns + durationMs) / newTotal;
    const newSuccessRate =
      (existing.successRate * existing.totalRuns + (success ? 1 : 0)) / newTotal;

    db.prepare(
      `UPDATE tool_metrics
       SET avg_duration_ms = ?, success_rate = ?, total_runs = ?, last_updated = ?
       WHERE tool_name = ? AND stage_type = ?`,
    ).run(newAvg, newSuccessRate, newTotal, new Date().toISOString(), toolName, stageType);
  } else {
    db.prepare(
      `INSERT INTO tool_metrics (tool_name, stage_type, avg_duration_ms, success_rate, total_runs, last_updated)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(toolName, stageType, durationMs, success ? 1.0 : 0.0, 1, new Date().toISOString());
  }

  log.debug({ toolName, stageType, durationMs, success }, "metric recorded");
}

/**
 * Get all metrics for a specific tool.
 */
export function getToolMetrics(toolName: string): ToolMetric[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM tool_metrics WHERE tool_name = ? ORDER BY stage_type")
    .all(toolName) as Array<{
      tool_name: string;
      stage_type: string;
      avg_duration_ms: number;
      success_rate: number;
      total_runs: number;
      last_updated: string;
    }>;

  return rows.map((r) => ({
    toolName: r.tool_name,
    stageType: r.stage_type,
    avgDurationMs: r.avg_duration_ms,
    successRate: r.success_rate,
    totalRuns: r.total_runs,
    lastUpdated: r.last_updated,
  }));
}

/**
 * Get all metrics across all tools.
 */
export function getAllMetrics(): ToolMetric[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM tool_metrics ORDER BY tool_name, stage_type")
    .all() as Array<{
      tool_name: string;
      stage_type: string;
      avg_duration_ms: number;
      success_rate: number;
      total_runs: number;
      last_updated: string;
    }>;

  return rows.map((r) => ({
    toolName: r.tool_name,
    stageType: r.stage_type,
    avgDurationMs: r.avg_duration_ms,
    successRate: r.success_rate,
    totalRuns: r.total_runs,
    lastUpdated: r.last_updated,
  }));
}

/**
 * Get best tool recommendation for each stage type.
 */
export function getRecommendations(minRuns: number = 3): ToolRecommendation[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT stage_type, tool_name, success_rate, avg_duration_ms
       FROM tool_metrics
       WHERE total_runs >= ?
       ORDER BY stage_type, success_rate DESC, avg_duration_ms ASC`,
    )
    .all(minRuns) as Array<{
      stage_type: string;
      tool_name: string;
      success_rate: number;
      avg_duration_ms: number;
    }>;

  // Pick the best tool per stage type
  const seen = new Set<string>();
  const recs: ToolRecommendation[] = [];

  for (const row of rows) {
    if (seen.has(row.stage_type)) continue;
    seen.add(row.stage_type);
    recs.push({
      stageType: row.stage_type,
      bestTool: row.tool_name,
      successRate: row.success_rate,
      avgDurationMs: row.avg_duration_ms,
    });
  }

  return recs;
}
