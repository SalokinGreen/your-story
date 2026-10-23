import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IDBFactory } from "fake-indexeddb";
import type { Meter, ProgressTrack, SceneChallenge, StoryData } from "@/app/misc/structs";
import {
  BUILTIN_SYSTEMS,
  BUILTIN_TIMESTAMP,
  builtinAdventureToLocal,
  builtinPackToLibraryNotes,
  getBuiltinLibraryNote,
  type BuiltinSystem,
} from "@/app/misc/systems";
import { resolveSystem } from "@/app/misc/systems/resolve";
import {
  adventureToDraft,
  createEmptyDraft,
  draftToAdventure,
  importLibraryNotesIntoDraft,
} from "@/app/misc/designer_executor";
import {
  getLibraryNoteOrBuiltin,
  libraryNoteToStoryLore,
} from "@/app/misc/localNotesLibraryManager";
import {
  getLocalStory,
  startAdventureLocally,
} from "@/app/misc/localStoryManager";
import { createMeter, createTrack } from "@/app/misc/metersAndTracks";
import { TEST_SYSTEM } from "./helpers/systemsHarness";
import MetersPanel from "@/app/story/MetersPanel";
import BuiltinSystemsSection from "@/app/library/BuiltinSystemsSection";

const STARTER_ID = "builtin:test:starter";

const SHEET = "# {{Name | who | Nobody}}\nStress: {{Stress | 0-6 | 2}}";

/** TEST_SYSTEM plus a sheet template and one starter that carries meters and a track. */
function makeSystem(): BuiltinSystem {
  const world = createMeter(
    { name: "Heat", min: 0, max: 6, start: 3 },
    "world",
  );
  const track = createTrack("Cohort", "Find the truth", "vow", "dangerous");
  return {
    ...TEST_SYSTEM,
    sheetTemplate: SHEET,
    starters: [
      {
        id: STARTER_ID,
        adventure: {
          title: "The Test Night",
          shortDescription: "A starter.",
          storyTemplate: {
            story_name: "The Test Night",
            premise: "p",
            intro: "i",
            lore: [
              {
                title: "Core",
                content: "x",
                type: "dm_instructions",
                libraryNoteId: "builtin:test:core",
                on: true,
              },
            ],
            meters: [world],
            progressTracks: [track],
          } as unknown as StoryData,
        },
      },
    ],
  };
}

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

let system: BuiltinSystem;
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("localStorage", new MemoryStorage());
  system = makeSystem();
  BUILTIN_SYSTEMS.push(system);
});
afterEach(() => {
  const i = BUILTIN_SYSTEMS.indexOf(system);
  if (i >= 0) BUILTIN_SYSTEMS.splice(i, 1);
});

describe("built-in notes as library notes", () => {
  it("keep their ids and use fixed timestamps", () => {
    const a = builtinPackToLibraryNotes(system.packs[0]);
    const b = builtinPackToLibraryNotes(system.packs[0]);
    expect(a).toEqual(b);
    expect(a[0].id).toBe("builtin:test:core");
    expect(a[0].createdAt).toBe(BUILTIN_TIMESTAMP);
    expect(a[0].updatedAt).toBe(BUILTIN_TIMESTAMP);
    expect(a[0].builtIn).toEqual({ systemId: "test", packId: "test:rules" });
  });

  it("are read back by id for pull, and never from IndexedDB", async () => {
    expect(getBuiltinLibraryNote("builtin:test:core")?.title).toBe("Core");
    expect(getBuiltinLibraryNote("builtin:nope")).toBeUndefined();
    const pulled = await getLibraryNoteOrBuiltin("builtin:test:core");
    expect(pulled?.content).toBe("x");
    // a missing stored id falls through to the real store, which is empty
    expect(await getLibraryNoteOrBuiltin("note_missing")).toBeUndefined();
  });

  it("carry the built-in id into the story's lore, and visibility when set", () => {
    const [note] = builtinPackToLibraryNotes({
      ...system.packs[0],
      notes: [{ ...system.packs[0].notes[0], visibility: "hidden" }],
    });
    const lore = libraryNoteToStoryLore(note);
    expect(lore.libraryNoteId).toBe("builtin:test:core");
    expect(lore.visibility).toBe("hidden");
    expect(
      libraryNoteToStoryLore(builtinPackToLibraryNotes(system.packs[0])[0])
        .visibility,
    ).toBeUndefined();
  });
});

describe("a built-in starter", () => {
  it("becomes a LocalAdventure that is never saved", () => {
    const local = builtinAdventureToLocal(system.starters[0]);
    expect(local.id).toBe(STARTER_ID);
    expect(local.title).toBe("The Test Night");
    expect(local.updatedAt.toISOString()).toBe(BUILTIN_TIMESTAMP);
  });

  it("starts through startAdventureLocally with its meters, and the system is found", async () => {
    const local = builtinAdventureToLocal(system.starters[0]);
    // The player attaches the pack again at the start: the template already
    // holds those notes, so they are replaced, not doubled.
    const attached = libraryNoteToStoryLore(
      builtinPackToLibraryNotes(system.packs[0])[0],
    );
    const id = await startAdventureLocally(
      local.adventureData,
      "Player",
      [attached],
    );
    const story = await getLocalStory(id);
    const data = story!.storyData;
    expect(data.lore.filter((l) => l.libraryNoteId === "builtin:test:core")).toHaveLength(1);
    expect(data.meters?.[0].name).toBe("Heat");
    expect(data.progressTracks?.[0].name).toBe("Find the truth");
    // ensureStoryDataArrays ran: the arrays the app reads without guarding exist
    expect(Array.isArray(data.npcs)).toBe(true);
    expect(Array.isArray(data.goals)).toBe(true);
    expect(resolveSystem(data, BUILTIN_SYSTEMS).usesSystemTools).toBe(true);
  });
});

