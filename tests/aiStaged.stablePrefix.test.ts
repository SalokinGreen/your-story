/**
 * The stable prefix (token-savings plan slice 5, decisions 91 and 100): the
 * GM request is ordered by how often each piece changes - system prompt with
 * nothing per-turn, a stable block, history, then one user message carrying
 * the live state and the player's action.
 */
import { describe, it, expect } from "vitest";
import { buildGMStagePrompt, buildStableBlock, buildLiveBlock } from "@/app/misc/ai_staged";
import { markRoundBreakpoint, storyCacheKey } from "@/app/misc/cacheMarks";
import type { StoryData } from "@/app/misc/structs";
import type { ChatMessage } from "@/app/misc/chatMessage";

function story(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "Test Story",
    premise: "Test premise",
    player_name: "Kira Vance",
    player_summary: "A disgraced ranger",
    scene: { parts: [], summary: "SUMMARY-MARKER" },
    lore: [
      { id: "1", title: "Rules", type: "mechanics", content: "roll d20", enabled: true },
      { id: "2", title: "House Rules", type: "dm_instructions", content: "DM-MARKER", enabled: true },
      { id: "3", title: "Kira", type: "character_sheet", content: "SHEET-MARKER", enabled: true },
      { id: "4", title: "Campaign Plan", type: "gm_plan", content: "PLAN-MARKER", enabled: true },
      { id: "5", title: "Old Mill", type: "location", content: "mill", enabled: true },
    ],
    memory: [],
    npcs: [],
    ...overrides,
  } as unknown as StoryData;
}

const NOTES = {
  pacingNote: "PACING-MARKER",
  observerNote: "OBSERVER-MARKER",
  storyProgressNote: "PROGRESS-MARKER",
  repetitionNote: "REPEAT-MARKER",
  knowledgeNote: "KNOWLEDGE-MARKER",
};

describe("buildGMStagePrompt message order", () => {
  const { messages } = buildGMStagePrompt({
    storyData: story(),
    userChoice: "I open the door",
    ...NOTES,
  });

  it("keeps every per-turn string out of the system prompt", () => {
    const system = messages[0].content;
    expect(messages[0].role).toBe("system");
    for (const marker of Object.values(NOTES)) expect(system).not.toContain(marker);
    expect(system).not.toContain("GM Advice for this scene");
    expect(system).not.toContain("SETUP");
  });

  it("puts the player, DM instructions and summary in the stable block, then an acknowledgement", () => {
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toContain("PLAYER CHARACTER");
    expect(messages[1].content).toContain("DM-MARKER");
    expect(messages[1].content).toContain("SUMMARY-MARKER");
    // The sheet, plan and titles change often and ride in the live block.
    expect(messages[1].content).not.toContain("SHEET-MARKER");
    expect(messages[1].content).not.toContain("PLAN-MARKER");
    expect(messages[1].content).not.toContain("Old Mill");
    expect(messages[2].role).toBe("assistant");
  });

  it("sends the live block and the action as one user message, last (bar a prefill)", () => {
    const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");
    const live = messages[lastUserIndex].content;
    expect(lastUserIndex).toBeGreaterThan(2);
    for (const marker of ["SHEET-MARKER", "PLAN-MARKER", "Old Mill", ...Object.values(NOTES)]) {
      expect(live).toContain(marker);
    }
    expect(live).toContain("> I open the door");
    // No two user messages in a row anywhere.
    for (let i = 1; i < messages.length; i++) {
      expect(messages[i].role === "user" && messages[i - 1].role === "user").toBe(false);
    }
    // The nudges come after the state and right before the action.
    expect(live.indexOf("PLAN-MARKER")).toBeLessThan(live.indexOf("OBSERVER-MARKER"));
    expect(live.indexOf("OBSERVER-MARKER")).toBeLessThan(live.indexOf("> I open the door"));
  });

  it("marks the end of history 'prefix' and the action 'turn'", () => {
    const prefix = messages.findIndex((m) => m.cacheBreakpoint === "prefix");
    const turn = messages.findIndex((m) => m.cacheBreakpoint === "turn");
    expect(prefix).toBe(2); // no history: the acknowledgement
    expect(turn).toBe(3);
    expect(messages.filter((m) => m.cacheBreakpoint).length).toBe(2);
  });
});

