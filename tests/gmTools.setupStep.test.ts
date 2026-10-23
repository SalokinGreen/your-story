/**
 * ask_question's setup_step and confirm_setup's gate on the creation steps
 * (docs/session-zero-detail-design.md 3.2, 3.3, 3.5): what the executor
 * records, what it refuses to, and what it tells the GM.
 */
import { describe, expect, it } from "vitest";
import {
  executeGMTools,
  type AskQuestionAnswer,
  type AskQuestionRequest,
  type GMInteractionHandlers,
} from "@/app/misc/gmExecutor";
import { getSetupProgress } from "@/app/misc/campaignPlan";
import { BLOOD_AND_BONE } from "@/app/misc/systems/blood-and-bone";
import type { SetupState, StoryData, StoryLore } from "@/app/misc/structs";

function lore(overrides: Partial<StoryLore>): StoryLore {
  return {
    title: "Note",
    content: "text",
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    type: "lore",
    enabled: true,
    ...overrides,
  } as StoryLore;
}

const SHEET = lore({ title: "Character: Nik", type: "character_sheet", content: "Nik, a Witch." });
const PLAN = lore({ title: "Campaign Plan", type: "gm_plan", content: "# Plan\nOpening Image" });
const BB_NOTE = BLOOD_AND_BONE.packs[0].notes[0];
const BB = lore({
  title: BB_NOTE.title,
  type: BB_NOTE.type,
  content: BB_NOTE.content,
  libraryNoteId: BB_NOTE.id,
});
const COUCH = [
  { id: "a", name: "Ann", color: "red" },
  { id: "b", name: "Bo", color: "blue" },
];
const OPTS = [{ label: "A" }, { label: "B" }];

function story(setup: SetupState, notes: StoryLore[] = [], extra: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "New Story",
    premise: "",
    player_name: "Nik",
    sessionZeroActive: true,
    scene: { parts: [] },
    lore: notes,
    memory: [],
    npcs: [],
    setup,
    ...extra,
  } as unknown as StoryData;
}
const couchStory = (setup: SetupState, notes: StoryLore[] = []) =>
  story(setup, notes, {
    multiplayer: { enabled: true, couchPlayers: COUCH },
  } as Partial<StoryData>);

let n = 0;
const call = (name: string, args: Record<string, unknown>) => ({
  id: `c${++n}`,
  function: { name, arguments: JSON.stringify(args) },
});

const q = (extra: Record<string, unknown> = {}) => ({
  question: "Which?",
  options: OPTS,
  ...extra,
});
const ask = (...questions: Record<string, unknown>[]) => call("ask_question", { questions });

const answered = (n = 1): AskQuestionAnswer => ({
  answers: Array.from({ length: n }, () => ({ selectedLabel: "A", skipped: false })),
});

function answering(answer: AskQuestionAnswer | ((r: AskQuestionRequest) => AskQuestionAnswer)) {
  const h: GMInteractionHandlers = {
    requestPlayerAnswer: async (r) => (typeof answer === "function" ? answer(r) : answer),
  };
  return h;
}

async function run(s: StoryData, calls: ReturnType<typeof call>[], h: GMInteractionHandlers, players?: { id: string; name: string }[]) {
  return executeGMTools(calls, s, {}, h, { setupPlayers: players });
}

