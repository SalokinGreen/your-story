/**
 * Deterministic pacing feedback: the engine measures how many words the player
 * has had to read over recent assistant turns and nudges the model shorter /
 * longer when replies trend away from the Reply Length setting.
 */
import { describe, it, expect } from "vitest";
import {
  countNarrationWords,
  computePacingFeedback,
  PACING_WINDOW,
} from "@/app/misc/pacingFeedback";
import type { ScenePart } from "@/app/misc/structs";

const words = (n: number): string =>
  Array.from({ length: n }, () => "word").join(" ");

const assistant = (n: number): ScenePart => ({
  content: words(n),
  imageUrl: "",
  user: false,
  role: "assistant",
});

const user = (n: number): ScenePart => ({
  content: words(n),
  imageUrl: "",
  user: true,
  role: "user",
});

describe("countNarrationWords", () => {
  it("counts whitespace-separated words", () => {
    expect(countNarrationWords("one two three")).toBe(3);
  });
  it("treats empty / whitespace / nullish as 0", () => {
    expect(countNarrationWords("")).toBe(0);
    expect(countNarrationWords("   \n  ")).toBe(0);
    expect(countNarrationWords(undefined)).toBe(0);
    expect(countNarrationWords(null)).toBe(0);
  });
  it("collapses runs of whitespace", () => {
    expect(countNarrationWords("  a   b\n\nc  ")).toBe(3);
  });
});

describe("computePacingFeedback", () => {
  it("stays quiet until there is enough history", () => {
    const fb = computePacingFeedback([assistant(500)], "medium");
    expect(fb.status).toBe("ok");
    expect(fb.message).toBeUndefined();
  });

  it("flags a consistently long trend (medium)", () => {
    const parts = [assistant(210), assistant(230), assistant(220)];
    const fb = computePacingFeedback(parts, "medium");
    expect(fb.status).toBe("long");
    expect(fb.message).toMatch(/shorter/i);
    expect(fb.avgWords).toBeGreaterThan(fb.band.high);
  });

  it("flags a consistently terse trend (medium)", () => {
    const parts = [assistant(8), assistant(10), assistant(9)];
    const fb = computePacingFeedback(parts, "medium");
    expect(fb.status).toBe("short");
    expect(fb.message).toMatch(/terse|texture|more/i);
  });

  it("stays quiet when on target (medium ~1-2 sentences)", () => {
    const parts = [assistant(40), assistant(50), assistant(45)];
    const fb = computePacingFeedback(parts, "medium");
    expect(fb.status).toBe("ok");
    expect(fb.message).toBeUndefined();
  });

  it("only averages the most recent window of assistant turns", () => {
    // Older huge turns beyond the window must not drag the average up.
    const older = Array.from({ length: 4 }, () => assistant(1000));
    const recent = Array.from({ length: PACING_WINDOW }, () => assistant(60));
    const fb = computePacingFeedback([...older, ...recent], "medium");
    expect(fb.sampled).toBe(PACING_WINDOW);
    expect(fb.status).toBe("ok");
  });

  it("ignores player turns and empty assistant parts", () => {
    const parts: ScenePart[] = [
      user(300),
      { content: "", imageUrl: "", user: false, role: "assistant" },
      assistant(220),
      user(300),
      assistant(230),
    ];
    const fb = computePacingFeedback(parts, "medium");
    expect(fb.sampled).toBe(2); // only the two non-empty assistant parts
    expect(fb.status).toBe("long");
  });

  it("uses per-setting bands: same length reads differently", () => {
    const parts = [assistant(60), assistant(60), assistant(60)];
    // ~60 words/turn is over the Short ceiling but fine for Medium.
    expect(computePacingFeedback(parts, "short").status).toBe("long");
    expect(computePacingFeedback(parts, "medium").status).toBe("ok");
  });

  it("defaults to the medium band when replyLength is omitted", () => {
    const parts = [assistant(210), assistant(230), assistant(220)];
    expect(computePacingFeedback(parts).status).toBe("long");
  });
});
