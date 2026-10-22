/**
 * Decision 111: the Illustrate this brief writer is given the setting, how the
 * people in the passage look and the turn before, because the illustrator
 * never sees the story (a one-armed NPC was painted with two arms).
 */
import { describe, it, expect } from "vitest";
import { buildSceneBriefInput } from "@/app/misc/imagePromptWriter";
import type { StoryData } from "@/app/misc/structs";

const story = {
  premise: "A guild of forgers works the salt ports after the Salt War.",
  player_name: "Nik",
  npcs: [{ id: "npc-bryn", name: "Bryn", description: "Grey-haired veteran sapper, left arm lost at the elbow." }],
  lore: [{ type: "character_sheet", title: "Nik", content: "Young forger, ink-stained fingers, long dark coat." }],
} as unknown as StoryData;

describe("buildSceneBriefInput", () => {
  it("carries the setting, each person's looks, the turn before and the passage, in that order", () => {
    const input = buildSceneBriefInput(
      "He taps the table with his stump.",
      story,
      ["npc-bryn", "player"],
      "Do we have any assassin contacts?",
    );
    expect(input).toContain("Setting: A guild of forgers");
    expect(input).toContain("- Bryn: Grey-haired veteran sapper, left arm lost at the elbow.");
    expect(input).toContain("- Nik: Young forger");
    expect(input).toContain("Just before: Do we have any assassin contacts?");
    const order = ["Setting:", "People who may appear", "Just before:", "Passage:\nHe taps"].map((m) => input.indexOf(m));
    expect(order.every((i, k) => i >= 0 && (k === 0 || i > order[k - 1]))).toBe(true);
  });

  it("leaves out what the story does not have", () => {
    const input = buildSceneBriefInput("Rain.", { npcs: [], lore: [] } as unknown as StoryData, ["npc-gone"]);
    expect(input).toBe("Passage:\nRain.");
  });
});
