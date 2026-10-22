/**
 * The "Balanced" defaults the author chose on 2026-10-21 (docs/decisions.md,
 * decisions 50 and 51):
 *
 *  - the reasoning ladder starts on Claude Haiku 5.5 (tiers 0 and 1), GLM 5.3
 *    (tier 2) and Claude Sonnet 5.5 (tier 3), with the narration voice on
 *    GLM 5.3, all through OpenRouter;
 *  - an unpinned side agent runs on its own default, Claude Haiku 5.5, no
 *    matter what the narration voice or the GM's tier model is - unless the
 *    player has no key for that default's provider, when it runs on the
 *    narration voice instead (added after the engine review of 2026-10-21).
 *
 * What these pin is the part that can quietly go wrong: that a default is a
 * real catalog key (an unknown one is swapped for DeepSeek V4 Flash, which
 * needs a different key), that the efforts reach OpenRouter in a form the
 * models accept, and that no path hands a side agent the narration model, the
 * GM's model or a Claude subscription model by inheritance.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@tauri-apps/api/core", async () => (await import("./helpers/fakeClaudeCli")).fakeTauriCore);

import { fakeCli } from "./helpers/fakeClaudeCli";
import { AI_MODELS, getModelConfig, hasKeyForModel, isKnownModelKey } from "@/app/misc/ai_prices";
import {
  REASONING_TIERS,
  NARRATION_MODEL_KEY,
  getEffectiveTiers,
  getEffectiveNarrationModelKey,
  getEffectiveNarrationEffort,
  resolveTier,
} from "@/app/misc/reasoningTiers";
import {
  SIDE_AGENT_DEFAULT_MODEL_KEY,
  getObserverModelOverride,
  getMemoryKeeperModelOverride,
  getReflectionModelOverride,
  getDirectorAssistantModelOverride,
  getStoryProgressObserverModelOverride,
  resolveSideCallModel,
  resolveObserverRewriteModel,
} from "@/app/misc/layerSettings";
import {
  isClaudeCliModel,
  resetClaudeCliStatusCache,
  setOnlineSessionActive,
} from "@/app/misc/claudeCliModels";
import { generateNonStreaming, isAnthropicViaOpenRouter } from "@/app/misc/providerCall";
import { estimateTurnCost } from "@/app/misc/turnCostEstimate";

const SONNET_SUBSCRIPTION = "Claude Sonnet (subscription)";

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

/** Every layer's saved-override key and the getter that reads it. */
const SIDE_AGENT_LAYERS: [string, string, () => ReturnType<typeof getObserverModelOverride>][] = [
  ["Observer", "observerModelOverride", getObserverModelOverride],
  ["Memory Keeper", "memoryKeeperModelOverride", getMemoryKeeperModelOverride],
  ["Reflection", "reflectionModelOverride", getReflectionModelOverride],
  ["Director Assistant", "directorAssistantModelOverride", getDirectorAssistantModelOverride],
  [
    "Story Progress Observer",
    "storyProgressObserverModelOverride",
    getStoryProgressObserverModelOverride,
  ],
];

beforeEach(() => {
  fakeCli.reset();
  resetClaudeCliStatusCache();
  setOnlineSessionActive(false);
  const storage = new MemoryStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", {
    localStorage: storage,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
});

afterEach(() => {
  setOnlineSessionActive(false);
  vi.unstubAllGlobals();
});

