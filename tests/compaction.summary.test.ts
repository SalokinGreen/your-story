/**
 * Token-savings plan, slice 4 (decisions 95, 102 and 103): the summary's fixed
 * sections, the adventure's summary_instructions note, a "Compact now" focus,
 * the tool use folded into the summary's input, and "Compact now" keeping the
 * last two turns.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  SUMMARY_INPUT_RESULT_CAP_TOKENS,
  SUMMARY_SECTIONS,
  SUMMARY_TARGET_TOKENS,
  getSummaryInstructions,
  partToCompactionText,
  planManualCompaction,
  runCompactionPlan,
} from "@/app/misc/compaction";
import { COMPACT_NOW_KEEP_PARTS, summarizeNow } from "@/app/misc/storyCompaction";
import { buildGMStagePrompt, buildInfoMessage } from "@/app/misc/ai_staged";
import type { ScenePart, StoryData, StoryLore } from "@/app/misc/structs";
import { estimateTokens } from "@/app/misc/tokenCounter";
import { seededText, warmTokenizer } from "./helpers/turnHarness";

beforeAll(async () => {
  await warmTokenizer();
});

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function readPart(n: number): ScenePart {
  return {
    content: `The courier reads the ledger, scene ${n}.`,
    imageUrl: "",
    user: false,
    role: "assistant",
    gmConversation: [
      {
        role: "assistant",
        content: "<thinking>private plan</thinking>",
        tool_calls: [
          {
            id: `c${n}`,
            type: "function",
            function: { name: "read_notes", arguments: '{"titles":["Salon"]}' },
          },
        ],
      },
      { role: "tool", content: `SALON FACT ${n}: the owner owes the Guild a debt.`, tool_call_id: `c${n}` },
      { role: "assistant", content: `The courier reads the ledger, scene ${n}.` },
    ],
  } as unknown as ScenePart;
}

function userPart(n: number): ScenePart {
  return { content: `> action ${n}`, imageUrl: "", user: true, role: "user" } as unknown as ScenePart;
}

function lore(over: Partial<StoryLore>): StoryLore {
  return {
    id: "n",
    title: "Note",
    content: "text",
    type: "lore",
    enabled: true,
    ...over,
  } as StoryLore;
}

function story(parts: ScenePart[], loreNotes: StoryLore[] = []): StoryData {
  return {
    story_name: "T",
    player_name: "P",
    premise: "",
    player_summary: "",
    scene: { parts },
    lore: loreNotes,
    memory: [],
    npcs: [],
  } as unknown as StoryData;
}

function fiveTurns(): ScenePart[] {
  const parts: ScenePart[] = [];
  for (let i = 0; i < 5; i++) parts.push(userPart(i), readPart(i));
  return parts;
}

/** Runs a plan against a mocked provider; returns the system and user messages sent. */
async function promptFor(
  s: StoryData,
  options?: { focus?: string },
): Promise<{ system: string; user: string }> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ content: "## Where things stand now\nfine" }),
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  const plan = planManualCompaction(s, 2)!;
  await runCompactionPlan(s, plan, { model: "test-model", token: "t" }, options);
  const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
  return {
    system: body.messages.find((m: { role: string }) => m.role === "system").content,
    user: body.messages.find((m: { role: string }) => m.role === "user").content,
  };
}

describe("the summary prompt", () => {
  it("names every section and the size target", async () => {
    const { system } = await promptFor(story(fiveTurns()));
    for (const section of SUMMARY_SECTIONS) expect(system).toContain(section);
    expect(system).toContain(String(SUMMARY_TARGET_TOKENS));
  });

  it("carries the adventure's summary instructions when it has them, and not otherwise", async () => {
    const withNote = story(fiveTurns(), [
      lore({ title: "Summary Rules", type: "summary_instructions", content: "Always keep Exposure and Heat changes." }),
    ]);
    expect((await promptFor(withNote)).system).toContain("Always keep Exposure and Heat changes.");
    expect((await promptFor(story(fiveTurns()))).system).not.toContain("STANDING INSTRUCTIONS");
  });

  it("ignores a disabled summary_instructions note", () => {
    const s = story([], [
      lore({ type: "summary_instructions", content: "keep heat", enabled: false }),
    ]);
    expect(getSummaryInstructions(s)).toBeUndefined();
  });

  it("carries the focus when one is given, and not otherwise", async () => {
    const focused = await promptFor(story(fiveTurns()), { focus: "everything about the Salon" });
    expect(focused.system).toContain("everything about the Salon");
    expect((await promptFor(story(fiveTurns()))).system).not.toContain("FOCUS FOR THIS SUMMARY");
  });

  it("reads the folded turns' tool calls and results, not only their prose", async () => {
    const { user } = await promptFor(story(fiveTurns()));
    expect(user).toContain("[GM called read_notes");
    expect(user).toContain("SALON FACT 1: the owner owes the Guild a debt.");
    expect(user).not.toContain("private plan"); // the GM's <thinking> is cost, not memory
  });
});

