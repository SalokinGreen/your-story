import { describe, it, expect } from "vitest";
import { buildSavedTimeline } from "@/app/misc/turnTimeline";

describe("buildSavedTimeline - story-stage reasoning", () => {
  it("returns [] when there is neither gmConversation nor storyReasoning", () => {
    expect(buildSavedTimeline(undefined, undefined, false)).toEqual([]);
    expect(buildSavedTimeline([], undefined, false, "")).toEqual([]);
  });

  it("appends a trailing reasoning block when storyReasoning is set, even with no gmConversation", () => {
    const blocks = buildSavedTimeline(
      undefined,
      undefined,
      false,
      "The player is bluffing, I should have the guard notice.",
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      kind: "thinking",
      isReasoning: true,
      content: "The player is bluffing, I should have the guard notice.",
    });
  });

  it("appends storyReasoning after the GM stage's own blocks", () => {
    const blocks = buildSavedTimeline(
      [
        {
          role: "assistant",
          content: "<thinking>checking notes</thinking>",
          tool_calls: [
            { id: "tc1", function: { name: "search_notes", arguments: "{}" } },
          ],
        },
      ],
      new Map([
        [
          "tc1",
          { success: true, contextForStory: "found note", toolName: "search_notes" },
        ],
      ]),
      false,
      "Now writing the narration itself.",
    );

    expect(blocks.map((b) => b.kind)).toEqual(["thinking", "tool", "thinking"]);
    const last = blocks[blocks.length - 1];
    expect(last.isReasoning).toBe(true);
    expect(last.content).toBe("Now writing the narration itself.");
  });

  it("ignores blank/whitespace-only storyReasoning", () => {
    const blocks = buildSavedTimeline(undefined, undefined, false, "   \n  ");
    expect(blocks).toEqual([]);
  });
});
