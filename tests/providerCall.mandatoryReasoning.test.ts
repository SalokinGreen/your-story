/**
 * Three fixes from the second engine review of the catalog-refresh branch
 * (2026-10-22):
 *
 *  - OpenRouter marks some models' reasoning `mandatory` and rejects an
 *    explicit `reasoning: {effort: "none"}` for them. Decision 53 made "none"
 *    the default effort of the narration voice and the Designer, and the
 *    Designer's first available model on an OpenRouter-only profile is
 *    Grok 4.5, one of them. Those models (flagged `reasoningMandatory` in the
 *    catalog) now get "low" for "none", plus the always-thinking max_tokens
 *    floor, the same treatment as Claude 5.5 and GLM 5.3.
 *  - Mistral's reasoning models answer a non-streaming request with `content`
 *    as a list of text and thinking chunks; generateNonStreaming now unpacks
 *    it into a string, as the streaming path already did.
 *  - The narration effort followed the raw saved voice, so a voice saved under
 *    a retired key (resolved to its successor) silently lost its effort.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeCli } from "./helpers/fakeClaudeCli";
import { AI_MODELS } from "@/app/misc/ai_prices";
import { generateNonStreaming } from "@/app/misc/providerCall";
import {
  getEffectiveNarrationEffort,
  getEffectiveNarrationModelKey,
} from "@/app/misc/reasoningTiers";
import { resetClaudeCliStatusCache, setOnlineSessionActive } from "@/app/misc/claudeCliModels";

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
  fakeCli.reset();
  // Off the desktop, so requests go through the stubbed global fetch rather
  // than Tauri's HTTP plugin.
  fakeCli.platform = false;
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
  vi.unstubAllGlobals();
});

const MESSAGES = [{ role: "user" as const, content: "hello" }];

function stubFetch(message: Record<string, unknown>) {
  const response = {
    choices: [{ index: 0, message: { role: "assistant", ...message }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => response,
    text: async () => JSON.stringify(response),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof stubFetch>) {
  return JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
}

const MANDATORY = ["Grok 4.5", "Grok 4.7", "Qwen 3.8 Max", "GPT-6.1 Sol", "MiniMax M2"];

describe("OpenRouter models whose reasoning is mandatory", () => {
  it("are exactly the catalog entries flagged reasoningMandatory, all on OpenRouter", () => {
    const flagged = Object.entries(AI_MODELS)
      .filter(([, m]) => (m as { reasoningMandatory?: boolean }).reasoningMandatory === true)
      .map(([key, m]) => {
        expect(m.provider, key).toBe("openrouter");
        return key;
      });
    expect(flagged.sort()).toEqual([...MANDATORY].sort());
  });

  it.each(MANDATORY)("%s is sent low for effort none, never the rejected none", async (key) => {
    const fetchMock = stubFetch({ content: "ok" });
    await generateNonStreaming({ messages: MESSAGES, model: key, openRouterKey: "k", reasoningEffort: "none" });
    expect(sentBody(fetchMock).reasoning).toEqual({ effort: "low" });
  });

  it("is sent low when a caller names no effort at all", async () => {
    const fetchMock = stubFetch({ content: "ok" });
    await generateNonStreaming({ messages: MESSAGES, model: "Grok 4.5", openRouterKey: "k" });
    expect(sentBody(fetchMock).reasoning).toEqual({ effort: "low" });
  });

  it("keeps an effort the player chose", async () => {
    const fetchMock = stubFetch({ content: "ok" });
    await generateNonStreaming({ messages: MESSAGES, model: "Grok 4.5", openRouterKey: "k", reasoningEffort: "high" });
    expect(sentBody(fetchMock).reasoning).toEqual({ effort: "high" });
  });

  it("gets the always-thinking max_tokens floor, so a short side call is not spent on reasoning", async () => {
    const fetchMock = stubFetch({ content: "ok" });
    await generateNonStreaming({ messages: MESSAGES, model: "Grok 4.5", openRouterKey: "k", reasoningEffort: "none", maxTokens: 200 });
    expect(sentBody(fetchMock).max_tokens).toBe(4096);
  });

  it("leaves a model whose reasoning can be turned off on an explicit none", async () => {
    const fetchMock = stubFetch({ content: "ok" });
    await generateNonStreaming({ messages: MESSAGES, model: "Kimi K3", openRouterKey: "k", reasoningEffort: "none", maxTokens: 200 });
    const body = sentBody(fetchMock);
    expect(body.reasoning).toEqual({ effort: "none" });
    expect(body.max_tokens).toBe(200);
  });
});

describe("a non-streaming reply whose content is a list of chunks (Mistral's reasoning models)", () => {
  it("comes back as a string, with the thinking kept as reasoning", async () => {
    stubFetch({
      content: [
        { type: "thinking", thinking: [{ type: "text", text: "Weighing the clue." }] },
        { type: "text", text: "The door is locked." },
      ],
    });
    const result = await generateNonStreaming({
      messages: MESSAGES,
      model: "Mistral Small 4",
      mistralKey: "k",
      reasoningEffort: "high",
    });
    expect("error" in result, JSON.stringify(result)).toBe(false);
    if ("error" in result) return;
    expect(result.content).toBe("The door is locked.");
    expect(result.reasoning).toBe("Weighing the clue.");
  });

  it("leaves a plain string reply as it was", async () => {
    stubFetch({ content: "Plain answer." });
    const result = await generateNonStreaming({ messages: MESSAGES, model: "Mistral Small 4", mistralKey: "k", reasoningEffort: "none" });
    if ("error" in result) throw new Error(result.error);
    expect(result.content).toBe("Plain answer.");
  });
});

describe("the narration effort follows a Default saved under a retired key", () => {
  const saveDefault = (modelKey: string, reasoningEffort: string) => {
    const o = { modelKey, reasoningEffort };
    localStorage.setItem("reasoningTierOverrides", JSON.stringify([o, o, o, null]));
  };

  it("keeps the saved effort when the saved model resolves to its successor", () => {
    saveDefault("Mistral Small 3.2", "high");
    expect(getEffectiveNarrationModelKey()).toBe("Mistral Small 4");
    expect(getEffectiveNarrationEffort()).toBe("high");
  });

  it("still falls back to none when the saved model was dropped outright", () => {
    saveDefault("Grok Code Fast 1", "high");
    expect(getEffectiveNarrationEffort()).toBe("none");
  });
});
