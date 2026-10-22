/**
 * Decision 53: every model call carries an explicit reasoning effort, and
 * every place a player picks a model also lets them pick its effort. These
 * pin the storage and resolution half: the narration voice's stored effort
 * (and where it falls back to "none"), the side agents' default effort, the
 * Game Designer's stored effort and the request it sends, and the one default
 * callSideModel adds for a caller that forgot.
 *
 * The turn-level half (which effort each request of a turn actually carries)
 * is tests/generation.effort.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@tauri-apps/api/core", async () => (await import("./helpers/fakeClaudeCli")).fakeTauriCore);

import { fakeCli } from "./helpers/fakeClaudeCli";
import {
  DEFAULT_REASONING_EFFORT,
  REASONING_EFFORTS,
  getEffectiveNarrationEffort,
  getEffectiveNarrationModelKey,
  getNarrationEffortOverride,
  isReasoningEffort,
  setNarrationEffortOverride,
  REASONING_CONFIG_CHANGED_EVENT,
} from "@/app/misc/reasoningTiers";
import {
  SIDE_AGENT_DEFAULT_EFFORT,
  SIDE_AGENT_DEFAULT_MODEL_KEY,
  getObserverModelOverride,
  resolveObserverRewriteModel,
  resolveSideCallModel,
} from "@/app/misc/layerSettings";
import {
  DESIGNER_EFFORT_KEY,
  getDesignerReasoningEffort,
  setDesignerReasoningEffort,
} from "@/app/misc/designerSettings";
import { callDesignerModel } from "@/app/creator/useDesignerSession";
import { callSideModel } from "@/app/misc/sideModelCall";
import { ensureStoryCompacted } from "@/app/misc/compaction";
import type { StoryData } from "@/app/misc/structs";
import { SYNCABLE_SETTINGS_KEYS } from "@/app/misc/syncableSettingsKeys";
import {
  resetClaudeCliStatusCache,
  setOnlineSessionActive,
} from "@/app/misc/claudeCliModels";

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

const SONNET_SUBSCRIPTION = "Claude Sonnet (subscription)";
let dispatchEvent: ReturnType<typeof vi.fn>;

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
  vi.restoreAllMocks();
});

describe("the five efforts", () => {
  it("are none, low, normal, high and xhigh, cheapest first, and none is the default", () => {
    expect(REASONING_EFFORTS).toEqual(["none", "low", "normal", "high", "xhigh"]);
    expect(DEFAULT_REASONING_EFFORT).toBe("none");
    expect(SIDE_AGENT_DEFAULT_EFFORT).toBe("none");
  });

  it("are the only values isReasoningEffort accepts", () => {
    for (const effort of REASONING_EFFORTS) expect(isReasoningEffort(effort)).toBe(true);
    for (const junk of ["", "max", "medium", "HIGH", "high ", null, undefined, 3, {}]) {
      expect(isReasoningEffort(junk), String(junk)).toBe(false);
    }
  });
});

describe("the narration voice's stored effort", () => {
  it("defaults to none when nothing is stored", () => {
    expect(getNarrationEffortOverride()).toBeNull();
    expect(getEffectiveNarrationEffort()).toBe("none");
  });

  it("keeps a stored value, for every effort", () => {
    for (const effort of REASONING_EFFORTS) {
      localStorage.setItem("narrationEffortOverride", effort);
      expect(getNarrationEffortOverride()).toBe(effort);
      expect(getEffectiveNarrationEffort()).toBe(effort);
    }
  });

  it("rejects a junk stored value and reads it as the default", () => {
    for (const junk of ["max", "medium", "", "null", "{}", "HIGH"]) {
      localStorage.setItem("narrationEffortOverride", junk);
      expect(getNarrationEffortOverride(), junk).toBeNull();
      expect(getEffectiveNarrationEffort(), junk).toBe("none");
    }
  });

  it("is written by the setter, cleared by null, and announced to the cost panel", () => {
    setNarrationEffortOverride("high");
    expect(localStorage.getItem("narrationEffortOverride")).toBe("high");
    expect(getEffectiveNarrationEffort()).toBe("high");
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect((dispatchEvent.mock.calls[0][0] as Event).type).toBe(REASONING_CONFIG_CHANGED_EVENT);

    setNarrationEffortOverride(null);
    expect(localStorage.getItem("narrationEffortOverride")).toBeNull();
    expect(getEffectiveNarrationEffort()).toBe("none");

    // A value that is not an effort is never stored.
    setNarrationEffortOverride("max" as never);
    expect(localStorage.getItem("narrationEffortOverride")).toBeNull();
  });

  it("applies to the default voice and to a voice the player picked", () => {
    localStorage.setItem("narrationEffortOverride", "normal");
    expect(getEffectiveNarrationModelKey()).toBe("GLM 5.3");
    expect(getEffectiveNarrationEffort()).toBe("normal");

    localStorage.setItem("narrationModelOverride", "Claude Sonnet 5.5");
    expect(getEffectiveNarrationModelKey()).toBe("Claude Sonnet 5.5");
    expect(getEffectiveNarrationEffort()).toBe("normal");
  });

  it("falls back to none when the voice falls back off the device (decision 16)", () => {
    localStorage.setItem("narrationModelOverride", SONNET_SUBSCRIPTION);
    localStorage.setItem("narrationEffortOverride", "high");

    // The desktop runs the subscription: the effort holds.
    expect(getEffectiveNarrationModelKey()).toBe(SONNET_SUBSCRIPTION);
    expect(getEffectiveNarrationEffort()).toBe("high");

    // A phone or the web build cannot: the voice is the default model, and
    // the effort chosen for the subscription model goes with it.
    fakeCli.platform = false;
    expect(getEffectiveNarrationModelKey()).toBe("GLM 5.3");
    expect(getEffectiveNarrationEffort()).toBe("none");
  });

  it("falls back to none during an online session (decision 29)", () => {
    localStorage.setItem("narrationModelOverride", SONNET_SUBSCRIPTION);
    localStorage.setItem("narrationEffortOverride", "xhigh");
    setOnlineSessionActive(true);
    expect(getEffectiveNarrationModelKey()).toBe("GLM 5.3");
    expect(getEffectiveNarrationEffort()).toBe("none");
  });

  it("falls back to none when the catalog dropped the saved voice", () => {
    localStorage.setItem("narrationModelOverride", "Grok Code Fast 1");
    localStorage.setItem("narrationEffortOverride", "high");
    expect(getEffectiveNarrationModelKey()).toBe("GLM 5.3");
    expect(getEffectiveNarrationEffort()).toBe("none");
  });

  it("syncs between devices next to the narration model", () => {
    const keys = SYNCABLE_SETTINGS_KEYS as readonly string[];
    expect(keys).toContain("narrationEffortOverride");
    expect(keys.indexOf("narrationEffortOverride")).toBe(keys.indexOf("narrationModelOverride") + 1);
  });
});

describe("a side agent's effort (decision 53)", () => {
  it("is none for an unpinned layer, with or without keys", () => {
    expect(resolveSideCallModel(null)).toEqual({
      model: SIDE_AGENT_DEFAULT_MODEL_KEY,
      reasoningEffort: "none",
    });
    expect(resolveSideCallModel(null, { openRouterKey: "or" })).toEqual({
      model: SIDE_AGENT_DEFAULT_MODEL_KEY,
      reasoningEffort: "none",
    });
  });

  it("is none for a subscription pin this device cannot run", () => {
    fakeCli.platform = false;
    expect(
      resolveSideCallModel({ modelKey: SONNET_SUBSCRIPTION, reasoningEffort: "xhigh" }),
    ).toEqual({ model: SIDE_AGENT_DEFAULT_MODEL_KEY, reasoningEffort: "none" });

    fakeCli.platform = true;
    setOnlineSessionActive(true);
    expect(
      resolveSideCallModel({ modelKey: SONNET_SUBSCRIPTION, reasoningEffort: "xhigh" }),
    ).toEqual({ model: SIDE_AGENT_DEFAULT_MODEL_KEY, reasoningEffort: "none" });
  });

  it("stays none when the layer falls to the narration voice for want of a key, even at a high narration effort", () => {
    localStorage.setItem("narrationModelOverride", "Mistral Small 4");
    localStorage.setItem("narrationEffortOverride", "high");
    expect(resolveSideCallModel(null, { mistralKey: "m" })).toEqual({
      model: "Mistral Small 4",
      reasoningEffort: "none",
    });
  });

  it("keeps a pin's own effort", () => {
    for (const reasoningEffort of REASONING_EFFORTS) {
      expect(
        resolveSideCallModel({ modelKey: "Mistral Medium 3.5", reasoningEffort }),
      ).toEqual({ model: "Mistral Medium 3.5", reasoningEffort });
    }
    // ...and a pin the desktop can run keeps the subscription model and its effort.
    expect(
      resolveSideCallModel({ modelKey: SONNET_SUBSCRIPTION, reasoningEffort: "normal" }),
    ).toEqual({ model: SONNET_SUBSCRIPTION, reasoningEffort: "normal" });
  });
});

describe("the Observer's rewrite carries the narration effort (decision 53)", () => {
  it("when the Observer is unpinned", () => {
    expect(resolveObserverRewriteModel(getObserverModelOverride(), "GLM 5.3", "high")).toEqual({
      model: "GLM 5.3",
      reasoningEffort: "high",
    });
    expect(resolveObserverRewriteModel(null, "Ministral 3 8B", "none")).toEqual({
      model: "Ministral 3 8B",
      reasoningEffort: "none",
    });
  });

  it("when its subscription pin cannot run here", () => {
    fakeCli.platform = false;
    expect(
      resolveObserverRewriteModel(
        { modelKey: SONNET_SUBSCRIPTION, reasoningEffort: "low" },
        "GLM 5.3",
        "normal",
      ),
    ).toEqual({ model: "GLM 5.3", reasoningEffort: "normal" });
  });

  it("but a pin keeps its own model and effort", () => {
    expect(
      resolveObserverRewriteModel(
        { modelKey: "Mistral Medium 3.5", reasoningEffort: "low" },
        "GLM 5.3",
        "xhigh",
      ),
    ).toEqual({ model: "Mistral Medium 3.5", reasoningEffort: "low" });
  });
});

describe("the Game Designer's stored effort", () => {
  it("defaults to none", () => {
    expect(getDesignerReasoningEffort()).toBe("none");
  });

  it("keeps a stored value and writes under its own key", () => {
    setDesignerReasoningEffort("normal");
    expect(localStorage.getItem(DESIGNER_EFFORT_KEY)).toBe("normal");
    expect(DESIGNER_EFFORT_KEY).toBe("designerReasoningEffort");
    expect(getDesignerReasoningEffort()).toBe("normal");
  });

  it("rejects a junk stored value, and never stores one", () => {
    localStorage.setItem(DESIGNER_EFFORT_KEY, "max");
    expect(getDesignerReasoningEffort()).toBe("none");
    setDesignerReasoningEffort("sideways" as never);
    expect(localStorage.getItem(DESIGNER_EFFORT_KEY)).toBe("max");
  });

  it("is not synced, like the Designer's model", () => {
    const keys = SYNCABLE_SETTINGS_KEYS as readonly string[];
    expect(keys).not.toContain("designerModel");
    expect(keys).not.toContain(DESIGNER_EFFORT_KEY);
  });
});

describe("the requests that go out", () => {
  const MESSAGES = [{ role: "user" as const, content: "hello" }];

  /** Runs `send` with /api/generate stubbed and returns the body it sent. */
  async function sentBody(send: () => Promise<unknown>): Promise<Record<string, unknown>> {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ content: "ok", toolCalls: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    fakeCli.platform = false;
    await send();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/generate");
    return JSON.parse(init.body as string);
  }

  it("the Designer sends the effort it was given, on every round", async () => {
    for (const reasoningEffort of ["none", "normal", "high"] as const) {
      const body = await sentBody(() =>
        callDesignerModel({
          model: "Claude Sonnet 5.5",
          reasoningEffort,
          messages: MESSAGES,
          apiKeys: { openRouterKey: "or" } as never,
          maxOutputTokens: 8000,
        }),
      );
      expect(body.model).toBe("Claude Sonnet 5.5");
      expect(body.reasoningEffort).toBe(reasoningEffort);
      expect(Array.isArray(body.tools) && body.tools.length > 0).toBe(true);
    }
  });

  it("callSideModel sends the caller's effort", async () => {
    const body = await sentBody(() =>
      callSideModel({
        label: "test",
        model: "Claude Haiku 5.5",
        messages: MESSAGES,
        keys: { openRouterKey: "or" },
        reasoningEffort: "xhigh",
      }),
    );
    expect(body.reasoningEffort).toBe("xhigh");
  });

  it("compaction (and the Compact Story menu, which shares it) sends the effort in its options", async () => {
    const longParagraph =
      "Marcus died defending the gate while the party pressed onward through the ruins. ".repeat(40);
    const storyWith = () =>
      ({
        story_name: "Test Story",
        player_name: "Hero",
        premise: "A test adventure",
        scene: {
          parts: [
            { content: longParagraph, imageUrl: "", user: false, role: "assistant" },
            { content: longParagraph, imageUrl: "", user: false, role: "assistant" },
            { content: "recent short line", imageUrl: "", user: false, role: "assistant" },
          ],
        },
        stats: [],
        resources: [],
        inventory: [],
        abilities: [],
        achievements: [],
        lore: [],
        memory: [],
        npcs: [],
      }) as unknown as StoryData;

    for (const [reasoningEffort, expected] of [
      ["low", "low"],
      [undefined, "none"],
    ] as const) {
      const body = await sentBody(async () => {
        const result = await ensureStoryCompacted(storyWith(), 50, {
          ...resolveSideCallModel(null, { openRouterKey: "or" }),
          reasoningEffort,
          token: null,
          openRouterKey: "or",
        });
        expect(result.ran).toBe(true);
      });
      expect(String(JSON.stringify(body.messages))).toContain("running summary");
      expect(body.reasoningEffort).toBe(expected);
    }
  });

  it("callSideModel sends none for a caller that forgot, not nothing", async () => {
    const body = await sentBody(() =>
      callSideModel({
        label: "test",
        model: "Claude Haiku 5.5",
        messages: MESSAGES,
        keys: { openRouterKey: "or" },
      }),
    );
    expect(body.reasoningEffort).toBe("none");
  });
});
