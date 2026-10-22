/**
 * Token-savings plan, slice 3 (decisions 94 and 101): history has a fixed
 * start at the summary's end, a summary runs only when the history as SENT
 * passes the budget, and it folds back to half the budget.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  FOLD_TARGET_RATIO,
  applyCompaction,
  measureHistoryTokens,
  planCompaction,
} from "@/app/misc/compaction";
import { getHistoryParts } from "@/app/misc/ai_staged";
import { estimateRenderedPartTokens } from "@/app/misc/historyStubs";
import type { ScenePart, StoryData } from "@/app/misc/structs";
import { seededText, warmTokenizer } from "./helpers/turnHarness";

beforeAll(async () => {
  await warmTokenizer();
});

function story(parts: ScenePart[], extra: Partial<StoryData["scene"]> = {}): StoryData {
  return {
    story_name: "T",
    player_name: "P",
    premise: "",
    scene: { parts, ...extra },
    lore: [],
    memory: [],
    npcs: [],
  } as unknown as StoryData;
}

/** `turns` user/assistant pairs; each reply is ~`replyTokens` tokens of prose. */
function turns(n: number, replyTokens = 300): ScenePart[] {
  const parts: ScenePart[] = [];
  for (let i = 0; i < n; i++) {
    parts.push({ content: `> action ${i}`, imageUrl: "", user: true, role: "user" } as unknown as ScenePart);
    parts.push({
      content: seededText(replyTokens, 50 + i),
      imageUrl: "",
      user: false,
      role: "assistant",
    } as unknown as ScenePart);
  }
  return parts;
}

describe("planCompaction (the real-size trigger)", () => {
  it("makes no plan while the history, as sent, fits the budget", () => {
    const s = story(turns(5)); // ~1,600 tokens
    expect(measureHistoryTokens(s)).toBeLessThan(2000);
    expect(planCompaction(s, 2000)).toBeNull();
  });

  it("folds back until what is left is at or under half the budget", () => {
    const s = story(turns(20)); // ~6,400 tokens against a 2,000 budget
    const plan = planCompaction(s, 2000);
    expect(plan).not.toBeNull();
    applyCompaction(s, plan!, "summary");
    expect(measureHistoryTokens(s)).toBeLessThanOrEqual(2000 * FOLD_TARGET_RATIO);
    // ...and not much less: the fold stops as soon as the rest fits.
    expect(measureHistoryTokens(s)).toBeGreaterThan(2000 * FOLD_TARGET_RATIO * 0.5);
  });

  it("keeps a reply with the action that prompted it", () => {
    const s = story(turns(20));
    const plan = planCompaction(s, 2000)!;
    expect(s.scene.parts[plan.cutoffIndex].user).toBe(true);
  });

  it("always leaves the latest part live, even when it alone is over the target", () => {
    const s = story(turns(2, 1500));
    const plan = planCompaction(s, 2000);
    expect(plan).not.toBeNull();
    expect(plan!.cutoffIndex).toBeLessThanOrEqual(s.scene.parts.length - 1);
  });

  it("snaps to a scene boundary only forward, and never between an action and its reply", () => {
    const parts = turns(20);
    const base = planCompaction(story(parts), 2000)!.cutoffIndex;
    expect(parts[base].user).toBe(true);

    // lastSceneBoundaryIndex points at a reply (odd index here): the cut goes
    // before that reply's action, so the pair stays together.
    const ahead = planCompaction(story(parts, { lastSceneBoundaryIndex: base + 5 }), 2000)!;
    expect(ahead.cutoffIndex).toBe(base + 4);
    expect(parts[ahead.cutoffIndex].user).toBe(true);

    const behind = planCompaction(story(parts, { lastSceneBoundaryIndex: base - 3 }), 2000)!;
    expect(behind.cutoffIndex).toBe(base);

    const tooFar = planCompaction(story(parts, { lastSceneBoundaryIndex: base + 15 }), 2000)!;
    expect(tooFar.cutoffIndex).toBe(base);
  });

  it("only folds what an earlier summary has not covered", () => {
    const s = story(turns(20), { summary: "old", summarizedThroughIndex: 10 });
    const plan = planCompaction(s, 2000)!;
    expect(plan.priorSummary).toBe("old");
    expect(plan.cutoffIndex).toBeGreaterThan(10);
    expect(plan.textToSummarize).not.toContain("action 0\n");
    expect(plan.textToSummarize).toContain("action 5");
  });

  it("counts stubs, not the raw tool results a part carries", () => {
    const withRead = (i: number): ScenePart =>
      ({
        content: "The salon is quiet.",
        imageUrl: "",
        user: false,
        role: "assistant",
        gmConversation: [
          {
            role: "assistant",
            content: "",
            tool_calls: [{ id: `c${i}`, type: "function", function: { name: "read_notes", arguments: '{"titles":["Salon"]}' } }],
          },
          { role: "tool", content: seededText(2000, i), tool_call_id: `c${i}` },
          { role: "assistant", content: "The salon is quiet." },
        ],
      }) as unknown as ScenePart;
    const parts = [withRead(1), withRead(2), withRead(3)];
    // Raw, three 2k reads would be 6k; as sent they are three one-line stubs.
    expect(measureHistoryTokens(story(parts))).toBeLessThan(400);
    expect(planCompaction(story(parts), 2000)).toBeNull();
  });
});

