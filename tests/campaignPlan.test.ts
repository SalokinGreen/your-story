/**
 * Campaign Plan Phase 2 (docs/gm-plan-notes-design.md): structured plan state
 * + the advance_plan tool that drives the deterministic re-planning gate.
 * These cover the pure helpers (campaignPlan.ts) and the executor behavior
 * (toolExecutor.ts); the gate's effect on the GM-stage loop is covered
 * separately in generation.planGate.test.ts.
 */
import { describe, it, expect } from "vitest";
import { executeTools, ToolCall } from "@/app/misc/toolExecutor";
import { executeGMTools } from "@/app/misc/gmExecutor";
import {
  CAMPAIGN_SPINE_BEATS,
  CAMPAIGN_SPINE_SHORT,
  CAMPAIGN_SPINE_MEDIUM,
  CAMPAIGN_SPINE_LONG,
  isPlanAwaitingNextBeat,
  findSpinePlanNote,
  currentBeatName,
  initPlanState,
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

describe("spine length presets", () => {
  it("defaults initPlanState to the medium preset", () => {
    const plan = initPlanState("Campaign Plan");
    expect(plan.beats).toEqual([...CAMPAIGN_SPINE_MEDIUM]);
    expect(plan.spineLength).toBe("medium");
  });

  it("initPlanState honors an explicit short/long preset", () => {
    expect(initPlanState("Campaign Plan", "short").beats).toEqual([
      ...CAMPAIGN_SPINE_SHORT,
    ]);
    expect(initPlanState("Campaign Plan", "long").beats).toEqual([
      ...CAMPAIGN_SPINE_LONG,
    ]);
  });

  it("initPlanState falls back to medium for an unrecognized length value", () => {
    // Defensive fallback (the executor path is guarded by enum validation
    // upstream, but the helper itself should never produce an empty spine).
    const plan = initPlanState("Campaign Plan", "epic" as never);
    expect(plan.beats).toEqual([...CAMPAIGN_SPINE_MEDIUM]);
  });

  it("the long preset has meaningfully more beats than short/medium", () => {
    expect(CAMPAIGN_SPINE_LONG.length).toBeGreaterThan(
      CAMPAIGN_SPINE_MEDIUM.length,
    );
    expect(CAMPAIGN_SPINE_MEDIUM.length).toBeGreaterThan(
      CAMPAIGN_SPINE_SHORT.length,
    );
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

  it("initializes planState with the requested spine length preset", () => {
    const story = createTestStory();
    executeTools(
      [
        call("create_note", {
          title: "Campaign Plan",
          content: "premise + spine",
          type: "gm_plan",
          planSpineLength: "long",
        }),
      ],
      story,
    );
    expect(story.planState?.spineLength).toBe("long");
    expect(story.planState?.beats).toEqual([...CAMPAIGN_SPINE_LONG]);
  });

  it("rejects create_note with a planSpineLength outside the enum", () => {
    const story = createTestStory();
    const { responses } = executeTools(
      [
        call("create_note", {
          title: "Campaign Plan",
          content: "premise + spine",
          type: "gm_plan",
          planSpineLength: "epic",
        }),
      ],
      story,
    );
    expect(responses[0].success).toBe(false);
    expect(story.planState).toBeUndefined();
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

describe("grounding gate (Phase 4): read notes before creating the plan", () => {
  it("rejects creating the Campaign Plan note when grounding notes exist and haven't been read", () => {
    const story = createTestStory({
      lore: [
        {
          title: "The Sunken City",
          content: "An old ruin.",
          relatedCharacters: [],
          relatedLocations: [],
          secrtet: false,
          keys: [],
          type: "lore",
        } as StoryLore,
      ],
    });
    const { responses } = executeTools(
      [
        call("create_note", {
          title: "Campaign Plan",
          content: "premise + spine",
          type: "gm_plan",
        }),
      ],
      story,
    );
    expect(responses[0].success).toBe(false);
    expect(responses[0].message).toMatch(/read_notes|search_notes/);
    expect(story.planState).toBeUndefined();
    expect(story.lore.find((l) => l.title === "Campaign Plan")).toBeUndefined();
  });

  it("allows creating the Campaign Plan note once notesReadThisTurn is true", () => {
    const story = createTestStory({
      lore: [
        {
          title: "The Sunken City",
          content: "An old ruin.",
          relatedCharacters: [],
          relatedLocations: [],
          secrtet: false,
          keys: [],
          type: "lore",
        } as StoryLore,
      ],
      notesReadThisTurn: true,
    });
    const { responses } = executeTools(
      [
        call("create_note", {
          title: "Campaign Plan",
          content: "premise + spine",
          type: "gm_plan",
        }),
      ],
      story,
    );
    expect(responses[0].success).toBe(true);
    expect(story.planState).toBeDefined();
  });

  it("does not gate when there are no existing lore/mechanics/dm_instructions notes to read", () => {
    const story = createTestStory({ lore: [] });
    const { responses } = executeTools(
      [
        call("create_note", {
          title: "Campaign Plan",
          content: "premise + spine",
          type: "gm_plan",
        }),
      ],
      story,
    );
    expect(responses[0].success).toBe(true);
    expect(story.planState).toBeDefined();
  });

  it("search_notes sets notesReadThisTurn, unblocking a subsequent Campaign Plan creation", () => {
    const story = createTestStory({
      lore: [
        {
          title: "The Sunken City",
          content: "An old ruin.",
          relatedCharacters: [],
          relatedLocations: [],
          secrtet: false,
          keys: [],
          type: "lore",
        } as StoryLore,
      ],
    });
    executeTools([call("search_notes", { query: "Sunken" })], story);
    expect(story.notesReadThisTurn).toBe(true);

    const { responses } = executeTools(
      [
        call("create_note", {
          title: "Campaign Plan",
          content: "premise + spine",
          type: "gm_plan",
        }),
      ],
      story,
    );
    expect(responses[0].success).toBe(true);
  });

  it("executeGMTools' read_notes sets notesReadThisTurn on the returned storyData", async () => {
    const story = createTestStory({
      lore: [
        {
          title: "The Sunken City",
          content: "An old ruin.",
          relatedCharacters: [],
          relatedLocations: [],
          secrtet: false,
          keys: [],
          type: "lore",
        } as StoryLore,
      ],
    });
    const gmCall = {
      id: "call_1",
      function: {
        name: "read_notes",
        arguments: JSON.stringify({ titles: ["The Sunken City"] }),
      },
    };
    const { modifiedStoryData } = await executeGMTools([gmCall], story);
    expect(modifiedStoryData.notesReadThisTurn).toBe(true);
  });

  it("a same-round read_notes followed by create_note unblocks plan creation", async () => {
    const story = createTestStory({
      lore: [
        {
          title: "The Sunken City",
          content: "An old ruin.",
          relatedCharacters: [],
          relatedLocations: [],
          secrtet: false,
          keys: [],
          type: "lore",
        } as StoryLore,
      ],
    });
    const gmCalls = [
      {
        id: "call_1",
        function: {
          name: "read_notes",
          arguments: JSON.stringify({ titles: ["The Sunken City"] }),
        },
      },
      {
        id: "call_2",
        function: {
          name: "create_note",
          arguments: JSON.stringify({
            title: "Campaign Plan",
            content: "premise + spine",
            type: "gm_plan",
          }),
        },
      },
    ];
    const { results, modifiedStoryData } = await executeGMTools(gmCalls, story);
    const createResult = results.find((r) => r.toolName === "create_note");
    expect(createResult?.success).toBe(true);
    expect(modifiedStoryData.planState).toBeDefined();
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