describe("recording a step", () => {
  it("records a solo player step under 'solo' and names the next one", async () => {
    const s = story({ mode: "full", covered: { table: ["setting", "tone", "campaign"], players: {} } }, [BB]);
    const out = await run(s, [ask(q({ setup_step: "kind" }))], answering(answered()));
    expect(out.modifiedStoryData.setup?.covered?.players).toEqual({ solo: ["kind"] });
    expect(out.results[0].contextForStory).toContain("Recorded: kind (Nik). Next: archetype (Nik).");
    // The input story is not mutated; the working copy carries the record.
    expect(s.setup?.covered?.players).toEqual({});
    // Still counted as an answered setup question.
    expect(out.modifiedStoryData.setup?.questionsAsked).toBe(1);
    expect(out.modifiedStoryData.setup?.conceptDone).toBe(true);
  });

  it("records a table step for the table", async () => {
    const s = story({ mode: "quick" });
    const out = await run(s, [ask(q({ setup_step: "setting" }))], answering(answered()));
    expect(out.modifiedStoryData.setup?.covered).toEqual({ table: ["setting"], players: {} });
    expect(out.results[0].contextForStory).toContain("Recorded: setting. Next: tone.");
  });

  it("says when every required step is covered", async () => {
    const quick = story({ mode: "quick", covered: { table: ["setting"], players: {} } });
    const out = await run(quick, [ask(q({ setup_step: "tone" }))], answering(answered()));
    expect(out.results[0].contextForStory).toContain("Every required step is covered.");
    expect(getSetupProgress(out.modifiedStoryData).next).toBe("character");

    const full = story({ mode: "full", covered: { table: ["setting", "tone", "campaign"], players: { solo: ["name_look", "history"] } } });
    const done = await run(full, [ask(q({ setup_step: "drives" }))], answering(answered()));
    expect(done.results[0].contextForStory).toContain("Every step is covered: write the sheet and the plan.");
  });

  it("ignores an unknown tag and says so, listing the story's steps", async () => {
    const s = story({ mode: "full" });
    const out = await run(s, [ask(q({ setup_step: "kind" }))], answering(answered()));
    // "kind" is Blood & Bone's; this story has no system.
    expect(out.modifiedStoryData.setup?.covered).toBeUndefined();
    expect(out.results[0].contextForStory).toContain('unknown setup_step "kind" ignored');
    expect(out.results[0].contextForStory).toContain("setting, tone, campaign");
    expect(out.results[0].success).toBe(true); // the answer itself still counts
  });

  it("does not count a skipped question", async () => {
    const s = story({ mode: "quick" });
    const out = await run(
      s,
      [ask(q({ setup_step: "setting" }))],
      answering({ answers: [{ skipped: true }] }),
    );
    expect(out.modifiedStoryData.setup?.covered).toBeUndefined();
    // A whole skipped batch is a failed call: nothing recorded either.
    const partial = await run(
      s,
      [ask(q({ setup_step: "setting" }), q())],
      answering({ answers: [{ skipped: true }, { selectedLabel: "A", skipped: false }] }),
    );
    expect(partial.modifiedStoryData.setup?.covered).toBeUndefined();
    expect(partial.results[0].contextForStory).toContain("setting not recorded");
  });

  it("quick mode records setting and tone batched in one call", async () => {
    const s = story({ mode: "quick" });
    const out = await run(
      s,
      [ask(q({ setup_step: "setting" }), q({ setup_step: "tone" }))],
      answering(answered(2)),
    );
    expect(out.modifiedStoryData.setup?.covered?.table).toEqual(["setting", "tone"]);
    expect(out.results[0].contextForStory).toContain("Recorded: setting, tone");
  });

  it("full mode records batched table steps but refuses a player step mixed in", async () => {
    const s = story({ mode: "full" });
    const out = await run(
      s,
      [ask(q({ setup_step: "setting" }), q({ setup_step: "tone" }), q({ setup_step: "drives" }))],
      answering(answered(3)),
    );
    expect(out.modifiedStoryData.setup?.covered?.table).toEqual(["setting", "tone"]);
    expect(out.modifiedStoryData.setup?.covered?.players).toEqual({});
    expect(out.results[0].contextForStory).toContain("Ask one setup step at a time");
  });

  it("full mode records none when two player steps share a call", async () => {
    const s = story({ mode: "full" });
    const out = await run(
      s,
      [ask(q({ setup_step: "drives" }), q({ setup_step: "history" }))],
      answering(answered(2)),
    );
    expect(out.modifiedStoryData.setup?.covered).toBeUndefined();
    expect(out.results[0].contextForStory).toContain("Ask one setup step at a time");
  });

  it("records one step for three items under one tag, once all are answered", async () => {
    const s = story({ mode: "full" });
    const three = [ask(q({ setup_step: "history" }), q({ setup_step: "history" }), q({ setup_step: "history" }))];
    const all = await run(s, three, answering(answered(3)));
    expect(all.modifiedStoryData.setup?.covered?.players).toEqual({ solo: ["history"] });
    expect(all.results[0].contextForStory.match(/Recorded:/g)).toHaveLength(1);

    const oneSkipped = await run(
      s,
      three,
      answering({
        answers: [
          { selectedLabel: "A", skipped: false },
          { skipped: true },
          { selectedLabel: "A", skipped: false },
        ],
      }),
    );
    expect(oneSkipped.modifiedStoryData.setup?.covered).toBeUndefined();
  });

  it("does not record the same step twice", async () => {
    const s = story({ mode: "quick", covered: { table: ["setting"], players: {} } });
    const out = await run(s, [ask(q({ setup_step: "setting" }))], answering(answered()));
    expect(out.modifiedStoryData.setup?.covered?.table).toEqual(["setting"]);
  });

  it("ignores tags outside session zero", async () => {
    const s = story({ mode: "full" }, [], { sessionZeroActive: false });
    const out = await run(s, [ask(q({ setup_step: "setting" }))], answering(answered()));
    expect(out.modifiedStoryData.setup?.covered).toBeUndefined();
    expect(out.results[0].contextForStory).not.toContain("Setup:");
  });

  it("leaves an untagged question alone", async () => {
    const s = story({ mode: "full" });
    const out = await run(s, [ask(q())], answering(answered()));
    expect(out.modifiedStoryData.setup?.covered).toBeUndefined();
    expect(out.results[0].contextForStory).not.toContain("Setup:");
  });
});

