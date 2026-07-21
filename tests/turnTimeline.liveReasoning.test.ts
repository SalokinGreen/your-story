import { describe, it, expect } from "vitest";
import {
  updateLiveRoundBlocks,
  updateLiveReasoningBlock,
  toolResultBlock,
  type TimelineBlock,
} from "@/app/misc/turnTimeline";

describe("live GM-round timeline - reasoning survives content/tool updates", () => {
  it("keeps the reasoning block once content deltas start arriving", () => {
    let blocks: TimelineBlock[] = [];

    // Reasoning streams in first, same as native provider reasoning deltas.
    blocks = updateLiveReasoningBlock(blocks, "The player is bluffing");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "thinking", isReasoning: true });

    // Then content starts streaming for the same round - this used to wipe
    // the reasoning block out entirely because updateLiveRoundBlocks
    // rebuilt the live slice purely from the parsed content buffer.
    blocks = updateLiveRoundBlocks(blocks, "<output>He nods.</output>");

    expect(blocks.map((b) => b.kind)).toEqual(["thinking", "text"]);
    expect(blocks[0]).toMatchObject({
      kind: "thinking",
      isReasoning: true,
      content: "The player is bluffing",
    });
    expect(blocks[1]).toMatchObject({ kind: "text", content: "He nods." });
  });

  it("keeps the reasoning block id stable across repeated content deltas", () => {
    let blocks: TimelineBlock[] = updateLiveReasoningBlock([], "Thinking");
    const reasoningId = blocks[0].id;

    blocks = updateLiveRoundBlocks(blocks, "<output>He</output>");
    blocks = updateLiveRoundBlocks(blocks, "<output>He nods.</output>");

    expect(blocks[0].id).toBe(reasoningId);
    expect(blocks[0].isReasoning).toBe(true);
  });

  it("still shows the reasoning block once a tool call freezes the round", () => {
    let blocks: TimelineBlock[] = updateLiveReasoningBlock([], "Checking notes");
    blocks = updateLiveRoundBlocks(blocks, "<thinking>let me look</thinking>");
    blocks = [
      ...blocks.map((b) => ({ ...b, streaming: false })),
      toolResultBlock({
        toolName: "search_notes",
        toolCallId: "tc1",
        success: true,
        contextForStory: "found note",
      }),
    ];

    expect(blocks.some((b) => b.isReasoning)).toBe(true);
    expect(blocks[blocks.length - 1].kind).toBe("tool");
  });
});
