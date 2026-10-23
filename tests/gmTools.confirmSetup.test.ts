/**
 * confirm_setup (docs/session-zero-design.md 3.5): the card before the story
 * starts. Refusals, the card built from the working copy, the four outcomes,
 * the approval hashes, and cancellation (Stop commits nothing and runs
 * nothing after it).
 */
import { describe, expect, it, vi } from "vitest";
import {
  executeGMTools,
  type GMInteractionHandlers,
  type SetupConfirmationAnswer,
  type SetupConfirmationRequest,
} from "@/app/misc/gmExecutor";
import { currentSetupHashes, getSetupProgress } from "@/app/misc/campaignPlan";
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

const sheet = (overrides: Partial<StoryLore> = {}) =>
  note({ title: "Character: Hero", content: "Hero, a Witch.", type: "character_sheet", ...overrides });
const plan = (overrides: Partial<StoryLore> = {}) =>
  note({ title: "Campaign Plan", content: "# Plan\nOpening Image", type: "gm_plan", ...overrides });

function story(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "New Story",
    premise: "",
    sessionZeroActive: true,
    scene: { parts: [] },
    lore: [sheet(), plan()],
    memory: [],
    npcs: [],
    setup: { mode: "quick", conceptDone: true },
    ...overrides,
  } as unknown as StoryData;
}

let n = 0;
function call(name: string, args: Record<string, unknown>) {
  return { id: `c${++n}`, function: { name, arguments: JSON.stringify(args) } };
}

const CONFIRM_ARGS = { character_summary: "Hero, a Witch.", campaign_hook: "A vow in Vienna." };

function handlers(answer: SetupConfirmationAnswer) {
  const requests: SetupConfirmationRequest[] = [];
  const h: GMInteractionHandlers = {
    requestSetupConfirmation: async (req) => {
      requests.push(req);
      return answer;
    },
  };
  return { h, requests };
}

describe("confirm_setup: refusals", () => {
  it("refuses without a sheet, naming it, and never shows the card", async () => {
    const { h, requests } = handlers({ approved: true });
    const out = await executeGMTools([call("confirm_setup", CONFIRM_ARGS)], story({ lore: [plan()] }), {}, h);
    expect(out.results[0].success).toBe(false);
    expect(out.results[0].contextForStory).toContain("character sheet");
    expect(out.results[0].contextForStory).not.toContain("Campaign Plan");
    expect(requests).toHaveLength(0);
  });

  it("refuses without a plan, naming it", async () => {
    const { h, requests } = handlers({ approved: true });
    const out = await executeGMTools([call("confirm_setup", CONFIRM_ARGS)], story({ lore: [sheet()] }), {}, h);
    expect(out.results[0].success).toBe(false);
    expect(out.results[0].contextForStory).toContain("Campaign Plan");
    expect(requests).toHaveLength(0);
  });

  it("names both when both are missing", async () => {
    const { h } = handlers({ approved: true });
    const out = await executeGMTools([call("confirm_setup", CONFIRM_ARGS)], story({ lore: [] }), {}, h);
    expect(out.results[0].contextForStory).toContain("character sheet");
    expect(out.results[0].contextForStory).toContain("Campaign Plan");
  });

  it("names the couch player who has no sheet", async () => {
    const s = story({
      multiplayer: {
        enabled: true,
        couchPlayers: [
          { id: "p1", name: "Hero", color: "#fff" },
          { id: "p2", name: "Bo", color: "#000" },
        ],
      },
    });
    const { h } = handlers({ approved: true });
    const out = await executeGMTools([call("confirm_setup", CONFIRM_ARGS)], s, {}, h);
    expect(out.results[0].success).toBe(false);
    expect(out.results[0].contextForStory).toContain("Bo");
  });

  it("reports itself unavailable when the page provides no card", async () => {
    const out = await executeGMTools([call("confirm_setup", CONFIRM_ARGS)], story());
    expect(out.results[0].success).toBe(false);
    expect(out.results[0].contextForStory).toContain("confirm_setup is unavailable here");
    expect(out.modifiedStoryData.setup?.approval).toBeUndefined();
  });

  it("rejects a call missing its summary", async () => {
    const { h } = handlers({ approved: true });
    const out = await executeGMTools([call("confirm_setup", {})], story(), {}, h);
    expect(out.results[0].success).toBe(false);
  });
});

