/**
 * computeGMStageBudget: the Memory Size slider (customMaxContext) is the GM
 * stage's input budget. The model's context window only cuts it down when
 * input plus one GM round's reply wouldn't fit.
 *
 * The bug this guards against: the budget used to be
 * `min(slider, window) - model.maxOutputTokens`, i.e. the model's *declared*
 * output ceiling came out of the slider. Every model advertising 65k+ of
 * output (the default DeepSeek V4 Flash, Kimi K3, GLM 5.2, MiniMax M2...)
 * went negative at the default 36k slider - the 2026-10-21 Tauri smoke test
 * logged "Context budget: -92000 tokens" - so getPartsWithinTokenBudget()
 * returned nothing, the GM ran with zero story history, and compaction (which
 * shares this budget) treated the whole scene as aged out every turn.
 */
import { describe, it, expect } from "vitest";
import {
  buildGMStagePrompt,
  computeGMStageBudget,
  GM_STAGE_DEFAULT_BUDGET,
  GM_STAGE_DEFAULT_MAX_OUTPUT,
} from "@/app/misc/ai_staged";
import { planCompaction } from "@/app/misc/compaction";
import { AI_MODELS } from "@/app/misc/ai_prices";
import type { StoryData, ScenePart } from "@/app/misc/structs";

// The Memory Size slider's presets (AIConfigTab.tsx).
const SLIDER_PRESETS = [8000, 16000, 36000, 72000, 120000, 200000];
// Response Length unset (generation.ts's GM-round fallback) and the
// Settings UI's own default.
const RESPONSE_LENGTHS = [undefined, 8000];

const MODELS = Object.entries(AI_MODELS).map(([key, config]) => ({
  key,
  window: config.maxTokens,
  maxOutput: config.maxOutputTokens,
}));

// What a GM round actually sends as max_tokens (generation.ts).
function requestedReply(maxOutput: number, customMaxOutput?: number): number {
  return Math.min(customMaxOutput || GM_STAGE_DEFAULT_MAX_OUTPUT, maxOutput);
}

function createTestStory(parts: ScenePart[]): StoryData {
  return {
    story_name: "Test Story",
    premise: "Test premise",
    player_name: "Test Player",
    scene: { parts },
    stats: [],
    resources: [],
    inventory: [],
    abilities: [],
    achievements: [],
    lore: [],
    memory: [],
    npcs: [],
  } as unknown as StoryData;
}

function part(content: string, user = false): ScenePart {
  return {
    content,
    imageUrl: "",
    user,
    role: user ? "user" : "assistant",
  } as ScenePart;
}

