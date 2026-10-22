/**
 * The 2026-10-21 fixed-model refresh (docs/research/gm-models-2026-10-21.md,
 * the second update note in §6): Mistral retired nine catalog models, and a
 * player may have pinned a tier, the narration voice, a side agent or the
 * Designer to one of them. Removing the key outright would make that pin read
 * as unset and fall back to an OpenRouter default - no use to a player whose
 * only key is Mistral's - so each retired key is aliased to its successor
 * (LEGACY_MODEL_KEY_ALIASES), and every saved-choice reader returns the
 * successor. Also the image prices and the OCR and TTS model names fixed in the
 * same pass.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  AI_MODELS,
  DEEPINFRA_IMAGE_MODELS,
  LEGACY_MODEL_KEY_ALIASES,
  LEGACY_PROVIDER_MODEL_IDS,
  OPENROUTER_IMAGE_MODELS,
  TTS_MODELS,
  getModelConfig,
  getRequiredKeyForModel,
  hasKeyForModel,
  isKnownModelKey,
  isModelAvailable,
  resolveImageModelKey,
  resolveLegacyProviderModelId,
  resolveModelKeyAlias,
  type AIModelKey,
} from "@/app/misc/ai_prices";
import {
  REASONING_TIERS,
  getEffectiveNarrationModelKey,
  getEffectiveTiers,
  getNarrationModelOverride,
  getTierOverrides,
  resolveTier,
  setTierOverride,
} from "@/app/misc/reasoningTiers";
import {
  getDirectorAssistantModelOverride,
  getMemoryKeeperModelOverride,
  getObserverModelOverride,
  getReflectionModelOverride,
  getStoryProgressObserverModelOverride,
  resolveSideCallModel,
} from "@/app/misc/layerSettings";
import { getDesignerModel } from "@/app/misc/designerSettings";

/** What each retired key was, and what Mistral's lifecycle table says replaced it. */
const RETIRED: { key: string; id: string; successor: AIModelKey }[] = [
  { key: "Mistral Small 3.2", id: "mistral-small-2506", successor: "Mistral Small 4" },
  { key: "Mistral Medium 3.1", id: "mistral-medium-2508", successor: "Mistral Medium 3.5" },
  { key: "Mistral Nemo", id: "open-mistral-nemo-2407", successor: "Ministral 3 8B" },
  { key: "Ministral 3B", id: "ministral-3b-2410", successor: "Ministral 3 3B" },
  { key: "Ministral 8B", id: "ministral-8b-2410", successor: "Ministral 3 8B" },
  { key: "Magistral Medium 1.2", id: "magistral-medium-2509", successor: "Mistral Medium 3.5" },
  { key: "Magistral Small 1.2", id: "magistral-small-2509", successor: "Mistral Small 4" },
  { key: "Devstral Small 2", id: "labs-devstral-small-2512", successor: "Mistral Medium 3.5" },
  { key: "Devstral 2", id: "devstral-2512", successor: "Mistral Medium 3.5" },
];

const MISTRAL_ONLY = { mistralKey: "mistral-key" };
const OPENROUTER_ONLY = { openRouterKey: "or-key" };

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

beforeEach(() => {
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the retired Mistral models are gone from the catalog", () => {
  it.each(RETIRED)("$key ($id) is not an AI_MODELS key or a model id", ({ key, id }) => {
    expect(Object.keys(AI_MODELS)).not.toContain(key);
    expect(Object.values(AI_MODELS).map((m) => m.model)).not.toContain(id);
    expect(Object.values(AI_MODELS).map((m) => m.original_model)).not.toContain(id);
  });

  it("keeps the Mistral models Mistral still lists", () => {
    // Codestral 25.08 and Ministral 3 14B are active on Mistral's models page;
    // Large 3 is active too. Large 4 was added in the earlier refresh.
    for (const key of ["Codestral", "Mistral Large 3.0", "Mistral Large 4", "Ministral 14B"]) {
      expect(Object.keys(AI_MODELS), key).toContain(key);
    }
  });
});

