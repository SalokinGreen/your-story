/**
 * adjustTension and selectDirectorMove are the Director/Pacing layer's core
 * primitives: a tension scalar (same clamped-scalar shape as chaos factor)
 * and a deterministic move-selection policy the model never controls (see
 * the H7 precedent this mirrors - the model renders the chosen move as
 * prose, it does not pick which move fires).
 */
import { describe, it, expect } from "vitest";
import {
  adjustTension,
  selectDirectorMove,
  classifyPlayerStyle,
  classifyToolActivityStyle,
  dominantPlayerStyle,
  storyProgress,
  targetTensionForProgress,
} from "../app/misc/mythic";
import { formatDirectorMoveLine } from "../app/misc/ai_staged";
import type { StoryData, PendingDirectorMove } from "../app/misc/structs";

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

  it("forces a choice (hardness dimension) at the hard tension ceiling, and targets an allied NPC if one is tracked", () => {
    const storyData = createTestStory({
      agmtState: {
        chaosFactor: 5,
        sceneCount: 1,
        skillCheckHistory: [],
        currentStreak: 0,
        lastChaosAdjustment: -999,
        tension: 9,
      },
      npcs: [
        {
          id: "npc1",
          name: "Marcus",
          status: "alive",
          attitude: "allied",
        } as any,
      ],
    });
    const move = selectDirectorMove(storyData, "Normal");
    expect(move?.hardnessForcesChoice).toBe(true);
    expect(move?.hardnessTarget).toBe("someone_they_love");
  });

  it("leaves hardnessTarget unset at the tension ceiling when no allied NPC is tracked", () => {
    const storyData = createTestStory({
      agmtState: {
        chaosFactor: 5,
        sceneCount: 1,
        skillCheckHistory: [],
        currentStreak: 0,
        lastChaosAdjustment: -999,
        tension: 9,
      },
      npcs: [
        { id: "npc1", name: "A Stranger", status: "alive", attitude: "neutral" } as any,
      ],
    });
    const move = selectDirectorMove(storyData, "Normal");
    expect(move?.hardnessForcesChoice).toBe(true);
    expect(move?.hardnessTarget).toBeUndefined();
  });

  it("does not set hardness dimensions on moves other than the hard-tension put_someone_in_a_spot trigger", () => {
    const storyData = createTestStory({
      threads: [
        { id: "th1", title: "T", description: "D", status: "active", createdAt: Date.now() },
      ],
      agmtState: {
        chaosFactor: 5,
        sceneCount: 1,
        skillCheckHistory: [],
        currentStreak: 0,
        lastChaosAdjustment: -999,
        tension: 3, // low, so an "Interrupted" scene check drives the move instead
      },
    });
    const move = selectDirectorMove(storyData, "Interrupted");
    expect(move?.move).toBe("announce_future_badness");
    expect(move?.hardnessForcesChoice).toBeUndefined();
    expect(move?.hardnessTarget).toBeUndefined();
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

  it("selects spotlight_couch_player for whoever has gone longest unheard", () => {
    const storyData = createTestStory({
      multiplayer: {
        enabled: true,
        couchPlayers: [
          { id: "p1", name: "Alex", color: "#22c55e" },
          { id: "p2", name: "Sam", color: "#3b82f6" },
        ],
        couchPlayerFocus: { p1: 0, p2: 4 },
      },
    });
    const move = selectDirectorMove(storyData, "Normal");
    expect(move?.move).toBe("spotlight_couch_player");
    expect(move?.targetCouchPlayerId).toBe("p2");
  });

  it("does not select spotlight_couch_player below the neglect threshold", () => {
    const storyData = createTestStory({
      multiplayer: {
        enabled: true,
        couchPlayers: [
          { id: "p1", name: "Alex", color: "#22c55e" },
          { id: "p2", name: "Sam", color: "#3b82f6" },
        ],
        couchPlayerFocus: { p1: 0, p2: 1 },
      },
    });
    expect(selectDirectorMove(storyData, "Normal")).toBeNull();
  });

  it("is a no-op for single-player stories even with focus data present", () => {
    const storyData = createTestStory({
      multiplayer: {
        enabled: false,
        couchPlayers: [{ id: "p1", name: "Alex", color: "#22c55e" }],
        couchPlayerFocus: { p1: 10 },
      },
    });
    expect(selectDirectorMove(storyData, "Normal")).toBeNull();
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

  it("selects offer_opportunity on a calm, on-pace scene with an open thread", () => {
    const storyData = createTestStory({
      agmtState: {
        chaosFactor: 5,
        sceneCount: 1,
        skillCheckHistory: [],
        currentStreak: 0,
        lastChaosAdjustment: -999,
        tension: 5,
      },
      threads: [
        {
          id: "th1",
          title: "The Locked Vault",
          description: "Something valuable is sealed inside",
          status: "active",
          createdAt: Date.now(),
        },
      ],
    });
    const move = selectDirectorMove(storyData, "Normal");
    expect(move?.move).toBe("offer_opportunity");
    expect(move?.targetThreadId).toBe("th1");
  });

  it("stays a no-op on a calm, on-pace scene with no open thread to offer", () => {
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

  it("still prioritizes put_someone_in_a_spot over offer_opportunity when tension is high", () => {
    const storyData = createTestStory({
      agmtState: {
        chaosFactor: 5,
        sceneCount: 1,
        skillCheckHistory: [],
        currentStreak: 0,
        lastChaosAdjustment: -999,
        tension: 9,
      },
      threads: [
        {
          id: "th1",
          title: "The Locked Vault",
          description: "Something valuable is sealed inside",
          status: "active",
          createdAt: Date.now(),
        },
      ],
    });
    const move = selectDirectorMove(storyData, "Normal");
    expect(move?.move).toBe("put_someone_in_a_spot");
  });
});

describe("storyProgress", () => {
  it("returns 0 for a story that hasn't started", () => {
    const storyData = createTestStory({ currentChapter: 0, max_chapters: 10 });
    expect(storyProgress(storyData)).toBe(0);
  });

  it("returns a fraction of currentChapter/max_chapters", () => {
    const storyData = createTestStory({ currentChapter: 5, max_chapters: 10 });
    expect(storyProgress(storyData)).toBe(0.5);
  });

  it("clamps to 1 when currentChapter exceeds max_chapters", () => {
    const storyData = createTestStory({ currentChapter: 15, max_chapters: 10 });
    expect(storyProgress(storyData)).toBe(1);
  });

  it("returns 0 instead of dividing by zero when max_chapters is 0", () => {
    const storyData = createTestStory({ currentChapter: 0, max_chapters: 0 });
    expect(storyProgress(storyData)).toBe(0);
  });
});

describe("targetTensionForProgress", () => {
  it("starts low at the beginning of the story", () => {
    expect(targetTensionForProgress(0)).toBe(2);
  });

  it("rises through the middle toward the climax window", () => {
    expect(targetTensionForProgress(0.3)).toBeCloseTo(5, 1);
  });

  it("peaks during the climax window", () => {
    expect(targetTensionForProgress(0.7)).toBeCloseTo(8.5, 1);
  });

  it("falls during the resolution", () => {
    expect(targetTensionForProgress(1)).toBeCloseTo(3, 9);
  });

  it("clamps out-of-range progress to 0-1", () => {
    expect(targetTensionForProgress(-1)).toBe(targetTensionForProgress(0));
    expect(targetTensionForProgress(2)).toBe(targetTensionForProgress(1));
  });
});

describe("selectDirectorMove: macro-arc lag", () => {
  it("proactively raises stakes when tension has fallen far behind the story's own arc", () => {
    const storyData = createTestStory({
      currentChapter: 8,
      max_chapters: 10, // progress 0.8 -> target tension 9
      agmtState: {
        chaosFactor: 5,
        sceneCount: 1,
        skillCheckHistory: [],
        currentStreak: 0,
        lastChaosAdjustment: -999,
        tension: 3, // far below the ~9 target for this point in the story
      },
    });
    const move = selectDirectorMove(storyData, "Normal");
    expect(move?.move).toBe("put_someone_in_a_spot");
    expect(move?.context).toMatch(/pacing/i);
  });

  it("does not fire arc-lag when tension is reasonably close to the target", () => {
    const storyData = createTestStory({
      currentChapter: 0,
      max_chapters: 10, // progress 0 -> target tension 2
      agmtState: {
        chaosFactor: 5,
        sceneCount: 1,
        skillCheckHistory: [],
        currentStreak: 0,
        lastChaosAdjustment: -999,
        tension: 5, // above the low early-story target, no lag
      },
    });
    expect(selectDirectorMove(storyData, "Normal")).toBeNull();
  });
});

describe("classifyPlayerStyle", () => {
  it("classifies action-flavored input", () => {
    expect(classifyPlayerStyle("I attack the goblin with my sword")).toBe("action");
    expect(classifyPlayerStyle("I charge toward the bandits")).toBe("action");
  });

  it("classifies social-flavored input", () => {
    expect(classifyPlayerStyle("I ask the innkeeper about the rumors")).toBe("social");
    expect(classifyPlayerStyle("I try to persuade the guard to let us through")).toBe(
      "social",
    );
  });

  it("classifies tactical-flavored input", () => {
    expect(classifyPlayerStyle("I search the room for traps")).toBe("tactical");
    expect(classifyPlayerStyle("I sneak past the sleeping dragon")).toBe("tactical");
  });

  it("returns null for input with no matching keywords", () => {
    expect(classifyPlayerStyle("The weather is nice today")).toBeNull();
    expect(classifyPlayerStyle("")).toBeNull();
  });
});

describe("classifyToolActivityStyle", () => {
  it("classifies action-flavored tool activity", () => {
    expect(classifyToolActivityStyle(["start_combat", "add_combatant"])).toBe(
      "action"
    );
  });

  it("classifies social-flavored tool activity", () => {
    expect(classifyToolActivityStyle(["npc_reaction", "update_npc"])).toBe(
      "social"
    );
  });

  it("classifies tactical-flavored tool activity", () => {
    expect(
      classifyToolActivityStyle(["start_challenge", "manage_timer"])
    ).toBe("tactical");
  });

  it("returns null when no called tools match any bucket", () => {
    expect(classifyToolActivityStyle(["formula_roll", "add_memory"])).toBeNull();
  });

  it("returns null for an empty tool list", () => {
    expect(classifyToolActivityStyle([])).toBeNull();
  });

  it("returns null on a tie between buckets rather than guessing", () => {
    expect(
      classifyToolActivityStyle(["start_combat", "npc_reaction"])
    ).toBeNull();
  });

  it("picks the bucket with strictly more matches", () => {
    expect(
      classifyToolActivityStyle([
        "start_combat",
        "add_combatant",
        "npc_reaction",
      ])
    ).toBe("action");
  });
});

describe("dominantPlayerStyle", () => {
  it("returns the style with the highest count", () => {
    expect(dominantPlayerStyle({ action: 5, social: 1, tactical: 2 })).toBe("action");
  });

  it("returns null when counts are undefined or all zero", () => {
    expect(dominantPlayerStyle(undefined)).toBeNull();
    expect(dominantPlayerStyle({ action: 0, social: 0, tactical: 0 })).toBeNull();
  });
});

describe("selectDirectorMove: player-style spotlight tie-breaking", () => {
  it("breaks a close neglect tie toward the player whose style fits a high-tension scene", () => {
    const storyData = createTestStory({
      agmtState: {
        chaosFactor: 5,
        sceneCount: 1,
        skillCheckHistory: [],
        currentStreak: 0,
        lastChaosAdjustment: -999,
        // 7 is high enough for preferredStyleForScene -> "action", but
        // below 8, the threshold where put_someone_in_a_spot itself would
        // fire first (higher priority than spotlight_couch_player).
        tension: 7,
      },
      multiplayer: {
        enabled: true,
        couchPlayers: [
          { id: "p1", name: "Alex", color: "#22c55e" },
          { id: "p2", name: "Sam", color: "#3b82f6" },
        ],
        // Within the tie window (difference of 1) - both are candidates.
        couchPlayerFocus: { p1: 3, p2: 4 },
        playerStyleCounts: {
          p1: { action: 5, social: 0, tactical: 0 },
          p2: { action: 0, social: 5, tactical: 0 },
        },
      },
    });

    const move = selectDirectorMove(storyData, "Normal");
    expect(move?.move).toBe("spotlight_couch_player");
    // Sam is more neglected (4 vs 3) but Alex's action style fits the
    // high-tension scene, and they're within the tie window - style wins.
    expect(move?.targetCouchPlayerId).toBe("p1");
  });

  it("does not let style override a clear (non-tied) neglect gap", () => {
    const storyData = createTestStory({
      multiplayer: {
        enabled: true,
        couchPlayers: [
          { id: "p1", name: "Alex", color: "#22c55e" },
          { id: "p2", name: "Sam", color: "#3b82f6" },
        ],
        // Not within the tie window - p2 is clearly the most overdue.
        couchPlayerFocus: { p1: 0, p2: 5 },
        playerStyleCounts: {
          p1: { action: 5, social: 0, tactical: 0 },
          p2: { action: 0, social: 5, tactical: 0 },
        },
      },
    });

    // Normal, low tension -> preferredStyleForScene is "social", which is
    // Sam's style anyway, but the point is fairness would pick Sam regardless.
    const move = selectDirectorMove(storyData, "Normal");
    expect(move?.targetCouchPlayerId).toBe("p2");
  });

  it("falls back to the most-neglected candidate when no style data exists", () => {
    const storyData = createTestStory({
      multiplayer: {
        enabled: true,
        couchPlayers: [
          { id: "p1", name: "Alex", color: "#22c55e" },
          { id: "p2", name: "Sam", color: "#3b82f6" },
        ],
        couchPlayerFocus: { p1: 3, p2: 3 },
      },
    });

    const move = selectDirectorMove(storyData, "Normal");
    expect(move?.move).toBe("spotlight_couch_player");
    expect(["p1", "p2"]).toContain(move?.targetCouchPlayerId);
  });
});

describe("formatDirectorMoveLine", () => {
  function baseMove(overrides: Partial<PendingDirectorMove> = {}): PendingDirectorMove {
    return {
      id: "mv1",
      move: "put_someone_in_a_spot",
      createdAt: Date.now(),
      ...overrides,
    };
  }

  it("renders a plain move with no hardness annotations", () => {
    const line = formatDirectorMoveLine(baseMove());
    expect(line).toContain("put someone in a spot");
    expect(line).not.toContain("[land this on");
    expect(line).not.toContain("[present this as a dilemma");
  });

  it("annotates hardnessTarget: someone_they_love", () => {
    const line = formatDirectorMoveLine(
      baseMove({ hardnessTarget: "someone_they_love" }),
    );
    expect(line).toContain("someone the character loves");
  });

  it("annotates hardnessTarget: someone_present", () => {
    const line = formatDirectorMoveLine(
      baseMove({ hardnessTarget: "someone_present" }),
    );
    expect(line).toContain("someone else present");
  });

  it("does not annotate hardnessTarget: self", () => {
    const line = formatDirectorMoveLine(baseMove({ hardnessTarget: "self" }));
    expect(line).not.toContain("[land this on");
  });

  it("annotates hardnessForcesChoice", () => {
    const line = formatDirectorMoveLine(baseMove({ hardnessForcesChoice: true }));
    expect(line).toContain("[present this as a dilemma between two costs]");
  });

  it("still includes the acknowledgement instruction with the move id", () => {
    const line = formatDirectorMoveLine(baseMove({ id: "mv-xyz" }));
    expect(line).toContain('acknowledge_director_move(id: "mv-xyz")');
  });
});
