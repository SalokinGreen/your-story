/**
 * Setup-overdue reminders (getSetupReminder, campaignPlan.ts, and the
 * "SETUP UNFINISHED"/"SETUP OVERDUE" block in buildGMStagePrompt).
 *
 * The fresh-story and START OF PLAY prompt blocks are one-shot nudges aimed at
 * turn one; a GM that talks past them used to run an entire campaign with no
 * campaign spine and without ever calling start_game. These reminders keep
 * unfinished setup in front of it every turn instead, escalating from a nudge
 * at SETUP_REMINDER_SOFT_TURNS to "do it this turn" at
 * SETUP_REMINDER_URGENT_TURNS.
 */
import { describe, it, expect } from "vitest";
import { buildGMStagePrompt } from "@/app/misc/ai_staged";
import {
  getSetupReminder,
  hasCampaignPlan,
  countPlayerTurns,
  SETUP_REMINDER_SOFT_TURNS,
  SETUP_REMINDER_URGENT_TURNS,
} from "@/app/misc/campaignPlan";
import type { StoryData, StoryLore, ScenePart } from "@/app/misc/structs";

function note(overrides: Partial<StoryLore> = {}): StoryLore {
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

/** `turns` player turns, each followed by a GM reply (the shape scene.parts
 * actually takes) - only the user parts should be counted. */
function parts(turns: number): ScenePart[] {
  const out: ScenePart[] = [];
  for (let i = 0; i < turns; i++) {
    out.push({
      content: `player ${i}`,
      imageUrl: "",
      user: true,
      role: "user",
    });
    out.push({
      content: `gm ${i}`,
      imageUrl: "",
      user: false,
      role: "assistant",
    });
  }
  return out;
}

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

describe("hasCampaignPlan", () => {
  it("is false with no notes at all", () => {
    expect(hasCampaignPlan(createTestStory())).toBe(false);
  });

  it("is false when the only gm_plan note is the active side beat", () => {
    const story = createTestStory({
      lore: [note({ title: "Side beat — Cat" })],
      activeSideBeatTitle: "Side beat — Cat",
    });
    expect(hasCampaignPlan(story)).toBe(false);
  });

  it("is true once the spine note exists", () => {
    expect(hasCampaignPlan(createTestStory({ lore: [note()] }))).toBe(true);
  });

  it("is true from planState alone (note since deleted/renamed)", () => {
    const story = createTestStory({
      planState: { beats: ["Opening Image (Session 0)"], currentBeatIndex: 0 },
    });
    expect(hasCampaignPlan(story)).toBe(true);
  });
});

describe("countPlayerTurns", () => {
  it("counts only user parts", () => {
    expect(countPlayerTurns(createTestStory({ scene: { parts: parts(4) } }))).toBe(
      4,
    );
  });

  it("is 0 for a story with no scene", () => {
    expect(
      countPlayerTurns(createTestStory({ scene: undefined } as Partial<StoryData>)),
    ).toBe(0);
  });
});

describe("getSetupReminder", () => {
  it("is null when the plan exists and the game has started", () => {
    const story = createTestStory({
      lore: [note()],
      sessionZeroActive: false,
      scene: { parts: parts(SETUP_REMINDER_URGENT_TURNS + 5) },
    });
    expect(getSetupReminder(story)).toBeNull();
  });

  it("is null while the story is younger than the soft threshold", () => {
    const story = createTestStory({
      sessionZeroActive: true,
      scene: { parts: parts(SETUP_REMINDER_SOFT_TURNS - 1) },
    });
    expect(getSetupReminder(story)).toBeNull();
  });

  it("fires soft at the soft threshold, flagging both gaps", () => {
    const story = createTestStory({
      sessionZeroActive: true,
      scene: { parts: parts(SETUP_REMINDER_SOFT_TURNS) },
    });
    expect(getSetupReminder(story)).toEqual({
      level: "soft",
      turns: SETUP_REMINDER_SOFT_TURNS,
      missingPlan: true,
      missingStart: true,
    });
  });

  it("escalates to urgent at the urgent threshold", () => {
    const story = createTestStory({
      sessionZeroActive: true,
      scene: { parts: parts(SETUP_REMINDER_URGENT_TURNS) },
    });
    expect(getSetupReminder(story)?.level).toBe("urgent");
  });

  it("flags a missing plan on a story that already started", () => {
    // The bug this whole change exists for: start_game happened (or the save
    // predates the plan layer) but no spine was ever written.
    const story = createTestStory({
      sessionZeroActive: false,
      scene: { parts: parts(SETUP_REMINDER_SOFT_TURNS) },
    });
    expect(getSetupReminder(story)).toMatchObject({
      missingPlan: true,
      missingStart: false,
    });
  });

  it("flags a missing start on a story that already has its plan", () => {
    const story = createTestStory({
      lore: [note()],
      sessionZeroActive: true,
      scene: { parts: parts(SETUP_REMINDER_SOFT_TURNS) },
    });
    expect(getSetupReminder(story)).toMatchObject({
      missingPlan: false,
      missingStart: true,
    });
  });

  it("treats an old save with no sessionZeroActive field as started", () => {
    const story = createTestStory({
      lore: [note()],
      scene: { parts: parts(SETUP_REMINDER_URGENT_TURNS) },
    });
    expect(getSetupReminder(story)).toBeNull();
  });
});

describe("the GM prompt carries the reminder", () => {
  function promptFor(story: StoryData): string {
    const { messages } = buildGMStagePrompt({
      storyData: story,
      userChoice: "I look around.",
    });
    return messages.map((m) => m.content).join("\n");
  }

  it("omits the block entirely when setup is done", () => {
    const prompt = promptFor(
      createTestStory({
        lore: [note()],
        sessionZeroActive: false,
        scene: { parts: parts(SETUP_REMINDER_URGENT_TURNS) },
      }),
    );
    expect(prompt).not.toContain("SETUP UNFINISHED");
    expect(prompt).not.toContain("SETUP OVERDUE");
  });

  it("injects the soft block with the plan instruction", () => {
    const prompt = promptFor(
      createTestStory({
        sessionZeroActive: true,
        scene: { parts: parts(SETUP_REMINDER_SOFT_TURNS) },
      }),
    );
    expect(prompt).toContain("SETUP UNFINISHED");
    expect(prompt).toContain("No campaign plan exists");
    expect(prompt).toContain("`start_game` has not been called");
  });

  it("injects the urgent block past the urgent threshold", () => {
    const prompt = promptFor(
      createTestStory({
        sessionZeroActive: true,
        scene: { parts: parts(SETUP_REMINDER_URGENT_TURNS + 3) },
      }),
    );
    expect(prompt).toContain("SETUP OVERDUE");
    expect(prompt).not.toContain("SETUP UNFINISHED");
  });

  it("only mentions the missing piece", () => {
    const prompt = promptFor(
      createTestStory({
        lore: [note()],
        sessionZeroActive: true,
        scene: { parts: parts(SETUP_REMINDER_SOFT_TURNS) },
      }),
    );
    expect(prompt).toContain("`start_game` has not been called");
    expect(prompt).not.toContain("No campaign plan exists");
  });
});