describe("per player on the couch", () => {
  it("covers a step for the player the question targets, not the whole couch", async () => {
    const s = couchStory({ mode: "full" });
    const out = await run(
      s,
      [ask(q({ setup_step: "name_look", target_player_name: "Ann" }))],
      answering(answered()),
    );
    expect(out.modifiedStoryData.setup?.covered?.players).toEqual({ a: ["name_look"] });
    const p = getSetupProgress(out.modifiedStoryData);
    const missing = p.creation.missing.map((m) => `${m.step.id}:${m.player ?? "-"}`);
    expect(missing).toContain("name_look:Bo");
    expect(missing).not.toContain("name_look:Ann");
    expect(out.results[0].contextForStory).toContain("Recorded: name_look (Ann).");
  });

  it("matches the target name loosely and keeps each player's own list", async () => {
    let s = couchStory({ mode: "full" });
    for (const [who, step] of [["ann", "name_look"], [" BO ", "name_look"], ["Ann", "drives"]]) {
      const out = await run(
        s,
        [ask(q({ setup_step: step, target_player_name: who }))],
        answering(answered()),
      );
      s = out.modifiedStoryData;
    }
    expect(s.setup?.covered?.players).toEqual({ a: ["name_look", "drives"], b: ["name_look"] });
  });

  it("records nothing for a player step with no or an unknown target", async () => {
    const s = couchStory({ mode: "full" });
    for (const target of [undefined, "Nobody"]) {
      const out = await run(
        s,
        [ask(q({ setup_step: "name_look", ...(target ? { target_player_name: target } : {}) }))],
        answering(answered()),
      );
      expect(out.modifiedStoryData.setup?.covered).toBeUndefined();
      expect(out.results[0].contextForStory).toContain("say which player it is for");
      expect(out.results[0].contextForStory).toContain("Ann, Bo");
    }
  });

  it("records nothing when one tagged item's target differs from the others", async () => {
    const s = couchStory({ mode: "full" });
    const out = await run(
      s,
      [
        ask(
          q({ setup_step: "history", target_player_name: "Ann" }),
          q({ setup_step: "history", target_player_name: "Bo" }),
        ),
      ],
      answering(answered(2)),
    );
    expect(out.modifiedStoryData.setup?.covered).toBeUndefined();
  });

  it("records a table step untargeted, whoever answers (party mode)", async () => {
    // Party seats arrive as the setup roster; the question goes to the
    // spotlight holder, and a table step counts for the table.
    const seats = [
      { id: "seat-1", name: "Mira" },
      { id: "seat-2", name: "Joss" },
    ];
    const s = story({ mode: "full" });
    const out = await run(s, [ask(q({ setup_step: "cohort" }))], answering(answered()), seats);
    expect(out.modifiedStoryData.setup?.covered?.table).toEqual(["cohort"]);
    // A seat's player step is recorded under its seat id.
    const player = await run(
      s,
      [ask(q({ setup_step: "name_look", target_player_name: "Joss" }))],
      answering(answered()),
      seats,
    );
    expect(player.modifiedStoryData.setup?.covered?.players).toEqual({ "seat-2": ["name_look"] });
  });
});

