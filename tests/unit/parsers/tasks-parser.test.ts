import { describe, it, expect } from "vitest";
import {
  parseTasksFromContent,
  parseDependencyGraphFromContent,
  detectCycles,
} from "../../../src/parsers/tasks-parser.js";

const sampleContent = `
# Tasks

## Phase 1

- [ ] T001 [SETUP] Create monorepo structure with packages/orchestrator/
- [ ] T002 [SETUP] Initialize packages/orchestrator/package.json
- [X] T003 [BE] [US1] Implement logger in packages/orchestrator/src/utils/logger.ts

## Phase 2

- [ ] T004 [DB] [US1] Create schema in packages/orchestrator/src/db/schema.sql
- [ ] T005 [FE] [US2] Implement component in packages/orchestrator/web/src/App.tsx

## Dependency Graph

### Dependencies

T001 → T002, T003
T002 → T004
T003 + T004 → T005
`;

describe("parseTasksFromContent", () => {
  it("parses all tasks", () => {
    const tasks = parseTasksFromContent(sampleContent);
    expect(tasks).toHaveLength(5);
  });

  it("extracts task IDs correctly", () => {
    const tasks = parseTasksFromContent(sampleContent);
    expect(tasks.map((t) => t.id)).toEqual(["T001", "T002", "T003", "T004", "T005"]);
  });

  it("extracts agent tags", () => {
    const tasks = parseTasksFromContent(sampleContent);
    expect(tasks[0]!.agentTag).toBe("[SETUP]");
    expect(tasks[2]!.agentTag).toBe("[BE]");
    expect(tasks[3]!.agentTag).toBe("[DB]");
    expect(tasks[4]!.agentTag).toBe("[FE]");
  });

  it("extracts story labels", () => {
    const tasks = parseTasksFromContent(sampleContent);
    expect(tasks[0]!.storyLabel).toBeUndefined();
    expect(tasks[2]!.storyLabel).toBe("[US1]");
    expect(tasks[4]!.storyLabel).toBe("[US2]");
  });

  it("extracts file paths from descriptions", () => {
    const tasks = parseTasksFromContent(sampleContent);
    expect(tasks[0]!.filePaths).toContain("packages/orchestrator/");
    expect(tasks[2]!.filePaths).toContain("packages/orchestrator/src/utils/logger.ts");
  });
});

describe("parseDependencyGraphFromContent", () => {
  it("parses fan-out edges (→ with comma)", () => {
    const graph = parseDependencyGraphFromContent(sampleContent);
    const edge = graph.edges.find((e) => e.from.includes("T001"));
    expect(edge).toBeDefined();
    expect(edge!.to).toContain("T002");
    expect(edge!.to).toContain("T003");
  });

  it("parses fan-in edges (+ join)", () => {
    const graph = parseDependencyGraphFromContent(sampleContent);
    const edge = graph.edges.find((e) => e.to.includes("T005"));
    expect(edge).toBeDefined();
    expect(edge!.from).toContain("T003");
    expect(edge!.from).toContain("T004");
  });

  it("identifies root nodes", () => {
    const graph = parseDependencyGraphFromContent(sampleContent);
    expect(graph.roots).toContain("T001");
  });
});

describe("detectCycles", () => {
  it("returns null for acyclic graph", () => {
    const graph = parseDependencyGraphFromContent(sampleContent);
    expect(detectCycles(graph)).toBeNull();
  });

  it("detects a cycle", () => {
    const cyclicContent = `
### Dependencies

T001 → T002
T002 → T003
T003 → T001
`;
    const graph = parseDependencyGraphFromContent(cyclicContent);
    const cycle = detectCycles(graph);
    expect(cycle).not.toBeNull();
    expect(cycle!.length).toBeGreaterThan(0);
  });
});