describe("confirm_setup: the card", () => {
  it("is built from the working copy, including this batch's edits", async () => {
    const { h, requests } = handlers({ approved: true });
    const out = await executeGMTools(
      [
        call("edit_note", { title: "Character: Hero", content: "Hero, a Wendigo.", reason: "x" }),
        call("confirm_setup", CONFIRM_ARGS),
      ],
      story(),
      {},
      h,
    );
    expect(requests).toHaveLength(1);
    const req = requests[0];
    expect(req.characterSummary).toBe(CONFIRM_ARGS.character_summary);
    expect(req.campaignHook).toBe(CONFIRM_ARGS.campaign_hook);
    expect(req.plan).toEqual({ title: "Campaign Plan", content: "# Plan\nOpening Image" });
    // Whatever the sheet text is by now in the working copy, the card shows it
    // and the approval binds to it.
    const sheetInWorkingCopy = out.modifiedStoryData.lore.find((l) => l.type === "character_sheet");
    expect(req.sheets).toEqual([
      { title: "Character: Hero", content: sheetInWorkingCopy?.content },
    ]);
  });

  it("carries one sheet per player", async () => {
    const { h, requests } = handlers({ approved: true });
    await executeGMTools(
      [call("confirm_setup", CONFIRM_ARGS)],
      story({ lore: [sheet(), sheet({ title: "Character: Bo", content: "Bo." }), plan()] }),
      {},
      h,
    );
    expect(requests[0].sheets.map((s) => s.title).sort()).toEqual(["Character: Bo", "Character: Hero"]);
  });
});

describe("confirm_setup: the four outcomes", () => {
  it("approved: writes the approval with the hashes of what was shown", async () => {
    const { h } = handlers({ approved: true });
    const input = story();
    const out = await executeGMTools([call("confirm_setup", CONFIRM_ARGS)], input, {}, h);
    expect(out.results[0].success).toBe(true);
    expect(out.results[0].contextForStory).toContain("Call start_game now");
    expect(out.results[0].contextForStory).toContain("campaign intro");
    expect(out.modifiedStoryData.setup?.approval).toEqual(currentSetupHashes(input));
    expect(out.modifiedStoryData.setup?.mode).toBe("quick");
    expect(getSetupProgress(out.modifiedStoryData).approved).toBe(true);
    // The input story is not mutated until the caller commits.
    expect(input.setup?.approval).toBeUndefined();
  });

  it("changes: returns the note and approves nothing", async () => {
    const { h } = handlers({ approved: false, note: "Make her a Wendigo" });
    const out = await executeGMTools([call("confirm_setup", CONFIRM_ARGS)], story(), {}, h);
    expect(out.results[0].success).toBe(false);
    expect(out.results[0].contextForStory).toContain("Make her a Wendigo");
    expect(out.modifiedStoryData.setup?.approval).toBeUndefined();
    expect(out.aborted).toBeUndefined();
  });

  it("dismissed: asks what to change and approves nothing", async () => {
    const { h } = handlers({ dismissed: true });
    const out = await executeGMTools([call("confirm_setup", CONFIRM_ARGS)], story(), {}, h);
    expect(out.results[0].success).toBe(false);
    expect(out.results[0].contextForStory).toBe(
      "[The player closed the card; ask what they want to change.]",
    );
    expect(out.modifiedStoryData.setup?.approval).toBeUndefined();
    expect(out.aborted).toBeUndefined();
  });

  it("a later edit in the same batch cancels the approval", async () => {
    const { h } = handlers({ approved: true });
    const out = await executeGMTools(
      [
        call("confirm_setup", CONFIRM_ARGS),
        call("edit_note", { title: "Campaign Plan", content: "# Plan\nChanged", reason: "x" }),
      ],
      story(),
      {},
      h,
    );
    expect(out.modifiedStoryData.setup?.approval).toBeDefined();
    expect(getSetupProgress(out.modifiedStoryData).approved).toBe(false);
  });

  it("an approval and start_game in one batch starts the game", async () => {
    const { h } = handlers({ approved: true });
    const out = await executeGMTools(
      [call("confirm_setup", CONFIRM_ARGS), call("start_game", { story_name: "Vienna" })],
      story(),
      {},
      h,
    );
    expect(out.results.map((r) => r.success)).toEqual([true, true]);
    expect(out.modifiedStoryData.sessionZeroActive).toBe(false);
    expect(out.modifiedStoryData.story_name).toBe("Vienna");
  });
});

