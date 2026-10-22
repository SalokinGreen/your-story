/**
 * The GM's tool list (docs/token-savings-design.md section 4.4, decision 92):
 * one stable list, trimmed. The schemas ride along on every round of every
 * turn, so their size is a cost the whole game pays; this holds it under the
 * budget and holds the list byte-identical from turn to turn so it caches.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildGMStagePrompt, estimateTokens } from "@/app/misc/ai_staged";
import type { StoryData } from "@/app/misc/structs";
import { DESIGN_FIXTURE, buildFixtureStory, warmTokenizer } from "./helpers/turnHarness";

vi.setConfig({ testTimeout: 120_000 }); // the fixture story is slow to build

const DEFAULT_LIST_BUDGET = 10_000; // tokens (was 15,841 before PR T3)
const MANUAL_DICE_EXTRA = 400; // ask_for_roll, the one gated tool today

beforeAll(async () => {
  await warmTokenizer();
});

function toolsFor(story: StoryData, userChoice = "I go"): { function: { name: string } }[] {
  return buildGMStagePrompt({ storyData: story, userChoice }).tools as {
    function: { name: string };
  }[];
}

function emptyStory(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "Test",
    scene: { parts: [] },
    lore: [],
    memory: [],
    npcs: [],
    ...overrides,
  } as unknown as StoryData;
}

describe("the GM's tool list", () => {
  it("is under the budget for a default story", () => {
    const tokens = estimateTokens(JSON.stringify(toolsFor(emptyStory())));
    expect(tokens).toBeLessThan(DEFAULT_LIST_BUDGET);
  });

  it("adds only a small, bounded amount for the gated tool in Manual Dice Mode", () => {
    const base = toolsFor(emptyStory());
    const manual = toolsFor(emptyStory({ diceMode: "manual" } as Partial<StoryData>));
    expect(manual.map((t) => t.function.name)).toContain("ask_for_roll");
    expect(base.map((t) => t.function.name)).not.toContain("ask_for_roll");
    const extra =
      estimateTokens(JSON.stringify(manual)) - estimateTokens(JSON.stringify(base));
    expect(extra).toBeLessThan(MANUAL_DICE_EXTRA);
  });

  it("is byte-identical across turns of the same story", () => {
    const early = JSON.stringify(toolsFor(buildFixtureStory({ ...DESIGN_FIXTURE, priorTurns: 2 })));
    const late = JSON.stringify(
      toolsFor(buildFixtureStory({ ...DESIGN_FIXTURE, priorTurns: 16 }), "I draw my sword"),
    );
    expect(late).toBe(early);
  });

  it("keeps the live tools callable: every tool has a description and a parameters object", () => {
    for (const t of toolsFor(emptyStory()) as unknown as {
      function: { name: string; description: string; parameters: { type: string } };
    }[]) {
      expect(t.function.description.length, t.function.name).toBeGreaterThan(20);
      expect(t.function.parameters.type, t.function.name).toBe("object");
    }
  });
});