describe("partToCompactionText", () => {
  it("is the prose alone for a part with no tool use", () => {
    const part = { content: "The door opens.", imageUrl: "", user: false, role: "assistant" } as unknown as ScenePart;
    expect(partToCompactionText(part)).toBe("The door opens.");
  });

  it("marks a player action", () => {
    expect(partToCompactionText(userPart(3))).toBe("> > action 3");
  });
});

describe("summary_instructions notes stay out of the GM's and the narrator's prompts", () => {
  const marker = "SUMMARIES-ONLY-MARKER";
  const s = story([], [
    lore({ title: "Summary Rules", type: "summary_instructions", content: marker }),
  ]);

  it("is not in the GM prompt, in full or as a title", () => {
    const { messages } = buildGMStagePrompt({ storyData: s, userChoice: "I go" });
    const all = JSON.stringify(messages);
    expect(all).not.toContain(marker);
    expect(all).not.toContain("Summary Rules");
  });

  it("is not in the narrator's info message", () => {
    const info = buildInfoMessage(s);
    expect(info).not.toContain(marker);
    expect(info).not.toContain("Summary Rules");
  });
});

describe("Compact now (summarizeNow)", () => {
  it("keeps the last two turns word for word and removes nothing", async () => {
    const s = story(fiveTurns());
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: "## Where things stand now\nfine" }),
    }) as unknown as typeof fetch;

    const result = await summarizeNow(s, { model: "test-model", token: "t" }, { focus: "the Salon" });

    expect(COMPACT_NOW_KEEP_PARTS).toBe(4);
    expect(result).toEqual({ ran: true, partsFolded: 6 });
    expect(s.scene.parts).toHaveLength(10);
    expect(s.scene.summarizedThroughIndex).toBe(6); // history now starts at the last four parts
    expect(s.scene.summary).toContain("Where things stand now");
  });

  it("does nothing when there is not more than the last two turns", async () => {
    const s = story([userPart(0), readPart(0), userPart(1), readPart(1)]);
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    expect(await summarizeNow(s, { model: "test-model", token: "t" })).toEqual({
      ran: false,
      partsFolded: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("a long tool result in the summary input", () => {
  it("is capped at about 600 tokens with a truncation note", () => {
    const note = seededText(2000, 9);
    const part = readPart(1);
    part.gmConversation![1].content = note;
    const text = partToCompactionText(part);
    expect(text).not.toContain(note);
    expect(text).toContain("...(truncated)");
    expect(estimateTokens(text)).toBeLessThan(SUMMARY_INPUT_RESULT_CAP_TOKENS + 200);
  });

  it("keeps a short result whole", () => {
    expect(partToCompactionText(readPart(1))).toContain("SALON FACT 1: the owner owes the Guild a debt.");
  });
});

describe("after the engine review", () => {
  it("tells the summariser to keep unrevealed material marked as unrevealed", async () => {
    const { system } = await promptFor(story(fiveTurns()));
    expect(system).toMatch(/unrevealed/i);
  });

  it("checks the summary against the prose, not the tool text that repeats a note's title", async () => {
    const parts: ScenePart[] = [];
    for (let i = 0; i < 5; i++) {
      parts.push(userPart(i), readPart(i));
    }
    // The title appears only inside tool calls and results, never in the prose.
    const s = story(parts, [lore({ title: "Zephyrine Vault", type: "location", content: "x" })]);
    for (const p of parts) {
      if (p.gmConversation) {
        p.gmConversation[0].tool_calls![0].function.arguments = '{"titles":["Zephyrine Vault"]}';
        p.gmConversation[1].content = "## Zephyrine Vault\nZephyrine Vault holds the debt.";
      }
    }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: "The courier reads ledgers." }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const plan = planManualCompaction(s, 2)!;
    expect(plan.textToSummarize).toContain("Zephyrine Vault");
    const result = await runCompactionPlan(s, plan, { model: "test-model", token: "t" });
    expect(result.warnings).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no revision call
  });
});
