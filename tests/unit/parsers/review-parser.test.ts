import { describe, it, expect } from "vitest";
import { parseReviewOutput } from "../../../src/parsers/review-parser.js";

describe("parseReviewOutput", () => {
  it("parses APPROVE with feedback", () => {
    const result = parseReviewOutput("APPROVE\nLooks good, well structured.", "gemini", 5000);
    expect(result.decision).toBe("APPROVE");
    expect(result.feedback).toBe("Looks good, well structured.");
    expect(result.toolName).toBe("gemini");
    expect(result.durationMs).toBe(5000);
  });

  it("parses APPROVE without feedback", () => {
    const result = parseReviewOutput("APPROVE", "gemini", 3000);
    expect(result.decision).toBe("APPROVE");
    expect(result.feedback).toContain("Approved");
  });

  it("parses REJECT with feedback", () => {
    const result = parseReviewOutput("REJECT\nMissing error handling\nNeeds more tests", "claude", 7000);
    expect(result.decision).toBe("REJECT");
    expect(result.feedback).toContain("Missing error handling");
    expect(result.feedback).toContain("Needs more tests");
  });

  it("parses REJECT without feedback", () => {
    const result = parseReviewOutput("REJECT", "claude", 2000);
    expect(result.decision).toBe("REJECT");
    expect(result.feedback).toContain("Rejected");
  });

  it("defaults to REJECT for malformed output", () => {
    const result = parseReviewOutput("This is some random output", "gemini", 4000);
    expect(result.decision).toBe("REJECT");
    expect(result.feedback).toContain("Malformed");
  });

  it("defaults to REJECT for empty output", () => {
    const result = parseReviewOutput("", "claude", 1000);
    expect(result.decision).toBe("REJECT");
    expect(result.feedback).toContain("Empty");
  });

  it("is case-insensitive for APPROVE", () => {
    const result = parseReviewOutput("approve\nOK", "gemini", 3000);
    expect(result.decision).toBe("APPROVE");
  });
});