describe("the successors", () => {
  // Mistral's own model pages (docs.mistral.ai/models/..., read 2026-10-21):
  // API id, 256k context, $ per M in / out.
  const SUCCESSORS: [AIModelKey, string, number, number][] = [
    ["Mistral Small 4", "mistral-small-2603", 0.15, 0.6],
    ["Mistral Medium 3.5", "mistral-medium-3-5", 1.5, 7.5],
    ["Ministral 3 3B", "ministral-3b-2512", 0.1, 0.1],
    ["Ministral 3 8B", "ministral-8b-2512", 0.15, 0.15],
  ];

  it.each(SUCCESSORS)("%s calls %s (in %d, out %d, $ per M)", (key, id, input, output) => {
    const config = AI_MODELS[key];
    expect(config.provider).toBe("mistral");
    expect(config.model).toBe(id);
    expect(config.original_model).toBe(id);
    expect(config.inputPrice).toBe(input);
    expect(config.outputPrice).toBe(output);
    expect(config.maxTokens).toBe(256000);
    expect(config.supportsToolCalling).toBe(true);
    expect(config.maxOutputTokens).toBeGreaterThan(0);
    expect(config.maxOutputTokens).toBeLessThan(config.maxTokens);
    expect(config.description.length).toBeGreaterThan(40);
    expect(config.finetunes).toEqual([]);
  });

  it("names no dated id Mistral has retired, and no -latest alias that can move", () => {
    for (const [key] of SUCCESSORS) {
      expect(AI_MODELS[key].model, key).not.toMatch(/latest$/);
    }
  });

  it("stays in the Mistral block, ahead of the DeepInfra entries (the Designer takes the first model a player has a key for)", () => {
    const keys = Object.keys(AI_MODELS);
    const firstMistral = keys.findIndex((k) => AI_MODELS[k as AIModelKey].provider === "mistral");
    const firstDeepInfra = keys.findIndex((k) => AI_MODELS[k as AIModelKey].provider === "deepinfra");
    expect(keys[firstMistral]).toBe("Mistral Small 4");
    expect(firstMistral).toBeLessThan(firstDeepInfra);
    const lastMistral = keys.map((k) => AI_MODELS[k as AIModelKey].provider).lastIndexOf("mistral");
    expect(lastMistral).toBeLessThan(firstDeepInfra);
  });
});

describe("LEGACY_MODEL_KEY_ALIASES", () => {
  it("maps exactly the retired keys, each to its successor", () => {
    expect(LEGACY_MODEL_KEY_ALIASES).toEqual(
      Object.fromEntries(RETIRED.map((r) => [r.key, r.successor])),
    );
  });

  it("every alias resolves to a real AI_MODELS key", () => {
    for (const [oldKey, newKey] of Object.entries(LEGACY_MODEL_KEY_ALIASES)) {
      expect(Object.keys(AI_MODELS), `${oldKey} -> ${newKey}`).toContain(newKey);
    }
  });

  it("no alias key is also a live catalog key, and none points at another alias", () => {
    for (const [oldKey, newKey] of Object.entries(LEGACY_MODEL_KEY_ALIASES)) {
      expect(Object.keys(AI_MODELS), oldKey).not.toContain(oldKey);
      expect(Object.keys(LEGACY_MODEL_KEY_ALIASES), `${oldKey} chains to ${newKey}`).not.toContain(newKey);
    }
  });

  it("every successor is a Mistral model that can call tools, so a Mistral-key pin stays on Mistral", () => {
    for (const newKey of Object.values(LEGACY_MODEL_KEY_ALIASES)) {
      expect(AI_MODELS[newKey].provider, newKey).toBe("mistral");
      expect(AI_MODELS[newKey].supportsToolCalling, newKey).toBe(true);
    }
  });
});

describe("resolveModelKeyAlias", () => {
  it.each(RETIRED)("turns $key into $successor", ({ key, successor }) => {
    expect(resolveModelKeyAlias(key)).toBe(successor);
  });

  it("leaves a current key, a custom model's UUID, an unknown key and an empty value alone", () => {
    const uuid = "123e4567-e89b-42d3-a456-426614174000";
    for (const key of ["Claude Haiku 5.5", "Mistral Small 4", "Codestral", uuid, "Grok Code Fast 1", ""]) {
      expect(resolveModelKeyAlias(key), key).toBe(key);
    }
  });

  it("does not treat the names every object inherits as aliases", () => {
    for (const key of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
      expect(resolveModelKeyAlias(key), key).toBe(key);
    }
  });
});

