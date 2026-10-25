/**
 * The GM's tool list (docs/token-savings-design.md section 4.4, decision 92):
 * one stable list, trimmed. The schemas ride along on every round of every
 * turn, so their size is a cost the whole game pays; this holds it under the
 * budget and holds the list byte-identical from turn to turn so it caches.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildGMStagePrompt, estimateTokens } from "@/app/misc/ai_staged";
import type { StoryData } from "@/app/misc/structs";
import { BUILTIN_SYSTEMS } from "@/app/misc/systems";
import type { BuiltinSystem } from "@/app/misc/systems/types";
import { DESIGN_FIXTURE, buildFixtureStory, warmTokenizer } from "./helpers/turnHarness";

vi.setConfig({ testTimeout: 120_000 }); // the fixture story is slow to build

const DEFAULT_LIST_BUDGET = 10_000; // tokens (was 15,841 before PR T3)
const MANUAL_DICE_EXTRA = 400; // ask_for_roll
// The campaign tool (campaign format, slice C1) is always offered, so every
// story pays for it, inside the one default budget (decision 242: other tool
// descriptions were trimmed to make room, rather than giving it a bound of its
// own). It is a bare schema: the data shapes come from `read` on an empty part
// and from the repair a refused write names.
// The four system tools (manage_meter, manage_track, end_session, action_roll),
// offered only to stories that use a system (decision 79). Their own bound, so
// the default list's budget is not loosened for them.
const SYSTEM_TOOLS_EXTRA = 1_500; // measured 1,204 on 2026-10-22

// Fantastic Realms is registered in slice 6; until then a stand-in with its
// tool list measures what its stories will be offered.
const FR_STAND_IN: BuiltinSystem = {
  id: "fantastic-realms",
  title: "Fantastic Realms (test stand-in)",
  description: "",
  packs: [],
  starters: [],
  meterSets: [],
  tools: ["manage_meter", "manage_feats", "feat_roll", "initiative_roll", "award_xp", "take_rest"],
};

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
    const tools = toolsFor(emptyStory());
    const campaign = tools.filter((t) => t.function.name === "campaign");
    const rest = tools.filter((t) => t.function.name !== "campaign");
    expect(campaign).toHaveLength(1);
    const restTokens = estimateTokens(JSON.stringify(rest));
    const campaignTokens = estimateTokens(JSON.stringify(campaign[0]));
    console.log(
      `Default tool list: ${estimateTokens(JSON.stringify(tools))} tokens (campaign tool ${campaignTokens}, the rest ${restTokens})`,
    );
    expect(restTokens + campaignTokens).toBeLessThan(DEFAULT_LIST_BUDGET);
    expect(estimateTokens(JSON.stringify(tools))).toBeLessThan(DEFAULT_LIST_BUDGET);
  });

  it("is the same list, campaign tool included, for a story that has a campaign record", () => {
    const withRecord = toolsFor(
      emptyStory({
        campaign: { version: 1, style: "mystery", factions: [], fronts: [], clocks: [], people: [], secrets: [], locations: [], endStates: [] },
      } as Partial<StoryData>),
    );
    const plain = toolsFor(emptyStory());
    expect(JSON.stringify(withRecord)).toBe(JSON.stringify(plain));
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

  it("adds only a bounded amount for the system tools, and only to a system story", () => {
    const base = toolsFor(emptyStory());
    const sys = toolsFor(
      emptyStory({
        systemState: { usesSystemTools: true, sessionCount: 0, dedupKeys: [] },
      } as Partial<StoryData>),
    );
    for (const n of ["manage_meter", "manage_track", "end_session", "action_roll"]) {
      expect(sys.map((t) => t.function.name)).toContain(n);
      expect(base.map((t) => t.function.name)).not.toContain(n);
    }
    const extra = estimateTokens(JSON.stringify(sys)) - estimateTokens(JSON.stringify(base));
    expect(extra).toBeLessThan(SYSTEM_TOOLS_EXTRA);
    // a system story's whole list still fits the default budget plus its own bound
    expect(estimateTokens(JSON.stringify(sys))).toBeLessThan(
      DEFAULT_LIST_BUDGET + SYSTEM_TOOLS_EXTRA,
    );
  });

  it("a Fantastic Realms story's list stays inside the default budget plus the system bound", () => {
    BUILTIN_SYSTEMS.push(FR_STAND_IN);
    try {
      const base = toolsFor(emptyStory());
      const fr = toolsFor(
        emptyStory({
          systemState: { systemId: "fantastic-realms", sessionCount: 0, dedupKeys: [] },
        } as Partial<StoryData>),
      );
      const names = fr.map((t) => t.function.name);
      for (const n of FR_STAND_IN.tools ?? []) expect(names, n).toContain(n);
      expect(names).not.toContain("action_roll");
      const total = estimateTokens(JSON.stringify(fr));
      const extra = total - estimateTokens(JSON.stringify(base));
      console.log(`Fantastic Realms tools: +${extra} tokens, list ${total}`);
      expect(extra).toBeLessThan(SYSTEM_TOOLS_EXTRA);
      expect(total).toBeLessThan(DEFAULT_LIST_BUDGET + SYSTEM_TOOLS_EXTRA);
    } finally {
      BUILTIN_SYSTEMS.splice(BUILTIN_SYSTEMS.indexOf(FR_STAND_IN), 1);
    }
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
