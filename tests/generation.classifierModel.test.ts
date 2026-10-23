/**
 * The tier classifier's model (decision 124): the side-agent model, or Default
 * when the player has no key for that model. A desktop player running both
 * slots on their Claude subscription with no OpenRouter key is the case the
 * fallback exists for - the classifier must still run, on the subscription,
 * as it did when it ran on tier 0's model. The HTTP half (the side-agent model
 * with a key) is tests/generation.effort.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@tauri-apps/api/core", async () => (await import("./helpers/fakeClaudeCli")).fakeTauriCore);

import { fakeCli, CliRunRequest } from "./helpers/fakeClaudeCli";
import { generateStoryTurn, GenerationOptions } from "@/app/misc/generation";
import type { StoryData } from "@/app/misc/structs";

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

const SUBSCRIPTION = { modelKey: "Claude Sonnet (subscription)", reasoningEffort: "high" };

/** No state signal and a long input: the one case that spends a classifier call. */
const LONG_INPUT = "I study the door, the hinges and the lock for a long while, ".repeat(5);

const OPTIONS: GenerationOptions = {
  storyModel: "test-model",
  toolsModel: "test-model",
  choicesModel: "test-model",
  enableTools: true,
  skipChoices: true,
};

let httpModels: string[];

beforeEach(() => {
  fakeCli.reset();
  const storage = new MemoryStorage();
  // Both slots on the subscription, as a desktop player with no API key saves them.
  storage.setItem(
    "reasoningTierOverrides",
    JSON.stringify([SUBSCRIPTION, SUBSCRIPTION, SUBSCRIPTION, SUBSCRIPTION]),
  );
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", {
    localStorage: storage,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
  httpModels = [];
  // The side agents run over HTTP on their own model and fail quietly with no key.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = init?.body ? (JSON.parse(init.body as string) as { model?: string; messages?: { content: string }[] }) : {};
      if (body.messages?.[0]?.content?.includes("Classify the following player action")) {
        httpModels.push(String(body.model));
      }
      throw new Error("no HTTP provider in this test");
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const isClassifierRun = (r: CliRunRequest) =>
  `${r.systemPrompt}\n${r.prompt}`.includes("Classify the following player action");

describe("the tier classifier with no key for the side-agent model", () => {
  it("runs on Default, here the subscription, instead of failing on the missing OpenRouter key", async () => {
    fakeCli.respond = (req) =>
      req.mode.kind === "stream"
        ? { lines: fakeCli.streamed(["freeform"]) }
        : { lines: fakeCli.structured({ narration: "The lock clicks open.", tool_calls: [] }) };

    const story = {
      story_name: "Test Story",
      premise: "A locked door.",
      player_name: "Test Player",
      scene: { parts: [] },
      lore: [],
      memory: [],
      npcs: [],
    } as unknown as StoryData;
    await generateStoryTurn(story, LONG_INPUT, OPTIONS, {});

    // The classifier ran on the CLI (Default's subscription model)...
    const classifierRuns = fakeCli.runs.filter(isClassifierRun);
    expect(classifierRuns).toHaveLength(1);
    expect(classifierRuns[0].model).toBe("sonnet");
    // ...and was never sent over HTTP to the side-agent default.
    expect(httpModels).toEqual([]);
  });
});
