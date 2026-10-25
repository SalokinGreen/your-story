import { vi } from "vitest";
import { executeGMTools, type GMExecutionResult } from "@/app/misc/gmExecutor";
import type { TurnLedger } from "@/app/misc/campaign/clocks";
import { emptyCampaign } from "@/app/misc/campaign/types";
import type { CampaignRecord, Clock, Front } from "@/app/misc/campaign/types";
import type { StoryData } from "@/app/misc/structs";

/** A small story, with or without a campaign record. */
export function story(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "Test",
    scene: { parts: [] },
    lore: [],
    memory: [],
    npcs: [],
    threads: [],
    ...overrides,
  } as unknown as StoryData;
}

export function clock(overrides: Partial<Clock> = {}): Clock {
  return {
    id: "clk_a",
    name: "The barrow wakes",
    segments: 6,
    filled: 0,
    triggers: ["scene", "miss"],
    visible: true,
    paused: false,
    crossed: [],
    ...overrides,
  };
}

export function front(overrides: Partial<Front> = {}): Front {
  return {
    id: "frt_a",
    name: "The Drowned King",
    dangers: [{ name: "Hollin Greycrown", impulse: "to reclaim his river" }],
    portents: [
      { at: 0, text: "the river runs backwards at night" },
      { at: 0, text: "the ferryman's dog won't cross" },
      { at: 0, text: "the drowned walk into the village" },
    ],
    doom: "the drowned walk into the village",
    stakes: ["Will the Marlows sell the mill?"],
    clockId: "clk_a",
    status: "active",
    ...overrides,
  };
}

export function record(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return { ...emptyCampaign(), ...overrides };
}

/** A story with the worked example of design 14.7: one front, its clock. */
export function drownedKingStory(): StoryData {
  return story({
    campaign: record({
      style: "mystery",
      clocks: [clock({ link: { kind: "front", id: "frt_a" }, visible: false })],
      fronts: [front()],
    }),
  });
}

let uuidCounter = 0;
/** Makes crypto.randomUUID() deterministic for the test. */
export function stubUuids(): void {
  uuidCounter = 0;
  vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
    uuidCounter++;
    const hex = uuidCounter.toString(16).padStart(8, "0");
    return `${hex}-0000-4000-8000-000000000000` as `${string}-${string}-${string}-${string}-${string}`;
  });
}

let callCounter = 0;
/** Runs one batch of tool calls, handing the ledger through. */
export async function run(
  s: StoryData,
  calls: { name: string; args: Record<string, unknown> }[],
  turnLedger?: TurnLedger,
): Promise<GMExecutionResult> {
  return executeGMTools(
    calls.map((c) => ({
      id: `call-${++callCounter}`,
      function: { name: c.name, arguments: JSON.stringify(c.args) },
    })),
    s,
    {},
    {},
    { turnLedger },
  );
}