describe("Open a copy in the Designer", () => {
  it("keeps the starter's meters and tracks through draft and back", () => {
    const local = builtinAdventureToLocal(system.starters[0]);
    const draft = adventureToDraft(local.adventureData);
    expect(draft.meters?.[0].name).toBe("Heat");
    expect(draft.progressTracks?.[0].owner).toBe("Cohort");
    const saved = draftToAdventure(draft);
    expect(saved.storyTemplate?.meters?.[0].name).toBe("Heat");
    expect(saved.storyTemplate?.progressTracks?.[0].name).toBe("Find the truth");
  });

  it("writes no meters for a draft that never had any", () => {
    const saved = draftToAdventure(createEmptyDraft());
    expect(saved.storyTemplate && "meters" in saved.storyTemplate).toBe(false);
    expect(saved.storyTemplate && "progressTracks" in saved.storyTemplate).toBe(false);
  });
});

describe("a Designer import of a built-in pack", () => {
  const notes = () => builtinPackToLibraryNotes(system.packs[0]);

  it("sets the sheet template when the draft has none, and says which system", () => {
    const out = importLibraryNotesIntoDraft(createEmptyDraft(), notes());
    expect(out.draft.characterSheetTemplate?.template).toBe(SHEET);
    expect(out.draft.characterSheetTemplate?.fields.map((f) => f.name)).toEqual(["Name", "Stress"]);
    expect(out.sheetFrom).toBe("Test System");
    expect(out.added).toEqual(["Core"]);
    expect(resolveSystem({ lore: out.draft.lore, systemState: undefined }, BUILTIN_SYSTEMS).usesSystemTools).toBe(true);
  });

  it("leaves an existing sheet template alone", () => {
    const draft = {
      ...createEmptyDraft(),
      characterSheetTemplate: { template: "mine {{A | b | c}}", fields: [] },
    };
    const out = importLibraryNotesIntoDraft(draft, notes());
    expect(out.draft.characterSheetTemplate?.template).toBe("mine {{A | b | c}}");
    expect(out.sheetFrom).toBeUndefined();
  });

  it("importing twice replaces rather than duplicates", () => {
    const first = importLibraryNotesIntoDraft(createEmptyDraft(), notes());
    const second = importLibraryNotesIntoDraft(first.draft, notes());
    expect(second.draft.lore).toHaveLength(1);
    expect(second.replaced).toEqual(["Core"]);
  });
});

describe("MetersPanel", () => {
  const stress: Meter = {
    ...createMeter({ name: "Stress", min: 0, max: 6, start: 3, thresholds: [{ at: 3, label: "Strained" }] }, "Mira"),
    cap: 5,
  };
  const secret: Meter = createMeter(
    { name: "Hidden clock", min: 0, max: 4, start: 1, hidden: true },
    "world",
  );
  const vow: ProgressTrack = { ...createTrack("Mira", "Find Runa", "vow", "dangerous"), ticks: 18 };

  const html = (props: Parameters<typeof MetersPanel>[0]) =>
    renderToStaticMarkup(createElement(MetersPanel, props));

  it("renders nothing when there is nothing to show", () => {
    expect(html({})).toBe("");
    expect(html({ meters: [secret] })).toBe("");
  });

  it("shows a meter with its value, cap and threshold label, but never a hidden one", () => {
    const out = html({ meters: [stress, secret] });
    expect(out).toContain("Stress");
    expect(out).toContain("3/6");
    expect(out).toContain("cap 5");
    expect(out).toContain("Strained");
    expect(out).not.toContain("Hidden clock");
  });

  it("shows a track as ten boxes", () => {
    const out = html({ progressTracks: [vow] });
    expect(out).toContain("Find Runa");
    expect(out).toContain("4 of 10 boxes filled");
  });

  it("shows a tally challenge's round and tally, and a first_to challenge's counts", () => {
    const base = {
      id: "c1",
      name: "Skirmish",
      rounds: 3,
      currentSuccesses: 0,
      currentFailures: 0,
      active: true,
      createdAt: 0,
    } as SceneChallenge;
    expect(html({ activeChallenge: { ...base, mode: "tally", tally: 1, recorded: 1 } })).toContain("Round 2 of 3 · tally +1");
    const first = html({
      activeChallenge: { ...base, currentSuccesses: 1, currentFailures: 2, requiredSuccesses: 3, maxFailures: 3 },
    });
    expect(first).toContain("1 of 3 successes");
    expect(first).toContain("2 of 3 failures");
    expect(html({ activeChallenge: { ...base, active: false } })).toBe("");
  });
});

describe("BuiltinSystemsSection", () => {
  it("renders nothing for an empty registry", () => {
    expect(
      renderToStaticMarkup(
        createElement(BuiltinSystemsSection, {
          onPlay: () => {},
          onOpenCopy: () => {},
          systems: [],
        }),
      ),
    ).toBe("");
  });

  it("lists the system, its pack and its starter with Play and Open a copy", () => {
    const out = renderToStaticMarkup(
      createElement(BuiltinSystemsSection, {
        onPlay: () => {},
        onOpenCopy: () => {},
        systems: [system],
      }),
    );
    expect(out).toContain("Test System");
    expect(out).toContain("Test rules");
    expect(out).toContain("The Test Night");
    expect(out).toContain("Play");
    expect(out).toContain("Open a copy in the Designer");
  });
});