describe("the default ladder (decision 50)", () => {
  it("is Haiku, Haiku, GLM 5.3, Sonnet at the efforts the ladder always had", () => {
    expect(REASONING_TIERS.map((t) => [t.modelKey, t.reasoningEffort])).toEqual([
      ["Claude Haiku 5.5", "none"],
      ["Claude Haiku 5.5", "none"],
      ["GLM 5.3", "high"],
      ["Claude Sonnet 5.5", "xhigh"],
    ]);
  });

  it("narrates on GLM 5.3", () => {
    expect(NARRATION_MODEL_KEY).toBe("GLM 5.3");
  });

  it("resolves from a fresh profile with nothing saved", () => {
    expect(getEffectiveTiers().map((t) => t.modelKey)).toEqual(
      REASONING_TIERS.map((t) => t.modelKey),
    );
    expect(getEffectiveNarrationModelKey()).toBe("GLM 5.3");
    expect(resolveTier(0).modelKey).toBe("Claude Haiku 5.5");
    expect(resolveTier(2)).toMatchObject({ modelKey: "GLM 5.3", reasoningEffort: "high" });
    expect(resolveTier(3)).toMatchObject({ modelKey: "Claude Sonnet 5.5", reasoningEffort: "xhigh" });
  });

  it("only names real catalog keys, so none is swapped for DeepSeek V4 Flash", () => {
    for (const key of [...REASONING_TIERS.map((t) => String(t.modelKey)), NARRATION_MODEL_KEY]) {
      expect(isKnownModelKey(key), key).toBe(true);
      expect(getModelConfig(key).name, key).toBe(key);
    }
  });

  it("is all OpenRouter, so one OpenRouter key runs it, and every tier can call tools", () => {
    for (const tier of REASONING_TIERS) {
      const config = getModelConfig(String(tier.modelKey));
      expect(config.provider, String(tier.modelKey)).toBe("openrouter");
      expect(config.supportsToolCalling, String(tier.modelKey)).toBe(true);
    }
    expect(getModelConfig(NARRATION_MODEL_KEY).provider).toBe("openrouter");
  });

  it("uses the OpenRouter GLM 5.3, not the Z.ai one", () => {
    expect(AI_MODELS["GLM 5.3"].provider).toBe("openrouter");
    expect(AI_MODELS["GLM 5.3"].model).toBe("z-ai/glm-5.3");
    expect(REASONING_TIERS.map((t) => String(t.modelKey))).not.toContain("GLM 5.3 (Z.ai)");
    expect(String(NARRATION_MODEL_KEY)).not.toContain("Z.ai");
  });

  it("leaves a player's saved tier and narration overrides alone", () => {
    localStorage.setItem(
      "reasoningTierOverrides",
      JSON.stringify([null, null, { modelKey: "Grok 4.5", reasoningEffort: "high" }, null]),
    );
    localStorage.setItem("narrationModelOverride", "Mistral Small 4");
    expect(getEffectiveTiers()[2].modelKey).toBe("Grok 4.5");
    expect(getEffectiveTiers()[3].modelKey).toBe("Claude Sonnet 5.5");
    expect(getEffectiveNarrationModelKey()).toBe("Mistral Small 4");
  });
});

