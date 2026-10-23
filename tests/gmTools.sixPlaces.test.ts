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
import { executeGMTools } from "@/app/misc/gmExecutor";
import { GM_TOOL_MAP } from "@/app/misc/gmTools";
import { TOOL_MAP } from "@/app/misc/toolSchemas";
import { TOOL_LABELS } from "@/app/misc/gmToolLabels";
import { GOOGLE_ESSENTIAL_TOOLS } from "@/app/misc/providerCall";
import type { StoryData } from "@/app/misc/structs";
import { warmTokenizer } from "./helpers/turnHarness";

vi.setConfig({ testTimeout: 120_000 });

const REMOVED_TOOLS = [
  "take_rest",
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

beforeAll(async () => {
  await warmTokenizer();
  whitelist = new Set([
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
