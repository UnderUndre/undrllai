/**
 * Dependency scheduler — topological sort, parallel group identification, critical path.
 * Transforms the dependency graph into execution order with lane assignments.
 */

import { logger } from "../utils/logger.js";
import type { DependencyGraph, ParsedTask, ParallelLane } from "../types.js";

const log = logger.child({ module: "scheduler" });

interface AdjacencyInfo {
  /** task → tasks it must wait for (predecessors) */
  inEdges: Map<string, Set<string>>;
  /** task → tasks it unlocks (successors) */
  outEdges: Map<string, Set<string>>;
  /** All task IDs referenced in the graph */
  allNodes: Set<string>;
}

/**
 * Build adjacency lists from the dependency graph.
 * Handles fan-in (A + B → C) and fan-out (A → B, C).
 */
function buildAdjacency(graph: DependencyGraph): AdjacencyInfo {
  const inEdges = new Map<string, Set<string>>();
  const outEdges = new Map<string, Set<string>>();
  const allNodes = new Set<string>();

  for (const edge of graph.edges) {
    for (const to of edge.to) {
      allNodes.add(to);
      for (const from of edge.from) {
        allNodes.add(from);

        const ins = inEdges.get(to) ?? new Set();
        ins.add(from);
        inEdges.set(to, ins);

        const outs = outEdges.get(from) ?? new Set();
        outs.add(to);
        outEdges.set(from, outs);
      }
    }
  }

  return { inEdges, outEdges, allNodes };
}

/**
 * Topological sort using Kahn's algorithm.
 * Returns tasks in valid execution order.
 * Throws if cycles detected.
 */
export function topologicalSort(graph: DependencyGraph, allTaskIds: string[]): string[] {
  const { inEdges, outEdges, allNodes } = buildAdjacency(graph);

  // Include tasks that aren't in the graph (no deps)
  const allSet = new Set([...allNodes, ...allTaskIds]);

  // Calculate in-degree for each node
  const inDegree = new Map<string, number>();
  for (const node of allSet) {
    inDegree.set(node, inEdges.get(node)?.size ?? 0);
  }

  // Start with zero in-degree nodes
  const queue: string[] = [];
  for (const [node, degree] of inDegree) {
    if (degree === 0) {
      queue.push(node);
    }
  }
  queue.sort(); // Deterministic order within each level

  const sorted: string[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);

    for (const successor of outEdges.get(node) ?? []) {
      const newDegree = (inDegree.get(successor) ?? 1) - 1;
      inDegree.set(successor, newDegree);
      if (newDegree === 0) {
        queue.push(successor);
        queue.sort();
      }
    }
  }

  if (sorted.length < allSet.size) {
    const remaining = [...allSet].filter((n) => !sorted.includes(n));
    log.error({ remaining }, "cycle detected — tasks cannot be sorted");
    throw new Error(`Dependency cycle detected involving: ${remaining.join(", ")}`);
  }

  return sorted;
}

/**
 * Identify parallel execution groups.
 * Tasks in the same group can run simultaneously.
 */
export function identifyParallelGroups(
  graph: DependencyGraph,
  allTaskIds: string[],
): string[][] {
  const { inEdges } = buildAdjacency(graph);
  const completed = new Set<string>();
  const groups: string[][] = [];
  const remaining = new Set(allTaskIds);

  while (remaining.size > 0) {
    // Find all tasks whose dependencies are all completed
    const ready: string[] = [];
    for (const taskId of remaining) {
      const deps = inEdges.get(taskId);
      if (!deps || [...deps].every((d) => completed.has(d))) {
        ready.push(taskId);
      }
    }

    if (ready.length === 0) {
      log.error({ remaining: [...remaining] }, "deadlock — no tasks can proceed");
      break;
    }

    ready.sort();
    groups.push(ready);

    for (const taskId of ready) {
      completed.add(taskId);
      remaining.delete(taskId);
    }
  }

  log.info({ groupCount: groups.length, totalTasks: allTaskIds.length }, "parallel groups identified");
  return groups;
}

/**
 * Compute the critical path (longest path through the graph).
 * Uses topological order + DP.
 */
export function computeCriticalPath(
  graph: DependencyGraph,
  allTaskIds: string[],
): string[] {
  const sorted = topologicalSort(graph, allTaskIds);
  const { outEdges } = buildAdjacency(graph);

  // Longest path to each node
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();

  for (const node of sorted) {
    dist.set(node, 0);
    prev.set(node, null);
  }

  for (const node of sorted) {
    const currentDist = dist.get(node) ?? 0;
    for (const successor of outEdges.get(node) ?? []) {
      const newDist = currentDist + 1;
      if (newDist > (dist.get(successor) ?? 0)) {
        dist.set(successor, newDist);
        prev.set(successor, node);
      }
    }
  }

  // Find the end of the longest path
  let maxNode = sorted[0] ?? "";
  let maxDist = 0;
  for (const [node, d] of dist) {
    if (d > maxDist) {
      maxDist = d;
      maxNode = node;
    }
  }

  // Trace back
  const path: string[] = [];
  let current: string | null = maxNode;
  while (current !== null) {
    path.unshift(current);
    current = prev.get(current) ?? null;
  }

  log.info({ criticalPath: path, length: path.length }, "critical path computed");
  return path;
}

/**
 * Assign lane numbers to tasks based on their agent tag grouping.
 */
export function assignLanes(
  tasks: ParsedTask[],
  graph: DependencyGraph,
): ParallelLane[] {
  // Group tasks by agent tag
  const byAgent = new Map<string, ParsedTask[]>();
  for (const task of tasks) {
    const existing = byAgent.get(task.agentTag) ?? [];
    existing.push(task);
    byAgent.set(task.agentTag, existing);
  }

  const { inEdges } = buildAdjacency(graph);
  const lanes: ParallelLane[] = [];
  let laneNum = 1;

  for (const [agentTag, agentTasks] of byAgent) {
    const taskIds = agentTasks.map((t) => t.id).sort();

    // Find blocking tasks (external deps from other agent tags)
    const blockers = new Set<string>();
    for (const taskId of taskIds) {
      for (const dep of inEdges.get(taskId) ?? []) {
        if (!taskIds.includes(dep)) {
          blockers.add(dep);
        }
      }
    }

    lanes.push({
      number: laneNum++,
      agentFlow: agentTag,
      taskIds,
      blockedBy: [...blockers].sort().join(" + ") || "—",
    });
  }

  return lanes;
}
