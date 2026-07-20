/**
 * A GM-stage tool call can arrive with argsTruncated: true when
 * generate-stream/route.ts hit the token limit mid tool-call, leaving the
 * accumulated arguments string as unterminated JSON. route.ts substitutes
 * `{}` for the unparseable arguments and marks the call so callers don't
 * mistake "cut off" for "the model sent nothing" - which otherwise produces
 * a misleading "missing required parameter" error for every field, even
 * ones the model actually wrote before the cutoff.
 */

import { describe, it, expect } from "vitest";
import { executeGMTools } from "@/app/misc/gmExecutor";
import { StoryData } from "@/app/misc/structs";

function createMockStoryData(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "Test Story",
    player_name: "Hero",
    premise: "A test adventure",
    scene: { parts: [] },
    stats: [],
    resources: [],
    inventory: [],
    abilities: [],
    achievements: [],
    lore: [],
    memory: [],
    ...overrides,
  } as StoryData;
}

describe("GM tool execution: truncated tool-call arguments", () => {
  it("reports a truncation-specific error instead of 'missing required parameter'", async () => {
    const storyData = createMockStoryData();
    const truncatedCall = {
      id: "test_truncated_1",
      function: { name: "create_note", arguments: "{}" },
      argsTruncated: true,
      rawArgumentsPreview: '{"title": "The Frozen Wastes", "content": "A vast, ',
    };

    const result = await executeGMTools([truncatedCall as any], storyData);

    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(false);
    const context = result.results[0].contextForStory || "";
    expect(context).toContain("cut off");
    expect(context).toContain("token limit");
    expect(context).toContain("The Frozen Wastes");
    expect(context).not.toContain("missing required parameter");
    expect(result.modifiedStoryData.lore || []).toHaveLength(0);
  });

  it("still runs normal validation for a call that genuinely has empty args (not truncated)", async () => {
    const storyData = createMockStoryData();
    const emptyCall = {
      id: "test_empty_1",
      function: { name: "create_note", arguments: "{}" },
    };

    const result = await executeGMTools([emptyCall as any], storyData);

    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].contextForStory || "").toContain(
      'missing required parameter "title"',
    );
  });

  it("executes normally when a call is not marked as truncated", async () => {
    const storyData = createMockStoryData();
    const goodCall = {
      id: "test_ok_1",
      function: {
        name: "create_note",
        arguments: JSON.stringify({
          title: "The Frozen Wastes",
          content: "A vast, icy tundra.",
          type: "location",
        }),
      },
      argsTruncated: false,
    };

    const result = await executeGMTools([goodCall as any], storyData);

    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);
    expect(
      result.modifiedStoryData.lore?.some(
        (l) => l.title === "The Frozen Wastes",
      ),
    ).toBe(true);
  });
});
