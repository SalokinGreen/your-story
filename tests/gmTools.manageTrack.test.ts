import { afterEach, describe, expect, it, vi } from "vitest";
import { mockStory, run } from "./helpers/systemsHarness";

afterEach(() => vi.restoreAllMocks());

async function withVow(rank = "dangerous") {
  return (
    await run(mockStory(), "manage_track", {
      action: "create",
      owner: "Mira",
      track: "Find the thief",
      kind: "vow",
      rank,
      reason: "x",
    })
  ).story;
}

describe("manage_track", () => {
  it("creates a track and refuses a duplicate", async () => {
    const story = await withVow();
    expect(story.progressTracks).toHaveLength(1);
    expect(story.progressTracks![0].ticks).toBe(0);
    const again = await run(story, "manage_track", {
      action: "create",
      owner: "mira",
      track: "FIND THE THIEF",
      rank: "epic",
      reason: "x",
    });
    expect(again.result.success).toBe(false);
  });

  it("create without a rank is an error", async () => {
    const { result } = await run(mockStory(), "manage_track", {
      action: "create",
      owner: "Mira",
      track: "t",
      reason: "x",
    });
    expect(result.success).toBe(false);
  });

  it("mark adds ticks by rank", async () => {
    const ranks: [string, number][] = [
      ["troublesome", 12],
      ["dangerous", 8],
      ["formidable", 4],
      ["extreme", 2],
      ["epic", 1],
    ];
    for (const [rank, ticks] of ranks) {
      const story = await withVow(rank);
      const { story: after, result } = await run(story, "manage_track", {
        action: "mark",
        owner: "Mira",
        track: "Find the thief",
        reason: "x",
      });
      expect(result.success).toBe(true);
      expect(after.progressTracks![0].ticks).toBe(ticks);
    }
  });

  it("mark with times, clamped at 40", async () => {
    const story = await withVow("troublesome");
    const { story: after, result } = await run(story, "manage_track", {
      action: "mark",
      owner: "Mira",
      track: "Find the thief",
      times: 9,
      reason: "x",
    });
    expect(after.progressTracks![0].ticks).toBe(40);
    expect(result.contextForStory).toContain("0 → 10 boxes");
  });

  it("progress_roll with given dice compares boxes to the challenge dice", async () => {
    let story = await withVow("formidable");
    story = {
      ...story,
      progressTracks: [{ ...story.progressTracks![0], ticks: 20 }], // 5 boxes
    };
    const args = { action: "progress_roll", owner: "Mira", track: "Find the thief", reason: "x" };
    const strong = await run(story, "manage_track", { ...args, dice: [3, 4] });
    expect(strong.result.success).toBe(true);
    expect(strong.result.contextForStory).toContain("STRONG HIT");
    const weak = await run(story, "manage_track", { ...args, dice: [3, 8] });
    expect(weak.result.contextForStory).toContain("WEAK HIT");
    const tie = await run(story, "manage_track", { ...args, dice: [5, 5] });
    expect(tie.result.contextForStory).toContain("MISS");
    expect(tie.result.contextForStory).toContain("MATCH");
    expect(tie.result.success).toBe(true); // a miss is an answer, not a failed call
  });

  it("progress_roll rejects bad dice and rolls two d10 when none are given", async () => {
    const story = await withVow();
    const bad = await run(story, "manage_track", {
      action: "progress_roll",
      owner: "Mira",
      track: "Find the thief",
      dice: [0, 11],
      reason: "x",
    });
    expect(bad.result.success).toBe(false);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const rolled = await run(story, "manage_track", {
      action: "progress_roll",
      owner: "Mira",
      track: "Find the thief",
      reason: "x",
    });
    expect(rolled.result.success).toBe(true);
    expect(rolled.result.contextForStory).toContain("0 boxes vs");
  });

  it("set_status closes a track, which can then no longer be marked", async () => {
    const story = await withVow();
    const done = await run(story, "manage_track", {
      action: "set_status",
      owner: "Mira",
      track: "Find the thief",
      status: "fulfilled",
      reason: "x",
    });
    expect(done.story.progressTracks![0].status).toBe("fulfilled");
    const mark = await run(done.story, "manage_track", {
      action: "mark",
      owner: "Mira",
      track: "Find the thief",
      reason: "x",
    });
    expect(mark.result.success).toBe(false);
  });

  it("halve rounds the boxes down", async () => {
    let story = await withVow();
    story = { ...story, progressTracks: [{ ...story.progressTracks![0], ticks: 28 }] };
    const { story: after } = await run(story, "manage_track", {
      action: "halve",
      owner: "Mira",
      track: "Find the thief",
      reason: "x",
    });
    expect(after.progressTracks![0].ticks).toBe(12);
  });

  it("set_rank and remove; an unknown track lists the owner's tracks", async () => {
    const story = await withVow();
    const ranked = await run(story, "manage_track", {
      action: "set_rank",
      owner: "Mira",
      track: "Find the thief",
      rank: "epic",
      reason: "x",
    });
    expect(ranked.story.progressTracks![0].rank).toBe("epic");
    const missing = await run(story, "manage_track", {
      action: "mark",
      owner: "Mira",
      track: "Other",
      reason: "x",
    });
    expect(missing.result.success).toBe(false);
    expect(missing.result.contextForStory).toContain("Find the thief");
    const removed = await run(story, "manage_track", {
      action: "remove",
      owner: "Mira",
      track: "Find the thief",
      reason: "x",
    });
    expect(removed.story.progressTracks).toHaveLength(0);
  });
});
