/**
 * An old save has no campaign record, and must be played exactly as before
 * (design section 11): the GM's request, every message of it, is byte-identical
 * to what the build without the campaign format produced. The digests below
 * were taken from the branch just before the format landed (see BEFORE), from this
 * same story, so they are the "before"; only the tool list differs (it gains
 * the campaign tool, which the tool budget test holds).
 */
import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildGMStagePrompt } from "@/app/misc/ai_staged";
import { migrateTimers } from "@/app/misc/campaign/migrate";
import type { StoryData } from "@/app/misc/structs";
import { DESIGN_FIXTURE, buildFixtureStory, warmTokenizer } from "./helpers/turnHarness";

vi.setConfig({ testTimeout: 120_000 });

beforeAll(async () => {
  await warmTokenizer();
});

const digest = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

function oldSave(): StoryData {
  const story = buildFixtureStory({ ...DESIGN_FIXTURE, priorTurns: 4 });
  story.timers = [
    {
      id: "timer_a",
      name: "The ritual completes",
      description: "The seal breaks",
      totalTicks: 6,
      currentTicks: 2,
      autoAdvance: false,
      status: "active",
      visibility: "visible",
      createdAt: 1,
    },
    {
      id: "timer_b",
      name: "Reinforcements",
      totalTicks: 4,
      currentTicks: 4,
      autoAdvance: false,
      status: "paused",
      visibility: "hidden",
      createdAt: 2,
    },
  ];
  return story;
}

function promptDigests(story: StoryData): string[] {
  const { messages } = buildGMStagePrompt({ storyData: story, userChoice: "I look around the room" });
  return (messages as { role: string; content: unknown }[]).map((m) => {
    const body = JSON.stringify(m);
    return `${m.role}:${body.length}:${digest(body)}`;
  });
}

// Taken on 2026-10-25 from `claude/gm-prompts-g1` (e8413c77): the GM prompts'
// slice 1 without the campaign format, so the only difference left is the
// campaign format's own (a story with no record must add nothing).
// 2026-10-25 (engine-review fixes): two digests were retaken, the system prompt
// and the live block's CAMPAIGN PLAN section, because the Front wording now
// teaches `campaign` (a front part plus a clock) instead of create_thread +
// manage_timer. That text is identical for every story, with or without a
// record, so it is a prompt change shared by all stories, not a record leak;
// the other thirteen digests are untouched.
// 2026-10-25 (GM prompt slice 2): three digests were retaken by design, the
// system prompt (the roll and agency chains replace the dice, oracle, agency and
// thinking rules), the "Ready." acknowledgement, and the last user message (the
// YOUR ROLL TOOL section and the new turn message). They change for every story,
// with or without a record; the other twelve are untouched.
// 2026-10-25 (GM prompt slice 5): the system prompt again, by design: the length
// brackets say beats and sentences and the pacing section has a second example
// pair. Every story gets it; the other fourteen are untouched.
// 2026-10-26 (randomness R1): the system prompt again, by design: the Tables section
// rolls table notes with roll_table and lists the built-in table names. Every
// story gets it; the other fourteen are untouched.
// 2026-10-26 (randomness R2): the system prompt again, by design: the Naming section
// says names are rolled (generate_name, a name table), not invented.
const BEFORE: string[] = [
  "system:27664:5e155faea382d886",
  "user:9575:ec82a88c82afe716",
  "assistant:39:44c002ba5a7f3e3a",
  "user:65:21f6cbf4db8f7103",
  "assistant:966:a277570106a134ba",
  "user:65:5652c6a9dca12c36",
  "assistant:945:b142b1a1afa3a7db",
  "user:65:c2df288b93b37cc2",
  "assistant:1103:f29a97ade25670aa",
  "user:65:51c20565e2058548",
  "assistant:171:3c8914881ba4c61a",
  "tool:158:62279d34a94c796d",
  "assistant:992:7ffd2be89ef124c3",
  "user:17650:d404d05b99430bd8",
  "assistant:82:75356dc26d8e4df6",
];

describe("a story with no campaign record", () => {
  it("builds the same GM request, message for message, as before the format", () => {
    expect(promptDigests(oldSave())).toEqual(BEFORE);
  });

  it("builds the same request twice (the digests are stable)", () => {
    expect(promptDigests(oldSave())).toEqual(promptDigests(oldSave()));
  });

  it("shows its timers as it always did, with no campaign section", () => {
    const { messages } = buildGMStagePrompt({ storyData: oldSave(), userChoice: "go" });
    const live = JSON.stringify(messages.filter((m) => JSON.stringify(m).includes("LIVE GAME STATE")));
    expect(live).toContain("ACTIVE TIMERS");
    expect(live).not.toContain("CAMPAIGN (read");
  });

  it("does not gain a record by being read or built", () => {
    const story = oldSave();
    promptDigests(story);
    expect(story.campaign).toBeUndefined();
  });
});

describe("the same story once its timers have migrated", () => {
  it("shows the timers as clocks in the campaign brief instead of the timers section", () => {
    const story = oldSave();
    expect(migrateTimers(story)).toBe(true);
    const { messages } = buildGMStagePrompt({ storyData: story, userChoice: "go" });
    const live = JSON.stringify(messages.filter((m) => JSON.stringify(m).includes("LIVE GAME STATE")));
    expect(live).not.toContain("ACTIVE TIMERS");
    expect(live).toContain("The ritual completes 4/6");
  });
});
