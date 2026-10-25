/**
 * A GM tool lives in several places that drift apart (CLAUDE.md): its schema,
 * the live whitelist in buildGMStagePrompt, its executor, GOOGLE_ESSENTIAL_TOOLS
 * and its label. This holds them together, and holds the tools the legacy
 * removal took out (decision 128) out of every one of them.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildGMStagePrompt } from "@/app/misc/ai_staged";
import { executeGMTools, rollAwareToolName } from "@/app/misc/gmExecutor";
import { stubPolicy, stubToolResult } from "@/app/misc/historyStubs";
import { OBSERVER_UNREGISTERED_TOOLS } from "@/app/misc/observer";
import { GM_TOOL_MAP } from "@/app/misc/gmTools";
import { TOOL_MAP } from "@/app/misc/toolSchemas";
import { TOOL_LABELS } from "@/app/misc/gmToolLabels";
import { GOOGLE_ESSENTIAL_TOOLS } from "@/app/misc/providerCall";
import type { StoryData } from "@/app/misc/structs";
import { BUILTIN_SYSTEMS } from "@/app/misc/systems";
import type { BuiltinSystem } from "@/app/misc/systems/types";
import { warmTokenizer } from "./helpers/turnHarness";

vi.setConfig({ testTimeout: 120_000 });

// (take_rest was removed with the legacy rest system and came back in 2026-10 as
// Fantastic Realms' own tool, so it is no longer on this list.)
const REMOVED_TOOLS = [
  "request_continuation",
  "end_gm_thinking",
  "reaction_check",
  "negotiate_price",
  "delegate_task",
  "game_over",
  "add_memory",
  "add_ability",
  "remove_ability",
  "modify_ability",
  "upgrade_ability",
  "reset_ability_cooldown",
  "refresh_ability",
  "update_challenge",
  "resolve_challenge",
  "skip_tools",
  "list_inactive_notes",
  "toggle_lore",
];

function story(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "Test",
    scene: { parts: [] },
    lore: [],
    memory: [],
    npcs: [],
    ...overrides,
  } as unknown as StoryData;
}

function offered(storyData: StoryData, imageToolAvailable = false): string[] {
  const { tools } = buildGMStagePrompt({
    storyData,
    userChoice: "I go",
    imageToolAvailable,
  });
  return (tools as { function: { name: string } }[]).map((t) => t.function.name);
}

// Every tool any story can be offered: the default list plus each story-level
// switch (Manual Dice Mode, a system story, pictures).
let whitelist: Set<string>;

// Fantastic Realms is registered in slice 6; until then a stand-in with its
// tool list lets the whitelist see its five tools.
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
  const registered = BUILTIN_SYSTEMS.some((s) => s.id === FR_STAND_IN.id);
  if (!registered) BUILTIN_SYSTEMS.push(FR_STAND_IN);
  const frOffered = offered(
    story({
      systemState: { systemId: "fantastic-realms", sessionCount: 0, dedupKeys: [] },
    } as Partial<StoryData>),
  );
  if (!registered) BUILTIN_SYSTEMS.splice(BUILTIN_SYSTEMS.indexOf(FR_STAND_IN), 1);
  whitelist = new Set([
    ...frOffered,
    ...offered(story()),
    ...offered(story({ diceMode: "manual" } as Partial<StoryData>)),
    ...offered(
      story({
        systemState: { usesSystemTools: true, sessionCount: 0, dedupKeys: [] },
      } as Partial<StoryData>),
    ),
    ...offered(story(), true),
  ]);
});

const gmExecutorSource = readFileSync(
  join(process.cwd(), "app/misc/gmExecutor.ts"),
  "utf8",
);
const toolExecutorSource = readFileSync(
  join(process.cwd(), "app/misc/toolExecutor.ts"),
  "utf8",
);

describe("the GM's tool surface", () => {
  it("offers something", () => {
    expect(whitelist.size).toBeGreaterThan(30);
  });

  it("gives every offered tool a schema", () => {
    for (const name of whitelist) {
      expect(GM_TOOL_MAP.has(name) || TOOL_MAP.has(name), name).toBe(true);
    }
  });

  it("gives every offered tool an executor", () => {
    for (const name of whitelist) {
      if (GM_TOOL_MAP.has(name)) {
        expect(gmExecutorSource, name).toContain(`case "${name}":`);
      } else {
        // A state tool: an inline block in executeTools, or a TOOL_DISPATCH entry.
        const inline = toolExecutorSource.includes(`function.name === "${name}"`);
        const dispatched = new RegExp(`^  ${name}: apply`, "m").test(
          toolExecutorSource,
        );
        expect(inline || dispatched, name).toBe(true);
      }
    }
  });

  it("keeps GOOGLE_ESSENTIAL_TOOLS inside what the GM can be offered", () => {
    for (const name of GOOGLE_ESSENTIAL_TOOLS) {
      expect(whitelist.has(name), name).toBe(true);
    }
  });

  it("keeps the label map inside what the GM can be offered", () => {
    for (const name of Object.keys(TOOL_LABELS)) {
      expect(whitelist.has(name), name).toBe(true);
    }
  });
});

// Session zero cannot finish without these (docs/session-zero-design.md): the
// questions, the player's OK and the start. Each must be offered, reach Gemini
// and have a label - the checks above only prove the Google and label entries
// point INTO the whitelist, not that a required tool is in all three.
const REQUIRED_TOOLS = ["ask_question", "confirm_setup", "start_game"];

describe("the tools session zero cannot do without", () => {
  it.each(REQUIRED_TOOLS)("%s is in the whitelist, the schema, the Google list and the labels", (name) => {
    expect(whitelist.has(name), "whitelist").toBe(true);
    expect(GM_TOOL_MAP.has(name), "schema").toBe(true);
    expect(gmExecutorSource, "executor").toContain(`case "${name}":`);
    expect(GOOGLE_ESSENTIAL_TOOLS.has(name), "google").toBe(true);
    expect(name in TOOL_LABELS, "label").toBe(true);
  });

  it("offers confirm_setup on every story, in or out of session zero (one stable list)", () => {
    expect(offered(story({ sessionZeroActive: true } as Partial<StoryData>))).toContain("confirm_setup");
    expect(offered(story({ sessionZeroActive: false } as Partial<StoryData>))).toContain("confirm_setup");
  });
});

describe("the removed tools", () => {
  it("are in no schema, whitelist, Google filter or label", () => {
    for (const name of REMOVED_TOOLS) {
      expect(GM_TOOL_MAP.has(name), name).toBe(false);
      expect(TOOL_MAP.has(name), name).toBe(false);
      expect(whitelist.has(name), name).toBe(false);
      expect(GOOGLE_ESSENTIAL_TOOLS.has(name), name).toBe(false);
      expect(name in TOOL_LABELS, name).toBe(false);
    }
  });

  it("answer a call with the engine's unknown-tool error, and change nothing", async () => {
    const storyData = story({ goals: [], threads: [] } as Partial<StoryData>);
    const before = JSON.stringify(storyData);
    const out = await executeGMTools(
      REMOVED_TOOLS.map((name, i) => ({
        id: `call-${i}`,
        function: { name, arguments: "{}" },
      })),
      storyData,
    );
    expect(out.results).toHaveLength(REMOVED_TOOLS.length);
    for (const r of out.results) {
      expect(r.success, r.toolName).toBe(false);
      expect(r.contextForStory, r.toolName).toContain("Unknown tool");
    }
    expect(JSON.stringify(out.modifiedStoryData)).toBe(before);
  });
});

// The campaign tool (campaign format, slice C1) is always offered, so the list
// stays one stable list. It lives in the six places CLAUDE.md names, and in the
// two unions and the history-stub policy the plan adds.
describe("the campaign tool", () => {
  const gmToolsSource = readFileSync(join(process.cwd(), "app/misc/gmTools.ts"), "utf8");

  it("is offered on every kind of story", () => {
    expect(offered(story())).toContain("campaign");
    expect(offered(story({ diceMode: "manual" } as Partial<StoryData>))).toContain("campaign");
    expect(offered(story({ sessionZeroActive: true } as Partial<StoryData>))).toContain("campaign");
  });

  it("has a schema, a whitelist entry, an executor, a Google entry and a label", () => {
    expect(GM_TOOL_MAP.has("campaign"), "schema").toBe(true);
    expect(whitelist.has("campaign"), "whitelist").toBe(true);
    expect(gmExecutorSource, "executor").toContain('case "campaign":');
    expect(GOOGLE_ESSENTIAL_TOOLS.has("campaign"), "google").toBe(true);
    expect("campaign" in TOOL_LABELS, "label").toBe(true);
  });

  it("is in the params union and the result union", () => {
    expect(gmToolsSource).toContain('{ name: "campaign"; params: CampaignParams }');
    expect(gmExecutorSource).toContain("| GMCampaignResult");
  });

  it("is recorded as deliberately outside the Observer", () => {
    expect(OBSERVER_UNREGISTERED_TOOLS.has("campaign")).toBe(true);
    // not a dice tool: the Observer's outcome checks never see it
    expect(rollAwareToolName({ toolName: "campaign" })).toBe("campaign");
  });

  it("keeps only a read result subject to size stubbing in history", () => {
    expect(stubPolicy("campaign", { action: "tick" })).toBe("whole");
    expect(stubPolicy("campaign", { action: "find_clue" })).toBe("whole");
    expect(stubPolicy("campaign", { action: "read" })).toBe("by_size");
    const long = "x ".repeat(2000);
    expect(stubToolResult("campaign", { action: "read" }, long)).not.toBe(long);
    expect(stubToolResult("campaign", { action: "reveal_secret" }, long)).toBe(long);
  });

  it("is hidden from the player's tool log", async () => {
    const out = await executeGMTools(
      [{ id: "c1", function: { name: "campaign", arguments: JSON.stringify({ action: "read" }) } }],
      story(),
    );
    expect(out.results[0].hiddenFromPlayer).toBe(true);
  });
});
