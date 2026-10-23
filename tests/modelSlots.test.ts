/**
 * The model slots (decisions 118-124): Settings shows Default and Advanced
 * over the engine's four tiers. These pin the storage half - what a slot
 * writes and reads from the four-entry `reasoningTierOverrides` array, how
 * Mixed is detected, combat's effort floor, and skipping identical tiers -
 * plus how the turn-cost estimate prices the classifier.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@tauri-apps/api/core", async () => (await import("./helpers/fakeClaudeCli")).fakeTauriCore);

import { fakeCli } from "./helpers/fakeClaudeCli";
import {
  REASONING_TIERS,
  REASONING_CONFIG_CHANGED_EVENT,
  SLOT_TIERS,
  atLeastEffort,
  getDefaultSlotMix,
  getEffectiveSlot,
  getEffectiveTiers,
  getSlotOverride,
  nextDistinctTier,
  setSlotOverride,
  slotForTier,
} from "@/app/misc/reasoningTiers";
import type { ReasoningTier } from "@/app/misc/reasoningTiers";
import { resetClaudeCliStatusCache, setOnlineSessionActive } from "@/app/misc/claudeCliModels";
import { estimateTurnCost } from "@/app/misc/turnCostEstimate";
import type { ProviderKeys } from "@/app/misc/sideModelCall";

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
}

const KEY = "reasoningTierOverrides";
const SONNET_SUBSCRIPTION = "Claude Sonnet (subscription)";
const CUSTOM_MODEL_UUID = "123e4567-e89b-42d3-a456-426614174000";
let dispatchEvent: ReturnType<typeof vi.fn>;

const stored = (): unknown[] => JSON.parse(localStorage.getItem(KEY)!);

beforeEach(() => {
  fakeCli.reset();
  resetClaudeCliStatusCache();
  setOnlineSessionActive(false);
  const storage = new MemoryStorage();
  dispatchEvent = vi.fn();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", {
    localStorage: storage,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent,
  });
});

afterEach(() => {
  setOnlineSessionActive(false);
  vi.unstubAllGlobals();
});

describe("setSlotOverride", () => {
  it("writes Default into tiers 0, 1 and 2 and leaves tier 3 alone", () => {
    const advanced = { modelKey: "Claude Opus 5.5", reasoningEffort: "high" };
    localStorage.setItem(KEY, JSON.stringify([null, null, null, advanced]));
    setSlotOverride("default", { modelKey: "Grok 4.5", reasoningEffort: "low" });
    const grok = { modelKey: "Grok 4.5", reasoningEffort: "low" };
    expect(stored()).toEqual([grok, grok, grok, advanced]);
  });

  it("writes Advanced into tier 3 only", () => {
    const def = { modelKey: "Grok 4.5", reasoningEffort: "low" };
    localStorage.setItem(KEY, JSON.stringify([def, def, def, null]));
    setSlotOverride("advanced", { modelKey: "Claude Opus 5.5", reasoningEffort: "xhigh" });
    expect(stored()).toEqual([def, def, def, { modelKey: "Claude Opus 5.5", reasoningEffort: "xhigh" }]);
  });

  it("starts from nothing stored, padding to four entries", () => {
    setSlotOverride("advanced", { modelKey: "Claude Opus 5.5", reasoningEffort: "high" });
    expect(stored()).toEqual([null, null, null, { modelKey: "Claude Opus 5.5", reasoningEffort: "high" }]);
    localStorage.setItem(KEY, JSON.stringify([{ modelKey: "Grok 4.5", reasoningEffort: "low" }]));
    setSlotOverride("advanced", null);
    expect(stored()).toEqual([{ modelKey: "Grok 4.5", reasoningEffort: "low" }, null, null, null]);
  });

  it("clears a slot with null", () => {
    setSlotOverride("default", { modelKey: "Grok 4.5", reasoningEffort: "low" });
    setSlotOverride("default", null);
    expect(stored()).toEqual([null, null, null, null]);
    expect(getSlotOverride("default")).toBeNull();
  });

  it("keeps an entry whose model this build does not know, byte for byte, when the other slot is edited", () => {
    const future = { modelKey: "Future Model 9", reasoningEffort: "high", extra: "kept" };
    // Unknown in Advanced, edit Default...
    localStorage.setItem(KEY, JSON.stringify([null, null, null, future]));
    setSlotOverride("default", { modelKey: "Grok 4.5", reasoningEffort: "low" });
    expect(stored()[3]).toEqual(future);
    expect(JSON.stringify(stored()[3])).toBe(JSON.stringify(future));
    // ...and unknown in Default's tiers, edit Advanced.
    localStorage.setItem(KEY, JSON.stringify([future, future, null, null]));
    setSlotOverride("advanced", { modelKey: "Claude Opus 5.5", reasoningEffort: "high" });
    const after = stored();
    expect(JSON.stringify(after[0])).toBe(JSON.stringify(future));
    expect(JSON.stringify(after[1])).toBe(JSON.stringify(future));
    expect(after[2]).toBeNull();
  });

  it("treats malformed JSON as four unset entries", () => {
    localStorage.setItem(KEY, "{not json");
    setSlotOverride("advanced", { modelKey: "Claude Opus 5.5", reasoningEffort: "high" });
    expect(stored()).toEqual([null, null, null, { modelKey: "Claude Opus 5.5", reasoningEffort: "high" }]);
    localStorage.setItem(KEY, JSON.stringify({ not: "an array" }));
    setSlotOverride("default", null);
    expect(stored()).toEqual([null, null, null, null]);
  });

  it("makes one write and fires one change event", () => {
    const setItem = vi.spyOn(localStorage, "setItem");
    setSlotOverride("default", { modelKey: "Grok 4.5", reasoningEffort: "low" });
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect((dispatchEvent.mock.calls[0][0] as Event).type).toBe(REASONING_CONFIG_CHANGED_EVENT);
  });
});

describe("reading a slot", () => {
  it("Default is tier 1 and only tier 1", () => {
    const a = { modelKey: "Grok 4.5", reasoningEffort: "low" };
    const b = { modelKey: "Claude Opus 5.5", reasoningEffort: "high" };
    localStorage.setItem(KEY, JSON.stringify([a, b, a, null]));
    expect(getSlotOverride("default")).toEqual(b);
    expect(getEffectiveSlot("default")).toEqual({ modelKey: "Claude Opus 5.5", reasoningEffort: "high" });
    // Tier 1 unset: neither tier 0's nor tier 2's choice stands in for it.
    localStorage.setItem(KEY, JSON.stringify([a, null, a, null]));
    expect(getSlotOverride("default")).toBeNull();
    expect(getEffectiveSlot("default")).toEqual({
      modelKey: REASONING_TIERS[1].modelKey,
      reasoningEffort: REASONING_TIERS[1].reasoningEffort,
    });
  });

  it("Advanced is tier 3", () => {
    expect(getSlotOverride("advanced")).toBeNull();
    expect(getEffectiveSlot("advanced")).toEqual({ modelKey: "Claude Sonnet 5.5", reasoningEffort: "xhigh" });
    setSlotOverride("advanced", { modelKey: "Claude Opus 5.5", reasoningEffort: "high" });
    expect(getSlotOverride("advanced")).toEqual({ modelKey: "Claude Opus 5.5", reasoningEffort: "high" });
    expect(getEffectiveSlot("advanced")).toEqual({ modelKey: "Claude Opus 5.5", reasoningEffort: "high" });
  });

  it("skips a subscription model this device cannot run", () => {
    setSlotOverride("default", { modelKey: SONNET_SUBSCRIPTION, reasoningEffort: "high" });
    expect(getEffectiveSlot("default").modelKey).toBe(SONNET_SUBSCRIPTION);
    fakeCli.platform = false;
    expect(getEffectiveSlot("default")).toEqual({
      modelKey: REASONING_TIERS[1].modelKey,
      reasoningEffort: REASONING_TIERS[1].reasoningEffort,
    });
    // The saved choice itself is still there for Settings to show.
    expect(getSlotOverride("default")?.modelKey).toBe(SONNET_SUBSCRIPTION);
  });

  it("maps tiers to slots", () => {
    expect([0, 1, 2, 3].map(slotForTier)).toEqual(["default", "default", "default", "advanced"]);
    expect(SLOT_TIERS).toEqual({ default: [0, 1, 2], advanced: [3] });
  });
});

describe("getDefaultSlotMix", () => {
  it("is empty on a fresh profile, even though tier 2 ships at high", () => {
    expect(getDefaultSlotMix()).toEqual([]);
  });

  it("is empty after one Default write", () => {
    setSlotOverride("default", { modelKey: "Grok 4.5", reasoningEffort: "none" });
    expect(getDefaultSlotMix()).toEqual([]);
  });

  it("lists the tiers an older build left different (Haiku in 0, a custom model in 2)", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        { modelKey: "Claude Haiku 5.5", reasoningEffort: "none" },
        null,
        { modelKey: CUSTOM_MODEL_UUID, reasoningEffort: "low" },
        null,
      ]),
    );
    expect(getDefaultSlotMix()).toEqual([
      { tier: 0, modelKey: "Claude Haiku 5.5", reasoningEffort: "none" },
      // Tier 2 reports the effort it runs at, with combat's floor.
      { tier: 2, modelKey: CUSTOM_MODEL_UUID, reasoningEffort: "high" },
    ]);
  });

  it("lists a tier left on the shipped model when tier 1 was saved", () => {
    localStorage.setItem(KEY, JSON.stringify([null, { modelKey: "Grok 4.5", reasoningEffort: "low" }, null, null]));
    expect(getDefaultSlotMix().map((m) => [m.tier, m.modelKey])).toEqual([
      [0, REASONING_TIERS[0].modelKey],
      [2, REASONING_TIERS[2].modelKey],
    ]);
  });
});

describe("combat's effort floor (decision 123)", () => {
  it("orders efforts cheapest first", () => {
    expect(atLeastEffort("none", "high")).toBe("high");
    expect(atLeastEffort("normal", "high")).toBe("high");
    expect(atLeastEffort("high", "high")).toBe("high");
    expect(atLeastEffort("xhigh", "high")).toBe("xhigh");
  });

  it("runs tier 2 at high with Default at none, and the other tiers as saved", () => {
    setSlotOverride("default", { modelKey: "GLM 5.3", reasoningEffort: "none" });
    expect(getEffectiveTiers().map((t) => t.reasoningEffort)).toEqual(["none", "none", "high", "xhigh"]);
  });

  it("runs tier 2 at xhigh with Default at xhigh", () => {
    setSlotOverride("default", { modelKey: "GLM 5.3", reasoningEffort: "xhigh" });
    expect(getEffectiveTiers().map((t) => t.reasoningEffort)).toEqual(["xhigh", "xhigh", "xhigh", "xhigh"]);
  });

  it("applies on a fresh profile too, and to a different Default model", () => {
    expect(getEffectiveTiers()[2].reasoningEffort).toBe("high");
    setSlotOverride("default", { modelKey: "Grok 4.5", reasoningEffort: "low" });
    expect(getEffectiveTiers()[2]).toMatchObject({ modelKey: "Grok 4.5", reasoningEffort: "high" });
  });

  it("does not touch Default's own effort, which narration reads", () => {
    setSlotOverride("default", { modelKey: "GLM 5.3", reasoningEffort: "low" });
    expect(getEffectiveSlot("default").reasoningEffort).toBe("low");
  });
});

describe("nextDistinctTier", () => {
  it("on the shipped ladder: up from 0 is 2, down from 1 is null, up from 2 is 3", () => {
    const tiers = getEffectiveTiers();
    expect(nextDistinctTier(0, "up", tiers)).toBe(2);
    expect(nextDistinctTier(1, "up", tiers)).toBe(2);
    expect(nextDistinctTier(2, "up", tiers)).toBe(3);
    expect(nextDistinctTier(1, "down", tiers)).toBeNull();
    expect(nextDistinctTier(0, "down", tiers)).toBeNull();
    // Tier 1 differs from tier 2 by effort alone, so that counts.
    expect(nextDistinctTier(2, "down", tiers)).toBe(1);
    expect(nextDistinctTier(3, "down", tiers)).toBe(2);
    expect(nextDistinctTier(3, "up", tiers)).toBeNull();
  });

  it("with Default at xhigh everywhere, up from 1 is 3 (tier 2 is the same call)", () => {
    setSlotOverride("default", { modelKey: "GLM 5.3", reasoningEffort: "xhigh" });
    const tiers = getEffectiveTiers();
    expect(nextDistinctTier(1, "up", tiers)).toBe(3);
    expect(nextDistinctTier(0, "up", tiers)).toBe(3);
    expect(nextDistinctTier(1, "down", tiers)).toBeNull();
    expect(nextDistinctTier(3, "down", tiers)).toBe(2);
  });

  it("returns null when every tier above is the same call", () => {
    const same = { modelKey: "Claude Sonnet 5.5", reasoningEffort: "xhigh" };
    localStorage.setItem(KEY, JSON.stringify([same, same, same, null]));
    expect(nextDistinctTier(1, "up", getEffectiveTiers())).toBeNull();
  });

  it("returns null for a tier that does not exist", () => {
    expect(nextDistinctTier(9, "up", getEffectiveTiers())).toBeNull();
  });

  it("compares model and effort, not the note", () => {
    const a: ReasoningTier = { modelKey: "m", reasoningEffort: "none", note: "a" };
    const b: ReasoningTier = { modelKey: "m", reasoningEffort: "none", note: "b" };
    const c: ReasoningTier = { modelKey: "m", reasoningEffort: "low", note: "b" };
    expect(nextDistinctTier(0, "up", [a, b, c])).toBe(2);
  });
});

describe("the turn-cost estimate prices the classifier as generation.ts runs it", () => {
  const classifierLine = (keys?: ProviderKeys) =>
    estimateTurnCost({ providerKeys: keys }).lines.find((l) => l.stage === "classifier");

  it("on the side-agent model, at its effort", () => {
    setSlotOverride("default", { modelKey: "Grok 4.5", reasoningEffort: "high" });
    expect(classifierLine()).toMatchObject({ modelKey: "Claude Haiku 5.5", reasoningEffort: "none" });
    expect(classifierLine({ openRouterKey: "k" })).toMatchObject({
      modelKey: "Claude Haiku 5.5",
      reasoningEffort: "none",
    });
  });

  it("on Default when the player has no key for the side-agent model", () => {
    setSlotOverride("default", { modelKey: "Grok 4.5", reasoningEffort: "low" });
    expect(classifierLine({ mistralKey: "m" })).toMatchObject({
      modelKey: "Grok 4.5",
      reasoningEffort: "low",
    });
  });
});
