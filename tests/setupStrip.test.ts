/**
 * The session-zero strip's state (docs/session-zero-design.md 3.2, 3.8):
 * the style picker before a mode is chosen, then the four ticks.
 */
import { describe, expect, it } from "vitest";
import { currentSetupHashes } from "@/app/misc/campaignPlan";
import { SETUP_STYLE_LINES, setupStripState } from "@/app/misc/setupStrip";
import type { StoryData, StoryLore } from "@/app/misc/structs";

function note(overrides: Partial<StoryLore>): StoryLore {
  return {
    title: "Note",
    content: "text",
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    type: "lore",
    ...overrides,
  } as StoryLore;
}

const sheet = note({ title: "Character: Hero", content: "Hero.", type: "character_sheet" });
const plan = note({ title: "Campaign Plan", content: "# Plan\nOpening", type: "gm_plan" });

function story(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "S",
    premise: "",
    sessionZeroActive: true,
    scene: { parts: [] },
    lore: [],
    memory: [],
    npcs: [],
    ...overrides,
  } as unknown as StoryData;
}

function ticks(s: StoryData): Record<string, boolean> {
  const state = setupStripState(s);
  if (state.kind !== "checklist") throw new Error(`not a checklist: ${state.kind}`);
  return Object.fromEntries(state.steps.map((x) => [x.id, x.done]));
}

describe("setupStripState", () => {
  it("is hidden once the game has started", () => {
    expect(setupStripState(story({ sessionZeroActive: false }))).toEqual({ kind: "hidden" });
    expect(setupStripState(story({ sessionZeroActive: undefined }))).toEqual({ kind: "hidden" });
  });

  it("offers the style choice until a mode is set", () => {
    expect(setupStripState(story())).toEqual({ kind: "choose" });
    expect(setupStripState(story({ setup: { conceptDone: true } }))).toEqual({ kind: "choose" });
  });

  it("shows the four labels, nothing ticked, after the choice", () => {
    const state = setupStripState(story({ setup: { mode: "quick" } }));
    expect(state).toMatchObject({ kind: "checklist", awaitingApproval: false });
    if (state.kind !== "checklist") return;
    expect(state.steps.map((x) => x.label)).toEqual(["Concept", "Character", "Campaign", "Start"]);
    expect(state.steps.every((x) => !x.done)).toBe(true);
  });

  it("ticks Concept, Character and Campaign from the notes, and names them", () => {
    const s = story({ setup: { mode: "full", conceptDone: true }, lore: [sheet, plan] });
    expect(ticks(s)).toEqual({ concept: true, character: true, campaign: true, start: false });
    const state = setupStripState(s);
    if (state.kind !== "checklist") throw new Error("checklist expected");
    expect(state.steps.find((x) => x.id === "character")?.noteTitle).toBe("Character: Hero");
    expect(state.steps.find((x) => x.id === "campaign")?.noteTitle).toBe("Campaign Plan");
    expect(state.awaitingApproval).toBe(true);
  });

  it("ticks Start on approval, and an edit afterwards takes the tick back", () => {
    const approved = story({
      setup: { mode: "quick", conceptDone: true, approval: currentSetupHashes(story({ lore: [sheet, plan] })) },
      lore: [sheet, plan],
    });
    expect(ticks(approved).start).toBe(true);
    expect(setupStripState(approved)).toMatchObject({ awaitingApproval: false });

    const edited = story({
      setup: approved.setup,
      lore: [{ ...sheet, content: "Hero, changed." }, plan],
    });
    expect(ticks(edited).start).toBe(false);
    expect(setupStripState(edited)).toMatchObject({ awaitingApproval: true });
  });

  it("has a player line for each style", () => {
    expect(SETUP_STYLE_LINES.quick).toBe("Let's do a quick setup.");
    expect(SETUP_STYLE_LINES.full).toBe("Let's build my character step by step.");
  });
});
