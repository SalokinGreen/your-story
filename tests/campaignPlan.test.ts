/**
 * Campaign Plan Phase 2 (docs/gm-plan-notes-design.md): structured plan state
 * + the advance_plan tool that drives the deterministic re-planning gate.
 * These cover the pure helpers (campaignPlan.ts) and the executor behavior
 * (toolExecutor.ts); the gate's effect on the GM-stage loop is covered
 * separately in generation.planGate.test.ts.
 */
import { describe, it, expect } from "vitest";
import { executeTools, ToolCall } from "@/app/misc/toolExecutor";
import {
  CAMPAIGN_SPINE_BEATS,
  isPlanAwaitingNextBeat,
  findSpinePlanNote,
  currentBeatName,
} from "@/app/misc/campaignPlan";
import type { StoryData, StoryLore } from "@/app/misc/structs";

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
    relationships: [],
    abilities: [],
    npcs: [],
    threads: [],
    ...overrides,
  } as StoryData;
}

function spineNote(overrides: Partial<StoryLore> = {}): StoryLore {
  return {
    title: "Campaign Plan",
    content: "# Campaign Plan\n## Current beat — Opening Image (Session 0)",
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    type: "gm_plan",
    ...overrides,
  } as StoryLore;
}

function call(name: string, args: Record<string, unknown>): ToolCall {
  return { type: "function", function: { name, arguments: args } };
}

describe("campaignPlan helpers", () => {
  it("isPlanAwaitingNextBeat is false without plan state", () => {
    expect(isPlanAwaitingNextBeat(createTestStory())).toBe(false);
  });

  it("isPlanAwaitingNextBeat reflects the awaitingNextBeat flag", () => {
    const story = createTestStory({
      planState: {
        beats: [...CAMPAIGN_SPINE_BEATS],
        currentBeatIndex: 0,
        awaitingNextBeat: true,
      },
    });
    expect(isPlanAwaitingNextBeat(story)).toBe(true);
  });

  it("findSpinePlanNote prefers a title-matched gm_plan note", () => {
    const story = createTestStory({
      lore: [
        spineNote({ title: "Arc — Kael" }),
        spineNote({ title: "Campaign Plan" }),
      ],
    });
    expect(findSpinePlanNote(story)?.title).toBe("Campaign Plan");
  });

  it("currentBeatName returns the beat at the current index", () => {
    const story = createTestStory({
      planState: {
        beats: [...CAMPAIGN_SPINE_BEATS],
        currentBeatIndex: 1,
      },
    });
    expect(currentBeatName(story)).toBe("Inciting Incident (Session 1)");
  });
});

describe("create_note initializes plan state for the spine note", () => {
  it("initializes planState when a gm_plan 'Campaign Plan' note is created", () => {
    const story = createTestStory();
    executeTools(
      [
        call("create_note", {
          title: "Campaign Plan",
          content: "premise + spine",
          type: "gm_plan",
        }),
      ],
      story,
    );
    expect(story.planState).toBeDefined();
    expect(story.planState?.currentBeatIndex).toBe(0);
    expect(story.planState?.beats).toEqual([...CAMPAIGN_SPINE_BEATS]);
    expect(story.planState?.spineNoteTitle).toBe("Campaign Plan");
  });

  it("does NOT initialize planState for a non-spine gm_plan note (e.g. an arc)", () => {
    const story = createTestStory();
    executeTools(
      [
        call("create_note", {
          title: "Arc — Kael",
          content: "current state + directions",
          type: "gm_plan",
        }),
      ],
      story,
    );
    expect(story.planState).toBeUndefined();
  });
});

describe("advance_plan", () => {
  it("complete_current sets awaitingNextBeat and marks the beat done in the note", () => {
    const story = createTestStory({
      lore: [spineNote()],
      planState: { beats: [...CAMPAIGN_SPINE_BEATS], currentBeatIndex: 0 },
    });
    const { responses } = executeTools(
      [
        call("advance_plan", {
          action: "complete_current",
          summary: "The party is established and the world is set.",
        }),
      ],
      story,
    );
    expect(responses[0].success).toBe(true);
    expect(story.planState?.awaitingNextBeat).toBe(true);
    const note = findSpinePlanNote(story);
    expect(note?.content).toContain("complete");
    expect(note?.content).toContain("The party is established");
  });

  it("write_next advances the index, clears the flag, and appends the beat", () => {
    const story = createTestStory({
      lore: [spineNote()],
      planState: {
        beats: [...CAMPAIGN_SPINE_BEATS],
        currentBeatIndex: 0,
        awaitingNextBeat: true,
      },
    });
    const { responses } = executeTools(
      [
        call("advance_plan", {
          action: "write_next",
          next_beat: "Inciting Incident (Session 1)",
          detail: "Goal: the call to adventure lands.\n- [ ] hook delivered",
        }),
      ],
      story,
    );
    expect(responses[0].success).toBe(true);
    expect(story.planState?.currentBeatIndex).toBe(1);
    expect(story.planState?.awaitingNextBeat).toBe(false);
    const note = findSpinePlanNote(story);
    expect(note?.content).toContain("Inciting Incident (Session 1)");
    expect(note?.content).toContain("the call to adventure lands");
  });

  it("write_next at the final beat marks the spine complete without overrunning", () => {
    const lastIndex = CAMPAIGN_SPINE_BEATS.length - 1;
    const story = createTestStory({
      lore: [spineNote()],
      planState: {
        beats: [...CAMPAIGN_SPINE_BEATS],
        currentBeatIndex: lastIndex,
        awaitingNextBeat: true,
      },
    });
    const { responses } = executeTools(
      [call("advance_plan", { action: "write_next", detail: "The end." })],
      story,
    );
    expect(responses[0].success).toBe(true);
    expect(story.planState?.currentBeatIndex).toBe(lastIndex); // did not overrun
    expect(story.planState?.awaitingNextBeat).toBe(false);
    expect(findSpinePlanNote(story)?.content).toContain("Campaign spine complete");
  });

  it("fails when no campaign plan exists", () => {
    const story = createTestStory();
    const { responses } = executeTools(
      [call("advance_plan", { action: "complete_current" })],
      story,
    );
    expect(responses[0].success).toBe(false);
  });

  it("late-initializes plan state for a hand-made plan note lacking it", () => {
    const story = createTestStory({ lore: [spineNote()] });
    executeTools(
      [call("advance_plan", { action: "complete_current", summary: "done" })],
      story,
    );
    expect(story.planState).toBeDefined();
    expect(story.planState?.awaitingNextBeat).toBe(true);
  });
});
