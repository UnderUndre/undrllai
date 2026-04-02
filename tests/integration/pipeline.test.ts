import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock execa to avoid real CLI tool calls
vi.mock("execa", () => ({
  execa: vi.fn().mockResolvedValue({
    stdout: "APPROVE\nLooks good",
    stderr: "",
    exitCode: 0,
    pid: 12345,
  }),
}));

import { executePipeline } from "../../src/engine/pipeline.js";
import { ToolRegistry } from "../../src/registry/tool-registry.js";
import type { OrchConfig } from "../../src/types.js";

const mockConfig: OrchConfig = {
  version: 1,
  defaults: {
    maxRetries: 2,
    timeouts: { implementation: 30, review: 15 },
    buildCommand: "echo ok",
    validateCommand: "echo ok",
  },
  pipeline: {
    specify: "mock-tool",
    "review-spec": "mock-tool",
    plan: "mock-tool",
    "review-plan": "mock-tool",
    contracts: "mock-tool",
    tasks: "mock-tool",
    "review-tasks": "mock-tool",
  },
  ensemble: {
    "[BE]": "mock-tool",
    "[FE]": "mock-tool",
    "[DB]": "mock-tool",
    "[OPS]": "mock-tool",
    "[E2E]": "mock-tool",
    "[SEC]": "mock-tool",
  },
  tools: {
    "mock-tool": {
      name: "mock-tool",
      command: "echo",
      headlessFlags: [],
      strengths: ["backend"],
      priority: 1,
      provider: "local",
      enabled: true,
    },
  },
};

describe("executePipeline (integration with mocked tools)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("completes all pipeline stages", async () => {
    const registry = new ToolRegistry(mockConfig);

    const result = await executePipeline({
      runId: "test-run-001",
      description: "Test feature",
      projectDir: process.cwd(),
      config: mockConfig,
      registry,
    });

    expect(result.stages.length).toBe(7);
    expect(result.totalDurationMs).toBeGreaterThan(0);
  });
});
