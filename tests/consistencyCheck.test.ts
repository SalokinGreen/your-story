/**
 * Layer 5 hardening: checkNarrationConsistency is the narration-side sibling
 * of compaction.ts's validateCompactionSummary "status_contradiction" check
 * - a dead/departed NPC described with an active-presence phrase is very
 * likely a hallucination, not a deliberate retrospective mention. Same
 * narrow, high-precision scope; same reused name-matching helpers.
 */
import { describe, it, expect } from "vitest";
import { checkNarrationConsistency } from "../app/misc/consistencyCheck";
import { StoryData, NPC } from "../app/misc/structs";

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
    npcs: [],
    ...overrides,
  } as StoryData;
}

function npc(overrides: Partial<NPC>): NPC {
  return {
    id: "npc-1",
    name: "Marcus",
    description: "A merchant",
    role: "Merchant",
    status: "alive",
    relationship: "Stranger",
    attitude: "neutral",
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("checkNarrationConsistency", () => {
  it("flags a dead NPC narrated with an active-presence phrase", () => {
    const storyData = createMockStoryData({
      npcs: [npc({ name: "Marcus", status: "dead" })],
    });
    const narration = "Marcus arrives and hands you the map before vanishing again.";

    const warnings = checkNarrationConsistency(narration, storyData);
    expect(
      warnings.some((w) => w.type === "status_contradiction" && w.entity === "Marcus")
    ).toBe(true);
  });

  it("flags a departed NPC (not just dead) narrated as present", () => {
    const storyData = createMockStoryData({
      npcs: [npc({ name: "Elena", status: "departed" })],
    });
    const narration = "Elena joins you again and attacks you out of nowhere.";

    const warnings = checkNarrationConsistency(narration, storyData);
    expect(
      warnings.some((w) => w.type === "status_contradiction" && w.entity === "Elena")
    ).toBe(true);
  });

  it("does not flag a dead NPC mentioned only retrospectively", () => {
    const storyData = createMockStoryData({
      npcs: [npc({ name: "Marcus", status: "dead" })],
    });
    const narration = "You remember Marcus, who died defending the gate.";

    const warnings = checkNarrationConsistency(narration, storyData);
    expect(warnings.some((w) => w.type === "status_contradiction")).toBe(false);
  });

  it("does not flag a living NPC narrated as present", () => {
    const storyData = createMockStoryData({
      npcs: [npc({ name: "Marcus", status: "alive" })],
    });
    const narration = "Marcus arrives and hands you the map.";

    const warnings = checkNarrationConsistency(narration, storyData);
    expect(warnings).toEqual([]);
  });

  // Codex review: the old match took any active-presence phrase within 60
  // characters of the name, whoever the subject was.
  it("does not blame a dead NPC for another character's action in the next sentence", () => {
    const storyData = createMockStoryData({
      npcs: [npc({ name: "Marcus", status: "dead" })],
    });
    expect(
      checkNarrationConsistency("Marcus is dead. Ada arrives with the news.", storyData),
    ).toEqual([]);
  });

  it("does not blame a dead NPC for another subject in the same sentence", () => {
    const storyData = createMockStoryData({
      npcs: [npc({ name: "Marcus", status: "dead" })],
    });
    expect(
      checkNarrationConsistency("Marcus's ring, which Ada hands you, is cold.", storyData),
    ).toEqual([]);
  });

  it("does not flag a negated or hypothetical presence", () => {
    const storyData = createMockStoryData({
      npcs: [npc({ name: "Marcus", status: "dead" })],
    });
    for (const narration of [
      "Marcus never arrives.",
      "Marcus will not arrive tonight.",
      "Marcus won't greet you again.",
      "If Marcus arrives, he finds nothing.",
      "You imagine Marcus arrives with the map.",
      "Never again does Marcus hand you the map.",
    ]) {
      expect(checkNarrationConsistency(narration, storyData), narration).toEqual([]);
    }
  });

  it("still flags the dead NPC acting in their own clause after an earlier sentence", () => {
    const storyData = createMockStoryData({
      npcs: [npc({ name: "Marcus", status: "dead" })],
    });
    const warnings = checkNarrationConsistency(
      "The hall is quiet. Marcus arrives, pale and silent.",
      storyData,
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0].entity).toBe("Marcus");
  });

  it("returns no warnings for empty narration or no tracked NPCs", () => {
    expect(checkNarrationConsistency("", createMockStoryData())).toEqual([]);
    expect(
      checkNarrationConsistency("Some prose.", createMockStoryData())
    ).toEqual([]);
  });
});