describe("cancellation", () => {
  it("Stop on the card commits nothing and runs no later tool", async () => {
    const { h } = handlers({ stopped: true });
    const input = story();
    const before = JSON.stringify(input);
    const out = await executeGMTools(
      [call("confirm_setup", CONFIRM_ARGS), call("start_game", { story_name: "Too Early" })],
      input,
      {},
      h,
    );
    expect(out.aborted).toBe(true);
    expect(out.results.map((r) => r.toolName)).toEqual(["confirm_setup"]);
    expect(out.results[0].contextForStory).toContain("stopped");
    expect(out.modifiedStoryData).toBe(input);
    expect(JSON.stringify(out.modifiedStoryData)).toBe(before);
    expect(out.modifiedStoryData.sessionZeroActive).toBe(true);
  });

  it("an abort during a pause stops the batch and drops the working copy", async () => {
    const controller = new AbortController();
    const input = story();
    const before = JSON.stringify(input);
    const out = await executeGMTools(
      [
        call("edit_note", { title: "Character: Hero", content: "Edited before the pause", reason: "x" }),
        call("ask_question", {
          questions: [
            {
              question: "Which?",
              options: [
                { label: "A", description: "a" },
                { label: "B", description: "b" },
              ],
            },
          ],
        }),
        call("start_game", { story_name: "Never" }),
      ],
      input,
      {},
      {
        requestPlayerAnswer: async () => {
          controller.abort(); // the player pressed Stop while the question was up
          return null;
        },
      },
      { abortSignal: controller.signal },
    );
    expect(out.aborted).toBe(true);
    expect(out.results.map((r) => r.toolName)).toEqual(["edit_note", "ask_question"]);
    expect(out.modifiedStoryData).toBe(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("an abort after the card answered still runs nothing further", async () => {
    const controller = new AbortController();
    const start = vi.fn();
    const out = await executeGMTools(
      [call("confirm_setup", CONFIRM_ARGS), call("start_game", { story_name: "Nope" })],
      story(),
      {},
      {
        requestSetupConfirmation: async () => {
          controller.abort();
          start();
          return { approved: true };
        },
      },
      { abortSignal: controller.signal },
    );
    expect(start).toHaveBeenCalledTimes(1);
    expect(out.aborted).toBe(true);
    expect(out.results.map((r) => r.toolName)).toEqual(["confirm_setup"]);
    expect(out.modifiedStoryData.setup?.approval).toBeUndefined();
    expect(out.modifiedStoryData.sessionZeroActive).toBe(true);
  });

  it("an already-aborted signal runs nothing", async () => {
    const controller = new AbortController();
    controller.abort();
    const out = await executeGMTools(
      [call("start_game", { story_name: "Nope" })],
      story(),
      {},
      {},
      { abortSignal: controller.signal },
    );
    expect(out.aborted).toBe(true);
    expect(out.results).toHaveLength(0);
  });

  it("a signal that never fires changes nothing", async () => {
    const controller = new AbortController();
    const { h } = handlers({ approved: true });
    const out = await executeGMTools(
      [call("confirm_setup", CONFIRM_ARGS), call("start_game", { story_name: "Fine" })],
      story(),
      {},
      h,
      { abortSignal: controller.signal },
    );
    expect(out.aborted).toBeUndefined();
    expect(out.modifiedStoryData.sessionZeroActive).toBe(false);
  });
});