describe("the default efforts reach OpenRouter in a form each model accepts", () => {
  // The web path: with the desktop shell faked, requests would go through
  // Tauri's HTTP plugin instead of the stubbed global fetch.
  beforeEach(() => {
    fakeCli.platform = false;
  });

  const MESSAGES = [{ role: "user" as const, content: "hello" }];
  const RESPONSE = {
    choices: [{ index: 0, message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };

  async function sentBody(model: string, reasoningEffort?: string, maxTokens = 8000) {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => RESPONSE,
      text: async () => JSON.stringify(RESPONSE),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await generateNonStreaming({
      messages: MESSAGES,
      model,
      openRouterKey: "test-key",
      reasoningEffort,
      maxTokens,
    });
    expect("error" in result, JSON.stringify(result)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    return JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
  }

  it("tiers 0 and 1: Haiku's effort none goes out as low, never the 400-ing none", async () => {
    for (const tier of [REASONING_TIERS[0], REASONING_TIERS[1]]) {
      const body = await sentBody(String(tier.modelKey), tier.reasoningEffort);
      expect(body.model).toBe("anthropic/claude-haiku-5.5");
      expect(body.reasoning).toEqual({ effort: "low" });
    }
  });

  it("tier 2: GLM 5.3 gets high, as OpenRouter's high", async () => {
    const tier = REASONING_TIERS[2];
    const body = await sentBody(String(tier.modelKey), tier.reasoningEffort);
    expect(body.model).toBe("z-ai/glm-5.3");
    expect(body.reasoning).toEqual({ effort: "high" });
  });

  it("tier 3: Sonnet gets xhigh, as OpenRouter's xhigh", async () => {
    const tier = REASONING_TIERS[3];
    const body = await sentBody(String(tier.modelKey), tier.reasoningEffort);
    expect(body.model).toBe("anthropic/claude-sonnet-5.5");
    expect(body.reasoning).toEqual({ effort: "xhigh" });
  });

  it("the narration model, with no effort of its own, is never sent effort none", async () => {
    const body = await sentBody(NARRATION_MODEL_KEY, undefined);
    expect(body.reasoning).toEqual({ effort: "low" });
  });

  it("the side-agent default is a Claude-via-OpenRouter model, so a short verdict gets room to think", async () => {
    const config = getModelConfig(SIDE_AGENT_DEFAULT_MODEL_KEY);
    expect(isAnthropicViaOpenRouter(config)).toBe(true);
    const body = await sentBody(SIDE_AGENT_DEFAULT_MODEL_KEY, undefined, 200);
    expect(body.max_tokens).toBe(4096);
  });

  it("an unpinned side call on Haiku thinks at low, not at Claude's own default", async () => {
    const body = await sentBody(SIDE_AGENT_DEFAULT_MODEL_KEY, undefined);
    expect(body.reasoning).toEqual({ effort: "low" });
  });
});

describe("an unpinned side agent runs on Claude Haiku 5.5 (decision 51)", () => {
  it("is the OpenRouter Haiku, named by a constant", () => {
    expect(SIDE_AGENT_DEFAULT_MODEL_KEY).toBe("Claude Haiku 5.5");
    expect(isKnownModelKey(SIDE_AGENT_DEFAULT_MODEL_KEY)).toBe(true);
    expect(getModelConfig(SIDE_AGENT_DEFAULT_MODEL_KEY).provider).toBe("openrouter");
    expect(getModelConfig(SIDE_AGENT_DEFAULT_MODEL_KEY).model).toBe("anthropic/claude-haiku-5.5");
    expect(isClaudeCliModel(SIDE_AGENT_DEFAULT_MODEL_KEY)).toBe(false);
  });

  it("resolves a layer with no pin to it, at effort none (decision 53)", () => {
    for (const [name, , read] of SIDE_AGENT_LAYERS) {
      expect(read(), name).toBeNull();
      expect(resolveSideCallModel(read()), name).toEqual({ model: "Claude Haiku 5.5", reasoningEffort: "none" });
    }
    expect(resolveSideCallModel(null)).toEqual({ model: "Claude Haiku 5.5", reasoningEffort: "none" });
  });

  it("does not follow the narration voice", () => {
    localStorage.setItem("narrationModelOverride", "Ministral 3 8B");
    expect(getEffectiveNarrationModelKey()).toBe("Ministral 3 8B");
    expect(resolveSideCallModel(null).model).toBe("Claude Haiku 5.5");
    expect(NARRATION_MODEL_KEY).not.toBe(resolveSideCallModel(null).model);
  });

  it("does not follow the GM's tier model", () => {
    localStorage.setItem(
      "reasoningTierOverrides",
      JSON.stringify(REASONING_TIERS.map(() => ({ modelKey: "Ministral 3 8B", reasoningEffort: "none" }))),
    );
    expect(getEffectiveTiers().every((t) => t.modelKey === "Ministral 3 8B")).toBe(true);
    expect(resolveSideCallModel(null).model).toBe("Claude Haiku 5.5");
  });

  it("is what the turn cost estimate prices every side agent at, and the narrator (and the rewrite) at GLM 5.3", () => {
    const lines = estimateTurnCost().lines;
    const modelOf = (stage: string) => lines.find((l) => l.stage === stage)?.modelKey;
    for (const stage of [
      "observer",
      "memory_keeper",
      "director",
      "progress_observer",
      "reflection",
    ]) {
      expect(modelOf(stage), stage).toBe("Claude Haiku 5.5");
    }
    expect(modelOf("narration")).toBe("GLM 5.3");
    expect(modelOf("choices")).toBe("GLM 5.3");
    expect(modelOf("observer_rewrite")).toBe("GLM 5.3");
  });

  it("prices the Reflection line at the Reflection pin, not at the Memory Keeper's", () => {
    // generation.ts resolves Reflection through getReflectionModelOverride(),
    // so the estimate has to as well: pinning the two layers differently must
    // show up on their own lines.
    localStorage.setItem(
      "memoryKeeperModelOverride",
      JSON.stringify({ modelKey: "Claude Sonnet 5.5", reasoningEffort: "high" }),
    );
    localStorage.setItem(
      "reflectionModelOverride",
      JSON.stringify({ modelKey: "Mistral Small 4", reasoningEffort: "low" }),
    );
    const lines = estimateTurnCost().lines;
    const line = (stage: string) => lines.find((l) => l.stage === stage);
    expect(line("memory_keeper")).toMatchObject({ modelKey: "Claude Sonnet 5.5", reasoningEffort: "high" });
    expect(line("reflection")).toMatchObject({ modelKey: "Mistral Small 4", reasoningEffort: "low" });
    expect(line("reflection")?.provider).toBe("mistral");
  });

  it("prices an unpinned Reflection at the side-agent default even when the Memory Keeper is pinned", () => {
    localStorage.setItem(
      "memoryKeeperModelOverride",
      JSON.stringify({ modelKey: "Claude Sonnet 5.5", reasoningEffort: "high" }),
    );
    const lines = estimateTurnCost().lines;
    expect(lines.find((l) => l.stage === "reflection")).toMatchObject({
      modelKey: "Claude Haiku 5.5",
      reasoningEffort: "none",
    });
  });

  it("keeps a layer's pin, model and effort", () => {
    for (const [name, storageKey, read] of SIDE_AGENT_LAYERS) {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ modelKey: "Mistral Medium 3.5", reasoningEffort: "low" }),
      );
      expect(resolveSideCallModel(read()), name).toEqual({
        model: "Mistral Medium 3.5",
        reasoningEffort: "low",
      });
    }
  });

  it("pins one layer without moving the others", () => {
    localStorage.setItem(
      "memoryKeeperModelOverride",
      JSON.stringify({ modelKey: "Claude Sonnet 5.5", reasoningEffort: "high" }),
    );
    expect(resolveSideCallModel(getMemoryKeeperModelOverride()).model).toBe("Claude Sonnet 5.5");
    expect(resolveSideCallModel(getObserverModelOverride()).model).toBe("Claude Haiku 5.5");
    expect(resolveSideCallModel(getReflectionModelOverride()).model).toBe("Claude Haiku 5.5");
  });

  it("lands a stale saved key on Haiku, not on the narration model", () => {
    // Keys the catalog dropped (a shut-down model, one synced from a newer
    // build) read as unset. With the narration voice moved off its default,
    // landing on it would show.
    localStorage.setItem("narrationModelOverride", "Ministral 3 8B");
    for (const [name, storageKey, read] of SIDE_AGENT_LAYERS) {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ modelKey: "Grok Code Fast 1", reasoningEffort: "low" }),
      );
      expect(read(), name).toBeNull();
      expect(resolveSideCallModel(read()), name).toEqual({ model: "Claude Haiku 5.5", reasoningEffort: "none" });
    }
  });
});

