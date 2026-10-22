import { describe, expect, it } from "vitest";
import type { SceneChallenge } from "@/app/misc/structs";
import { formatActiveChallengeState } from "@/app/misc/ai_staged";
import { mockStory, run } from "./helpers/systemsHarness";

async function startTally(rounds = 3) {
  return run(mockStory(), "start_challenge", {
    name: "Skirmish",
    description: "Escape the tunnels",
    mode: "tally",
    rounds,
    primary_stat: "Edge",
    difficulty: "dangerous",
  });
}

async function record(story: Awaited<ReturnType<typeof startTally>>["story"], outcome: string) {
  return run(story, "record_challenge_result", { outcome, description: "a turn" });
}

describe("tally challenges", () => {
  it("start_challenge in tally mode needs rounds", async () => {
    const { result } = await run(mockStory(), "start_challenge", {
      name: "Skirmish",
      description: "d",
      mode: "tally",
      primary_stat: "Edge",
      difficulty: "x",
    });
    expect(result.success).toBe(false);
    expect(result.contextForStory).toContain("rounds");
  });

  it("first_to still needs its thresholds, and the error names the field", async () => {
    const { result } = await run(mockStory(), "start_challenge", {
      name: "Chase",
      description: "d",
      primary_stat: "Edge",
      difficulty: "x",
    });
    expect(result.success).toBe(false);
    expect(result.contextForStory).toContain("required_successes and max_failures");
  });

  it("three strong hits close it as won; the context names the tally", async () => {
    let { story } = await startTally();
    expect(story.activeChallenge!.mode).toBe("tally");
    let r = await record(story, "strong_hit");
    expect(r.result.contextForStory).toContain("round 1 of 3, tally +1");
    expect(r.story.activeChallenge!.active).toBe(true);
    r = await record(r.story, "strong_hit");
    r = await record(r.story, "strong_hit");
    expect(r.story.activeChallenge!.active).toBe(false);
    expect(r.story.activeChallenge!.result).toBe("won");
    expect(r.story.activeChallenge!.tally).toBe(3);
    expect(r.result.contextForStory).toContain("WON");
    story = r.story;
  });

  it("each band: +1 or more won, 0 even, -1 or less lost", async () => {
    // weak, weak, weak = 0 -> even
    let r = await record((await startTally()).story, "weak_hit");
    r = await record(r.story, "weak_hit");
    r = await record(r.story, "weak_hit");
    expect(r.story.activeChallenge!.result).toBe("even");
    expect(r.result.contextForStory).toContain("EVEN");
    // strong, miss, weak = 0 -> even
    r = await record((await startTally()).story, "strong_hit");
    r = await record(r.story, "miss");
    r = await record(r.story, "weak_hit");
    expect(r.story.activeChallenge!.result).toBe("even");
    // strong, weak, weak = +1 -> won
    r = await record((await startTally()).story, "strong_hit");
    r = await record(r.story, "weak_hit");
    r = await record(r.story, "weak_hit");
    expect(r.story.activeChallenge!.result).toBe("won");
    // miss, weak, strong... -1 case: miss, weak, weak
    r = await record((await startTally()).story, "miss");
    r = await record(r.story, "weak_hit");
    r = await record(r.story, "weak_hit");
    expect(r.story.activeChallenge!.result).toBe("lost");
    expect(r.story.activeChallenge!.tally).toBe(-1);
  });

  it("success is false only for a miss, and a miss is not an engine error", async () => {
    const s = (await startTally()).story;
    const miss = await record(s, "miss");
    expect(miss.result.success).toBe(false);
    expect(miss.result.contextForStory).not.toContain("ERROR");
    const weak = await record(s, "weak_hit");
    expect(weak.result.success).toBe(true);
  });

  it("a tally challenge refuses success/failure with an error", async () => {
    const s = (await startTally()).story;
    const r = await record(s, "success");
    expect(r.result.success).toBe(false);
    expect(r.result.contextForStory).toContain("tally challenge");
    expect(r.story.activeChallenge!.recorded).toBe(0);
  });

  it("a first_to challenge accepts hits and misses as successes and failures", async () => {
    let r = await run(mockStory(), "start_challenge", {
      name: "Chase",
      description: "d",
      required_successes: 2,
      max_failures: 2,
      primary_stat: "Edge",
      difficulty: "x",
    });
    r = await run(r.story, "record_challenge_result", { outcome: "strong_hit", description: "a" });
    expect(r.story.activeChallenge!.currentSuccesses).toBe(1);
    r = await run(r.story, "record_challenge_result", { outcome: "miss", description: "b" });
    expect(r.story.activeChallenge!.currentFailures).toBe(1);
    expect(r.result.success).toBe(false);
    r = await run(r.story, "record_challenge_result", { outcome: "weak_hit", description: "c" });
    expect(r.story.activeChallenge!.result).toBe("won");
  });

  it("get_game_state describes a tally challenge", async () => {
    const s = (await startTally()).story;
    const { result } = await run(s, "get_game_state", { sections: ["challenge"] });
    expect(result.contextForStory).toContain("round 1 of 3");
  });
});

describe("formatActiveChallengeState", () => {
  const base: SceneChallenge = {
    id: "c",
    name: "Escape the tunnels",
    rounds: 3,
    currentSuccesses: 0,
    currentFailures: 0,
    active: true,
    createdAt: 0,
  };
  it("is empty without an active challenge", () => {
    expect(formatActiveChallengeState(undefined)).toBe("");
    expect(formatActiveChallengeState({ ...base, active: false })).toBe("");
  });
  it("shows a tally challenge's round and tally", () => {
    const line = formatActiveChallengeState({ ...base, mode: "tally", tally: 1, recorded: 1 });
    expect(line).toContain("round 2 of 3");
    expect(line).toContain("tally +1");
  });
  it("shows a first_to challenge's counts", () => {
    const line = formatActiveChallengeState({
      ...base,
      rounds: 5,
      requiredSuccesses: 3,
      maxFailures: 3,
      currentSuccesses: 1,
      currentFailures: 2,
    });
    expect(line).toContain("first to 3");
    expect(line).toContain("1 success");
    expect(line).toContain("2 of 3 failures");
  });
});
