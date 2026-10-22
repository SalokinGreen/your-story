/**
 * The 2026-10-21 catalog refresh (docs/research/gm-models-2026-10-21.md §6):
 * dead entries removed, current ones added, and - the part that can hurt a
 * player - a saved choice of a removed model degrades to its slot's default
 * instead of reaching getModelConfig, which would swap in DeepSeek V4 Flash
 * (a different provider, needing a different key, billing differently).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  AI_MODELS,
  DEEPINFRA_IMAGE_MODELS,
  OPENROUTER_IMAGE_MODELS,
  getModelConfig,
  isKnownModelKey,
  resolveImageModelKey,
  type AIModelConfig,
} from "@/app/misc/ai_prices";
import {
  REASONING_TIERS,
  NARRATION_MODEL_KEY,
  getEffectiveTiers,
  getEffectiveNarrationModelKey,
  getNarrationModelOverride,
  getTierOverrides,
  resolveTier,
  setTierOverride,
} from "@/app/misc/reasoningTiers";
import {
  SIDE_AGENT_DEFAULT_MODEL_KEY,
  getObserverModelOverride,
  getMemoryKeeperModelOverride,
  resolveSideCallModel,
} from "@/app/misc/layerSettings";

const REMOVED_CHAT_KEYS = ["Grok Code Fast 1", "Google Gemini 3 Pro"];
const REMOVED_OPENROUTER_IMAGE_KEYS = ["Flux 2 Pro", "Flux 2 Flex"];
const CUSTOM_MODEL_UUID = "123e4567-e89b-42d3-a456-426614174000";

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
});

describe("the dead entries are gone", () => {
  it.each(REMOVED_CHAT_KEYS)("%s is not in AI_MODELS", (key) => {
    expect(Object.keys(AI_MODELS)).not.toContain(key);
    expect(isKnownModelKey(key)).toBe(false);
  });

  it("no chat entry still points at a model id OpenRouter or Google shut down", () => {
    const ids = Object.values(AI_MODELS).map((m) => m.model);
    expect(ids).not.toContain("x-ai/grok-code-fast-1");
    expect(ids).not.toContain("models/gemini-3-pro-preview");
  });

  it.each(REMOVED_OPENROUTER_IMAGE_KEYS)("OpenRouter image model %s is not offered", (key) => {
    expect(Object.keys(OPENROUTER_IMAGE_MODELS)).not.toContain(key);
  });

  it("keeps DeepInfra's own FLUX 2 Pro, which DeepInfra still lists", () => {
    expect(DEEPINFRA_IMAGE_MODELS["FLUX 2 Pro"].model).toBe("black-forest-labs/FLUX-2-pro");
  });
});

describe("DeepSeek", () => {
  it("keeps the DeepSeek V4 Flash key valid, since getModelConfig falls back to it", () => {
    expect(isKnownModelKey("DeepSeek V4 Flash")).toBe(true);
    expect(getModelConfig("a-key-that-never-existed").provider).toBe("deepseek");
  });

  it("calls DeepSeek's current Flash name from both Flash entries, not the retired alias", () => {
    expect(AI_MODELS["DeepSeek V4.1 Flash"].model).toBe("deepseek-flash");
    expect(AI_MODELS["DeepSeek V4 Flash"].model).toBe("deepseek-flash");
  });

  it("prices both Flash entries at DeepSeek's V4.1 Flash rate ($0.15 / $0.60)", () => {
    for (const key of ["DeepSeek V4.1 Flash", "DeepSeek V4 Flash"] as const) {
      expect(AI_MODELS[key].inputPrice).toBe(0.15);
      expect(AI_MODELS[key].outputPrice).toBe(0.6);
    }
  });

  it("no longer shows the Pro entry at a Flash-class price, or a stale one", () => {
    // DeepSeek's Models & Pricing page, 2026-10-21: deepseek-v4-pro is
    // DeepSeek-V4-Pro-0813 at $0.66 / $1.98 off-peak.
    expect(AI_MODELS["DeepSeek V4 Pro"].model).toBe("deepseek-v4-pro");
    expect(AI_MODELS["DeepSeek V4 Pro"].inputPrice).toBe(0.66);
    expect(AI_MODELS["DeepSeek V4 Pro"].outputPrice).toBe(1.98);
  });

  it("serves every DeepSeek entry through the deepseek provider (reasoning_content replay)", () => {
    const deepseek = Object.entries(AI_MODELS).filter(([, m]) => m.provider === "deepseek");
    expect(deepseek.map(([key]) => key)).toEqual(
      expect.arrayContaining(["DeepSeek V4 Flash", "DeepSeek V4.1 Flash", "DeepSeek V4 Pro"]),
    );
  });
});

describe("the added models", () => {
  const ADDED: [string, Pick<AIModelConfig, "provider" | "model">][] = [
    ["Grok 4.7", { provider: "openrouter", model: "x-ai/grok-4.7" }],
    ["DeepSeek V4.1 Flash", { provider: "deepseek", model: "deepseek-flash" }],
    ["Mistral Large 4", { provider: "mistral", model: "mistral-large-4" }],
    ["Qwen 3.8 Max", { provider: "openrouter", model: "qwen/qwen3.8-max-0902" }],
    ["Qwen 3.8 Flash", { provider: "openrouter", model: "qwen/qwen3.8-flash" }],
    ["GPT-6.1 Sol", { provider: "openrouter", model: "openai/gpt-6.1-sol" }],
    ["GPT-6 Luna", { provider: "openrouter", model: "openai/gpt-6-luna" }],
    ["Google Gemini 4 Argon", { provider: "google", model: "models/gemini-4-argon" }],
    ["Google Gemini 3.8 Flash", { provider: "google", model: "models/gemini-3.8-flash" }],
  ];

  it.each(ADDED)("%s is offered with the right provider and model id", (key, expected) => {
    expect(Object.keys(AI_MODELS)).toContain(key);
    expect(AI_MODELS[key as keyof typeof AI_MODELS]).toMatchObject(expected);
  });

  it.each(ADDED)("%s can call tools, and fills every config field", (key) => {
    const m = AI_MODELS[key as keyof typeof AI_MODELS] as AIModelConfig;
    expect(m.supportsToolCalling).toBe(true);
    expect(m.name.length).toBeGreaterThan(0);
    expect(m.original_model.length).toBeGreaterThan(0);
    expect(m.description.length).toBeGreaterThan(40);
    expect(m.strengths.length).toBeGreaterThan(0);
    expect(m.finetunes).toEqual([]);
    expect(m.inputPrice).toBeGreaterThan(0);
    expect(m.outputPrice).toBeGreaterThan(0);
    expect(m.maxTokens).toBeGreaterThanOrEqual(500000);
    expect(m.maxOutputTokens).toBeGreaterThan(0);
    expect(m.maxOutputTokens).toBeLessThanOrEqual(128000);
    expect(m.maxOutputTokens).toBeLessThan(m.maxTokens);
  });

  it("records the dated price changes in the description", () => {
    expect(AI_MODELS["Google Gemini 4 Argon"].description).toContain("2026-11-30");
    expect(AI_MODELS["Google Gemini 3.8 Flash"].description).toContain("2026-12-31");
  });

  it("uses the official prices", () => {
    // xAI docs, Alibaba Model Studio, OpenAI pricing, Mistral docs, Google pricing.
    const prices = (key: keyof typeof AI_MODELS) => [
      AI_MODELS[key].inputPrice,
      AI_MODELS[key].outputPrice,
    ];
    expect(prices("Grok 4.7")).toEqual([2, 6]);
    expect(prices("Qwen 3.8 Max")).toEqual([2, 6]);
    expect(prices("Qwen 3.8 Flash")).toEqual([0.15, 0.47]);
    expect(prices("GPT-6.1 Sol")).toEqual([2, 10]);
    expect(prices("GPT-6 Luna")).toEqual([0.1, 0.5]);
    expect(prices("Mistral Large 4")).toEqual([1.36, 4.18]);
    expect(prices("Google Gemini 4 Argon")).toEqual([2, 10]);
    expect(prices("Google Gemini 3.8 Flash")).toEqual([0.75, 3.75]);
  });
});

describe("isKnownModelKey", () => {
  it("accepts catalog keys, including every one of the default slots", () => {
    for (const key of Object.keys(AI_MODELS)) expect(isKnownModelKey(key), key).toBe(true);
    for (const tier of REASONING_TIERS) expect(isKnownModelKey(tier.modelKey)).toBe(true);
    expect(isKnownModelKey(NARRATION_MODEL_KEY)).toBe(true);
  });

  it("accepts a custom model's UUID", () => {
    expect(isKnownModelKey(CUSTOM_MODEL_UUID)).toBe(true);
  });

  it("rejects removed keys, empty values and non-strings", () => {
    for (const key of [...REMOVED_CHAT_KEYS, "", "gpt-4", null, undefined, 7, {}]) {
      expect(isKnownModelKey(key), String(key)).toBe(false);
    }
  });

  it("rejects the names every object inherits", () => {
    for (const key of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
      expect(isKnownModelKey(key), key).toBe(false);
    }
  });
});

describe("a saved choice of a removed model uses the slot's default", () => {
  it("in a reasoning tier, leaving the other slots' choices alone", () => {
    localStorage.setItem(
      "reasoningTierOverrides",
      JSON.stringify([
        { modelKey: "Claude Haiku 5.5", reasoningEffort: "low" },
        null,
        { modelKey: "Grok Code Fast 1", reasoningEffort: "high" },
        { modelKey: CUSTOM_MODEL_UUID, reasoningEffort: "xhigh" },
      ]),
    );

    const tiers = getEffectiveTiers();
    expect(tiers[0]).toMatchObject({ modelKey: "Claude Haiku 5.5", reasoningEffort: "low" });
    // The dead choice: the default model AND the default effort.
    expect(tiers[2].modelKey).toBe(REASONING_TIERS[2].modelKey);
    expect(tiers[2].reasoningEffort).toBe(REASONING_TIERS[2].reasoningEffort);
    expect(tiers[3]).toMatchObject({ modelKey: CUSTOM_MODEL_UUID, reasoningEffort: "xhigh" });
    expect(getTierOverrides()[2]).toBeNull();
  });

  it("when a turn resolves its tier", () => {
    localStorage.setItem(
      "reasoningTierOverrides",
      JSON.stringify([null, null, { modelKey: "Google Gemini 3 Pro", reasoningEffort: "high" }, null]),
    );
    const resolved = resolveTier(2);
    expect(resolved.modelKey).toBe(REASONING_TIERS[2].modelKey);
    // And the model it names is a real one with a config and a provider key to check.
    expect(isKnownModelKey(resolved.modelKey)).toBe(true);
    expect(getModelConfig(String(resolved.modelKey)).name).not.toBe("Custom Model");
  });

  it("is dropped from storage by the next write, not resurrected", () => {
    localStorage.setItem(
      "reasoningTierOverrides",
      JSON.stringify([null, null, { modelKey: "Grok Code Fast 1", reasoningEffort: "high" }, null]),
    );
    setTierOverride(1, { modelKey: "Claude Haiku 5.5", reasoningEffort: "low" });
    const stored = JSON.parse(localStorage.getItem("reasoningTierOverrides")!);
    expect(stored[1].modelKey).toBe("Claude Haiku 5.5");
    expect(stored[2]).toBeNull();
  });

  it("as the narration voice", () => {
    localStorage.setItem("narrationModelOverride", "Grok Code Fast 1");
    expect(getNarrationModelOverride()).toBeNull();
    expect(getEffectiveNarrationModelKey()).toBe(NARRATION_MODEL_KEY);
  });

  it("keeps a narration voice that is still in the catalog, or a custom model", () => {
    localStorage.setItem("narrationModelOverride", "Claude Sonnet 5.5");
    expect(getEffectiveNarrationModelKey()).toBe("Claude Sonnet 5.5");
    localStorage.setItem("narrationModelOverride", CUSTOM_MODEL_UUID);
    expect(getEffectiveNarrationModelKey()).toBe(CUSTOM_MODEL_UUID);
  });

  it("on a side agent, which then runs on the side-agent default at effort none (decision 53)", () => {
    localStorage.setItem(
      "observerModelOverride",
      JSON.stringify({ modelKey: "Grok Code Fast 1", reasoningEffort: "low" }),
    );
    expect(getObserverModelOverride()).toBeNull();
    expect(resolveSideCallModel(getObserverModelOverride())).toEqual({
      model: SIDE_AGENT_DEFAULT_MODEL_KEY,
      reasoningEffort: "none",
    });
  });

  it("keeps a side agent's choice that is still in the catalog", () => {
    localStorage.setItem(
      "memoryKeeperModelOverride",
      JSON.stringify({ modelKey: "Claude Haiku 5.5", reasoningEffort: "low" }),
    );
    expect(resolveSideCallModel(getMemoryKeeperModelOverride())).toEqual({
      model: "Claude Haiku 5.5",
      reasoningEffort: "low",
    });
  });

  it("treats a malformed saved override as none", () => {
    localStorage.setItem("observerModelOverride", "{}");
    expect(getObserverModelOverride()).toBeNull();
    localStorage.setItem("observerModelOverride", "null");
    expect(getObserverModelOverride()).toBeNull();
    localStorage.setItem("observerModelOverride", "not json");
    expect(getObserverModelOverride()).toBeNull();
  });
});

describe("a saved image model the catalog dropped", () => {
  it.each(["Flux 2 Pro", "Flux 2 Flex"])(
    "OpenRouter's %s becomes Nano Banana",
    (key) => {
      expect(resolveImageModelKey("openrouter", key)).toBe("Nano Banana");
    },
  );

  it("an empty or unknown choice becomes the provider's default", () => {
    expect(resolveImageModelKey("openrouter", "")).toBe("Nano Banana");
    expect(resolveImageModelKey("deepinfra", "")).toBe("Bria 3.2");
    expect(resolveImageModelKey("deepinfra", "Flux 2 Pro")).toBe("Bria 3.2");
  });

  it("leaves a choice that is still offered alone", () => {
    expect(resolveImageModelKey("openrouter", "Nano Banana Pro")).toBe("Nano Banana Pro");
    expect(resolveImageModelKey("openrouter", "GPT-5 Image Mini")).toBe("GPT-5 Image Mini");
    expect(resolveImageModelKey("deepinfra", "FLUX 2 Pro")).toBe("FLUX 2 Pro");
  });

  it("only ever returns a key its provider's catalog has", () => {
    for (const key of ["", "x", "Flux 2 Pro", "constructor"]) {
      expect(Object.keys(OPENROUTER_IMAGE_MODELS)).toContain(resolveImageModelKey("openrouter", key));
      expect(Object.keys(DEEPINFRA_IMAGE_MODELS)).toContain(resolveImageModelKey("deepinfra", key));
    }
  });
});
