/**
 * Calls a re-ask refused (generation.ts, mergeRefusedDiceCalls) were never part
 * of the turn: the saved timeline must not draw them after a reload, as the
 * live one did not.
 */
import { describe, it, expect } from "vitest";
import { buildSavedTimeline, REASK_REFUSAL_TAG } from "@/app/misc/turnTimeline";

describe("buildSavedTimeline and a re-ask's refused calls", () => {
  const conversation = [
    {
      role: "assistant" as const,
      content: "",
      tool_calls: [
        { id: "ok", function: { name: "manage_meter", arguments: "{}" } },
        { id: "no", function: { name: "feat_roll", arguments: "{}" } },
      ],
    },
    { role: "tool" as const, content: "[manage_meter] Hearts 3 → 2", tool_call_id: "ok" },
    {
      role: "tool" as const,
      content: `**ERROR** in feat_roll: [ERROR] feat_roll was not run ${REASK_REFUSAL_TAG}: dice are thrown`,
      tool_call_id: "no",
    },
  ];
  const toolIds = (blocks: ReturnType<typeof buildSavedTimeline>) =>
    blocks
      .filter((b) => b.kind === "tool")
      .map((b) => (b as { toolCallId: string }).toolCallId);

  it("skips the refused call and keeps the others", () => {
    expect(toolIds(buildSavedTimeline(conversation, undefined, true))).toEqual(["ok"]);
  });

  it("draws an ordinary failed call", () => {
    const failed = conversation.map((m) =>
      m.tool_call_id === "no" ? { ...m, content: "**ERROR** in feat_roll: no such hero" } : m,
    );
    expect(toolIds(buildSavedTimeline(failed, undefined, true))).toEqual(["ok", "no"]);
  });
});
