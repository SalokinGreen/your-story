/**
 * buildGMStagePrompt filters TOOL_SCHEMAS/GM_TOOL_SCHEMAS down to an
 * explicit whitelist before sending them to the model - a tool can have a
 * full schema and executor and still be completely unreachable if it's
 * missing from that whitelist. increment_scene and resolve_random_event
 * both had this exact gap (schema + executor existed, whitelist entry
 * didn't), so this locks in that they're actually sent to the model.
 */
import { describe, it, expect } from "vitest";
import { buildGMStagePrompt } from "@/app/misc/ai_staged";
import type { StoryData } from "@/app/misc/structs";

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
    momentum: 0,
    maxMomentum: 10,
    relationships: [],
    rpgSystem: "3d6",
    abilities: [],
    level: 1,
    upgradesSpent: 0,
    conditions: [],
    npcs: [],
    ...overrides,
  } as StoryData;
}

describe("buildGMStagePrompt tool whitelist", () => {
  it("includes increment_scene", () => {
    const { tools } = buildGMStagePrompt({
      storyData: createTestStory(),
      userChoice: "Look around",
    });
    const names = tools.map((t) => t.function.name);
    expect(names).toContain("increment_scene");
  });

  it("includes resolve_random_event", () => {
    const { tools } = buildGMStagePrompt({
      storyData: createTestStory(),
      userChoice: "Look around",
    });
    const names = tools.map((t) => t.function.name);
    expect(names).toContain("resolve_random_event");
  });

  it("includes acknowledge_director_move", () => {
    const { tools } = buildGMStagePrompt({
      storyData: createTestStory(),
      userChoice: "Look around",
    });
    const names = tools.map((t) => t.function.name);
    expect(names).toContain("acknowledge_director_move");
  });

  it("still includes fate_question (sanity baseline)", () => {
    const { tools } = buildGMStagePrompt({
      storyData: createTestStory(),
      userChoice: "Look around",
    });
    const names = tools.map((t) => t.function.name);
    expect(names).toContain("fate_question");
  });
});

describe("buildGMStagePrompt pending-state surfacing", () => {
  it("surfaces pendingRandomEvents in the GM stage's own state message, not just buildInfoMessage", () => {
    const storyData = createTestStory({
      pendingRandomEvents: [
        {
          id: "evt-1",
          source: "scene_check",
          action: "Betray",
          subject: "A rival",
          createdAt: Date.now(),
        },
      ],
    });
    const { messages } = buildGMStagePrompt({
      storyData,
      userChoice: "Look around",
    });
    const combined = messages.map((m) => m.content).join("\n");
    expect(combined).toContain("evt-1");
    expect(combined).toContain("resolve_random_event");
  });

  it("surfaces pendingDirectorMoves in the GM stage's own state message", () => {
    const storyData = createTestStory({
      pendingDirectorMoves: [
        {
          id: "move-1",
          move: "announce_future_badness",
          createdAt: Date.now(),
        },
      ],
    });
    const { messages } = buildGMStagePrompt({
      storyData,
      userChoice: "Look around",
    });
    const combined = messages.map((m) => m.content).join("\n");
    expect(combined).toContain("move-1");
    expect(combined).toContain("acknowledge_director_move");
  });
});
