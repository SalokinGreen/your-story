/**
 * Scripted multi-turn campaign regression suite (paper's Phase 4
 * recommendation: "a regression harness replaying scripted campaigns...
 * asserting a stable (non-growing) contradiction count as turn count
 * increases"). Builds on the same mockGMFetch infra as
 * generation.m2RollGate.test.ts, but drives generateStoryTurn repeatedly
 * in sequence with storyData threaded forward between calls, the way a
 * real multi-turn session would.
 *
 * Scenario: an NPC (Marcus) is alive, then dies mid-campaign via a real
 * update_npc tool call, then several routine turns pass. The check:
 * (1) canonical state (Marcus's dead status) survives every subsequent
 * turn without drifting or resetting; (2) consistencyWarnings (C2's
 * checkNarrationConsistency) stays empty across every clean turn - it
 * does not spuriously fire just because the campaign has gotten longer;
 * (3) a late-campaign hallucination (Marcus narrated back as present,
 * turns after his death) is still caught, proving detection doesn't
 * degrade as scene.parts grows.
 */
import { describe, it, expect, afterEach } from "vitest";
import { generateStoryTurn, GenerationOptions } from "@/app/misc/generation";
import { createMockGMFetch, ScriptedGMRound } from "./helpers/mockGMFetch";
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
    npcs: [
      {
        id: "npc-marcus",
        name: "Marcus",
        description: "A grizzled mercenary captain",
        role: "Ally",
        status: "alive",
        relationship: "Friend",
        attitude: "friendly",
        createdAt: Date.now(),
      },
    ],
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

/** Runs one turn: scripts the given GM rounds, calls generateStoryTurn, and threads storyData forward. */
async function runTurn(
  storyData: StoryData,
  userInput: string,
  rounds: ScriptedGMRound[],
) {
  const { fetchMock } = createMockGMFetch(rounds);
  global.fetch = fetchMock as unknown as typeof fetch;

  const result = await generateStoryTurn(storyData, userInput, baseOptions, {});
  expect(result.success).toBe(true);

  storyData.scene.parts.push(
    { content: `> ${userInput}`, imageUrl: "", user: true, role: "user", choices: [] },
    result.scenePart,
  );

  return result;
}

describe("Scripted multi-turn campaign regression", () => {
  it("keeps canonical NPC state correct and consistency warnings flat across a multi-turn campaign, catching a late hallucination", async () => {
    const storyData = createTestStory();

    // Turn 1: routine, Marcus alive and well - no contradictions possible.
    const turn1 = await runTurn(storyData, "I greet Marcus", [
      { content: "Marcus grins and claps you on the shoulder in greeting." },
    ]);
    expect(turn1.scenePart.consistencyWarnings).toBeUndefined();

    // Turn 2: Marcus dies via a real update_npc tool call. Narration
    // avoids active-presence trigger phrases for the death beat itself.
    const turn2 = await runTurn(storyData, "I can't save him in time", [
      {
        toolCalls: [{ name: "update_npc", arguments: { npc: "Marcus", status: "dead" } }],
      },
      { content: "Marcus collapses, his sword falling silent beside him." },
    ]);
    expect(storyData.npcs![0].status).toBe("dead");
    expect(turn2.scenePart.consistencyWarnings).toBeUndefined();

    // Turns 3-6: routine post-death turns. Some mention Marcus only
    // retrospectively (fine, not a contradiction); most don't mention him
    // at all. None should ever flag a warning, and his status must stay
    // "dead" throughout - the state must not drift or silently reset as
    // the campaign gets longer.
    const routineTurns = [
      "I search the battlefield",
      "I think about what Marcus taught me",
      "I make camp for the night",
      "I continue toward the city",
    ];
    for (const input of routineTurns) {
      const turn = await runTurn(storyData, input, [
        { content: `You press on. The memory of Marcus, now gone, weighs on you as you ${input.toLowerCase()}.` },
      ]);
      expect(turn.scenePart.consistencyWarnings).toBeUndefined();
      expect(storyData.npcs![0].status).toBe("dead");
    }

    // Turn 7: a late-campaign hallucination - Marcus narrated back as
    // present, several turns after his death. Detection must still catch
    // this; it must not have "aged out" or stopped working.
    const turn7 = await runTurn(storyData, "I look around the tavern", [
      { content: "Marcus arrives and hands you a warm drink, grinning as always." },
    ]);
    expect(turn7.scenePart.consistencyWarnings).toBeDefined();
    expect(
      turn7.scenePart.consistencyWarnings!.some(
        (w) => w.type === "status_contradiction" && w.entity === "Marcus",
      ),
    ).toBe(true);

    // Final sanity: canonical state is still correct even after the
    // hallucinated turn - the bad narration didn't get written back as fact.
    expect(storyData.npcs![0].status).toBe("dead");

    // The whole campaign accumulated exactly 7 turns' worth of scene parts
    // (2 per turn: user + assistant) - confirms history actually grew
    // rather than something silently failing to append.
    expect(storyData.scene.parts.length).toBe(14);
  });
});
