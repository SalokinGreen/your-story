/**
 * buildGMStagePrompt filters TOOL_SCHEMAS/GM_TOOL_SCHEMAS down to an
 * explicit whitelist before sending them to the model - a tool can have a
 * full schema and executor and still be completely unreachable if it's
 * missing from that whitelist. increment_scene and resolve_random_event
 * both had this exact gap (schema + executor existed, whitelist entry
 * didn't), so this locks in that they're actually sent to the model.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
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

describe("buildGMStagePrompt generate_image (docs/image-generation-design.md §3.1)", () => {
  it("does not offer generate_image, or its prompt section, by default", () => {
    const { tools, messages } = buildGMStagePrompt({
      storyData: createTestStory(),
      userChoice: "Look around",
    });
    expect(tools.map((t) => t.function.name)).not.toContain("generate_image");
    expect(messages.map((m) => m.content).join("\n")).not.toContain(
      "### Pictures (generate_image)",
    );
  });

  it("offers generate_image and states the per-scene cap when imageToolAvailable", () => {
    const { tools, messages } = buildGMStagePrompt({
      storyData: createTestStory(),
      userChoice: "Look around",
      imageToolAvailable: true,
      imagesPerScene: 3,
    });
    expect(tools.map((t) => t.function.name)).toContain("generate_image");
    const combined = messages.map((m) => m.content).join("\n");
    expect(combined).toContain("### Pictures (generate_image)");
    expect(combined).toContain("at most 3 per scene");
  });

  it("is in the Google essential tool list, so Gemini can call it", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../app/misc/providerCall.ts"),
      "utf8",
    );
    const start = source.indexOf("const GOOGLE_ESSENTIAL_TOOLS");
    const end = source.indexOf("]);", start);
    expect(source.slice(start, end)).toContain('"generate_image"');
  });
});