describe("an unpinned side agent never reaches the Claude subscription (decisions 12, 16 and 29)", () => {
  /** As synced from the desktop: every tier and the narration voice on the subscription. */
  function everythingOnTheSubscription() {
    localStorage.setItem(
      "reasoningTierOverrides",
      JSON.stringify(REASONING_TIERS.map(() => ({ modelKey: SONNET_SUBSCRIPTION, reasoningEffort: "high" }))),
    );
    localStorage.setItem("narrationModelOverride", SONNET_SUBSCRIPTION);
  }

  it("in the desktop app, where the narration voice and the GM really are the subscription", () => {
    everythingOnTheSubscription();
    expect(isClaudeCliModel(String(getEffectiveNarrationModelKey()))).toBe(true);
    expect(isClaudeCliModel(String(getEffectiveTiers()[2].modelKey))).toBe(true);

    for (const [name, , read] of SIDE_AGENT_LAYERS) {
      const resolved = resolveSideCallModel(read());
      expect(resolved, name).toEqual({ model: "Claude Haiku 5.5", reasoningEffort: "none" });
      expect(isClaudeCliModel(resolved.model), name).toBe(false);
    }
  });

  it("on a phone or the web build", () => {
    fakeCli.platform = false;
    everythingOnTheSubscription();
    expect(resolveSideCallModel(null)).toEqual({ model: "Claude Haiku 5.5", reasoningEffort: "none" });
  });

  it("during an online session", () => {
    everythingOnTheSubscription();
    setOnlineSessionActive(true);
    expect(resolveSideCallModel(null)).toEqual({ model: "Claude Haiku 5.5", reasoningEffort: "none" });
  });

  it("falls a subscription pin this device cannot run to Haiku, not to the narration model", () => {
    fakeCli.platform = false;
    localStorage.setItem("narrationModelOverride", "Ministral 3 8B");
    localStorage.setItem(
      "observerModelOverride",
      JSON.stringify({ modelKey: SONNET_SUBSCRIPTION, reasoningEffort: "low" }),
    );
    expect(resolveSideCallModel(getObserverModelOverride())).toEqual({ model: "Claude Haiku 5.5", reasoningEffort: "none" });

    fakeCli.platform = true;
    setOnlineSessionActive(true);
    expect(resolveSideCallModel(getObserverModelOverride())).toEqual({ model: "Claude Haiku 5.5", reasoningEffort: "none" });
  });

  it("still lets a layer the player pointed at the subscription run there on the desktop", () => {
    localStorage.setItem(
      "observerModelOverride",
      JSON.stringify({ modelKey: SONNET_SUBSCRIPTION, reasoningEffort: "low" }),
    );
    expect(resolveSideCallModel(getObserverModelOverride())).toEqual({
      model: SONNET_SUBSCRIPTION,
      reasoningEffort: "low",
    });
  });
});

