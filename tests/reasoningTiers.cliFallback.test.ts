/**
 * Where a Claude subscription model may run (docs/claude-gm-design.md §4.5,
 * decisions 12 and 16). Tier and narration choices sync between devices, so
 * a desktop choice of "Claude Sonnet (subscription)" reaches a phone, which
 * cannot run the `claude` CLI: there each slot uses its default and Settings
 * lists why. The side agents never land on the subscription by inheritance,
 * only when a layer is pointed there. The pickers offer the models only on a
 * desktop with the CLI signed in, and a request that still gets through off
 * the desktop is refused with a clear message.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@tauri-apps/api/core", async () => (await import("./helpers/fakeClaudeCli")).fakeTauriCore);

import { fakeCli } from "./helpers/fakeClaudeCli";
import {
  REASONING_TIERS,
  NARRATION_MODEL_KEY,
  getEffectiveTiers,
  getEffectiveNarrationModelKey,
  getSubscriptionFallbacks,
} from "@/app/misc/reasoningTiers";
import { resolveSideCallModel } from "@/app/misc/layerSettings";
import { getAvailableModelKeys } from "@/app/misc/ai_prices";
import { getClaudeCliStatus, resetClaudeCliStatusCache } from "@/app/misc/claudeCliModels";
import { generateNonStreaming } from "@/app/misc/providerCall";

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

const SONNET = "Claude Sonnet (subscription)";

beforeEach(() => {
  fakeCli.reset();
  resetClaudeCliStatusCache();
  const storage = new MemoryStorage();
  // As synced from the desktop: tier 2 and the narration voice on the subscription.
  storage.setItem(
    "reasoningTierOverrides",
    JSON.stringify([null, null, { modelKey: SONNET, reasoningEffort: "high" }, null]),
  );
  storage.setItem("narrationModelOverride", SONNET);
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", {
    localStorage: storage,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("on a phone or the web build", () => {
  beforeEach(() => {
    fakeCli.platform = false;
  });

  it("uses each slot's default for a synced subscription model", () => {
    const tiers = getEffectiveTiers();
    expect(tiers[2].modelKey).toBe(REASONING_TIERS[2].modelKey);
    expect(tiers[2].reasoningEffort).toBe(REASONING_TIERS[2].reasoningEffort);
    expect(getEffectiveNarrationModelKey()).toBe(NARRATION_MODEL_KEY);
  });

  it("tells Settings which slots fell back, and to what", () => {
    expect(getSubscriptionFallbacks()).toEqual([
      { slot: "Tier 2", modelKey: SONNET, fallbackModelKey: REASONING_TIERS[2].modelKey },
      { slot: "Narration", modelKey: SONNET, fallbackModelKey: NARRATION_MODEL_KEY },
    ]);
  });

  it("swaps a side agent's synced subscription override for its fallback", () => {
    expect(
      resolveSideCallModel({ modelKey: SONNET, reasoningEffort: "low" }, "Mistral Nemo"),
    ).toEqual({ model: "Mistral Nemo" });
  });

  it("does not offer the subscription models", async () => {
    await getClaudeCliStatus(true);
    expect(getAvailableModelKeys({ openRouterKey: true })).not.toContain(SONNET);
  });

  it("refuses a subscription request that still reaches providerCall", async () => {
    const result = await generateNonStreaming({
      messages: [{ role: "user", content: "hi" }],
      model: SONNET,
    });
    expect(result).toMatchObject({ code: "CLI_UNAVAILABLE", status: 400 });
    expect("error" in result && result.error).toContain("desktop app");
  });
});

describe("in the desktop app", () => {
  it("keeps the subscription choices, with no fallback notice", () => {
    expect(getEffectiveTiers()[2]).toMatchObject({ modelKey: SONNET, reasoningEffort: "high" });
    expect(getEffectiveNarrationModelKey()).toBe(SONNET);
    expect(getSubscriptionFallbacks()).toEqual([]);
  });

  it("offers the subscription models once the CLI reports signed in", async () => {
    expect(getAvailableModelKeys({})).not.toContain(SONNET); // nothing checked yet
    await getClaudeCliStatus();
    expect(getAvailableModelKeys({})).toEqual(
      expect.arrayContaining(["Claude Opus (subscription)", SONNET, "Claude Haiku (subscription)"]),
    );
  });

  it("does not offer them when the CLI is signed out", async () => {
    fakeCli.status = { ...fakeCli.status, loggedIn: false };
    await getClaudeCliStatus(true);
    expect(getAvailableModelKeys({})).not.toContain(SONNET);
  });

  it("runs a side agent on the subscription only when its layer is pointed there", () => {
    // Inherited (the narration or GM model is a subscription model): the
    // default narration model instead, decision 12.
    expect(resolveSideCallModel(null, SONNET)).toEqual({ model: NARRATION_MODEL_KEY });
    // Pointed there explicitly: kept.
    expect(resolveSideCallModel({ modelKey: SONNET, reasoningEffort: "low" }, "Mistral Nemo")).toEqual({
      model: SONNET,
      reasoningEffort: "low",
    });
    // An ordinary fallback is untouched.
    expect(resolveSideCallModel(null, "Mistral Nemo")).toEqual({ model: "Mistral Nemo" });
  });
});
