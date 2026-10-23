/**
 * getSetupProgress and hashNotes (campaignPlan.ts): where session zero stands,
 * derived from live state (docs/session-zero-design.md 3.1).
 */
import { describe, expect, it } from "vitest";
import {
  currentSetupHashes,
  getSetupProgress,
  hashNotes,
} from "@/app/misc/campaignPlan";
import { hasCharacterSheetNote } from "@/app/misc/observer";
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
    story_name: "T",
    sessionZeroActive: true,
    scene: { parts: [] },
    lore: [],
    memory: [],
    npcs: [],
    ...overrides,
  } as unknown as StoryData;
}

/** A story with the sheet, the plan and an approval of exactly those. */
function approvedStory(overrides: Partial<StoryData> = {}): StoryData {
  const base = story({ lore: [sheet(), plan()], ...overrides });
  return {
    ...base,
    setup: { mode: "quick", conceptDone: true, approval: currentSetupHashes(base) },
  };
}

describe("getSetupProgress: the steps", () => {
  it("starts at concept on an empty story", () => {
    const p = getSetupProgress(story());
    expect(p).toMatchObject({
      concept: false,
      character: false,
      campaign: false,
      approved: false,
      started: false,
      next: "concept",
    });
  });

  it("needs a chosen mode for the concept, and an answer or a sheet", () => {
    expect(getSetupProgress(story({ setup: { conceptDone: true } })).concept).toBe(false);
    expect(getSetupProgress(story({ setup: { mode: "quick" } })).concept).toBe(false);
    expect(
      getSetupProgress(story({ setup: { mode: "quick", conceptDone: true } })).concept,
    ).toBe(true);
  });

  it("counts a pre-made sheet as the concept once a mode is chosen", () => {
    const s = story({ lore: [sheet()], setup: { mode: "full" } });
    const p = getSetupProgress(s);
    expect(p.concept).toBe(true);
    expect(p.character).toBe(true);
    expect(p.next).toBe("campaign");
  });

  it("does not tick the concept for a pre-made sheet before a style is chosen", () => {
    const p = getSetupProgress(story({ lore: [sheet()] }));
    expect(p.concept).toBe(false);
    expect(p.next).toBe("concept");
  });

  it("walks concept, character, campaign, confirm, start_game", () => {
    const answered = story({ setup: { mode: "quick", conceptDone: true } });
    expect(getSetupProgress(answered).next).toBe("character");

    const withSheet = { ...answered, lore: [sheet()] } as StoryData;
    expect(getSetupProgress(withSheet).next).toBe("campaign");

    const withPlan = { ...withSheet, lore: [sheet(), plan()] } as StoryData;
    const p = getSetupProgress(withPlan);
    expect(p).toMatchObject({ character: true, campaign: true, approved: false });
    expect(p.next).toBe("confirm");

    const approved = approvedStory();
    const pa = getSetupProgress(approved);
    expect(pa.approved).toBe(true);
    expect(pa.next).toBe("start_game");
  });

  it("reports started, and no next step, once session zero is over", () => {
    const p = getSetupProgress({ ...approvedStory(), sessionZeroActive: false });
    expect(p.started).toBe(true);
    expect(p.next).toBeNull();
    const old = getSetupProgress(story({ sessionZeroActive: undefined }));
    expect(old.started).toBe(true);
    expect(old.next).toBeNull();
  });
});

describe("getSetupProgress: the character step", () => {
  it("ignores a disabled sheet and an empty one", () => {
    expect(getSetupProgress(story({ lore: [sheet({ enabled: false })] })).character).toBe(false);
    expect(getSetupProgress(story({ lore: [sheet({ content: "   " })] })).character).toBe(false);
  });

  it("needs one sheet per couch player, matched by owner or title", () => {
    const players = [
      { id: "p1", name: "Ada" },
      { id: "p2", name: "Bo" },
    ];
    const couch = (lore: StoryLore[]) =>
      story({
        lore,
        multiplayer: {
          enabled: true,
          couchPlayers: players.map((p) => ({ ...p, color: "#fff" })),
        },
      });

    const one = getSetupProgress(couch([sheet({ title: "Character: Ada" })]));
    expect(one.character).toBe(false);
    expect(one.missingSheetFor).toEqual(["Bo"]);

    const byTitle = getSetupProgress(
      couch([sheet({ title: "Character: Ada" }), sheet({ title: "character:  bo" })]),
    );
    expect(byTitle.character).toBe(true);

    const byOwner = getSetupProgress(
      couch([
        sheet({ title: "Ada's sheet", ownerCouchPlayerId: "p1" }),
        sheet({ title: "Whatever", ownerCouchPlayerId: "p2" }),
      ]),
    );
    expect(byOwner.character).toBe(true);
  });

  it("does not let an owned sheet be claimed by title for another player", () => {
    const p = getSetupProgress(
      story({ lore: [sheet({ title: "Character: Bo", ownerCouchPlayerId: "p1" })] }),
      [
        { id: "p1", name: "Ada" },
        { id: "p2", name: "Bo" },
      ],
    );
    expect(p.character).toBe(false);
    expect(p.missingSheetFor).toEqual(["Bo"]);
  });

  it("takes an explicit player list (party seats) over the story", () => {
    const seats = [
      { id: "s1", name: "Cy" },
      { id: "s2", name: "Di" },
    ];
    const s = story({ lore: [sheet({ title: "Character: Cy" })] });
    expect(getSetupProgress(s, seats).character).toBe(false);
    expect(getSetupProgress(s).character).toBe(true); // solo default
  });

  it("needs only one sheet for a lone couch player", () => {
    const s = story({
      lore: [sheet()],
      multiplayer: { enabled: true, couchPlayers: [{ id: "p1", name: "Ada", color: "#fff" }] },
    });
    expect(getSetupProgress(s).character).toBe(true);
  });
});

