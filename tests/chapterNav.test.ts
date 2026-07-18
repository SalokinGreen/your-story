import { describe, it, expect } from "vitest";
import { computeChapterSegments } from "../app/misc/chapterNav";
import { ScenePart } from "../app/misc/structs";

function part(content: string, overrides: Partial<ScenePart> = {}): ScenePart {
  return {
    content,
    imageUrl: "",
    user: false,
    role: "assistant",
    ...overrides,
  } as ScenePart;
}

function userPart(content: string): ScenePart {
  return part(content, { user: true, role: "user" });
}

describe("computeChapterSegments", () => {
  it("returns an empty array for no parts", () => {
    expect(computeChapterSegments([])).toEqual([]);
  });

  it("treats the whole story as chapter 1 when there are no endChapter markers", () => {
    const parts = [userPart("> go north"), part("You head north into the woods.")];
    const segments = computeChapterSegments(parts);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ number: 1, startIndex: 1 });
  });

  it("starts a new chapter after an endChapter marker", () => {
    const parts = [
      userPart("> enter the tower"),
      part("You climb the tower.", { endChapter: true }),
      userPart("> continue"),
      part("A new dawn breaks over the valley."),
    ];
    const segments = computeChapterSegments(parts);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ number: 1, startIndex: 1 });
    expect(segments[1]).toMatchObject({ number: 2, startIndex: 3 });
  });

  it("produces a truncated single-line preview from the chapter's opening content", () => {
    const parts = [
      part(
        "The quick brown fox jumps over the lazy dog and keeps running far past the edge of the map."
      ),
    ];
    const segments = computeChapterSegments(parts);
    expect(segments[0].preview.length).toBeLessThanOrEqual(61); // 60 chars + ellipsis
    expect(segments[0].preview.endsWith("…")).toBe(true);
  });

  it("uses the first non-empty line when content starts with blank lines", () => {
    const parts = [part("\n\n  The tavern falls silent.")];
    const segments = computeChapterSegments(parts);
    expect(segments[0].preview).toBe("The tavern falls silent.");
  });

  it("skips leading user parts when finding a chapter's start", () => {
    const parts = [userPart("> look around"), part("Nothing but ruins.")];
    const segments = computeChapterSegments(parts);
    expect(segments[0].startIndex).toBe(1);
  });

  it("handles multiple chapter breaks in sequence", () => {
    const parts = [
      part("Chapter one begins.", { endChapter: true }),
      part("Chapter two begins.", { endChapter: true }),
      part("Chapter three begins."),
    ];
    const segments = computeChapterSegments(parts);
    expect(segments.map((s) => s.number)).toEqual([1, 2, 3]);
    expect(segments.map((s) => s.startIndex)).toEqual([0, 1, 2]);
  });
});
