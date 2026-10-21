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
import {
  SIDE_AGENT_DEFAULT_MODEL_KEY,
  resolveSideCallModel,
  getLayerSubscriptionFallbacks,
} from "@/app/misc/layerSettings";
import { getAvailableModelKeys } from "@/app/misc/ai_prices";
import {
  getClaudeCliStatus,
  resetClaudeCliStatusCache,
  setOnlineSessionActive,
  canRunClaudeCliModel,
  claudeCliBlockReason,
} from "@/app/misc/claudeCliModels";
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
      { slot: "Tier 2", reason: "device", modelKey: SONNET, fallbackModelKey: REASONING_TIERS[2].modelKey },
      { slot: "Narration", reason: "device", modelKey: SONNET, fallbackModelKey: NARRATION_MODEL_KEY },
    ]);
  });

  it("lists a side agent's synced subscription override for the Settings notice", () => {
    localStorage.setItem(
      "memoryKeeperModelOverride",
      JSON.stringify({ modelKey: SONNET, reasoningEffort: "low" }),
    );
    expect(getLayerSubscriptionFallbacks()).toEqual([
      { slot: "Memory Keeper", modelKey: SONNET, reason: "device" },
    ]);
  });

  it("swaps a side agent's synced subscription override for the side-agent default", () => {
    expect(resolveSideCallModel({ modelKey: SONNET, reasoningEffort: "low" })).toEqual({
      model: SIDE_AGENT_DEFAULT_MODEL_KEY,
      reasoningEffort: "none",
    });
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
  it("lists no layer fallbacks", () => {
    localStorage.setItem(
      "memoryKeeperModelOverride",
      JSON.stringify({ modelKey: SONNET, reasoningEffort: "low" }),
    );
    expect(getLayerSubscriptionFallbacks()).toEqual([]);
  });

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
    // Not pointed there (the narration voice and tier 2 are subscription
    // models here, as synced from the desktop): the side-agent default,
    // never a subscription model and never the narration voice, decision 12.
    expect(getEffectiveNarrationModelKey()).toBe(SONNET);
    expect(resolveSideCallModel(null)).toEqual({
      model: SIDE_AGENT_DEFAULT_MODEL_KEY,
      reasoningEffort: "none",
    });
    // Pointed there explicitly: kept.
    expect(resolveSideCallModel({ modelKey: SONNET, reasoningEffort: "low" })).toEqual({
      model: SONNET,
      reasoningEffort: "low",
    });
  });
});

describe("during an online session (decision 29)", () => {
  beforeEach(() => {
    localStorage.setItem(
      "memoryKeeperModelOverride",
      JSON.stringify({ modelKey: SONNET, reasoningEffort: "low" }),
    );
    setOnlineSessionActive(true);
  });

  it("stops a subscription model from running, on the desktop too", () => {
    expect(canRunClaudeCliModel()).toBe(false);
    expect(claudeCliBlockReason()).toBe("online");
  });

  it("uses each slot's default instead of its subscription choice", () => {
    expect(getEffectiveTiers()[2].modelKey).toBe(REASONING_TIERS[2].modelKey);
    expect(getEffectiveNarrationModelKey()).toBe(NARRATION_MODEL_KEY);
  });

  it("tells Settings and the game which slots fell back, and why", () => {
    expect(getSubscriptionFallbacks()).toEqual([
      { slot: "Tier 2", reason: "online", modelKey: SONNET, fallbackModelKey: REASONING_TIERS[2].modelKey },
      { slot: "Narration", reason: "online", modelKey: SONNET, fallbackModelKey: NARRATION_MODEL_KEY },
    ]);
    expect(getLayerSubscriptionFallbacks()).toEqual([
      { slot: "Memory Keeper", modelKey: SONNET, reason: "online" },
    ]);
  });

  it("swaps a side agent's subscription override for the side-agent default", () => {
    expect(resolveSideCallModel({ modelKey: SONNET, reasoningEffort: "low" })).toEqual({
      model: SIDE_AGENT_DEFAULT_MODEL_KEY,
      reasoningEffort: "none",
    });
  });

  it("gives the subscription back when the session ends", () => {
    setOnlineSessionActive(false);
    expect(canRunClaudeCliModel()).toBe(true);
    expect(claudeCliBlockReason()).toBeNull();
    expect(getEffectiveTiers()[2]).toMatchObject({ modelKey: SONNET, reasoningEffort: "high" });
    expect(getEffectiveNarrationModelKey()).toBe(SONNET);
    expect(getSubscriptionFallbacks()).toEqual([]);
    expect(getLayerSubscriptionFallbacks()).toEqual([]);
  });

  it("does not touch a model that never needed the CLI", () => {
    expect(getEffectiveTiers()[0].modelKey).toBe(REASONING_TIERS[0].modelKey);
    expect(getEffectiveTiers()[3].modelKey).toBe(REASONING_TIERS[3].modelKey);
  });
});
