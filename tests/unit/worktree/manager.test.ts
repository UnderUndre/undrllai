import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock git utilities
vi.mock("../../../src/utils/git.js", () => ({
  createWorktree: vi.fn().mockResolvedValue(undefined),
  removeWorktree: vi.fn().mockResolvedValue(undefined),
  pruneWorktrees: vi.fn().mockResolvedValue(undefined),
}));

import { createTaskWorktree, removeTaskWorktree } from "../../../src/worktree/manager.js";
import { createWorktree, removeWorktree } from "../../../src/utils/git.js";

describe("createTaskWorktree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a worktree with correct path and branch", async () => {
    const result = await createTaskWorktree("/project", "run-123", "T001");

    expect(createWorktree).toHaveBeenCalledWith(
      "/project",
      expect.stringContaining("T001"),
      expect.stringContaining("orch/run-123/T001"),
    );

    expect(result.taskId).toBe("T001");
    expect(result.runId).toBe("run-123");
    expect(result.branch).toBe("orch/run-123/T001");
    expect(result.path).toContain("T001");
  });
});

describe("removeTaskWorktree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls git removeWorktree", async () => {
    await removeTaskWorktree("/project", "/project/.orch-worktrees/run-123/T001");
    expect(removeWorktree).toHaveBeenCalledWith(
      "/project",
      "/project/.orch-worktrees/run-123/T001",
    );
  });
});
