import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installTestSystem, mockStory, run, systemStory } from "./helpers/systemsHarness";

let uninstall: () => void;
beforeEach(() => {
  uninstall = installTestSystem();
});
afterEach(() => uninstall());

describe("end_session", () => {
  it("counts the session, resets meters that reset, and returns the reminder", async () => {
    let story = systemStory();
    story = (
      await run(story, "manage_meter", { action: "create_set", owner: "Mira", set: "Hero", reason: "x" })
    ).story;
    story = (
      await run(story, "manage_meter", { action: "adjust", owner: "Mira", meter: "Resolve", by: -2, reason: "x" })
    ).story;
    expect(story.meters!.find((m) => m.name === "Resolve")!.value).toBe(1);

    const { result, story: after } = await run(story, "end_session", { reason: "Dawn" });
    expect(result.success).toBe(true);
    expect(after.systemState!.sessionCount).toBe(1);
    expect(after.meters!.find((m) => m.name === "Resolve")!.value).toBe(3);
    expect(after.meters!.find((m) => m.name === "Stress")!.value).toBe(2);
    expect(result.contextForStory).toContain("Run the Reckoning.");
    expect(result.contextForStory).toContain("Mira: Resolve → 3");
  });

  it("clears once-per-session keys so the trigger works again", async () => {
    let story = mockStory();
    story = (
      await run(story, "manage_meter", {
        action: "create",
        owner: "Mira",
        meter: "XP",
        min: 0,
        max: 99,
        value: 0,
        reason: "x",
      })
    ).story;
    const args = {
      action: "adjust",
      owner: "Mira",
      meter: "XP",
      by: 1,
      once_per: "session",
      key: "vow",
      reason: "x",
    };
    story = (await run(story, "manage_meter", args)).story;
    const repeat = await run(story, "manage_meter", args);
    expect(repeat.story.meters![0].value).toBe(1);
    story = (await run(repeat.story, "end_session", { reason: "Dawn" })).story;
    expect(story.systemState!.dedupKeys).toHaveLength(0);
    story = (await run(story, "manage_meter", args)).story;
    expect(story.meters![0].value).toBe(2);
  });

  it("works with no system and no meters, and counts again", async () => {
    let story = mockStory();
    story = (await run(story, "end_session", { reason: "one" })).story;
    const { result, story: after } = await run(story, "end_session", { reason: "two" });
    expect(after.systemState!.sessionCount).toBe(2);
    expect(result.success).toBe(true);
  });
});
