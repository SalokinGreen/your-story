/**
 * adjustTension and selectDirectorMove are the Director/Pacing layer's core
 * primitives: a tension scalar (same clamped-scalar shape as chaos factor)
 * and a deterministic move-selection policy the model never controls (see
 * the H7 precedent this mirrors - the model renders the chosen move as
 * prose, it does not pick which move fires).
 */
import { describe, it, expect } from "vitest";
import { adjustTension, selectDirectorMove } from "../app/misc/mythic";
import type { StoryData } from "../app/misc/structs";

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
    level: 1,
    upgradesSpent: 0,
    conditions: [],
    npcs: [],
    ...overrides,
  } as StoryData;
}

describe("adjustTension", () => {
  it("clamps to the 0-10 range", () => {
    expect(adjustTension(0, { sceneType: "Normal" })).toBe(0);
    expect(adjustTension(10, { sceneType: "Interrupted" })).toBe(10);
  });

  it("rises on an Interrupted scene check", () => {
    expect(adjustTension(5, { sceneType: "Interrupted" })).toBe(6);
  });

  it("rises when combat is active, even on a Normal scene check", () => {
    expect(adjustTension(5, { sceneType: "Normal", combatActive: true })).toBe(6);
  });

  it("rises when a timer is about to trigger", () => {
    expect(adjustTension(5, { sceneType: "Normal", timerNearZero: true })).toBe(6);
  });

  it("falls on a calm Normal scene with no other pressure", () => {
    expect(adjustTension(5, { sceneType: "Normal" })).toBe(4);
  });

  it("is neutral on an Altered scene with no other pressure", () => {
    expect(adjustTension(5, { sceneType: "Altered" })).toBe(5);
  });
});

describe("selectDirectorMove", () => {
  it("returns null when nothing warrants a move", () => {
    const storyData = createTestStory({
      agmtState: {
        chaosFactor: 5,
        sceneCount: 1,
        skillCheckHistory: [],
        currentStreak: 0,
        lastChaosAdjustment: -999,
        tension: 5,
      },
    });
    expect(selectDirectorMove(storyData, "Normal")).toBeNull();
  });

  it("selects tick_a_clock when a timer is about to trigger, over other signals", () => {
    const storyData = createTestStory({
      timers: [
        {
          id: "t1",
          name: "Ritual Completion",
          totalTicks: 5,
          currentTicks: 1,
          autoAdvance: true,
          status: "active",
          visibility: "visible",
          createdAt: Date.now(),
        },
      ],
      threads: [
        {
          id: "th1",
          title: "The Ritual",
          description: "A cult is preparing something",
          status: "active",
          createdAt: Date.now(),
          linkedTimerId: "t1",
        },
      ],
    });
    const move = selectDirectorMove(storyData, "Interrupted");
    expect(move?.move).toBe("tick_a_clock");
    expect(move?.targetTimerId).toBe("t1");
    expect(move?.targetThreadId).toBe("th1");
  });

  it("selects announce_future_badness on an Interrupted or Altered scene check", () => {
    const storyData = createTestStory({
      threads: [
        {
          id: "th1",
          title: "The Missing Heir",
          description: "Someone is hiding the truth",
          status: "active",
          createdAt: Date.now(),
        },
      ],
    });
    const move = selectDirectorMove(storyData, "Interrupted");
    expect(move?.move).toBe("announce_future_badness");
    expect(move?.targetThreadId).toBe("th1");
  });

  it("selects put_someone_in_a_spot when tension is high with no other trigger", () => {
    const storyData = createTestStory({
      agmtState: {
        chaosFactor: 5,
        sceneCount: 1,
        skillCheckHistory: [],
        currentStreak: 0,
        lastChaosAdjustment: -999,
        tension: 9,
      },
    });
    const move = selectDirectorMove(storyData, "Normal");
    expect(move?.move).toBe("put_someone_in_a_spot");
  });

  it("does not fire a new move while one is already pending (anti-pileup throttle)", () => {
    const storyData = createTestStory({
      agmtState: {
        chaosFactor: 5,
        sceneCount: 1,
        skillCheckHistory: [],
        currentStreak: 0,
        lastChaosAdjustment: -999,
        tension: 9,
      },
      pendingDirectorMoves: [
        {
          id: "existing",
          move: "put_someone_in_a_spot",
          createdAt: Date.now(),
        },
      ],
    });
    expect(selectDirectorMove(storyData, "Interrupted")).toBeNull();
  });

  it("ignores inactive timers and threads", () => {
    const storyData = createTestStory({
      timers: [
        {
          id: "t1",
          name: "Cancelled Timer",
          totalTicks: 5,
          currentTicks: 0,
          autoAdvance: true,
          status: "cancelled",
          visibility: "visible",
          createdAt: Date.now(),
        },
      ],
      threads: [
        {
          id: "th1",
          title: "Resolved Thread",
          description: "Already dealt with",
          status: "resolved",
          createdAt: Date.now(),
        },
      ],
    });
    // No active timer/thread pressure and a Normal scene check -> no move.
    expect(selectDirectorMove(storyData, "Normal")).toBeNull();
  });
});