describe("confirm_setup waits for the steps", () => {
  const CONFIRM = { character_summary: "Nik, a Witch.", campaign_hook: "A vow." };
  const approving: GMInteractionHandlers = {
    requestSetupConfirmation: async () => ({ approved: true }),
  };

  it("refuses while required steps are missing, names them, and never shows the card", async () => {
    let shown = 0;
    const h: GMInteractionHandlers = {
      requestSetupConfirmation: async () => {
        shown++;
        return { approved: true };
      },
    };
    const s = story({ mode: "full", covered: { table: ["setting", "tone", "campaign"], players: { solo: ["name_look"] } } }, [SHEET, PLAN]);
    const out = await run(s, [call("confirm_setup", CONFIRM)], h);
    const r = out.results[0];
    expect(r.success).toBe(false);
    expect((r.result as { outcome: string }).outcome).toBe("refused");
    expect(r.contextForStory).toContain("Not yet: you haven't asked Nik about history, drives");
    expect(shown).toBe(0);
    expect(out.modifiedStoryData.setup?.approval).toBeUndefined();
  });

  it("names the table and each player separately", async () => {
    const s = couchStory({ mode: "full", covered: { table: ["setting", "tone", "campaign"], players: { a: ["name_look", "history", "drives"] } } }, [SHEET, PLAN]);
    const out = await run(s, [call("confirm_setup", CONFIRM)], approving);
    expect(out.results[0].contextForStory).toContain("the table about cohort");
    expect(out.results[0].contextForStory).toContain("Bo about name_look, history, drives");
    expect(out.results[0].contextForStory).not.toContain("Ann about");
  });

  it("opens the card, and approval starts the game, once every step is covered", async () => {
    const s = story(
      {
        mode: "full",
        covered: {
          table: ["setting", "tone", "campaign"],
          players: { solo: ["name_look", "history", "drives"] },
        },
      },
      [SHEET, PLAN],
    );
    const out = await run(
      s,
      [call("confirm_setup", { ...CONFIRM, story_name: "Vienna", premise: "A vow in Vienna." })],
      approving,
    );
    const r = out.results[0];
    expect(r.success).toBe(true);
    expect((r.result as { outcome: string; started?: boolean })).toMatchObject({
      outcome: "approved",
      started: true,
    });
    expect(out.results).toHaveLength(1); // one result per call
    expect(r.contextForStory).toContain("the game has started");
    expect(out.modifiedStoryData.sessionZeroActive).toBe(false);
    expect(out.modifiedStoryData.story_name).toBe("Vienna");
    expect(out.modifiedStoryData.premise).toBe("A vow in Vienna.");
    expect(out.modifiedStoryData.setup?.approval).toBeDefined();
  });

  it("falls back to a title when the GM gave none", async () => {
    const s = story({ mode: "quick", covered: { table: ["setting", "tone"], players: {} } }, [SHEET, PLAN]);
    const out = await run(s, [call("confirm_setup", CONFIRM)], approving);
    expect(out.modifiedStoryData.sessionZeroActive).toBe(false);
    expect(out.modifiedStoryData.story_name).toBe("Untitled Story");
  });

  it("dismissed and changes do not start the game", async () => {
    const s = story({ mode: "quick", covered: { table: ["setting", "tone"], players: {} } }, [SHEET, PLAN]);
    for (const answer of [{ dismissed: true as const }, { approved: false as const, note: "Edit" }]) {
      const out = await run(
        s,
        [call("confirm_setup", CONFIRM)],
        { requestSetupConfirmation: async () => answer },
      );
      expect(out.modifiedStoryData.sessionZeroActive).toBe(true);
      expect((out.results[0].result as { started?: boolean }).started).toBeUndefined();
    }
  });
});
