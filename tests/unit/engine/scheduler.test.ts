import { describe, it, expect } from "vitest";
import {
  topologicalSort,
  identifyParallelGroups,
  computeCriticalPath,
} from "../../../src/engine/scheduler.js";
import type { DependencyGraph } from "../../../src/types.js";

const simpleGraph: DependencyGraph = {
  edges: [
    { from: ["T001"], to: ["T002", "T003"] },
    { from: ["T002"], to: ["T004"] },
    { from: ["T003"], to: ["T004"] },
    { from: ["T004"], to: ["T005"] },
  ],
  roots: ["T001"],
  criticalPath: [],
};

const allTasks = ["T001", "T002", "T003", "T004", "T005"];

describe("topologicalSort", () => {
  it("produces valid ordering", () => {
    const sorted = topologicalSort(simpleGraph, allTasks);
    expect(sorted).toHaveLength(5);
    expect(sorted.indexOf("T001")).toBeLessThan(sorted.indexOf("T002"));
    expect(sorted.indexOf("T001")).toBeLessThan(sorted.indexOf("T003"));
    expect(sorted.indexOf("T002")).toBeLessThan(sorted.indexOf("T004"));
    expect(sorted.indexOf("T003")).toBeLessThan(sorted.indexOf("T004"));
    expect(sorted.indexOf("T004")).toBeLessThan(sorted.indexOf("T005"));
  });

  it("throws on cycles", () => {
    const cyclic: DependencyGraph = {
      edges: [
        { from: ["T001"], to: ["T002"] },
        { from: ["T002"], to: ["T001"] },
      ],
      roots: [],
      criticalPath: [],
    };
    expect(() => topologicalSort(cyclic, ["T001", "T002"])).toThrow("cycle");
  });

  it("includes tasks not in graph", () => {
    const sorted = topologicalSort(simpleGraph, [...allTasks, "T006"]);
    expect(sorted).toContain("T006");
  });
});

describe("identifyParallelGroups", () => {
  it("groups independent tasks together", () => {
    const groups = identifyParallelGroups(simpleGraph, allTasks);
    // T001 is first (root), T002+T003 can run in parallel, T004 after both, T005 last
    expect(groups[0]).toEqual(["T001"]);
    expect(groups[1]).toEqual(expect.arrayContaining(["T002", "T003"]));
    expect(groups[2]).toEqual(["T004"]);
    expect(groups[3]).toEqual(["T005"]);
  });

  it("handles single-task groups", () => {
    const linear: DependencyGraph = {
      edges: [
        { from: ["T001"], to: ["T002"] },
        { from: ["T002"], to: ["T003"] },
      ],
      roots: ["T001"],
      criticalPath: [],
    };
    const groups = identifyParallelGroups(linear, ["T001", "T002", "T003"]);
    expect(groups).toHaveLength(3);
    expect(groups.every((g) => g.length === 1)).toBe(true);
  });
});

describe("computeCriticalPath", () => {
  it("finds longest path", () => {
    const path = computeCriticalPath(simpleGraph, allTasks);
    expect(path).toEqual(["T001", "T002", "T004", "T005"]);
  });

  it("returns at least one node", () => {
    const trivial: DependencyGraph = {
      edges: [],
      roots: ["T001"],
      criticalPath: [],
    };
    const path = computeCriticalPath(trivial, ["T001"]);
    expect(path.length).toBeGreaterThan(0);
  });
});