describe("isKnownModelKey and getModelConfig follow an alias", () => {
  it.each(RETIRED)("$key is still a known key", ({ key }) => {
    expect(isKnownModelKey(key)).toBe(true);
  });

  it.each(RETIRED)("getModelConfig($key) is $successor's config, not DeepSeek V4 Flash", ({ key, successor }) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const config = getModelConfig(key);
    expect(config).toBe(AI_MODELS[successor]);
    expect(config.provider).toBe("mistral");
    expect(config.name).not.toBe(AI_MODELS["DeepSeek V4 Flash"].name);
    expect(warn).not.toHaveBeenCalled();
  });

  it("still falls back to DeepSeek V4 Flash for a key that was never aliased", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(getModelConfig("Grok Code Fast 1")).toBe(AI_MODELS["DeepSeek V4 Flash"]);
  });

  it("judges a retired key by its successor's provider key", () => {
    for (const { key } of RETIRED) {
      expect(getRequiredKeyForModel(key), key).toBe("mistralKey");
      expect(isModelAvailable(key, { mistralKey: true }), key).toBe(true);
      expect(isModelAvailable(key, { openRouterKey: true }), key).toBe(false);
      expect(hasKeyForModel(key, MISTRAL_ONLY), key).toBe(true);
      // Not mistaken for a custom model, which would want an OpenRouter key.
      expect(hasKeyForModel(key, OPENROUTER_ONLY), key).toBe(false);
    }
  });
});

