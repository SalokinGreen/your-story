import { describe, it, expect } from "vitest";
import { estimateTokens, truncateToTokenBudget } from "../app/misc/tokenCounter";

describe("estimateTokens", () => {
  it("returns 0 for empty input", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("returns a positive count for non-empty text (heuristic or real encoder)", () => {
    const count = estimateTokens("Hello world, this is a test.");
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(30); // sanity bound: fewer tokens than characters
  });

  it("uses the real BPE encoder once it has finished loading", async () => {
    // First call kicks off the dynamic import; wait for it to settle.
    estimateTokens("warm up");
    await new Promise((resolve) => setTimeout(resolve, 200));

    const text = "The quick brown fox jumps over the lazy dog.";
    const count = estimateTokens(text);
    // cl100k_base tokenizes this sentence into 10 tokens; the chars/4
    // heuristic would give Math.ceil(45/4) = 12, so this distinguishes them.
    expect(count).toBe(10);
  });

  it("scales roughly with content length", () => {
    const short = estimateTokens("short text");
    const long = estimateTokens("short text ".repeat(50));
    expect(long).toBeGreaterThan(short * 10);
  });
});

describe("truncateToTokenBudget", () => {
  it("returns text unchanged when it already fits", () => {
    const text = "short text that fits easily";
    expect(truncateToTokenBudget(text, 1000)).toBe(text);
  });

  it("returns an empty string for a non-positive budget", () => {
    expect(truncateToTokenBudget("some text", 0)).toBe("");
    expect(truncateToTokenBudget("some text", -5)).toBe("");
  });

  it("truncates long text to fit the budget and marks it as truncated", async () => {
    // Warm up the real encoder so token counts are exact, not the chars/4 fallback.
    estimateTokens("warm up");
    await new Promise((resolve) => setTimeout(resolve, 200));

    const longText = "The quick brown fox jumps over the lazy dog. ".repeat(200);
    const result = truncateToTokenBudget(longText, 50);

    expect(result.length).toBeLessThan(longText.length);
    expect(result).toContain("[...truncated to fit context budget...]");
    expect(estimateTokens(result)).toBeLessThanOrEqual(50);
  });

  it("never exceeds the requested budget across a range of sizes", async () => {
    estimateTokens("warm up");
    await new Promise((resolve) => setTimeout(resolve, 200));

    const longText = "Rules and mechanics text goes here. ".repeat(500);
    for (const budget of [10, 50, 200, 1000]) {
      const result = truncateToTokenBudget(longText, budget);
      expect(estimateTokens(result)).toBeLessThanOrEqual(budget);
    }
  });
});
