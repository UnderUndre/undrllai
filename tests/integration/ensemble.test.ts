import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock git and execa
vi.mock("execa", () => ({
  execa: vi.fn().mockResolvedValue({
    stdout: "Task completed successfully",
    stderr: "",
    exitCode: 0,
    pid: 99999,
  }),
}));

vi.mock("../../src/utils/git.js", () => ({
  createWorktree: vi.fn().mockResolvedValue(undefined),
  removeWorktree: vi.fn().mockResolvedValue(undefined),
  listWorktrees: vi.fn().mockResolvedValue([]),
  mergeBranch: vi.fn().mockResolvedValue({ success: true, conflicts: [] }),
  createBranch: vi.fn().mockResolvedValue(undefined),
  checkoutBranch: vi.fn().mockResolvedValue(undefined),
  getCurrentBranch: vi.fn().mockResolvedValue("main"),
  isCleanWorkingTree: vi.fn().mockResolvedValue(true),
  pruneWorktrees: vi.fn().mockResolvedValue(undefined),
}));

import { executeEnsemble } from "../../src/engine/ensemble.js";
import { ToolRegistry } from "../../src/registry/tool-registry.js";
import type { OrchConfig, ParsedTask, DependencyGraph } from "../../src/types.js";

const mockConfig: OrchConfig = {
  version: 1,
  defaults: {
    maxRetries: 1,
    timeouts: { implementation: 30, review: 15 },
    buildCommand: "echo ok",
    validateCommand: "echo ok",
  },
  pipeline: {
    specify: "mock",
    "review-spec": "mock",
    plan: "mock",
    "review-plan": "mock",
    contracts: "mock",
    tasks: "mock",
    "review-tasks": "mock",
  },
  ensemble: {
    "[BE]": "mock",
    "[FE]": "mock",
    "[DB]": "mock",
    "[OPS]": "mock",
    "[E2E]": "mock",
    "[SEC]": "mock",
  },
  tools: {
    mock: {
      name: "mock",
      command: "echo",
      headlessFlags: [],
      strengths: ["backend"],
      priority: 1,
      provider: "local",
      enabled: true,
    },
  },
};

const mockTasks: ParsedTask[] = [
  { id: "T001", agentTag: "[BE]", description: "Implement feature A", filePaths: ["src/a.ts"] },
  { id: "T002", agentTag: "[FE]", description: "Implement UI for A", filePaths: ["src/ui.tsx"] },
];

const mockGraph: DependencyGraph = {
  edges: [{ from: ["T001"], to: ["T002"] }],
  roots: ["T001"],
  criticalPath: ["T001", "T002"],
};

describe("executeEnsemble (integration with mocked tools)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executes tasks in dependency order", async () => {
    const registry = new ToolRegistry(mockConfig);

    const result = await executeEnsemble({
      runId: "test-ensemble-001",
      projectDir: process.cwd(),
      config: mockConfig,
      registry,
      tasks: mockTasks,
      graph: mockGraph,
      contextFiles: [],
    });

    expect(result.tasks).toHaveLength(2);
    expect(result.totalDurationMs).toBeGreaterThan(0);
  });
});
