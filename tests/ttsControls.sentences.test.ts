import { describe, it, expect } from "vitest";
import { extractCompleteSentences } from "@/app/components/TTSControls";

describe("extractCompleteSentences", () => {
  it("returns no sentences and the whole input as remainder when nothing is complete", () => {
    const result = extractCompleteSentences("The door creaked open");
    expect(result.sentences).toEqual([]);
    expect(result.remainder).toBe("The door creaked open");
  });

  it("splits a single complete sentence off, leaving nothing", () => {
    const result = extractCompleteSentences("The door creaked open. ");
    expect(result.sentences).toEqual(["The door creaked open."]);
    expect(result.remainder).toBe("");
  });

  it("splits multiple complete sentences arriving in one batch", () => {
    const result = extractCompleteSentences(
      "You step inside. It's dark! Do you light a torch? Maybe not.",
    );
    expect(result.sentences).toEqual([
      "You step inside.",
      "It's dark!",
      "Do you light a torch?",
    ]);
    expect(result.remainder).toBe("Maybe not.");
  });

  it("handles newline-terminated sentences the same as space-terminated", () => {
    const result = extractCompleteSentences("First line.\nSecond line.\nThird");
    expect(result.sentences).toEqual(["First line.", "Second line."]);
    expect(result.remainder).toBe("Third");
  });

  it("is a no-op on empty input", () => {
    const result = extractCompleteSentences("");
    expect(result.sentences).toEqual([]);
    expect(result.remainder).toBe("");
  });

  it("tolerates extra whitespace between sentences, and leaves a trailing sentence with no terminal whitespace in remainder", () => {
    // "Bye." has no following space/newline yet (stream could still be
    // mid-word for all we know), so it correctly stays unconsumed - this
    // mirrors why the caller flushes the remainder once streaming ends.
    const result = extractCompleteSentences("Hi.   Bye.");
    expect(result.sentences).toEqual(["Hi."]);
    expect(result.remainder).toBe("  Bye.");
  });
});
