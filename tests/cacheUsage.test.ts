/**
 * Cached tokens in the cost ledger (token-savings plan slice 7): reading each
 * provider's usage shape, carrying the figures through the ledger, and pricing
 * cached input at the cached rate where a model has one.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readCacheUsage, generateNonStreaming } from "@/app/misc/providerCall";
import {
  beginTurnCost,
  getTurnCostReport,
  priceCall,
  recordAICall,
} from "@/app/misc/turnCost";

describe("readCacheUsage", () => {
  it("reads OpenAI-style prompt_tokens_details", () => {
    expect(
      readCacheUsage("openrouter", {
        prompt_tokens_details: { cached_tokens: 900, cache_write_tokens: 100 },
      }),
    ).toEqual({ cachedTokens: 900, cacheWriteTokens: 100 });
    expect(
      readCacheUsage("mistral", { prompt_tokens_details: { cached_tokens: 64 } }),
    ).toEqual({ cachedTokens: 64 });
  });

  it("reads DeepSeek's prompt_cache_hit_tokens", () => {
    expect(readCacheUsage("deepseek", { prompt_cache_hit_tokens: 5000 })).toEqual({
      cachedTokens: 5000,
    });
  });

  it("reads nothing when the provider reports nothing or a miss", () => {
    expect(readCacheUsage("zai", undefined)).toEqual({});
    expect(readCacheUsage("deepseek", { prompt_cache_hit_tokens: 0 })).toEqual({});
    expect(readCacheUsage("google", { prompt_tokens_details: {} })).toEqual({});
  });
});

describe("a non-streaming call", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the cached figures in meta.usage", async () => {
    const body = {
      choices: [{ index: 0, message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 10,
        total_tokens: 1010,
        prompt_cache_hit_tokens: 800,
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => body, text: async () => "" })),
    );
    const result = await generateNonStreaming({
      messages: [{ role: "user", content: "hello" }],
      model: "DeepSeek V4 Flash",
      deepseekKey: "k",
    });
    if ("error" in result) throw new Error(result.error);
    expect(result.meta.usage.cachedTokens).toBe(800);
  });
});

describe("pricing cached input", () => {
  it("prices cached tokens at cachedInputPrice when the model has one", () => {
    // GLM 5.3 (Z.ai): $1.4 in, $0.26 cached, $4.4 out per M.
    const full = priceCall("GLM 5.3 (Z.ai)", 1_000_000, 0);
    const cached = priceCall("GLM 5.3 (Z.ai)", 1_000_000, 0, 750_000);
    expect(full).toBeCloseTo(1.4, 6);
    expect(cached).toBeCloseTo(0.25 * 1.4 + 0.75 * 0.26, 6);
  });

  it("prices them as plain input when the model has no cached price", () => {
    expect(priceCall("Claude Haiku 5.5", 1_000_000, 0, 900_000)).toBeCloseTo(
      priceCall("Claude Haiku 5.5", 1_000_000, 0),
      6,
    );
  });

  it("never lets cached tokens exceed the prompt", () => {
    expect(priceCall("GLM 5.3 (Z.ai)", 1000, 0, 5000)).toBeCloseTo((1000 / 1e6) * 0.26, 9);
  });
});

describe("the ledger", () => {
  it("records cached tokens, the share, and whether they were priced at full", () => {
    const turnId = beginTurnCost();
    recordAICall({
      stage: "gm",
      label: "GM round 1",
      modelKey: "GLM 5.3 (Z.ai)",
      promptTokens: 10_000,
      completionTokens: 100,
      cachedTokens: 8000,
    });
    recordAICall({
      stage: "gm",
      label: "GM round 2",
      modelKey: "Claude Haiku 5.5",
      promptTokens: 10_000,
      completionTokens: 100,
      cachedTokens: 5000,
      cacheWriteTokens: 1000,
    });
    const report = getTurnCostReport(turnId)!;
    expect(report.cachedTokens).toBe(13_000);
    expect(report.entries[0].cachedAtFullPrice).toBeUndefined();
    expect(report.entries[1].cachedAtFullPrice).toBe(true);
    expect(report.entries[1].cacheWriteTokens).toBe(1000);
  });
});