describe("a saved choice of a retired Mistral model keeps working", () => {
  it("in a reasoning tier: the successor, with the saved effort, for a Mistral-key-only player", () => {
    localStorage.setItem(
      "reasoningTierOverrides",
      JSON.stringify([
        { modelKey: "Mistral Nemo", reasoningEffort: "low" },
        null,
        { modelKey: "Devstral 2", reasoningEffort: "high" },
        { modelKey: "Claude Sonnet 5.5", reasoningEffort: "xhigh" },
      ]),
    );

    const overrides = getTierOverrides();
    expect(overrides[0]).toEqual({ modelKey: "Ministral 3 8B", reasoningEffort: "low" });
    expect(overrides[1]).toBeNull();
    expect(overrides[2]).toEqual({ modelKey: "Mistral Medium 3.5", reasoningEffort: "high" });
    expect(overrides[3]).toEqual({ modelKey: "Claude Sonnet 5.5", reasoningEffort: "xhigh" });

    const tiers = getEffectiveTiers();
    expect(tiers[0]).toMatchObject({ modelKey: "Ministral 3 8B", reasoningEffort: "low" });
    // The slot with nothing saved is untouched.
    expect(tiers[1].modelKey).toBe(REASONING_TIERS[1].modelKey);

    const resolved = resolveTier(0);
    expect(resolved).toMatchObject({ modelKey: "Ministral 3 8B", reasoningEffort: "low" });
    expect(getModelConfig(String(resolved.modelKey)).provider).toBe("mistral");
    expect(hasKeyForModel(String(resolved.modelKey), MISTRAL_ONLY)).toBe(true);
    expect(hasKeyForModel(String(resolveTier(2).modelKey), MISTRAL_ONLY)).toBe(true);
  });

  it("in a reasoning tier: the next write replaces the stored retired key", () => {
    localStorage.setItem(
      "reasoningTierOverrides",
      JSON.stringify([{ modelKey: "Mistral Small 3.2", reasoningEffort: "none" }, null, null, null]),
    );
    setTierOverride(1, { modelKey: "Claude Haiku 5.5", reasoningEffort: "low" });
    const stored = JSON.parse(localStorage.getItem("reasoningTierOverrides")!);
    expect(stored[0].modelKey).toBe("Mistral Small 4");
    expect(stored[1].modelKey).toBe("Claude Haiku 5.5");
  });

  it.each(RETIRED)("as the narration voice: $key becomes $successor", ({ key, successor }) => {
    localStorage.setItem("narrationModelOverride", key);
    expect(getNarrationModelOverride()).toBe(successor);
    expect(getEffectiveNarrationModelKey()).toBe(successor);
  });

  it("as the narration voice, a Mistral-key-only player's unpinned side agent follows it to the successor", () => {
    localStorage.setItem("narrationModelOverride", "Mistral Small 3.2");
    // No OpenRouter key: the side-agent default is out of reach, so the agent
    // takes the narration voice, which must be a model the Mistral key can call.
    const call = resolveSideCallModel(null, MISTRAL_ONLY);
    expect(call.model).toBe("Mistral Small 4");
    expect(hasKeyForModel(call.model, MISTRAL_ONLY)).toBe(true);
  });

  describe.each([
    ["Observer", "observerModelOverride", getObserverModelOverride],
    ["Memory Keeper", "memoryKeeperModelOverride", getMemoryKeeperModelOverride],
    ["Reflection", "reflectionModelOverride", getReflectionModelOverride],
    ["Director Assistant", "directorAssistantModelOverride", getDirectorAssistantModelOverride],
    [
      "Story Progress Observer",
      "storyProgressObserverModelOverride",
      getStoryProgressObserverModelOverride,
    ],
  ] as const)("on the %s", (_name, storageKey, read) => {
    it.each(RETIRED)("a pin on $key runs on $successor, effort kept", ({ key, successor }) => {
      localStorage.setItem(storageKey, JSON.stringify({ modelKey: key, reasoningEffort: "high" }));
      expect(read()).toEqual({ modelKey: successor, reasoningEffort: "high" });
      expect(resolveSideCallModel(read(), MISTRAL_ONLY)).toEqual({
        model: successor,
        reasoningEffort: "high",
      });
    });
  });

  it("on a side agent, a retired pin is not mistaken for a dropped one (which would fall to Claude Haiku)", () => {
    localStorage.setItem(
      "observerModelOverride",
      JSON.stringify({ modelKey: "Magistral Small 1.2", reasoningEffort: "low" }),
    );
    expect(resolveSideCallModel(getObserverModelOverride(), MISTRAL_ONLY).model).toBe("Mistral Small 4");
    expect(resolveSideCallModel(getObserverModelOverride(), MISTRAL_ONLY).model).not.toBe("Claude Haiku 5.5");
  });

  it("on the Game Designer", () => {
    expect(getDesignerModel()).toBe("");
    localStorage.setItem("designerModel", "Mistral Medium 3.1");
    expect(getDesignerModel()).toBe("Mistral Medium 3.5");
    localStorage.setItem("designerModel", "Claude Sonnet 5.5");
    expect(getDesignerModel()).toBe("Claude Sonnet 5.5");
    const uuid = "123e4567-e89b-42d3-a456-426614174000";
    localStorage.setItem("designerModel", uuid);
    expect(getDesignerModel()).toBe(uuid);
  });
});

describe("a saved choice saved as a provider model id (the PDF importer's)", () => {
  it.each(RETIRED)("$id becomes $successor's id", ({ id, successor }) => {
    expect(resolveLegacyProviderModelId(id)).toBe(AI_MODELS[successor].model);
  });

  it("agrees with the key aliases, pair by pair", () => {
    for (const { id, key } of RETIRED) {
      expect(LEGACY_PROVIDER_MODEL_IDS[id], id).toBe(LEGACY_MODEL_KEY_ALIASES[key]);
    }
    expect(Object.keys(LEGACY_PROVIDER_MODEL_IDS)).toHaveLength(RETIRED.length);
  });

  it("leaves a current id, the importer's default and an unknown id alone", () => {
    for (const id of ["ministral-14b-2512", "mistral-small-2603", "deepseek-flash", "custom-model", "", "constructor"]) {
      expect(resolveLegacyProviderModelId(id), id).toBe(id);
    }
  });
});

