import { describe, it, expect } from "vitest";
import { orchConfigSchema, validateToolReferences } from "../../../src/config/schema.js";

const validConfig = {
  version: 1,
  defaults: {
    maxRetries: 3,
    timeouts: { implementation: 300, review: 120 },
    buildCommand: "npm run build",
    validateCommand: "npx tsc --noEmit",
  },
  pipeline: {
    specify: "claude",
    "review-spec": "gemini",
    plan: "claude",
    "review-plan": "gemini",
    contracts: "claude",
    tasks: "claude",
    "review-tasks": "gemini",
  },
  ensemble: {
    "[BE]": "claude",
    "[FE]": "gemini",
    "[DB]": "claude",
    "[OPS]": "gemini",
    "[E2E]": "claude",
    "[SEC]": "claude",
  },
  tools: {
    claude: {
      command: "claude",
      headlessFlags: ["-p"],
      strengths: ["backend", "review"],
      priority: 1,
      provider: "anthropic",
      enabled: true,
    },
    gemini: {
      command: "gemini",
      headlessFlags: ["-p", "-y"],
      strengths: ["frontend"],
      priority: 2,
      provider: "google",
      enabled: true,
    },
  },
};

describe("orchConfigSchema", () => {
  it("accepts valid config", () => {
    const result = orchConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it("rejects wrong version", () => {
    const result = orchConfigSchema.safeParse({ ...validConfig, version: 2 });
    expect(result.success).toBe(false);
  });

  it("rejects empty tools", () => {
    const result = orchConfigSchema.safeParse({ ...validConfig, tools: {} });
    expect(result.success).toBe(false);
  });

  it("applies defaults for missing fields", () => {
    const minimal = {
      version: 1,
      pipeline: validConfig.pipeline,
      ensemble: validConfig.ensemble,
      tools: validConfig.tools,
    };
    const result = orchConfigSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaults.maxRetries).toBe(3);
      expect(result.data.defaults.timeouts.implementation).toBe(300);
    }
  });

  it("rejects invalid tool provider", () => {
    const bad = {
      ...validConfig,
      tools: {
        bad: {
          command: "bad",
          priority: 1,
          provider: "nonexistent",
          enabled: true,
        },
      },
    };
    const result = orchConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects maxRetries > 10", () => {
    const bad = {
      ...validConfig,
      defaults: { ...validConfig.defaults, maxRetries: 99 },
    };
    const result = orchConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe("validateToolReferences", () => {
  it("returns no errors for valid references", () => {
    const parsed = orchConfigSchema.parse(validConfig);
    const errors = validateToolReferences(parsed);
    expect(errors).toEqual([]);
  });

  it("detects unknown tool in pipeline", () => {
    const config = {
      ...validConfig,
      pipeline: { ...validConfig.pipeline, specify: "nonexistent" },
    };
    const parsed = orchConfigSchema.parse(config);
    const errors = validateToolReferences(parsed);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("nonexistent");
  });

  it("detects unknown tool in ensemble", () => {
    const config = {
      ...validConfig,
      ensemble: { ...validConfig.ensemble, "[BE]": "unknown" },
    };
    const parsed = orchConfigSchema.parse(config);
    const errors = validateToolReferences(parsed);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("unknown");
  });
});