describe("the Observer's rewrite follows the narration voice, not the judges (decision 52)", () => {
  it("runs an unpinned Observer's rewrite on the narration model, at the narration effort (decision 53)", () => {
    expect(
      resolveObserverRewriteModel(
        getObserverModelOverride(),
        String(getEffectiveNarrationModelKey()),
        getEffectiveNarrationEffort(),
      ),
    ).toEqual({ model: "GLM 5.3", reasoningEffort: "none" });
    // ...and takes the effort the player set for the voice with it (decision 53).
    localStorage.setItem("narrationEffortOverride", "high");
    expect(
      resolveObserverRewriteModel(
        getObserverModelOverride(),
        String(getEffectiveNarrationModelKey()),
        getEffectiveNarrationEffort(),
      ),
    ).toEqual({ model: "GLM 5.3", reasoningEffort: "high" });
    // ...while its judges stay on the side-agent default.
    expect(resolveSideCallModel(getObserverModelOverride())).toEqual({ model: "Claude Haiku 5.5", reasoningEffort: "none" });
  });

  it("follows a narration voice the player picked", () => {
    localStorage.setItem("narrationModelOverride", "Ministral 3 8B");
    expect(
      resolveObserverRewriteModel(null, String(getEffectiveNarrationModelKey()), getEffectiveNarrationEffort()),
    ).toEqual({ model: "Ministral 3 8B", reasoningEffort: "none" });
  });

  it("takes a pinned Observer's model and effort with it", () => {
    localStorage.setItem(
      "observerModelOverride",
      JSON.stringify({ modelKey: "Mistral Medium 3.5", reasoningEffort: "low" }),
    );
    // A pin keeps its own effort, whatever the narration voice is set to.
    expect(resolveObserverRewriteModel(getObserverModelOverride(), "GLM 5.3", "high")).toEqual({
      model: "Mistral Medium 3.5",
      reasoningEffort: "low",
    });
  });

  it("falls a subscription pin this device cannot run, or a stale pin, to the narration voice", () => {
    fakeCli.platform = false;
    localStorage.setItem(
      "observerModelOverride",
      JSON.stringify({ modelKey: SONNET_SUBSCRIPTION, reasoningEffort: "low" }),
    );
    expect(resolveObserverRewriteModel(getObserverModelOverride(), "GLM 5.3", "high")).toEqual({
      model: "GLM 5.3",
      reasoningEffort: "high",
    });

    localStorage.setItem(
      "observerModelOverride",
      JSON.stringify({ modelKey: "Grok Code Fast 1", reasoningEffort: "low" }),
    );
    expect(resolveObserverRewriteModel(getObserverModelOverride(), "GLM 5.3", "high")).toEqual({
      model: "GLM 5.3",
      reasoningEffort: "high",
    });
  });
});

