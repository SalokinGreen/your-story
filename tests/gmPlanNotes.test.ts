/**
 * GM Plan notes (docs/gm-plan-notes-design.md): a pinned, player-visible
 * `gm_plan` note type that holds the campaign spine + per-player arcs, plus an
 * open_side_beat/close_side_beat tool pair for focus detours. These tests lock
 * in the Phase 1 (prompt-only) behavior: the plan is injected in full into the
 * GM stage, the side-beat tools are reachable and mutate state correctly, and
 * an active side beat is foregrounded over the main spine.
 */
import { describe, it, expect } from "vitest";
import { buildGMStagePrompt } from "@/app/misc/ai_staged";
import { executeTools, ToolCall } from "@/app/misc/toolExecutor";
import type { StoryData, StoryLore } from "@/app/misc/structs";

function createTestStory(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "Test Story",
    premise: "Test premise",
    player_name: "Test Player",
    player_summary: "Test summary",
    intro: "Test intro",
    points: 0,
    earnedPointsFromQuests: [],
    earnedPointsFromChapters: [],
    currentChapter: 0,
    max_chapters: 10,
    scene: { parts: [] },
    chapters: [],
    quests: [],
    stats: [],
    resources: [],
    inventory: [],
    achievements: [],
    lore: [],
    memory: [],
    relationships: [],
    abilities: [],
    npcs: [],
    threads: [],
    ...overrides,
  } as StoryData;
}

function planNote(overrides: Partial<StoryLore> = {}): StoryLore {
  return {
    title: "Campaign Plan",
    content:
      "# Campaign Plan\n## Spine\n- [x] Opening Image (Session 0)\n- [ ] Inciting Incident (Session 1)",
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    type: "gm_plan",
    ...overrides,
  } as StoryLore;
}

function call(name: string, args: Record<string, unknown>): ToolCall {
  return { type: "function", function: { name, arguments: args } };
}

describe("gm_plan injection into the GM stage", () => {
  it("injects the campaign plan note's full content", () => {
    const storyData = createTestStory({ lore: [planNote()] });
    const { messages } = buildGMStagePrompt({
      storyData,
      userChoice: "Look around",
    });
    const combined = messages.map((m) => m.content).join("\n");
    expect(combined).toContain("CAMPAIGN PLAN");
    expect(combined).toContain("Inciting Incident (Session 1)");
  });

  it("whitelists open_side_beat and close_side_beat for the GM stage", () => {
    const { tools } = buildGMStagePrompt({
      storyData: createTestStory(),
      userChoice: "Look around",
    });
    const names = tools.map((t) => t.function.name);
    expect(names).toContain("open_side_beat");
    expect(names).toContain("close_side_beat");
  });

  it("foregrounds the active side beat over the main spine", () => {
    const storyData = createTestStory({
      lore: [
        planNote(),
        planNote({ title: "Side Beat — The Caravan", content: "Goal: X" }),
      ],
      activeSideBeatTitle: "Side Beat — The Caravan",
    });
    const { messages } = buildGMStagePrompt({
      storyData,
      userChoice: "Look around",
    });
    const combined = messages.map((m) => m.content).join("\n");
    expect(combined).toContain("ACTIVE FOCUS");
    expect(combined).toContain("Side Beat — The Caravan");
  });
});

describe("create_note accepts gm_plan", () => {
  it("round-trips a gm_plan note through the executor", () => {
    const storyData = createTestStory();
    const { responses } = executeTools(
      [
        call("create_note", {
          title: "Campaign Plan",
          content: "premise + spine",
          type: "gm_plan",
        }),
      ],
      storyData,
    );
    expect(responses[0].success).toBe(true);
    const note = storyData.lore.find((l) => l.title === "Campaign Plan");
    expect(note?.type).toBe("gm_plan");
  });
});

describe("open_side_beat / close_side_beat", () => {
  it("creates a gm_plan side-beat note and marks it the active focus", () => {
    const storyData = createTestStory();
    const { responses } = executeTools(
      [
        call("open_side_beat", {
          title: "Side Beat — The Caravan",
          goal: "Find the missing caravan",
          return_when: "The caravan's fate is known",
        }),
      ],
      storyData,
    );
    expect(responses[0].success).toBe(true);
    expect(storyData.activeSideBeatTitle).toBe("Side Beat — The Caravan");
    const note = storyData.lore.find(
      (l) => l.title === "Side Beat — The Caravan",
    );
    expect(note?.type).toBe("gm_plan");
    expect(note?.content).toContain("Find the missing caravan");
  });

  it("scopes an owner onto the side-beat note when provided", () => {
    const storyData = createTestStory();
    executeTools(
      [
        call("open_side_beat", {
          title: "Kael's Reckoning",
          goal: "Confront the mentor",
          owner: "player-kael",
        }),
      ],
      storyData,
    );
    const note = storyData.lore.find((l) => l.title === "Kael's Reckoning");
    expect(note?.ownerCouchPlayerId).toBe("player-kael");
  });

  it("refuses to open a second side beat while one is active", () => {
    const storyData = createTestStory({
      activeSideBeatTitle: "Side Beat — The Caravan",
      lore: [planNote({ title: "Side Beat — The Caravan" })],
    });
    const { responses } = executeTools(
      [call("open_side_beat", { title: "Another Detour", goal: "..." })],
      storyData,
    );
    expect(responses[0].success).toBe(false);
    expect(storyData.activeSideBeatTitle).toBe("Side Beat — The Caravan");
    expect(
      storyData.lore.find((l) => l.title === "Another Detour"),
    ).toBeUndefined();
  });

  it("closes the active side beat, records the resolution, and clears focus", () => {
    const storyData = createTestStory({
      activeSideBeatTitle: "Side Beat — The Caravan",
      lore: [
        planNote({
          title: "Side Beat — The Caravan",
          content: "Goal: find it",
        }),
      ],
    });
    const { responses } = executeTools(
      [call("close_side_beat", { resolution: "The caravan was ambushed" })],
      storyData,
    );
    expect(responses[0].success).toBe(true);
    expect(storyData.activeSideBeatTitle).toBeUndefined();
    const note = storyData.lore.find(
      (l) => l.title === "Side Beat — The Caravan",
    );
    expect(note?.content).toContain("Resolved:");
    expect(note?.content).toContain("The caravan was ambushed");
  });

  it("fails to close when no side beat is active", () => {
    const storyData = createTestStory();
    const { responses } = executeTools(
      [call("close_side_beat", { resolution: "n/a" })],
      storyData,
    );
    expect(responses[0].success).toBe(false);
  });
});
