/**
 * Per-turn cost accounting (app/misc/turnCost.ts) and the prediction built
 * on top of it (app/misc/turnCostEstimate.ts).
 *
 * The ledger is module-level state, so every test opens its own turn via
 * beginTurnCost() and works with the id it returns rather than relying on
 * whatever turn a previous test left open.
 *
 * Prices here are asserted against real AI_MODELS entries rather than mocked
 * ones - a pricing change that silently breaks the arithmetic should fail
 * these tests, which is the point.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  beginTurnCost,
  recordAICall,
  recordSideCall,
  getTurnCostReport,
  getLatestTurnCostReport,
  getModelPrice,
  priceCall,
  reasoningOutputMultiplier,
  recordTurnCostCalibration,
  getTurnCostCalibration,
  resetTurnCostCalibration,
  formatUsd,
  turnsPerDollar,
  TurnCostReport,
} from "@/app/misc/turnCost";
import { estimateTurnCost } from "@/app/misc/turnCostEstimate";
import { AI_MODELS } from "@/app/misc/ai_prices";

// "Mistral Nemo" is $0.15/$0.15 per 1M tokens - a model with equal input and
// output prices keeps the hand-computed expectations below readable.
const CHEAP_MODEL = "Mistral Nemo";
// "GLM 5.2" is $0.65 in / $2.10 out - asymmetric, so it catches an
// input/output price mix-up that a symmetric model would hide.
const PRICEY_MODEL = "GLM 5.2";

// The suite runs in vitest's node environment, but everything under test
// reads config through `typeof window === "undefined"` guards plus
// localStorage - so both have to exist for any of it to do more than return
// defaults. Same stubGlobal approach syncManager.test.ts uses.
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
  vi.stubGlobal("sessionStorage", new MemoryStorage());
  vi.stubGlobal("window", {
    localStorage: globalThis.localStorage,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
  vi.stubGlobal(
    "CustomEvent",
    class {
      type: string;
      detail: unknown;
      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
  );
  resetTurnCostCalibration();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getModelPrice", () => {
  it("reads prices straight off the AI_MODELS entry", () => {
    const price = getModelPrice(PRICEY_MODEL);
    expect(price.inputPrice).toBe(AI_MODELS["GLM 5.2"].inputPrice);
    expect(price.outputPrice).toBe(AI_MODELS["GLM 5.2"].outputPrice);
    expect(price.provider).toBe("openrouter");
    expect(price.unpriced).toBe(false);
  });

  it("flags an unknown model as unpriced instead of silently costing $0", () => {
    // getModelConfig() would fall back to DeepSeek V4 Flash's prices here,
    // which would make a typo'd model key quietly bill at someone else's
    // rate. Cost accounting has to say "I don't know" instead.
    const price = getModelPrice("not-a-real-model");
    expect(price.unpriced).toBe(true);
    expect(price.inputPrice).toBe(0);
  });

  it("prices a custom BYOK model from the user's own settings", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    localStorage.setItem(
      "customModels",
      JSON.stringify([
        {
          id,
          modelId: "some/model",
          name: "My Model",
          contextSize: 128000,
          maxOutputTokens: 8000,
          inputPrice: 2,
          outputPrice: 8,
        },
      ]),
    );
    const price = getModelPrice(id);
    expect(price.displayName).toBe("My Model");
    expect(price.inputPrice).toBe(2);
    expect(price.outputPrice).toBe(8);
    expect(price.unpriced).toBe(false);
  });

  it("marks a custom model with no prices set as unpriced", () => {
    const id = "11111111-2222-3333-4444-666666666666";
    localStorage.setItem(
      "customModels",
      JSON.stringify([
        {
          id,
          modelId: "some/model",
          name: "Unpriced Model",
          contextSize: 128000,
          maxOutputTokens: 8000,
        },
      ]),
    );
    expect(getModelPrice(id).unpriced).toBe(true);
  });
});

describe("priceCall", () => {
  it("bills input and output at their separate per-million rates", () => {
    // 1M in at $0.65 + 1M out at $2.10
    expect(priceCall(PRICEY_MODEL, 1_000_000, 1_000_000)).toBeCloseTo(2.75, 6);
  });

  it("scales linearly below a million tokens", () => {
    expect(priceCall(CHEAP_MODEL, 100_000, 100_000)).toBeCloseTo(0.03, 6);
  });

  it("treats negative token counts as zero rather than a credit", () => {
    expect(priceCall(PRICEY_MODEL, -5000, 1000)).toBeCloseTo(
      priceCall(PRICEY_MODEL, 0, 1000),
      9,
    );
  });
});

describe("reasoningOutputMultiplier", () => {
  it("charges more output for higher reasoning effort", () => {
    expect(reasoningOutputMultiplier("none")).toBe(1);
    expect(reasoningOutputMultiplier("high")).toBeGreaterThan(
      reasoningOutputMultiplier("low"),
    );
    expect(reasoningOutputMultiplier("xhigh")).toBeGreaterThan(
      reasoningOutputMultiplier("high"),
    );
  });

  it("is a no-op for an unset or unrecognized effort", () => {
    expect(reasoningOutputMultiplier(undefined)).toBe(1);
    expect(reasoningOutputMultiplier("nonsense")).toBe(1);
  });
});

describe("the turn ledger", () => {
  it("totals every recorded call in the turn", () => {
    const turnId = beginTurnCost();
    recordAICall({
      stage: "gm",
      label: "GM round 1",
      modelKey: PRICEY_MODEL,
      promptTokens: 100_000,
      completionTokens: 1_000,
    });
    recordAICall({
      stage: "choices",
      label: "Choices",
      modelKey: CHEAP_MODEL,
      promptTokens: 5_000,
      completionTokens: 300,
    });

    const report = getTurnCostReport(turnId)!;
    expect(report.calls).toBe(2);
    expect(report.promptTokens).toBe(105_000);
    expect(report.completionTokens).toBe(1_300);
    expect(report.totalUsd).toBeCloseTo(
      priceCall(PRICEY_MODEL, 100_000, 1_000) +
        priceCall(CHEAP_MODEL, 5_000, 300),
      9,
    );
  });

  it("groups calls by stage", () => {
    const turnId = beginTurnCost();
    for (const round of [1, 2, 3]) {
      recordAICall({
        stage: "gm",
        label: `GM round ${round}`,
        modelKey: CHEAP_MODEL,
        promptTokens: 10_000,
        completionTokens: 200,
      });
    }
    recordAICall({
      stage: "memory_keeper",
      label: "Memory Keeper",
      modelKey: CHEAP_MODEL,
      promptTokens: 1_000,
      completionTokens: 50,
    });

    const report = getTurnCostReport(turnId)!;
    const gm = report.byStage.find((s) => s.stage === "gm")!;
    expect(gm.calls).toBe(3);
    expect(gm.promptTokens).toBe(30_000);
    expect(report.byStage.find((s) => s.stage === "memory_keeper")!.calls).toBe(
      1,
    );
  });

  it("prefers the provider's own cost figure over list-price arithmetic", () => {
    // DeepInfra reports estimated_cost; when it does, that's the billed
    // number and our per-million multiplication is just a fallback.
    const turnId = beginTurnCost();
    recordAICall({
      stage: "gm",
      label: "GM round 1",
      modelKey: PRICEY_MODEL,
      promptTokens: 100_000,
      completionTokens: 1_000,
      providerReportedUsd: 0.005,
    });
    expect(getTurnCostReport(turnId)!.totalUsd).toBeCloseTo(0.005, 9);
  });

  it("bills a background call to the turn that spawned it, not the open one", () => {
    // This is the whole reason costTurnId exists: the Memory Keeper and
    // Observer run fire-and-forget AFTER their turn hands control back, so
    // they routinely land while the NEXT turn is already open.
    const firstTurn = beginTurnCost();
    recordAICall({
      stage: "gm",
      label: "GM round 1",
      modelKey: CHEAP_MODEL,
      promptTokens: 10_000,
      completionTokens: 500,
    });

    const secondTurn = beginTurnCost();
    recordAICall({
      stage: "memory_keeper",
      label: "Memory Keeper (late)",
      modelKey: CHEAP_MODEL,
      promptTokens: 1_000,
      completionTokens: 100,
      costTurnId: firstTurn,
    });

    expect(getTurnCostReport(firstTurn)!.calls).toBe(2);
    expect(getTurnCostReport(secondTurn)!.calls).toBe(0);
  });

  it("marks a turn that used an unpriced model so the total isn't read as final", () => {
    const turnId = beginTurnCost();
    recordAICall({
      stage: "gm",
      label: "GM round 1",
      modelKey: "not-a-real-model",
      promptTokens: 10_000,
      completionTokens: 500,
    });
    expect(getTurnCostReport(turnId)!.hasUnpricedCalls).toBe(true);
  });

  it("does not mark a call as unpriced when the provider reported a cost", () => {
    const turnId = beginTurnCost();
    recordAICall({
      stage: "gm",
      label: "GM round 1",
      modelKey: "not-a-real-model",
      promptTokens: 10_000,
      completionTokens: 500,
      providerReportedUsd: 0.002,
    });
    const report = getTurnCostReport(turnId)!;
    expect(report.hasUnpricedCalls).toBe(false);
    expect(report.totalUsd).toBeCloseTo(0.002, 9);
  });

  it("returns null for a turn id it never opened", () => {
    expect(getTurnCostReport("turn-that-never-existed")).toBeNull();
  });

  it("exposes the most recently opened turn", () => {
    beginTurnCost();
    const latest = beginTurnCost();
    expect(getLatestTurnCostReport()!.turnId).toBe(latest);
  });
});

describe("recordSideCall", () => {
  it("pulls tokens and provider cost off a /api/generate response", () => {
    const turnId = beginTurnCost();
    recordSideCall("observer", "player_agency judge", CHEAP_MODEL, {
      meta: {
        usage: { promptTokens: 2_000, completionTokens: 100 },
        estimatedCost: 0.0004,
      },
    });
    const report = getTurnCostReport(turnId)!;
    expect(report.calls).toBe(1);
    expect(report.promptTokens).toBe(2_000);
    expect(report.totalUsd).toBeCloseTo(0.0004, 9);
  });

  it("ignores a response with no usage rather than recording a zero-cost call", () => {
    // A failed/short-circuited call shouldn't pad the call count with a
    // phantom $0 entry that makes the turn look busier than it was.
    const turnId = beginTurnCost();
    recordSideCall("observer", "judge", CHEAP_MODEL, { meta: {} });
    recordSideCall("observer", "judge", CHEAP_MODEL, null);
    expect(getTurnCostReport(turnId)!.calls).toBe(0);
  });
});

describe("calibration", () => {
  function reportWith(
    stages: { stage: string; calls: number; prompt: number; completion: number }[],
  ): TurnCostReport {
    return {
      turnId: "t",
      calls: stages.reduce((n, s) => n + s.calls, 0),
      promptTokens: 0,
      completionTokens: 0,
      totalUsd: 0,
      hasUnpricedCalls: false,
      byStage: stages.map((s) => ({
        stage: s.stage as never,
        calls: s.calls,
        promptTokens: s.prompt,
        completionTokens: s.completion,
        costUsd: 0,
      })),
      entries: [],
      startedAt: 0,
      elapsedMs: 0,
    };
  }

  it("records per-call token averages, not per-turn totals", () => {
    // Three GM rounds totalling 30k input is 10k per CALL - the estimator
    // multiplies by its own expected round count, so storing the total here
    // would triple-count.
    recordTurnCostCalibration(
      reportWith([{ stage: "gm", calls: 3, prompt: 30_000, completion: 900 }]),
    );
    const gm = getTurnCostCalibration().gm!;
    expect(gm.avgPromptTokens).toBeCloseTo(10_000, 6);
    expect(gm.avgCompletionTokens).toBeCloseTo(300, 6);
    expect(gm.avgCallsPerTurn).toBeCloseTo(3, 6);
  });

  it("learns how often a periodic layer actually fires", () => {
    // The Story Progress Observer fires once every ten turns by default;
    // after nine quiet turns and one firing, its calls-per-turn should sit
    // well below one rather than being counted as always-on.
    for (let i = 0; i < 9; i++) {
      recordTurnCostCalibration(
        reportWith([{ stage: "gm", calls: 1, prompt: 10_000, completion: 300 }]),
      );
    }
    recordTurnCostCalibration(
      reportWith([
        { stage: "gm", calls: 1, prompt: 10_000, completion: 300 },
        { stage: "progress_observer", calls: 1, prompt: 3_000, completion: 200 },
      ]),
    );

    const progress = getTurnCostCalibration().progress_observer!;
    expect(progress.avgCallsPerTurn).toBeGreaterThan(0);
    expect(progress.avgCallsPerTurn).toBeLessThan(0.5);
  });

  it("holds a stage's token average across turns where it didn't run", () => {
    // A zero-call turn is evidence about frequency, not about how big the
    // call is - letting it drag the token average toward zero would make
    // periodic layers look free.
    recordTurnCostCalibration(
      reportWith([
        { stage: "reflection", calls: 1, prompt: 4_000, completion: 200 },
      ]),
    );
    for (let i = 0; i < 5; i++) {
      recordTurnCostCalibration(
        reportWith([{ stage: "gm", calls: 1, prompt: 10_000, completion: 300 }]),
      );
    }
    expect(getTurnCostCalibration().reflection!.avgPromptTokens).toBeCloseTo(
      4_000,
      6,
    );
  });

  it("does not let quiet turns shrink a rare layer's measured call size", () => {
    // The bug this guards against: reflection fires maybe one turn in
    // twelve. If the eleven quiet turns count as evidence about how big a
    // reflection CALL is, its token average decays toward zero and the
    // estimator reports the layer as nearly free - exactly backwards, since
    // reflection is one of the larger side calls when it does fire.
    for (let i = 0; i < 11; i++) {
      recordTurnCostCalibration(
        reportWith([{ stage: "gm", calls: 1, prompt: 10_000, completion: 300 }]),
      );
    }
    recordTurnCostCalibration(
      reportWith([
        { stage: "gm", calls: 1, prompt: 10_000, completion: 300 },
        { stage: "reflection", calls: 1, prompt: 4_000, completion: 200 },
      ]),
    );

    const reflection = getTurnCostCalibration().reflection!;
    expect(reflection.avgPromptTokens).toBeCloseTo(4_000, 6);
    expect(reflection.tokenSamples).toBe(1);
    // Frequency, on the other hand, SHOULD reflect all twelve turns.
    expect(reflection.samples).toBe(12);
    expect(reflection.avgCallsPerTurn).toBeLessThan(0.5);
  });

  it("keeps token averages out of the estimate until the stage has really run", () => {
    // Twelve turns of samples with zero firings: the stage's FREQUENCY is
    // well-measured (it never fires, so it contributes ~nothing), but its
    // token sizes are still placeholders and must not be reported as
    // "measured" - otherwise the first time it does fire, the estimate
    // would have been anchored on made-up numbers it claimed were observed.
    for (let i = 0; i < 12; i++) {
      recordTurnCostCalibration(
        reportWith([{ stage: "gm", calls: 1, prompt: 10_000, completion: 300 }]),
      );
    }
    const calibration = getTurnCostCalibration();
    expect(calibration.reflection!.tokenSamples).toBe(0);

    const line = estimateTurnCost({ calibration }).lines.find(
      (l) => l.stage === "reflection",
    )!;
    expect(line.calibrated).toBe(false);
    expect(line.expectedCalls).toBe(0);
  });

  it("ignores a turn with no calls at all", () => {
    recordTurnCostCalibration(reportWith([]));
    expect(getTurnCostCalibration().gm).toBeUndefined();
  });

  it("is cleared by resetTurnCostCalibration", () => {
    recordTurnCostCalibration(
      reportWith([{ stage: "gm", calls: 1, prompt: 10_000, completion: 300 }]),
    );
    resetTurnCostCalibration();
    expect(getTurnCostCalibration()).toEqual({});
  });
});

describe("estimateTurnCost", () => {
  it("costs a turn as more than any single call in it", () => {
    // The headline claim of the feature: a turn is the GM plus narration
    // plus choices plus the background layers, not just the GM call.
    const estimate = estimateTurnCost();
    expect(estimate.expectedUsd).toBeGreaterThan(0);
    const largestLine = Math.max(...estimate.lines.map((l) => l.expectedUsd));
    expect(estimate.expectedUsd).toBeGreaterThan(largestLine);
  });

  it("brackets the expected cost with a low/high band", () => {
    const estimate = estimateTurnCost();
    expect(estimate.lowUsd).toBeLessThanOrEqual(estimate.expectedUsd);
    expect(estimate.highUsd).toBeGreaterThanOrEqual(estimate.expectedUsd);
  });

  it("splits what the player waits on from the background layers", () => {
    const estimate = estimateTurnCost();
    expect(estimate.foregroundUsd).toBeGreaterThan(0);
    expect(estimate.backgroundUsd).toBeGreaterThan(0);
    expect(estimate.foregroundUsd + estimate.backgroundUsd).toBeCloseTo(
      estimate.expectedUsd,
      9,
    );
  });

  it("accounts for the observer, memory keeper and other side layers", () => {
    const stages = new Set(estimateTurnCost().lines.map((l) => l.stage));
    expect(stages.has("gm")).toBe(true);
    expect(stages.has("choices")).toBe(true);
    expect(stages.has("observer")).toBe(true);
    expect(stages.has("memory_keeper")).toBe(true);
    expect(stages.has("progress_observer")).toBe(true);
  });

  it("costs more when the memory size slider is raised", () => {
    // Every GM round resends the whole context, so this is the single
    // biggest lever a player has - the estimate has to reflect it.
    const small = estimateTurnCost({ customMaxContext: 32_000 });
    const large = estimateTurnCost({ customMaxContext: 256_000 });
    expect(large.expectedUsd).toBeGreaterThan(small.expectedUsd);
  });

  it("weights a periodic layer below one call per turn", () => {
    const progress = estimateTurnCost().lines.find(
      (l) => l.stage === "progress_observer",
    )!;
    expect(progress.expectedCalls).toBeLessThan(1);
    expect(progress.expectedCalls).toBeGreaterThan(0);
  });

  it("charges more output for a tier running at higher reasoning effort", () => {
    localStorage.setItem(
      "reasoningTierOverrides",
      JSON.stringify([
        { modelKey: CHEAP_MODEL, reasoningEffort: "none" },
        { modelKey: CHEAP_MODEL, reasoningEffort: "none" },
        { modelKey: CHEAP_MODEL, reasoningEffort: "none" },
        { modelKey: CHEAP_MODEL, reasoningEffort: "none" },
      ]),
    );
    const cheap = estimateTurnCost().lines.find((l) => l.stage === "gm")!;

    localStorage.setItem(
      "reasoningTierOverrides",
      JSON.stringify([
        { modelKey: CHEAP_MODEL, reasoningEffort: "xhigh" },
        { modelKey: CHEAP_MODEL, reasoningEffort: "xhigh" },
        { modelKey: CHEAP_MODEL, reasoningEffort: "xhigh" },
        { modelKey: CHEAP_MODEL, reasoningEffort: "xhigh" },
      ]),
    );
    const thinky = estimateTurnCost().lines.find((l) => l.stage === "gm")!;

    expect(thinky.outputTokens).toBeGreaterThan(cheap.outputTokens);
    expect(thinky.expectedUsd).toBeGreaterThan(cheap.expectedUsd);
  });

  it("follows the model a layer override pins it to", () => {
    localStorage.setItem(
      "memoryKeeperModelOverride",
      JSON.stringify({ modelKey: PRICEY_MODEL, reasoningEffort: "none" }),
    );
    const line = estimateTurnCost().lines.find(
      (l) => l.stage === "memory_keeper",
    )!;
    expect(line.modelName).toBe(AI_MODELS["GLM 5.2"].name);
  });

  it("drops observer lines when every check is disabled", () => {
    const allOff = {
      response_length: { enabled: false, triggersReset: false, sensitivity: 5 },
      player_agency: { enabled: false, triggersReset: false, sensitivity: 5 },
      outcome_narration_mismatch: {
        enabled: false,
        triggersReset: false,
        sensitivity: 5,
      },
      missing_oracle_or_table: {
        enabled: false,
        triggersReset: false,
        sensitivity: 5,
      },
      missing_scene_increment: {
        enabled: false,
        triggersReset: false,
        sensitivity: 5,
      },
      tier_escalation_missed: {
        enabled: false,
        triggersReset: false,
        sensitivity: 5,
      },
    };
    const withObserver = estimateTurnCost();
    const without = estimateTurnCost({ observerSettings: allOff });

    expect(without.lines.some((l) => l.stage === "observer")).toBe(false);
    expect(without.expectedUsd).toBeLessThan(withObserver.expectedUsd);
  });

  it("prefers measured token sizes over its priors once calibrated", () => {
    const uncalibrated = estimateTurnCost().lines.find(
      (l) => l.stage === "memory_keeper",
    )!;
    expect(uncalibrated.calibrated).toBe(false);

    const calibration = {
      memory_keeper: {
        avgPromptTokens: 50_000,
        avgCompletionTokens: 400,
        avgCallsPerTurn: 1,
        samples: 12,
      },
    };
    const calibrated = estimateTurnCost({ calibration }).lines.find(
      (l) => l.stage === "memory_keeper",
    )!;

    expect(calibrated.calibrated).toBe(true);
    expect(calibrated.inputTokens).toBe(50_000);
    expect(calibrated.expectedUsd).toBeGreaterThan(uncalibrated.expectedUsd);
  });

  it("ignores calibration data that hasn't got enough samples yet", () => {
    const calibration = {
      memory_keeper: {
        avgPromptTokens: 50_000,
        avgCompletionTokens: 400,
        avgCallsPerTurn: 1,
        samples: 1,
      },
    };
    const line = estimateTurnCost({ calibration }).lines.find(
      (l) => l.stage === "memory_keeper",
    )!;
    expect(line.calibrated).toBe(false);
  });

  it("warns when an unpriced custom model makes the total a lie", () => {
    const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    localStorage.setItem(
      "customModels",
      JSON.stringify([
        {
          id,
          modelId: "some/model",
          name: "Unpriced",
          contextSize: 128000,
          maxOutputTokens: 8000,
        },
      ]),
    );
    localStorage.setItem("narrationModelOverride", id);

    const estimate = estimateTurnCost();
    expect(estimate.hasUnpricedModels).toBe(true);
    expect(estimate.assumptions.join(" ")).toMatch(/no prices set/i);
  });
});

describe("formatting", () => {
  it("keeps sub-cent turn costs legible instead of rounding them to $0.00", () => {
    expect(formatUsd(0.0023)).toBe("$0.0023");
    expect(formatUsd(0.00004)).toBe("$0.00004");
    expect(formatUsd(0.42)).toBe("$0.420");
    expect(formatUsd(3.5)).toBe("$3.50");
  });

  it("reports nothing spent as a plain $0", () => {
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(NaN)).toBe("$0");
  });

  it("converts a per-turn cost into turns per dollar", () => {
    expect(turnsPerDollar(0.001)).toBe(1000);
    expect(turnsPerDollar(0)).toBeNull();
  });
});