describe("a side agent without a key for the default falls to the narration voice (decision 51)", () => {
  const OPENROUTER = { openRouterKey: "or-key" };
  const MISTRAL_ONLY = { mistralKey: "mistral-key" };
  const MISTRAL_NARRATOR = "Mistral Small 4";
  const CUSTOM_MODEL_UUID = "123e4567-e89b-42d3-a456-426614174000";

  const pin = (storageKey: string, modelKey: string) =>
    localStorage.setItem(storageKey, JSON.stringify({ modelKey, reasoningEffort: "low" }));

  it("hasKeyForModel maps a model to its provider's key, a custom UUID to OpenRouter, and the subscription to none", () => {
    expect(hasKeyForModel("Claude Haiku 5.5", OPENROUTER)).toBe(true);
    expect(hasKeyForModel("Claude Haiku 5.5", MISTRAL_ONLY)).toBe(false);
    expect(hasKeyForModel(MISTRAL_NARRATOR, MISTRAL_ONLY)).toBe(true);
    expect(hasKeyForModel(MISTRAL_NARRATOR, OPENROUTER)).toBe(false);
    expect(hasKeyForModel("GLM 5.3 (Z.ai)", { zaiKey: "z" })).toBe(true);
    expect(hasKeyForModel("GLM 5.3", { zaiKey: "z" })).toBe(false);
    expect(hasKeyForModel(CUSTOM_MODEL_UUID, OPENROUTER)).toBe(true);
    expect(hasKeyForModel(CUSTOM_MODEL_UUID, MISTRAL_ONLY)).toBe(false);
    expect(hasKeyForModel(SONNET_SUBSCRIPTION, { ...OPENROUTER, ...MISTRAL_ONLY })).toBe(false);
    expect(hasKeyForModel("Grok Code Fast 1", { ...OPENROUTER, ...MISTRAL_ONLY })).toBe(false);
    expect(hasKeyForModel("Claude Haiku 5.5", { openRouterKey: "" })).toBe(false);
  });

  it("keeps Haiku when the player has an OpenRouter key, whatever the narration voice is", () => {
    localStorage.setItem("narrationModelOverride", MISTRAL_NARRATOR);
    expect(resolveSideCallModel(null, OPENROUTER)).toEqual({ model: "Claude Haiku 5.5", reasoningEffort: "none" });
    expect(resolveSideCallModel(null, { ...OPENROUTER, ...MISTRAL_ONLY })).toEqual({
      model: "Claude Haiku 5.5",
      reasoningEffort: "none",
    });
  });

  it("runs on the narration voice when the Mistral key is the only one and the voice is a Mistral model", () => {
    localStorage.setItem("narrationModelOverride", MISTRAL_NARRATOR);
    expect(resolveSideCallModel(null, MISTRAL_ONLY)).toEqual({ model: MISTRAL_NARRATOR, reasoningEffort: "none" });
  });

  it("follows a Z.ai key to the Z.ai entry of GLM, but not to the OpenRouter entry the voice defaults to", () => {
    // Fresh profile: the voice is "GLM 5.3" (OpenRouter), which a Z.ai key cannot call.
    expect(resolveSideCallModel(null, { zaiKey: "z" })).toEqual({ model: "Claude Haiku 5.5", reasoningEffort: "none" });
    localStorage.setItem("narrationModelOverride", "GLM 5.3 (Z.ai)");
    expect(resolveSideCallModel(null, { zaiKey: "z" })).toEqual({ model: "GLM 5.3 (Z.ai)", reasoningEffort: "none" });
  });

  it("never falls to a Claude subscription narration voice", () => {
    localStorage.setItem("narrationModelOverride", SONNET_SUBSCRIPTION);
    expect(isClaudeCliModel(String(getEffectiveNarrationModelKey()))).toBe(true);
    for (const keys of [MISTRAL_ONLY, {}, { mistralKey: "m", zaiKey: "z" }]) {
      const resolved = resolveSideCallModel(null, keys);
      expect(resolved).toEqual({ model: "Claude Haiku 5.5", reasoningEffort: "none" });
      expect(isClaudeCliModel(resolved.model)).toBe(false);
    }
  });

  it("stays on Haiku, to fail visibly, when the voice is one the player has no key for either", () => {
    // Only a Mistral key, voice on the default GLM 5.3 (OpenRouter).
    expect(getEffectiveNarrationModelKey()).toBe("GLM 5.3");
    expect(resolveSideCallModel(null, MISTRAL_ONLY)).toEqual({ model: "Claude Haiku 5.5", reasoningEffort: "none" });
    // A custom model's UUID is an OpenRouter model, which this player cannot call.
    localStorage.setItem("narrationModelOverride", CUSTOM_MODEL_UUID);
    expect(getEffectiveNarrationModelKey()).toBe(CUSTOM_MODEL_UUID);
    expect(resolveSideCallModel(null, MISTRAL_ONLY)).toEqual({ model: "Claude Haiku 5.5", reasoningEffort: "none" });
  });

  it("stays on Haiku with no keys at all", () => {
    localStorage.setItem("narrationModelOverride", MISTRAL_NARRATOR);
    expect(resolveSideCallModel(null, {})).toEqual({ model: "Claude Haiku 5.5", reasoningEffort: "none" });
    expect(resolveSideCallModel(null, { openRouterKey: "", mistralKey: undefined })).toEqual({
      model: "Claude Haiku 5.5",
      reasoningEffort: "none",
    });
  });

  it("is the same answer as before when the keys argument is left out", () => {
    localStorage.setItem("narrationModelOverride", MISTRAL_NARRATOR);
    expect(resolveSideCallModel(null)).toEqual({ model: "Claude Haiku 5.5", reasoningEffort: "none" });
    expect(resolveSideCallModel(null, undefined)).toEqual({ model: "Claude Haiku 5.5", reasoningEffort: "none" });
  });

  it("keeps a pinned layer on its pin, key or no key", () => {
    localStorage.setItem("narrationModelOverride", MISTRAL_NARRATOR);
    // A pin on a provider the player has no key for is still the player's choice.
    pin("memoryKeeperModelOverride", "Claude Sonnet 5.5");
    expect(resolveSideCallModel(getMemoryKeeperModelOverride(), MISTRAL_ONLY)).toEqual({
      model: "Claude Sonnet 5.5",
      reasoningEffort: "low",
    });
    pin("observerModelOverride", "Mistral Medium 3.5");
    expect(resolveSideCallModel(getObserverModelOverride(), OPENROUTER)).toEqual({
      model: "Mistral Medium 3.5",
      reasoningEffort: "low",
    });
    expect(resolveSideCallModel(getObserverModelOverride(), {})).toEqual({
      model: "Mistral Medium 3.5",
      reasoningEffort: "low",
    });
  });

  it("keeps a subscription pin the desktop can run, and falls one it cannot the same way as an unpinned layer", () => {
    pin("observerModelOverride", SONNET_SUBSCRIPTION);
    localStorage.setItem("narrationModelOverride", MISTRAL_NARRATOR);
    expect(resolveSideCallModel(getObserverModelOverride(), MISTRAL_ONLY)).toEqual({
      model: SONNET_SUBSCRIPTION,
      reasoningEffort: "low",
    });

    // Decision 16: a synced choice on a device without the CLI.
    fakeCli.platform = false;
    expect(resolveSideCallModel(getObserverModelOverride(), MISTRAL_ONLY)).toEqual({
      model: MISTRAL_NARRATOR,
      reasoningEffort: "none",
    });
    expect(resolveSideCallModel(getObserverModelOverride(), OPENROUTER)).toEqual({
      model: "Claude Haiku 5.5",
      reasoningEffort: "none",
    });
    expect(resolveSideCallModel(getObserverModelOverride())).toEqual({ model: "Claude Haiku 5.5", reasoningEffort: "none" });

    // Decision 29: online play.
    fakeCli.platform = true;
    setOnlineSessionActive(true);
    expect(resolveSideCallModel(getObserverModelOverride(), MISTRAL_ONLY)).toEqual({
      model: MISTRAL_NARRATOR,
      reasoningEffort: "none",
    });
  });
});
