/**
 * Oracle recency counter.
 *
 * The oracle had six places in the prompt telling the GM to consult it and
 * zero state tracking whether it ever did - unlike pending random events,
 * director moves, or the M2 roll gate, all of which have deterministic
 * pressure behind them. `agmtState.lastOracleTurn` is the cheap end of that
 * spectrum: stamped by executeGMTools on a successful fate_question/
 * roll_table, rendered as a mounting "turns since you last consulted the
 * oracle" line that escalates in tone the longer the GM goes without one.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { executeGMTools } from "@/app/misc/gmExecutor";
import { buildGMStagePrompt } from "@/app/misc/ai_staged";
import {
  formatOracleRecencyLine,
  markOracleConsulted,
  ORACLE_NUDGE_THRESHOLD,
  ORACLE_STRONG_NUDGE_THRESHOLD,
  createAGMTState,
} from "@/app/misc/mythic";
import type { StoryData, ScenePart } from "@/app/misc/structs";

function sceneParts(count: number): ScenePart[] {
  return Array.from({ length: count }, (_, i) => ({
    content: `turn ${i}`,
    imageUrl: "",
    user: false,
    role: "assistant" as const,
  }));
}

function createTestStory(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "Test Story",
    premise: "Test premise",
    player_name: "Hero",
    scene: { parts: [] },
    stats: [],
    resources: [],
    inventory: [],
    abilities: [],
    achievements: [],
    lore: [],
    memory: [],
    npcs: [],
    conditions: [],
    agmtState: createAGMTState(),
    ...overrides,
  } as StoryData;
}

function gmToolCall(name: string, args: Record<string, unknown>) {
  return {
    id: `test_${Math.random().toString(36).slice(2)}`,
    function: { name, arguments: JSON.stringify(args) },
  };
}

describe("formatOracleRecencyLine", () => {
  it("reports 'not consulted yet' quietly on a young story", () => {
    const line = formatOracleRecencyLine(
      createTestStory({ scene: { parts: sceneParts(1) } })
    );
    expect(line).toContain("not consulted yet");
    expect(line).not.toContain("🚨");
  });

  it("escalates once a story has run several turns with no oracle call at all", () => {
    const line = formatOracleRecencyLine(
      createTestStory({
        scene: { parts: sceneParts(ORACLE_NUDGE_THRESHOLD + 2) },
      })
    );
    expect(line).toContain("NEVER consulted");
    expect(line).toContain("🚨");
  });

  it("stays neutral immediately after an oracle call", () => {
    const storyData = createTestStory({ scene: { parts: sceneParts(4) } });
    storyData.agmtState!.lastOracleTurn = 4;
    const line = formatOracleRecencyLine(storyData);
    expect(line).toContain("0 (this turn)");
    expect(line).not.toContain("⚠️");
    expect(line).not.toContain("🚨");
  });

  it("stays neutral for a gap below the nudge threshold", () => {
    const storyData = createTestStory({ scene: { parts: sceneParts(10) } });
    storyData.agmtState!.lastOracleTurn = 10 - (ORACLE_NUDGE_THRESHOLD - 1);
    const line = formatOracleRecencyLine(storyData);
    expect(line).toContain(`: ${ORACLE_NUDGE_THRESHOLD - 1}`);
    expect(line).not.toContain("⚠️");
    expect(line).not.toContain("🚨");
  });

  it("warns at the nudge threshold", () => {
    const storyData = createTestStory({ scene: { parts: sceneParts(10) } });
    storyData.agmtState!.lastOracleTurn = 10 - ORACLE_NUDGE_THRESHOLD;
    expect(formatOracleRecencyLine(storyData)).toContain("⚠️");
  });

  it("escalates to a strong nudge at the strong threshold", () => {
    const storyData = createTestStory({ scene: { parts: sceneParts(20) } });
    storyData.agmtState!.lastOracleTurn = 20 - ORACLE_STRONG_NUDGE_THRESHOLD;
    const line = formatOracleRecencyLine(storyData);
    expect(line).toContain("🚨");
    expect(line).not.toContain("⚠️");
  });

  it("never reports a negative gap if the stamp is somehow ahead of the turn count", () => {
    const storyData = createTestStory({ scene: { parts: sceneParts(2) } });
    storyData.agmtState!.lastOracleTurn = 9;
    expect(formatOracleRecencyLine(storyData)).toContain("0 (this turn)");
  });
});

describe("markOracleConsulted", () => {
  it("stamps the current turn index", () => {
    const storyData = createTestStory({ scene: { parts: sceneParts(7) } });
    markOracleConsulted(storyData);
    expect(storyData.agmtState!.lastOracleTurn).toBe(7);
  });

  it("is a no-op for a story with no agmtState", () => {
    const storyData = createTestStory({ agmtState: undefined });
    expect(() => markOracleConsulted(storyData)).not.toThrow();
    expect(storyData.agmtState).toBeUndefined();
  });
});

describe("executeGMTools oracle stamping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stamps lastOracleTurn on a successful fate_question", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const storyData = createTestStory({ scene: { parts: sceneParts(3) } });

    const { modifiedStoryData } = await executeGMTools(
      [gmToolCall("fate_question", { question: "Is the door locked?", likelihood: "50/50" })],
      storyData
    );

    expect(modifiedStoryData.agmtState!.lastOracleTurn).toBe(3);
  });

  it("stamps lastOracleTurn on a successful roll_table", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const storyData = createTestStory({ scene: { parts: sceneParts(5) } });

    const { modifiedStoryData } = await executeGMTools(
      [gmToolCall("roll_table", { table_name: "plot_twists", reason: "What complicates this?" })],
      storyData
    );

    expect(modifiedStoryData.agmtState!.lastOracleTurn).toBe(5);
  });

  it("does NOT stamp when roll_table fails to find the table", async () => {
    const storyData = createTestStory({ scene: { parts: sceneParts(5) } });

    const { modifiedStoryData } = await executeGMTools(
      [gmToolCall("roll_table", { table_name: "no_such_table_exists", reason: "test" })],
      storyData
    );

    expect(modifiedStoryData.agmtState!.lastOracleTurn).toBeUndefined();
  });

  it("does NOT stamp for a non-oracle tool", async () => {
    const storyData = createTestStory({ scene: { parts: sceneParts(5) } });

    const { modifiedStoryData } = await executeGMTools(
      [gmToolCall("calculate", { expression: "2 + 2", reason: "test" })],
      storyData
    );

    expect(modifiedStoryData.agmtState!.lastOracleTurn).toBeUndefined();
  });
});

describe("buildGMStagePrompt Oracle State section", () => {
  it("surfaces the recency line to the GM", () => {
    const storyData = createTestStory({
      scene: { parts: sceneParts(ORACLE_STRONG_NUDGE_THRESHOLD + 1) },
    });

    const { messages } = buildGMStagePrompt({
      storyData,
      userChoice: "Look around",
    });
    const prompt = messages.map((m) => m.content).join("\n");

    expect(prompt).toContain("Oracle State");
    expect(prompt).toContain("NEVER consulted");
  });

  it("reflects a fresh oracle call rather than the stale never-consulted copy", () => {
    const storyData = createTestStory({
      scene: { parts: sceneParts(ORACLE_STRONG_NUDGE_THRESHOLD + 1) },
    });
    markOracleConsulted(storyData);

    const { messages } = buildGMStagePrompt({
      storyData,
      userChoice: "Look around",
    });
    const prompt = messages.map((m) => m.content).join("\n");

    expect(prompt).toContain("0 (this turn)");
    expect(prompt).not.toContain("NEVER consulted");
  });
});

describe("CORE STANCE oracle framing", () => {
  it("scopes the roll-restraint rule to dice tools, not the oracle", () => {
    const { messages } = buildGMStagePrompt({
      storyData: createTestStory(),
      userChoice: "Look around",
    });
    const prompt = messages.map((m) => m.content).join("\n");

    expect(prompt).toContain("Roll dice only when they matter");
    expect(prompt).toContain("Ask the oracle whenever you don't already know");
    // The old wording lumped dice and oracle into one restraint rule, which
    // is what made the oracle guidance read as a footnote to "don't call
    // tools out of habit".
    expect(prompt).not.toContain("Call a dice or oracle tool ONLY when");
  });
});
