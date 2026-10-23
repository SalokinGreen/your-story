/**
 * Tests for start_game - the session-zero -> real-play handoff tool. It
 * renames the story (replacing the generic "New Story" placeholder),
 * optionally records the premise, and clears sessionZeroActive so the
 * reasoning-tier router's hard floor (hardRuleFloor, reasoningTiers.ts)
 * stops forcing TOP_TIER.
 *
 * It also refuses to run at all until the character sheet and the campaign
 * spine exist and the player approved them through confirm_setup
 * (getSetupProgress, campaignPlan.ts) - writing the plan is part of session
 * zero's job, and a campaign started without one never gets one.
 */
import { describe, it, expect } from "vitest";
import { executeGMTools } from "@/app/misc/gmExecutor";
import { buildGMStagePrompt } from "@/app/misc/ai_staged";
import { StoryData, StoryLore } from "@/app/misc/structs";
import { currentSetupHashes } from "@/app/misc/campaignPlan";
import {
  hardRuleFloor,
  SCENE_BASELINE_TIER,
  TOP_TIER,
} from "@/app/misc/reasoningTiers";

function spineNote(overrides: Partial<StoryLore> = {}): StoryLore {
  return {
    title: "Campaign Plan",
    content: "# Campaign Plan\n## Current beat — Opening Image (Session 0)",
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    type: "gm_plan",
    ...overrides,
  } as StoryLore;
}

function sheetNote(overrides: Partial<StoryLore> = {}): StoryLore {
  return {
    title: "Character: Hero",
    content: "Name: Hero. Kind: Human. Stress 2.",
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    type: "character_sheet",
    ...overrides,
  } as StoryLore;
}

// The player's OK, bound to the hashes of the lore as it stands.
function withApproval(story: StoryData): StoryData {
  return {
    ...story,
    setup: {
      mode: "quick",
      conceptDone: true,
      approval: currentSetupHashes(story),
    },
  };
}

function createMockStoryData(overrides: Partial<StoryData> = {}): StoryData {
  const story = {
    story_name: "New Story",
    player_name: "Hero",
    premise: "",
    sessionZeroActive: true,
    scene: { parts: [] },
    stats: [],
    resources: [],
    inventory: [],
    abilities: [],
    achievements: [],
    // start_game is gated on a sheet, the spine and the player's OK, so the
    // happy-path cases below have all three; the gate's own describe blocks
    // drop them.
    lore: [sheetNote(), spineNote()],
    memory: [],
    ...overrides,
  } as StoryData;
  // An explicit setup override is kept as given.
  return overrides.setup !== undefined ? story : withApproval(story);
}

function createToolCall(name: string, args: Record<string, unknown>) {
  return {
    id: `test_${Math.random().toString(36).slice(2)}`,
    function: { name, arguments: JSON.stringify(args) },
  };
}

describe("hardRuleFloor: session zero", () => {
  it("forces TOP_TIER while sessionZeroActive is true", () => {
    const storyData = createMockStoryData();
    expect(hardRuleFloor(storyData)).toBe(TOP_TIER);
  });

  it("does not force a tier once sessionZeroActive is false", () => {
    const storyData = createMockStoryData({ sessionZeroActive: false });
    expect(hardRuleFloor(storyData)).toBe(0);
  });

  it("does not force a tier for old saves with no sessionZeroActive field", () => {
    const storyData = createMockStoryData({ sessionZeroActive: undefined });
    expect(hardRuleFloor(storyData)).toBe(0);
  });
});

describe("start_game", () => {
  it("names the story and clears sessionZeroActive", async () => {
    const storyData = createMockStoryData();
    const result = await executeGMTools(
      [
        createToolCall("start_game", {
          story_name: "Ashes of the Ninth Legion",
          premise: "A disgraced legionnaire seeks redemption at the empire's edge.",
        }),
      ],
      storyData,
    );

    expect(result.results[0].success).toBe(true);
    expect(result.modifiedStoryData.story_name).toBe(
      "Ashes of the Ninth Legion",
    );
    expect(result.modifiedStoryData.premise).toBe(
      "A disgraced legionnaire seeks redemption at the empire's edge.",
    );
    expect(result.modifiedStoryData.sessionZeroActive).toBe(false);
  });

  it("resets reasoningTierState to baseline immediately", async () => {
    const storyData = createMockStoryData({
      reasoningTierState: {
        currentTier: TOP_TIER,
        tier3CallsInScene: 2,
        lastSceneKey: "freeform:0",
      },
    });
    const result = await executeGMTools(
      [createToolCall("start_game", { story_name: "The Long Road" })],
      storyData,
    );

    expect(result.modifiedStoryData.reasoningTierState?.currentTier).toBe(
      SCENE_BASELINE_TIER,
    );
    expect(hardRuleFloor(result.modifiedStoryData)).toBe(0);
  });

  it("leaves premise untouched when not provided", async () => {
    const storyData = createMockStoryData({ premise: "Existing premise" });
    const result = await executeGMTools(
      [createToolCall("start_game", { story_name: "Untitled Saga" })],
      storyData,
    );

    expect(result.modifiedStoryData.premise).toBe("Existing premise");
  });

  it("rejects a call missing the required story_name", async () => {
    const storyData = createMockStoryData();
    const result = await executeGMTools(
      [createToolCall("start_game", {})],
      storyData,
    );

    expect(result.results[0].success).toBe(false);
  });
});