describe("computeGMStageBudget", () => {
  describe.each(MODELS)("$key", ({ key, window, maxOutput }) => {
    it.each(RESPONSE_LENGTHS)(
      "is positive and sensible at every slider preset (Response Length %s)",
      (customMaxOutput) => {
        for (const slider of SLIDER_PRESETS) {
          const { historyBudget, infoBudget, totalContextBudget } =
            computeGMStageBudget(slider, key, customMaxOutput);

          expect(historyBudget).toBeGreaterThan(0);
          expect(infoBudget).toBeGreaterThan(0);
          // Never more than the player asked for...
          expect(totalContextBudget).toBeLessThanOrEqual(slider);
          // ...and never less than the slider or half the window, whichever
          // is smaller, however large the model's declared output is.
          expect(totalContextBudget).toBeGreaterThanOrEqual(
            Math.min(slider, Math.floor(window / 2)),
          );
          // Input plus the reply a GM round requests fits the window,
          // unless that reply alone would take more than half of it (then
          // half is kept for input - see the Phi 4 test below).
          const reply = requestedReply(maxOutput, customMaxOutput);
          if (reply <= window / 2) {
            expect(totalContextBudget + reply).toBeLessThanOrEqual(window);
          }
        }
      },
    );
  });

  it.each([
    "DeepSeek V4 Flash",
    "Grok 4.5",
    "GLM 5.2",
    "Kimi K3",
    "Kimi K2.6",
    "MiniMax M2",
    "DeepInfra MiniMax M2",
    "Mistral Large 3.0",
  ])(
    "gives %s the full default slider despite its large declared output",
    (model) => {
      expect(AI_MODELS[model as keyof typeof AI_MODELS].maxOutputTokens)
        .toBeGreaterThan(GM_STAGE_DEFAULT_BUDGET);

      const budget = computeGMStageBudget(undefined, model);

      expect(budget.totalContextBudget).toBe(GM_STAGE_DEFAULT_BUDGET);
      expect(budget.historyBudget).toBe(21600);
      expect(budget.infoBudget).toBe(14400);
    },
  );

  it("treats a non-positive slider value as the default", () => {
    expect(computeGMStageBudget(0, "Kimi K3").totalContextBudget).toBe(
      GM_STAGE_DEFAULT_BUDGET,
    );
    expect(computeGMStageBudget(-1, "Kimi K3").totalContextBudget).toBe(
      GM_STAGE_DEFAULT_BUDGET,
    );
  });

  it("doesn't take the reply out of the slider when the window has room", () => {
    // Mistral Small 3.2: 128k window, 8k output. The old math gave 28k here.
    expect(
      computeGMStageBudget(36000, "Mistral Small 3.2", 8000)
        .totalContextBudget,
    ).toBe(36000);
  });

  it("caps the slider at the window minus the reply", () => {
    // 128k window - 8k reply.
    expect(
      computeGMStageBudget(200000, "Mistral Small 3.2", 8000)
        .totalContextBudget,
    ).toBe(120000);
    // 40k window - 8k reply.
    expect(
      computeGMStageBudget(72000, "DeepInfra Qwen3 32B").totalContextBudget,
    ).toBe(32000);
  });

  it("reserves the Response Length setting, not the declared output ceiling", () => {
    // MiniMax M2: 204,800 window, 131,072 declared output.
    expect(
      computeGMStageBudget(200000, "MiniMax M2").totalContextBudget,
    ).toBe(204800 - GM_STAGE_DEFAULT_MAX_OUTPUT);
    expect(
      computeGMStageBudget(200000, "MiniMax M2", 32000).totalContextBudget,
    ).toBe(204800 - 32000);
  });

  it("keeps half the window for input when the reply cap would eat more", () => {
    // Phi 4 declares 16k output in a 16k window, and the 12k default reply
    // is more than half of it.
    for (const slider of SLIDER_PRESETS) {
      expect(computeGMStageBudget(slider, "Phi 4").totalContextBudget).toBe(
        8000,
      );
    }
    // Kimi K2.6 declares output equal to its whole window.
    expect(
      computeGMStageBudget(1_000_000, "Kimi K2.6", 1_000_000)
        .totalContextBudget,
    ).toBe(262144 / 2);
  });
});

describe("GM stage history at default settings", () => {
  it("buildGMStagePrompt includes chat history on a large-output model", () => {
    const storyData = createTestStory([
      part("> go north", true),
      part("You head into a narrow corridor."),
      part("> look around", true),
      part("You spot a heavy locked door."),
    ]);

    const { messages } = buildGMStagePrompt({
      storyData,
      userChoice: "try the door",
      modelName: "Kimi K3",
    });

    expect(
      messages.some(
        (m) => m.role === "assistant" && m.content.includes("corridor"),
      ),
    ).toBe(true);
    expect(
      messages.some(
        (m) => m.role === "assistant" && m.content.includes("locked door"),
      ),
    ).toBe(true);
  });

  it("compaction doesn't summarize history that still fits the budget", () => {
    // A few thousand tokens per part: well over compaction's minimum, well
    // under the 21.6k default history budget.
    const paragraph =
      "The party pressed onward through the ancient ruins, wary of traps. ".repeat(
        150,
      );
    const storyData = createTestStory([
      part(paragraph),
      part("> keep going", true),
      part(paragraph),
      part("> open the vault", true),
    ]);

    const { historyBudget } = computeGMStageBudget(undefined, "Kimi K3");

    expect(planCompaction(storyData, historyBudget)).toBeNull();
  });
});
