/**
 * computeGMStageBudget: the Memory Size slider is an *input* budget, so the
 * GM stage's history budget must never go to zero or negative because of a
 * model's output limit.
 *
 * Regression: the budget used to be `min(Memory Size, window) - the model's
 * declared maxOutputTokens`. With the default 36k Memory Size that went
 * negative on every model declaring 36k+ output - including the Grok 4.5
 * (-38,400 history) and Kimi K3 (-55,200) tiers, then the defaults for combat
 * and boss fights - and getPartsWithinTokenBudget then included no story
 * history at all. The defaults are Claude and GLM models now (decision 50),
 * which declare 128k output, so the first block below runs over whatever
 * REASONING_TIERS holds and the literal models after it keep the old heavy
 * tiers covered.
 */
import { describe, it, expect } from "vitest";
import {
  buildGMStagePrompt,
  computeGMStageBudget,
  getGMStageOutputTokens,
  GM_STAGE_DEFAULT_BUDGET,
  GM_STAGE_DEFAULT_OUTPUT,
  GM_STAGE_MIN_BUDGET,
} from "@/app/misc/ai_staged";
import { AI_MODELS, getModelConfig } from "@/app/misc/ai_prices";
import {
  REASONING_TIERS,
  NARRATION_MODEL_KEY,
} from "@/app/misc/reasoningTiers";
import type { StoryData, ScenePart } from "@/app/misc/structs";

const DEFAULT_HISTORY_BUDGET = Math.floor(GM_STAGE_DEFAULT_BUDGET * 0.6);

const defaultModels = [
  ...REASONING_TIERS.map((t) => String(t.modelKey)),
  NARRATION_MODEL_KEY,
];

describe("computeGMStageBudget defaults", () => {
  it.each(defaultModels)(
    "%s gets the full default history budget",
    (modelName) => {
      const { historyBudget, infoBudget, totalContextBudget } =
        computeGMStageBudget(undefined, modelName);
      expect(totalContextBudget).toBe(GM_STAGE_DEFAULT_BUDGET);
      expect(historyBudget).toBe(DEFAULT_HISTORY_BUDGET);
      expect(infoBudget).toBeGreaterThan(0);
    },
  );

  it("is the same with the Response Length default the story page sends", () => {
    for (const modelName of defaultModels) {
      expect(computeGMStageBudget(undefined, modelName, 8000).historyBudget).toBe(
        DEFAULT_HISTORY_BUDGET,
      );
    }
  });

  it("gives every model in AI_MODELS a positive default history budget", () => {
    for (const modelName of Object.keys(AI_MODELS)) {
      const { historyBudget } = computeGMStageBudget(undefined, modelName);
      expect(historyBudget, modelName).toBeGreaterThanOrEqual(
        Math.floor(GM_STAGE_MIN_BUDGET * 0.6),
      );
    }
  });
});

describe("computeGMStageBudget limits", () => {
  it("caps Memory Size at the model window minus the requested output", () => {
    // Mistral Small 4: 256k window, 100k max output, so the 12k default
    // request is what is reserved.
    expect(
      computeGMStageBudget(1_000_000, "Mistral Small 4").totalContextBudget,
    ).toBe(256000 - GM_STAGE_DEFAULT_OUTPUT);
    // DeepInfra Phi 4: 16k window, 8k max output, so the model's own maximum
    // is what is reserved, below the 12k default.
    expect(
      computeGMStageBudget(200000, "DeepInfra Phi 4").totalContextBudget,
    ).toBe(16000 - 8000);
  });

  it("reserves the output the round requests, not the declared max", () => {
    const kimi = getModelConfig("Kimi K3");
    expect(kimi.maxOutputTokens).toBeGreaterThan(GM_STAGE_DEFAULT_OUTPUT);
    expect(
      computeGMStageBudget(5_000_000, "Kimi K3").totalContextBudget,
    ).toBe(kimi.maxTokens - GM_STAGE_DEFAULT_OUTPUT);
    expect(
      computeGMStageBudget(5_000_000, "Kimi K3", 8000).totalContextBudget,
    ).toBe(kimi.maxTokens - 8000);
  });

  it("uses Memory Size as-is when it fits the window", () => {
    expect(computeGMStageBudget(72000, "Grok 4.5").totalContextBudget).toBe(
      72000,
    );
  });

  it("never drops below the floor, even for a tiny custom Memory Size", () => {
    const { historyBudget, totalContextBudget } = computeGMStageBudget(
      500,
      "Ministral 3 8B",
    );
    expect(totalContextBudget).toBe(GM_STAGE_MIN_BUDGET);
    expect(historyBudget).toBeGreaterThan(0);
  });
});

describe("getGMStageOutputTokens", () => {
  it("is the Response Length, capped by the model's max output", () => {
    expect(getGMStageOutputTokens(undefined, "Kimi K3")).toBe(
      GM_STAGE_DEFAULT_OUTPUT,
    );
    expect(getGMStageOutputTokens(4000, "Kimi K3")).toBe(4000);
    expect(getGMStageOutputTokens(50000, "DeepInfra Phi 4")).toBe(8000);
  });
});

describe("buildGMStagePrompt with no Memory Size set", () => {
  it.each(["DeepSeek V4 Flash", "Kimi K3", "Grok 4.5"])(
    "includes story history on %s",
    (modelName) => {
      const storyData = {
        story_name: "Test Story",
        premise: "Test premise",
        player_name: "Test Player",
        scene: {
          parts: [
            { content: "> go north", user: true, role: "user" },
            {
              content: "You head into a narrow corridor.",
              user: false,
              role: "assistant",
            },
          ] as ScenePart[],
        },
        lore: [],
        memory: [],
        npcs: [],
      } as unknown as StoryData;

      const { messages } = buildGMStagePrompt({
        storyData,
        userChoice: "look around",
        modelName,
      });

      expect(
        messages.some(
          (m) => m.role === "assistant" && m.content.includes("corridor"),
        ),
      ).toBe(true);
    },
  );
});
