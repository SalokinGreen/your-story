/**
 * buildGMStagePrompt's reasoning/reasoning_details replay is scoped to only
 * the most recently completed GM round in history, not every past round
 * concatenated into the prompt.
 *
 * Why this matters: OpenRouter's Gemini integration requires a tool call's
 * `reasoning.encrypted` thought signature to be replayed for the model to
 * continue reasoning about that specific call - but replaying an OLDER,
 * already-completed round's encrypted blob on a later, unrelated request is
 * exactly the failure mode reported upstream (OpenRouterTeam/ai-sdk-
 * provider#491: stale `reasoning.encrypted` replayed from history causes a
 * 400 on a later request). Before this fix, every historical assistant
 * message in `gmConversation` had its reasoning/reasoning_details restored
 * unconditionally; now only the last completed round keeps them - older
 * rounds keep their content and tool_calls (still needed for narrative and
 * tool-call continuity) but drop `reasoning_details`, where the encrypted
 * signature lives.
 *
 * The one carve-out: an older round that made tool calls keeps its
 * plain-text `reasoning`. DeepSeek's thinking mode 400s on any assistant
 * message carrying tool_calls without its reasoning_content
 * (api-docs.deepseek.com/guides/thinking_mode), no matter how old the turn
 * is, and plain reasoning text is not a thought signature - it carries none
 * of the staleness the scoping above exists to prevent.
 */
import { describe, it, expect } from "vitest";
import { buildGMStagePrompt } from "@/app/misc/ai_staged";
import type { StoryData, ScenePart } from "@/app/misc/structs";

function createTestStory(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "Test Story",
    premise: "Test premise",
    player_name: "Test Player",
    player_summary: "Test summary",
    intro: "Test intro",
    points: 0,
    earnedPointsFromQuests: [],
    earnedPointsFromChapters: [],
    currentChapter: 0,
    max_chapters: 10,
    scene: { parts: [] },
    chapters: [],
    quests: [],
    stats: [],
    resources: [],
    inventory: [],
    achievements: [],
    lore: [],
    memory: [],
    momentum: 0,
    maxMomentum: 10,
    relationships: [],
    rpgSystem: "3d6",
    abilities: [],
    level: 1,
    upgradesSpent: 0,
    conditions: [],
    npcs: [],
    ...overrides,
  } as StoryData;
}

function userPart(content: string): ScenePart {
  return {
    content,
    imageUrl: "",
    user: true,
    role: "user",
  } as ScenePart;
}

function gmRoundPart(
  content: string,
  reasoningContent: string,
  signature: string,
): ScenePart {
  return {
    content,
    imageUrl: "",
    user: false,
    role: "assistant",
    gmConversation: [
      {
        role: "assistant",
        content,
        reasoning: reasoningContent,
        reasoning_details: [
          { type: "reasoning.encrypted", data: signature, id: `rs_${signature}` },
        ],
      },
    ],
  } as ScenePart;
}

describe("buildGMStagePrompt reasoning replay scoping", () => {
  it("keeps reasoning/reasoning_details only on the most recently completed round", () => {
    const storyData = createTestStory({
      scene: {
        parts: [
          userPart("> go north"),
          gmRoundPart(
            "You head into a narrow corridor.",
            "OLD_REASONING",
            "OLD_SIGNATURE",
          ),
          userPart("> look around"),
          gmRoundPart(
            "You spot a heavy locked door.",
            "NEW_REASONING",
            "NEW_SIGNATURE",
          ),
        ],
      },
    });

    const { messages } = buildGMStagePrompt({
      storyData,
      userChoice: "try the door",
      // Explicit budget: the default modelName's maxOutputTokens (65000)
      // exceeds GM_STAGE_DEFAULT_BUDGET (36000), which zeroes out chat
      // history when customMaxContext is omitted - unrelated to what this
      // test is actually exercising.
      customMaxContext: 200000,
    });

    const oldRoundMsg = messages.find(
      (m) => m.role === "assistant" && m.content.includes("corridor"),
    );
    const newRoundMsg = messages.find(
      (m) => m.role === "assistant" && m.content.includes("locked door"),
    );

    expect(oldRoundMsg).toBeDefined();
    expect(newRoundMsg).toBeDefined();

    // Older, already-completed round: reasoning metadata stripped.
    expect(oldRoundMsg?.reasoning).toBeUndefined();
    expect(oldRoundMsg?.reasoning_details).toBeUndefined();
    // Content itself is untouched - narrative continuity is preserved.
    expect(oldRoundMsg?.content).toContain("corridor");

    // Most recent completed round: reasoning metadata preserved.
    expect(newRoundMsg?.reasoning).toBe("NEW_REASONING");
    expect(newRoundMsg?.reasoning_details).toEqual([
      { type: "reasoning.encrypted", data: "NEW_SIGNATURE", id: "rs_NEW_SIGNATURE" },
    ]);
  });

  it("still preserves tool_calls on older rounds, with their plain reasoning", () => {
    const storyData = createTestStory({
      scene: {
        parts: [
          userPart("> search the shelf"),
          {
            content: "You find a small key.",
            imageUrl: "",
            user: false,
            role: "assistant",
            gmConversation: [
              {
                role: "assistant",
                content: "Rolling to search the shelf.",
                reasoning: "OLD_REASONING",
                reasoning_details: [
                  { type: "reasoning.encrypted", data: "OLD_SIG", id: "rs_old" },
                ],
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: { name: "formula_roll", arguments: "{}" },
                  },
                ],
              },
              {
                role: "tool",
                content: "Rolled 15, success.",
                tool_call_id: "call_1",
              },
            ],
          } as ScenePart,
          userPart("> take the key"),
          gmRoundPart("You pocket the key.", "NEW_REASONING", "NEW_SIG"),
        ],
      },
    });

    const { messages } = buildGMStagePrompt({
      storyData,
      userChoice: "unlock the chest",
      customMaxContext: 200000,
    });

    const oldRoundMsg = messages.find(
      (m) => m.role === "assistant" && m.content.includes("search the shelf"),
    );
    // Kept: DeepSeek 400s on a tool-call message with no reasoning_content.
    expect(oldRoundMsg?.reasoning).toBe("OLD_REASONING");
    // Still dropped: this is the stale encrypted signature the scoping is for.
    expect(oldRoundMsg?.reasoning_details).toBeUndefined();
    expect(oldRoundMsg?.tool_calls).toEqual([
      {
        id: "call_1",
        type: "function",
        function: { name: "formula_roll", arguments: "{}" },
      },
    ]);

    const toolMsg = messages.find(
      (m) => m.role === "tool" && m.tool_call_id === "call_1",
    );
    expect(toolMsg?.content).toBe("Rolled 15, success.");
  });
});
