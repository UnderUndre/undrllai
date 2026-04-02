/**
 * Tasks.md parser — extracts tasks, agent tags, story labels, file paths,
 * and builds the dependency graph for the scheduler.
 */

import { readFileSync } from "node:fs";
import { logger } from "../utils/logger.js";
import type { ParsedTask, DependencyGraph, DependencyEdge, AgentTag } from "../types.js";
import { AGENT_TAGS } from "../types.js";

const log = logger.child({ module: "tasks-parser" });

/**
 * Regex to match task lines:
 * - [ ] T001 [AGENT] [USx?] Description with packages/foo/bar.ts
 */
const TASK_LINE_RE =
  /^- \[[ X→!~]\] (T\d{3}) \[(\w+)\](?: \[(\w+)\])? (.+)$/;

/**
 * Regex to extract file paths from task descriptions.
 * Matches paths like packages/orchestrator/src/foo/bar.ts
 */
const FILE_PATH_RE = /(?:packages\/[\w/.-]+|src\/[\w/.-]+)/g;

/**
 * Parse a dependency line like: T001 → T002, T003, T004
 * Or join: T006 + T007 → T019
 */
const DEP_LINE_RE =
  /^(T\d{3}(?:\s*\+\s*T\d{3})*)\s*→\s*(T\d{3}(?:\s*,\s*T\d{3})*)$/;

/**
 * Parse tasks from a tasks.md file.
 */
export function parseTasks(filePath: string): ParsedTask[] {
  const content = readFileSync(filePath, "utf-8");
  return parseTasksFromContent(content);
}

/**
 * Parse tasks from raw content string (for testing).
 */
export function parseTasksFromContent(content: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];

  for (const line of content.split("\n")) {
    const match = TASK_LINE_RE.exec(line.trim());
    if (!match) continue;

    const [, id, agentRaw, story, description] = match;
    if (!id || !agentRaw || !description) continue;

    const agentTag = `[${agentRaw}]` as AgentTag;
    if (!AGENT_TAGS.includes(agentTag)) {
      log.warn({ id, agentTag }, "unknown agent tag, skipping");
      continue;
    }

    const filePaths = description.match(FILE_PATH_RE) ?? [];

    tasks.push({
      id,
      agentTag,
      storyLabel: story ? `[${story}]` : undefined,
      description,
      filePaths,
    });
  }

  log.info({ taskCount: tasks.length }, "tasks parsed");
  return tasks;
}

/**
 * Parse the dependency graph from a tasks.md file.
 */
export function parseDependencyGraph(filePath: string): DependencyGraph {
  const content = readFileSync(filePath, "utf-8");
  return parseDependencyGraphFromContent(content);
}

/**
 * Parse dependency graph from raw content string.
 */
export function parseDependencyGraphFromContent(content: string): DependencyGraph {
  const edges: DependencyEdge[] = [];
  const allTo = new Set<string>();
  const allFrom = new Set<string>();

  // Find the Dependencies section
  const lines = content.split("\n");
  let inDeps = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "### Dependencies") {
      inDeps = true;
      continue;
    }

    if (inDeps && trimmed.startsWith("###")) {
      break; // Next section
    }

    if (!inDeps) continue;
    if (!trimmed || trimmed.startsWith(">") || trimmed.startsWith("-") || trimmed.startsWith("#")) {
      continue;
    }

    const match = DEP_LINE_RE.exec(trimmed);
    if (!match) continue;

    const [, fromRaw, toRaw] = match;
    if (!fromRaw || !toRaw) continue;

    const from = fromRaw.split(/\s*\+\s*/).map((s) => s.trim());
    const to = toRaw.split(/\s*,\s*/).map((s) => s.trim());

    edges.push({ from, to });

    for (const f of from) allFrom.add(f);
    for (const t of to) allTo.add(t);
  }

  // Roots = tasks that appear in 'from' but never in 'to', or tasks not in graph at all
  const roots = [...allFrom].filter((f) => !allTo.has(f));

  log.info({ edgeCount: edges.length, rootCount: roots.length }, "dependency graph parsed");

  return {
    edges,
    roots: roots.sort(),
    criticalPath: [], // Computed by scheduler
  };
}

/**
 * Detect circular dependencies in the graph.
 * Returns the cycle path if found, null otherwise.
 */
export function detectCycles(graph: DependencyGraph): string[] | null {
  // Build adjacency list
  const adj = new Map<string, string[]>();
  for (const edge of graph.edges) {
    for (const from of edge.from) {
      for (const to of edge.to) {
        const existing = adj.get(from) ?? [];
        existing.push(to);
        adj.set(from, existing);
      }
    }
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): string[] | null {
    if (inStack.has(node)) {
      // Found cycle
      const cycleStart = path.indexOf(node);
      return [...path.slice(cycleStart), node];
    }
    if (visited.has(node)) return null;

    visited.add(node);
    inStack.add(node);
    path.push(node);

    for (const neighbor of adj.get(node) ?? []) {
      const cycle = dfs(neighbor);
      if (cycle) return cycle;
    }

    path.pop();
    inStack.delete(node);
    return null;
  }

  for (const node of adj.keys()) {
    const cycle = dfs(node);
    if (cycle) return cycle;
  }

  return null;
}
