/**
 * Integration test for the Phase 2 campaign-plan re-planning gate as it runs
 * inside generateStoryTurn's GM-stage loop (app/misc/generation.ts, search
 * "Campaign-plan re-planning gate"). Sibling to generation.m2RollGate.test.ts,
 * and it works the same way: when a *zero-tool-call* round ends while the plan
 * is awaiting its next beat (the GM called advance_plan complete_current but
 * never wrote the next beat), the gate pushes a re-prompt user message and
 * forces another round with toolChoice "required", instead of letting the
 * turn end on prose alone. Capped like M2 so it fails open.
 *
 * Every scenario uses skipChoices + no combat/threads, so the only fetch
 * calls are GM-stage rounds (mockGMFetch throws on anything else).
 */
import { describe, it, expect, afterEach } from "vitest";
import { generateStoryTurn, GenerationOptions } from "@/app/misc/generation";
import { createMockGMFetch } from "./helpers/mockGMFetch";
import { CAMPAIGN_SPINE_BEATS } from "@/app/misc/campaignPlan";
import type { StoryData, StoryLore } from "@/app/misc/structs";

const REPROMPT_TEXT = "write the next beat before the turn can end";

function spineNote(): StoryLore {
  return {
    title: "Campaign Plan",
    content: "# Campaign Plan\n## Current beat — Opening Image (Session 0)",
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    type: "gm_plan",
  } as StoryLore;
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

const baseOptions: GenerationOptions = {
  storyModel: "test-model",
  toolsModel: "test-model",
  choicesModel: "test-model",
  enableTools: true,
  skipChoices: true,
};

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

describe("campaign-plan gate - generateStoryTurn integration", () => {
  it("forces another round with the re-prompt when a beat is marked complete but the next beat is unwritten", async () => {
    const storyData = createTestStory({
      lore: [spineNote()],
      planState: {
        beats: [...CAMPAIGN_SPINE_BEATS],
        currentBeatIndex: 0,
        awaitingNextBeat: true, // GM completed the beat but never wrote the next
      },
    });

    // Prose-only rounds. Round 1 ends -> gate fires (1). Round 2 ends -> gate
    // fires (2). Round 3: cap reached -> fails open, turn completes.
    const { fetchMock, gmStageCalls } = createMockGMFetch([
      { content: "The lanterns are lit; the village settles into evening." },
      { content: "A hush falls over the square." },
      { content: "The moment lingers." },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateStoryTurn(
      storyData,
      "I look around the village",
      baseOptions,
      {},
    );

    expect(result.success).toBe(true);

    const calls = gmStageCalls();
    expect(calls).toHaveLength(3);

    // Round 1 predates the gate firing - no re-prompt yet.
    const round1 = calls[0].body.messages as { role: string; content: string }[];
    expect(
      round1.some((m) => m.role === "user" && m.content?.includes(REPROMPT_TEXT)),
    ).toBe(false);
    expect(calls[0].body.toolChoice).toBeUndefined();

    // Round 2 carries round 1's re-prompt and is forced to call a tool.
    const round2 = calls[1].body.messages as { role: string; content: string }[];
    expect(
      round2.some((m) => m.role === "user" && m.content?.includes(REPROMPT_TEXT)),
    ).toBe(true);
    expect(calls[1].body.toolChoice).toBe("required");

    // Round 3 carries both re-prompts.
    const round3 = calls[2].body.messages as { role: string; content: string }[];
    expect(
      round3.filter((m) => m.role === "user" && m.content?.includes(REPROMPT_TEXT))
        .length,
    ).toBe(2);
    expect(calls[2].body.toolChoice).toBe("required");
  });

  it("does not fire when the plan is not awaiting a next beat", async () => {
    const storyData = createTestStory({
      lore: [spineNote()],
      planState: {
        beats: [...CAMPAIGN_SPINE_BEATS],
        currentBeatIndex: 0,
        awaitingNextBeat: false,
      },
    });

    const { fetchMock, gmStageCalls } = createMockGMFetch([
      { content: "You wander the quiet market, taking in the sights." },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateStoryTurn(
      storyData,
      "I look around",
      baseOptions,
      {},
    );

    expect(result.success).toBe(true);
    const calls = gmStageCalls();
    expect(calls).toHaveLength(1);
    const messages = calls[0].body.messages as { role: string; content: string }[];
    expect(
      messages.some((m) => m.role === "user" && m.content?.includes(REPROMPT_TEXT)),
    ).toBe(false);
    expect(calls[0].body.toolChoice).toBeUndefined();
  });

  it("is satisfied once the GM writes the next beat via advance_plan", async () => {
    const storyData = createTestStory({
      lore: [spineNote()],
      planState: {
        beats: [...CAMPAIGN_SPINE_BEATS],
        currentBeatIndex: 0,
        awaitingNextBeat: true,
      },
    });

    // Round 1 calls advance_plan write_next (clears awaitingNextBeat). The
    // loop always continues one more round after a tool-call round; round 2
    // ends on prose, and since the flag is now clear the gate must NOT fire.
    const { fetchMock, gmStageCalls } = createMockGMFetch([
      {
        toolCalls: [
          {
            name: "advance_plan",
            arguments: {
              action: "write_next",
              next_beat: "Inciting Incident (Session 1)",
              detail: "Goal: the call lands.\n- [ ] hook delivered",
            },
          },
        ],
      },
      { content: "A rider crests the hill, banner snapping in the wind." },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateStoryTurn(
      storyData,
      "I wait for something to happen",
      baseOptions,
      {},
    );

    expect(result.success).toBe(true);
    expect(storyData.planState?.awaitingNextBeat).toBe(false);
    expect(storyData.planState?.currentBeatIndex).toBe(1);

    const calls = gmStageCalls();
    expect(calls).toHaveLength(2); // not a third - the gate did not fire
    for (const c of calls) {
      const messages = c.body.messages as { role: string; content: string }[];
      expect(
        messages.some((m) => m.role === "user" && m.content?.includes(REPROMPT_TEXT)),
      ).toBe(false);
    }
  });
});