describe("image prices", () => {
  it("shows Bria 3.2 at DeepInfra's $0.04 per image, not as free", () => {
    // https://deepinfra.com/Bria/Bria-3.2 (read 2026-10-21)
    expect(DEEPINFRA_IMAGE_MODELS["Bria 3.2"].pricePerImage).toBe(0.04);
    expect(DEEPINFRA_IMAGE_MODELS["Bria 3.2"].description).not.toMatch(/free/i);
  });

  it("shows FLUX 2 Pro at $0.03 for the default megapixel, not the $0.015 per extra megapixel", () => {
    // https://deepinfra.com/black-forest-labs/FLUX-2-pro: first megapixel $0.03,
    // each further one $0.015.
    expect(DEEPINFRA_IMAGE_MODELS["FLUX 2 Pro"].pricePerImage).toBe(0.03);
  });

  it("shows no image model as free", () => {
    for (const [key, m] of [
      ...Object.entries(OPENROUTER_IMAGE_MODELS),
      ...Object.entries(DEEPINFRA_IMAGE_MODELS),
    ]) {
      expect(m.pricePerImage, key).toBeGreaterThan(0);
    }
  });
});

describe("image model ids", () => {
  it("moves Nano Banana Pro off the preview id Google shut down on 2026-06-25", () => {
    expect(OPENROUTER_IMAGE_MODELS["Nano Banana Pro"].model).toBe("google/gemini-3-pro-image");
    // Google: $2 in, $120 per M image-output tokens, $0.134 per 1K image.
    expect(OPENROUTER_IMAGE_MODELS["Nano Banana Pro"].inputPrice).toBe(2);
    expect(OPENROUTER_IMAGE_MODELS["Nano Banana Pro"].outputPrice).toBe(120);
    expect(OPENROUTER_IMAGE_MODELS["Nano Banana Pro"].pricePerImage).toBe(0.134);
  });

  it("moves Nano Banana to the successor Google names for gemini-2.5-flash-image", () => {
    expect(OPENROUTER_IMAGE_MODELS["Nano Banana"].model).toBe("google/gemini-3.1-flash-lite-image");
    // Google: $0.25 in, $30 per M image-output tokens, $0.0336 per 1K image.
    expect(OPENROUTER_IMAGE_MODELS["Nano Banana"].inputPrice).toBe(0.25);
    expect(OPENROUTER_IMAGE_MODELS["Nano Banana"].outputPrice).toBe(30);
    expect(OPENROUTER_IMAGE_MODELS["Nano Banana"].pricePerImage).toBe(0.034);
  });

  it("offers no image id Google has deprecated or shut down", () => {
    const ids = Object.values(OPENROUTER_IMAGE_MODELS).map((m) => m.model);
    expect(ids).not.toContain("google/gemini-3-pro-image-preview");
    expect(ids).not.toContain("google/gemini-2.5-flash-image");
  });

  it("adds GPT-5.4 Image 2 after the existing OpenAI image models, and leaves them", () => {
    const keys = Object.keys(OPENROUTER_IMAGE_MODELS);
    expect(OPENROUTER_IMAGE_MODELS["GPT-5.4 Image 2"].model).toBe("openai/gpt-5.4-image-2");
    expect(OPENROUTER_IMAGE_MODELS["GPT-5 Image"].model).toBe("openai/gpt-5-image");
    expect(OPENROUTER_IMAGE_MODELS["GPT-5 Image Mini"].model).toBe("openai/gpt-5-image-mini");
    expect(keys.indexOf("GPT-5.4 Image 2")).toBeGreaterThan(keys.indexOf("GPT-5 Image"));
    expect(keys.indexOf("GPT-5.4 Image 2")).toBeGreaterThan(keys.indexOf("GPT-5 Image Mini"));
  });

  it("keeps every saved image choice resolving to itself (no key was renamed)", () => {
    for (const key of Object.keys(OPENROUTER_IMAGE_MODELS)) {
      expect(resolveImageModelKey("openrouter", key), key).toBe(key);
    }
    for (const key of Object.keys(DEEPINFRA_IMAGE_MODELS)) {
      expect(resolveImageModelKey("deepinfra", key), key).toBe(key);
    }
  });
});

describe("the Cartesia label", () => {
  it("names the model the TTS call sends", () => {
    expect(TTS_MODELS.cartesia.name).toBe("Cartesia Sonic-3.6");
  });
});
