import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { StoryData } from "@/app/misc/structs";
import { installTestSystem, mockStory, run, systemStory } from "./helpers/systemsHarness";

let uninstall: () => void;
beforeEach(() => {
  uninstall = installTestSystem();
});
afterEach(() => uninstall());

async function withHero(): Promise<StoryData> {
  const { story } = await run(systemStory(), "manage_meter", {
    action: "create_set",
    owner: "Mira",
    set: "Hero",
    reason: "setup",
  });
  return story;
}

describe("manage_meter", () => {
  it("create_set builds a whole set for one owner and skips what exists", async () => {
    const { result, story } = await run(systemStory(), "manage_meter", {
      action: "create_set",
      owner: "Mira",
      set: "hero",
      reason: "setup",
    });
    expect(result.success).toBe(true);
    expect(story.meters?.map((m) => m.name)).toEqual(["Stress", "Beast", "Resolve"]);
    const again = await run(story, "manage_meter", {
      action: "create_set",
      owner: "mira",
      set: "Hero",
      reason: "again",
    });
    expect(again.story.meters).toHaveLength(3);
    expect(again.result.contextForStory).toContain("Already had");
  });

  it("an unknown set errors and names the sets that exist", async () => {
    const { result } = await run(systemStory(), "manage_meter", {
      action: "create_set",
      owner: "Mira",
      set: "Nope",
      reason: "x",
    });
    expect(result.success).toBe(false);
    expect(result.contextForStory).toContain("Hero");
  });

  it("creates a meter by hand and adjusts it with clamping", async () => {
    const created = await run(mockStory(), "manage_meter", {
      action: "create",
      owner: "world",
      meter: "Heat",
      min: 0,
      max: 6,
      value: 3,
      reason: "x",
    });
    expect(created.result.success).toBe(true);
    const { result, story } = await run(created.story, "manage_meter", {
      action: "adjust",
      owner: "World",
      meter: "heat",
      by: 5,
      reason: "x",
    });
    expect(result.success).toBe(true);
    expect(story.meters![0].value).toBe(6);
    expect(result.contextForStory).toContain("3 → 6");
    expect(result.contextForStory).toContain("clamped away");
    expect(result.contextForStory).toContain("cap");
  });

  it("reports thresholds crossed", async () => {
    const story = await withHero();
    const { result } = await run(story, "manage_meter", {
      action: "adjust",
      owner: "Mira",
      meter: "Beast",
      by: 3,
      reason: "x",
    });
    expect(result.contextForStory).toContain('reached "Stirring"');
    expect(result.contextForStory).toContain("the Beast whispers");
  });

  it("refuses a fall on an only-rises meter as an error", async () => {
    const story = await withHero();
    const { result } = await run(story, "manage_meter", {
      action: "adjust",
      owner: "Mira",
      meter: "Beast",
      by: -1,
      reason: "x",
    });
    expect(result.success).toBe(false);
    expect(result.contextForStory).toContain("only rises");
  });

  it("an unknown meter lists what the owner has", async () => {
    const story = await withHero();
    const { result } = await run(story, "manage_meter", {
      action: "adjust",
      owner: "Mira",
      meter: "Mana",
      by: 1,
      reason: "x",
    });
    expect(result.success).toBe(false);
    expect(result.contextForStory).toContain("Stress, Beast, Resolve");
    const stranger = await run(story, "manage_meter", {
      action: "adjust",
      owner: "Nobody",
      meter: "Stress",
      by: 1,
      reason: "x",
    });
    expect(stranger.result.contextForStory).toContain("Nobody has no meters");
  });

  it("set_cap pulls the value down; set_floor pushes it up", async () => {
    let story = await withHero();
    story = (
      await run(story, "manage_meter", {
        action: "set",
        owner: "Mira",
        meter: "Stress",
        value: 6,
        reason: "x",
      })
    ).story;
    const capped = await run(story, "manage_meter", {
      action: "set_cap",
      owner: "Mira",
      meter: "Stress",
      value: 5,
      reason: "x",
    });
    expect(capped.story.meters![0].value).toBe(5);
    expect(capped.story.meters![0].cap).toBe(5);
    const floored = await run(capped.story, "manage_meter", {
      action: "set_floor",
      owner: "Mira",
      meter: "Stress",
      value: 5,
      reason: "x",
    });
    expect(floored.story.meters![0].floor).toBe(5);
  });

  it("once_per scene refuses a repeat with success true, allows it after the scene moves", async () => {
    let story = await withHero();
    story = { ...story, agmtState: { sceneCount: 4 } as StoryData["agmtState"] };
    const args = {
      action: "adjust",
      owner: "Mira",
      meter: "Stress",
      by: 1,
      once_per: "scene",
      key: "Sunlight",
      reason: "x",
    };
    const first = await run(story, "manage_meter", args);
    expect(first.story.meters![0].value).toBe(3);
    const second = await run(first.story, "manage_meter", args);
    expect(second.result.success).toBe(true);
    expect(second.story.meters![0].value).toBe(3);
    expect(second.result.contextForStory).toContain("already counted this scene");
    const moved = {
      ...second.story,
      agmtState: { ...second.story.agmtState, sceneCount: 5 } as StoryData["agmtState"],
    };
    const third = await run(moved, "manage_meter", { ...args, key: "sunlight" });
    expect(third.story.meters![0].value).toBe(4);
    // stale scene keys were pruned
    expect(third.story.systemState!.dedupKeys).toHaveLength(1);
  });

  it("once_per without a key is an error", async () => {
    const story = await withHero();
    const { result } = await run(story, "manage_meter", {
      action: "adjust",
      owner: "Mira",
      meter: "Stress",
      by: 1,
      once_per: "session",
      reason: "x",
    });
    expect(result.success).toBe(false);
  });

  it("a different key, or a different meter, is not a repeat", async () => {
    let story = await withHero();
    const base = { action: "adjust", owner: "Mira", by: 1, once_per: "scene", reason: "x" };
    story = (await run(story, "manage_meter", { ...base, meter: "Stress", key: "a" })).story;
    story = (await run(story, "manage_meter", { ...base, meter: "Stress", key: "b" })).story;
    story = (await run(story, "manage_meter", { ...base, meter: "Beast", key: "a" })).story;
    expect(story.meters!.find((m) => m.name === "Stress")!.value).toBe(4);
    expect(story.meters!.find((m) => m.name === "Beast")!.value).toBe(1);
  });

  it("remove deletes the meter", async () => {
    const story = await withHero();
    const { story: after } = await run(story, "manage_meter", {
      action: "remove",
      owner: "Mira",
      meter: "Resolve",
      reason: "x",
    });
    expect(after.meters!.map((m) => m.name)).toEqual(["Stress", "Beast"]);
  });
});