describe("the stable prefix across turns", () => {
  it("is byte-identical when only the per-turn notes change", () => {
    const a = buildGMStagePrompt({ storyData: story(), userChoice: "go", ...NOTES });
    const b = buildGMStagePrompt({
      storyData: story(),
      userChoice: "do something else",
      pacingNote: "OTHER",
    });
    const stable = (m: ChatMessage[]) => JSON.stringify(m.slice(0, 3));
    expect(stable(a.messages)).toBe(stable(b.messages));
  });

  it("marks the last history message 'prefix' when there is history", () => {
    const s = story({
      scene: {
        parts: [
          { content: "> look", user: true, role: "user", choices: [], imageUrl: "" },
          { content: "You see a mill.", user: false, role: "assistant", choices: [], imageUrl: "" },
          { content: "> enter", user: true, role: "user", choices: [], imageUrl: "" },
        ],
      },
    } as unknown as Partial<StoryData>);
    const { messages } = buildGMStagePrompt({ storyData: s, userChoice: "enter" });
    const prefix = messages.findIndex((m) => m.cacheBreakpoint === "prefix");
    expect(messages[prefix].content).toContain("You see a mill.");
    expect(messages[prefix + 1].role).toBe("user");
    expect(messages[prefix + 1].cacheBreakpoint).toBe("turn");
  });
});

describe("buildStableBlock / buildLiveBlock", () => {
  it("leave out empty sections", () => {
    const stable = buildStableBlock({ playerSection: "", archetypeSection: "", dmInstructions: "" });
    expect(stable).not.toContain("STORY SO FAR");
    const live = buildLiveBlock({
      loreSection: "",
      npcList: "",
      goalsSection: "",
      threadsSection: "",
      oracleSection: "",
      combatSection: "",
      timersSection: "",
      pendingEventsSection: "",
      pendingMovesSection: "",
      freshStorySetupBlock: "",
      sessionZeroStartGameReminder: "",
      setupOverdueBlock: "",
      observerNoteBlock: "",
      storyProgressNoteBlock: "",
      repetitionNoteBlock: "",
      knowledgeNoteBlock: "",
      pacingFeedbackLine: "",
      gmAdviceSection: "",
    });
    expect(live).not.toContain("PACING");
    expect(live).toContain("LIVE GAME STATE");
  });
});

describe("cache marks and keys", () => {
  it("marks a round's last message on a copy, and only once the round has history", () => {
    const base: ChatMessage[] = [
      { role: "user", content: "action", cacheBreakpoint: "turn" },
    ];
    const round1 = [...base];
    markRoundBreakpoint(round1, false);
    expect(round1[0].cacheBreakpoint).toBe("turn");

    const round2 = [
      ...base,
      { role: "assistant", content: "Let me check.", tool_calls: [{ id: "x" }] } as ChatMessage,
      { role: "tool", content: "result", tool_call_id: "x" } as ChatMessage,
    ];
    markRoundBreakpoint(round2, true);
    // Never on the tool message: the mark walks back to the assistant text.
    expect(round2[2].cacheBreakpoint).toBeUndefined();
    expect(round2[1].cacheBreakpoint).toBe("round");
    expect(base).toHaveLength(1);
    expect(base[0].cacheBreakpoint).toBe("turn");
  });

  it("puts no round mark when only tool or empty messages follow the action", () => {
    const m: ChatMessage[] = [
      { role: "user", content: "action", cacheBreakpoint: "turn" },
      { role: "assistant", content: "", tool_calls: [{ id: "x" }] } as ChatMessage,
      { role: "tool", content: "result", tool_call_id: "x" } as ChatMessage,
    ];
    markRoundBreakpoint(m, true);
    expect(m.some((x) => x.cacheBreakpoint === "round")).toBe(false);
    expect(m[0].cacheBreakpoint).toBe("turn");
  });

  it("never marks an empty message", () => {
    const m: ChatMessage[] = [{ role: "assistant", content: "" }];
    markRoundBreakpoint(m, true);
    expect(m[0].cacheBreakpoint).toBeUndefined();
  });

  it("builds keys per story and stage, and none without a story", () => {
    expect(storyCacheKey("abc", "gm")).toEqual({ cacheKey: "ys:abc:gm" });
    expect(storyCacheKey("abc", "narration")).toEqual({ cacheKey: "ys:abc:narration" });
    expect(storyCacheKey(undefined, "gm")).toEqual({});
  });
});
