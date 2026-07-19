/**
 * Integration test for the M2 roll-invariant gate as it actually runs
 * inside generateStoryTurn's GM-stage loop (app/misc/generation.ts, search
 * "M2 roll-invariant gate"), as opposed to the pure-logic unit coverage in
 * tests/reasoningTiers.rollGate.test.ts (isSceneGatedForRoll /
 * hasSatisfiedRollGate directly).
 *
 * generateStoryTurn's GM-stage round loop always makes at least one more
 * fetch call after any round that included tool calls (it only stops when
 * a round produces zero tool calls) - that's ordinary tool-loop behavior,
 * not the M2 gate. The M2 gate's own, distinguishing effect is: when a
 * *zero-tool-call* round ends in a gated scene without a roll ever having
 * happened this turn, it pushes a re-prompt user message onto the GM
 * conversation and forces another round, instead of letting the turn end
 * on prose alone. That's what these tests assert on.
 *
 * Every scenario here uses `skipChoices: true` and a combat/challenge
 * fixture with empty combatants/no threads, so the *only* fetch calls
 * generateStoryTurn makes are GM-stage rounds: the GM's own final prose
 * becomes the story content directly (gmFinalStoryContent in
 * generation.ts), skipping the separate Story-stage fetch, and
 * skipChoices skips the Choices-stage fetch. mockGMFetch.ts throws loudly
 * on any fetch call outside that GM-stage script, so an unexpected extra
 * call (e.g. this scenario turning out to need more mocking than assumed)
 * fails the test with a clear message rather than silently passing.
 */
import { describe, it, expect, afterEach } from "vitest";
import { generateStoryTurn, GenerationOptions } from "@/app/misc/generation";
import { createMockGMFetch } from "./helpers/mockGMFetch";
import type { StoryData } from "@/app/misc/structs";

const REPROMPT_TEXT = "This scene requires a roll before the turn can end";

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
  skipChoices: true, // Choices stage is a separate concern already covered elsewhere - keep this test scoped to the GM stage.
};

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe("M2 roll-invariant gate - generateStoryTurn integration", () => {
  it("forces a second GM-stage round with the re-prompt when a gated scene ends with no roll tool call", async () => {
    const storyData = createTestStory({
      combatState: {
        active: true,
        combatants: [],
        turnOrder: [],
        currentTurnIndex: 0,
        round: 1,
      },
    });

    // Three prose-only rounds, each with zero tool calls:
    //   round 1: gate fires (noToolCallPrompts 0 -> 1), re-prompt pushed, loop continues.
    //   round 2: still no roll ever made -> gate fires again (1 -> 2), re-prompt pushed again.
    //   round 3: MAX_NO_TOOL_PROMPTS (2) reached -> gate no longer fires, fails open, turn completes.
    const { fetchMock, gmStageCalls } = createMockGMFetch([
      { content: "The goblin lunges forward, blade flashing." },
      { content: "It presses the attack, forcing you back toward the wall." },
      { content: "The moment stretches - the fight hangs in the balance." },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateStoryTurn(
      storyData,
      "I try to end the fight",
      baseOptions,
      {},
    );

    expect(result.success).toBe(true);

    const calls = gmStageCalls();
    expect(calls).toHaveLength(3);

    // Round 2's request is the direct evidence the gate fired after round 1.
    const round2Messages = calls[1].body.messages as { role: string; content: string }[];
    expect(
      round2Messages.some(
        (m) => m.role === "user" && m.content?.includes(REPROMPT_TEXT),
      ),
    ).toBe(true);

    // Round 3 carries both re-prompts (round 1's and round 2's).
    const round3Messages = calls[2].body.messages as { role: string; content: string }[];
    const round3RepromptCount = round3Messages.filter(
      (m) => m.role === "user" && m.content?.includes(REPROMPT_TEXT),
    ).length;
    expect(round3RepromptCount).toBe(2);

    // Round 1's own request predates any gate firing - it must NOT already contain the re-prompt.
    const round1Messages = calls[0].body.messages as { role: string; content: string }[];
    expect(
      round1Messages.some(
        (m) => m.role === "user" && m.content?.includes(REPROMPT_TEXT),
      ),
    ).toBe(false);
  });

  it("does not fire when the gate is already satisfied by a roll tool call earlier this turn", async () => {
    const storyData = createTestStory({
      combatState: {
        active: true,
        combatants: [],
        turnOrder: [],
        currentTurnIndex: 0,
        round: 1,
      },
    });

    // Round 1 calls formula_roll (satisfies the gate) - the loop always
    // continues for one more round after any tool-call round regardless of
    // the gate (ordinary tool-loop behavior, not the M2 mechanism). Round 2
    // ends on prose with zero tool calls; since a roll already happened
    // this turn, the gate must NOT fire a third round here.
    const { fetchMock, gmStageCalls } = createMockGMFetch([
      {
        toolCalls: [
          {
            name: "formula_roll",
            arguments: { formula: "1d20+5", dc: 15, reason: "Strike the goblin" },
          },
        ],
      },
      { content: "Your blade connects - the goblin staggers and falls." },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateStoryTurn(
      storyData,
      "I attack the goblin",
      baseOptions,
      {},
    );

    expect(result.success).toBe(true);

    const calls = gmStageCalls();
    // Exactly the two rounds the natural tool-then-finish flow requires -
    // not a third, which is what a false-positive gate firing would add.
    expect(calls).toHaveLength(2);

    for (const call of calls) {
      const messages = call.body.messages as { role: string; content: string }[];
      expect(
        messages.some(
          (m) => m.role === "user" && m.content?.includes(REPROMPT_TEXT),
        ),
      ).toBe(false);
    }
  });

  it("does not fire on a routine (non-gated) scene with zero tool calls", async () => {
    const storyData = createTestStory();

    const { fetchMock, gmStageCalls } = createMockGMFetch([
      { content: "You wander through the quiet market, taking in the sights." },
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
      messages.some(
        (m) => m.role === "user" && m.content?.includes(REPROMPT_TEXT),
      ),
    ).toBe(false);
  });
});