describe("start_game requires a campaign plan", () => {
  it("refuses to start the game when no gm_plan spine note exists", async () => {
    const storyData = createMockStoryData({ lore: [sheetNote()] });
    const result = await executeGMTools(
      [createToolCall("start_game", { story_name: "Premature Saga" })],
      storyData,
    );

    expect(result.results[0].success).toBe(false);
    expect(result.results[0].contextForStory).toContain("no campaign plan");
    expect(result.results[0].contextForStory).toContain("Campaign Plan");
    // Nothing was mutated - the story stays unnamed and in session zero.
    expect(result.modifiedStoryData.story_name).toBe("New Story");
    expect(result.modifiedStoryData.sessionZeroActive).toBe(true);
  });

  it("still refuses when the only gm_plan note is a side beat", async () => {
    const storyData = createMockStoryData({
      lore: [sheetNote(), spineNote({ title: "Side beat — The Missing Cat" })],
      activeSideBeatTitle: "Side beat — The Missing Cat",
    });
    const result = await executeGMTools(
      [createToolCall("start_game", { story_name: "Cat Quest" })],
      storyData,
    );

    expect(result.results[0].success).toBe(false);
    expect(result.modifiedStoryData.sessionZeroActive).toBe(true);
  });

  it("allows the start once the spine note exists", async () => {
    const storyData = createMockStoryData({ lore: [sheetNote(), spineNote()] });
    const result = await executeGMTools(
      [createToolCall("start_game", { story_name: "Ready Saga" })],
      storyData,
    );

    expect(result.results[0].success).toBe(true);
    expect(result.modifiedStoryData.sessionZeroActive).toBe(false);
  });

  it("does not count a stale planState whose note is gone (changed by session zero's rule)", async () => {
    // During setup a plan means a note the player can see and approve.
    const storyData = createMockStoryData({
      lore: [sheetNote()],
      planState: {
        beats: ["Opening Image (Session 0)", "Inciting Incident"],
        currentBeatIndex: 0,
      },
    });
    const result = await executeGMTools(
      [createToolCall("start_game", { story_name: "Salvaged Saga" })],
      storyData,
    );

    expect(result.results[0].success).toBe(false);
    expect(result.results[0].contextForStory).toContain("no campaign plan");
  });

  it("ignores a disabled spine note", async () => {
    const storyData = createMockStoryData({
      lore: [sheetNote(), spineNote({ enabled: false })],
    });
    const result = await executeGMTools(
      [createToolCall("start_game", { story_name: "Disabled Plan Saga" })],
      storyData,
    );

    expect(result.results[0].success).toBe(false);
  });
});

describe("start_game requires the sheet and the player's OK", () => {
  it("refuses without a character sheet, and names it", async () => {
    const storyData = createMockStoryData({ lore: [spineNote()] });
    const result = await executeGMTools(
      [createToolCall("start_game", { story_name: "No Hero" })],
      storyData,
    );
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].contextForStory).toContain("no character sheet");
    expect(result.modifiedStoryData.sessionZeroActive).toBe(true);
  });

  it("refuses an empty or disabled sheet", async () => {
    for (const sheet of [sheetNote({ content: "  " }), sheetNote({ enabled: false })]) {
      const result = await executeGMTools(
        [createToolCall("start_game", { story_name: "Blank" })],
        createMockStoryData({ lore: [sheet, spineNote()] }),
      );
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].contextForStory).toContain("no character sheet");
    }
  });

  it("refuses without the player's approval, and names confirm_setup", async () => {
    const storyData = createMockStoryData({ setup: { mode: "quick", conceptDone: true } });
    const result = await executeGMTools(
      [createToolCall("start_game", { story_name: "Unapproved" })],
      storyData,
    );
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].contextForStory).toContain("confirm_setup");
    expect(result.modifiedStoryData.sessionZeroActive).toBe(true);
  });

  it("refuses when the sheet changed after the OK", async () => {
    const base = createMockStoryData();
    const edited = {
      ...base,
      lore: [sheetNote({ content: "Name: Hero. Kind: Witch." }), spineNote()],
    } as StoryData;
    const result = await executeGMTools(
      [createToolCall("start_game", { story_name: "Edited" })],
      edited,
    );
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].contextForStory).toContain("changed after");
  });

  it("names everything that is missing at once", async () => {
    const result = await executeGMTools(
      [createToolCall("start_game", { story_name: "Nothing" })],
      createMockStoryData({ lore: [], setup: {} }),
    );
    const text = result.results[0].contextForStory;
    expect(text).toContain("no character sheet");
    expect(text).toContain("no campaign plan");
  });

  it("carries the campaign intro instructions on success", async () => {
    const result = await executeGMTools(
      [createToolCall("start_game", { story_name: "Intro Saga" })],
      createMockStoryData(),
    );
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].contextForStory).toContain("Now write the campaign intro");
    expect(result.results[0].contextForStory).toContain("short briefing");
    expect(result.results[0].contextForStory).toContain("first choice");
  });
});

describe("start_game is offered to the GM stage", () => {
  // Regression: the prompt (fresh-story-setup + START OF PLAY blocks) tells the
  // GM to call start_game, but the tool was never in the GM-stage whitelist, so
  // the model was instructed to call a tool it didn't have. It must be present
  // in the tools buildGMStagePrompt hands to the model.
  it("whitelists start_game so the model can actually call it", () => {
    const storyData = createMockStoryData({
      chapters: [],
      quests: [],
      relationships: [],
      npcs: [],
      threads: [],
    } as Partial<StoryData>);
    const { tools } = buildGMStagePrompt({
      storyData,
      userChoice: "Use the start game tool",
    });
    const names = tools.map((t) => t.function.name);
    expect(names).toContain("start_game");
  });
});