describe("getSetupProgress: the campaign step", () => {
  it("needs an existing, enabled gm_plan note", () => {
    expect(getSetupProgress(story({ lore: [plan()] })).campaign).toBe(true);
    expect(getSetupProgress(story({ lore: [plan({ enabled: false })] })).campaign).toBe(false);
    expect(getSetupProgress(story()).campaign).toBe(false);
  });

  it("does not count a stale planState with no note", () => {
    const s = story({
      planState: { beats: ["Opening Image (Session 0)"], currentBeatIndex: 0 },
    });
    expect(getSetupProgress(s).campaign).toBe(false);
  });
});

describe("approval and its hashes", () => {
  it("holds while the sheet and the plan are unchanged", () => {
    expect(getSetupProgress(approvedStory()).approved).toBe(true);
  });

  it("is cancelled by an edit to the sheet", () => {
    const s = approvedStory();
    const edited = { ...s, lore: [sheet({ content: "Hero, a Wendigo." }), plan()] } as StoryData;
    const p = getSetupProgress(edited);
    expect(p.approved).toBe(false);
    expect(p.next).toBe("confirm");
  });

  it("is cancelled by an edit to the plan", () => {
    const s = approvedStory();
    const edited = { ...s, lore: [sheet(), plan({ content: "# Plan\nAnother" })] } as StoryData;
    expect(getSetupProgress(edited).approved).toBe(false);
  });

  it("is cancelled when a sheet is added, and when the plan is removed", () => {
    const s = approvedStory();
    expect(
      getSetupProgress({ ...s, lore: [...s.lore, sheet({ title: "Character: Two" })] } as StoryData)
        .approved,
    ).toBe(false);
    expect(getSetupProgress({ ...s, lore: [sheet()] } as StoryData).approved).toBe(false);
  });

  it("is not set by approval hashes alone when a step is missing", () => {
    const s = approvedStory();
    expect(getSetupProgress({ ...s, lore: [plan()] } as StoryData).approved).toBe(false);
  });

  it("is unaffected by unrelated notes", () => {
    const s = approvedStory();
    const p = getSetupProgress({ ...s, lore: [...s.lore, note({ title: "Vienna" })] } as StoryData);
    expect(p.approved).toBe(true);
  });
});

describe("hashNotes", () => {
  it("is stable and order-independent", () => {
    const a = { title: "A", content: "one" };
    const b = { title: "B", content: "two" };
    expect(hashNotes([a, b])).toBe(hashNotes([b, a]));
    expect(hashNotes([a, b])).toBe(hashNotes([{ ...a }, { ...b }]));
  });

  it("changes with a title or a character of content", () => {
    const base = hashNotes([{ title: "A", content: "one" }]);
    expect(hashNotes([{ title: "A", content: "onf" }])).not.toBe(base);
    expect(hashNotes([{ title: "B", content: "one" }])).not.toBe(base);
    expect(hashNotes([])).not.toBe(base);
  });

  it("does not confuse where a title ends and the content begins", () => {
    expect(hashNotes([{ title: "ab", content: "c" }])).not.toBe(
      hashNotes([{ title: "a", content: "bc" }]),
    );
  });
});

describe("hasCharacterSheetNote (moved to campaignPlan, re-exported by observer)", () => {
  it("is the same test as before", () => {
    expect(hasCharacterSheetNote(story({ lore: [sheet()] }))).toBe(true);
    expect(hasCharacterSheetNote(story({ lore: [sheet({ content: " " })] }))).toBe(false);
    expect(hasCharacterSheetNote(story())).toBe(false);
  });
});