describe("the history start (getHistoryParts)", () => {
  it("begins at summarizedThroughIndex after a summary is applied", () => {
    const s = story(turns(20));
    const plan = planCompaction(s, 2000)!;
    applyCompaction(s, plan, "summary");
    const history = getHistoryParts(s, 2000);
    expect(s.scene.summarizedThroughIndex).toBe(plan.cutoffIndex);
    expect(history.startIndex).toBe(plan.cutoffIndex);
    expect(history.slidingFallback).toBe(false);
  });

  it("leaves no part between the summary and the history (status report 6.20)", () => {
    const s = story(turns(20));
    const plan = planCompaction(s, 2000)!;
    applyCompaction(s, plan, "summary");
    const history = getHistoryParts(s, 2000);
    // Everything after the summary is sent: the history is exactly the tail.
    expect(history.parts).toEqual(s.scene.parts.slice(plan.cutoffIndex));
  });

  it("does not move between turns while it fits, so the prefix only grows at its end", () => {
    const s = story(turns(10), { summary: "old", summarizedThroughIndex: 4 });
    const before = getHistoryParts(s, 4000);
    s.scene.parts.push(...turns(1));
    const after = getHistoryParts(s, 4000);
    expect(after.startIndex).toBe(before.startIndex);
    expect(after.parts.slice(0, before.parts.length)).toEqual(before.parts);
  });

  it("falls back to a sliding window when the history is over budget and no summary ran", () => {
    const s = story(turns(20));
    const history = getHistoryParts(s, 2000);
    expect(history.slidingFallback).toBe(true);
    expect(history.startIndex).toBe(s.scene.parts.length - history.parts.length);
    const tokens = history.parts.reduce(
      (sum, p, i) => sum + estimateRenderedPartTokens(p, history.startIndex + i),
      0,
    );
    expect(tokens).toBeLessThanOrEqual(2000);
    expect(history.parts.length).toBeGreaterThan(0);
  });
});

// At run time page.tsx has already pushed the current player action as the
// last part, and buildGMStagePrompt pops it from the history.
function action(text = "I act"): ScenePart {
  return { content: `> ${text}`, imageUrl: "", user: true, role: "user" } as unknown as ScenePart;
}

describe("planCompaction with the current action as the last part", () => {
  it("keeps the previous action and reply live even when they alone pass the target", () => {
    const parts = [...turns(6, 300), ...turns(1, 1500), action()];
    const plan = planCompaction(story(parts), 2000)!;
    expect(plan).not.toBeNull();
    // [..., user, big reply, current action]: the pair stays, the cut is before it.
    expect(plan.cutoffIndex).toBe(parts.length - 3);
    expect(parts[plan.cutoffIndex].user).toBe(true);
  });

  it("treats the trailing action as the action, not as history", () => {
    const parts = [...turns(20), action()];
    const s = story(parts);
    const plan = planCompaction(s, 2000)!;
    expect(plan.cutoffIndex).toBeLessThanOrEqual(parts.length - 3);
    applyCompaction(s, plan, "summary");
    const history = getHistoryParts(s, 2000);
    expect(history.slidingFallback).toBe(false);
    expect(history.parts[history.parts.length - 1]).toBe(parts[parts.length - 1]);
  });
});
