/**
 * Fantastic Realms expansion E2 (docs/fr-expansion-plan.md): the versioned
 * update of built-in notes a story already holds (updateBuiltinNotes), and
 * the history that drives it.
 */
import { describe, expect, it } from "vitest";
import type { StoryData, StoryLore } from "@/app/misc/structs";
import { BUILTIN_SYSTEMS } from "@/app/misc/systems";
import { BLOOD_AND_BONE } from "@/app/misc/systems/blood-and-bone";
import { BUILTIN_NOTE_HISTORY } from "@/app/misc/systems/builtinNoteHistory";
import {
  addMissingBuiltinNotes,
  hashNoteContent,
  updateBuiltinNotes,
} from "@/app/misc/systems/builtinNotes";
import { FANTASTIC_REALMS } from "@/app/misc/systems/fantastic-realms";
import { CORE_NOTE } from "@/app/misc/systems/fantastic-realms/core";
import { CREATION_NOTE } from "@/app/misc/systems/fantastic-realms/creation";
import { PRE_E2_CORE, PRE_E2_CREATION } from "./helpers/frPreE2Notes";
import { mockStory } from "./helpers/systemsHarness";


function lore(note: { id: string; title: string; type: StoryLore["type"] }, content: string): StoryLore {
  return {
    title: note.title,
    content,
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    type: note.type,
    on: true,
    libraryNoteId: note.id,
  } as StoryLore;
}

/** A Fantastic Realms story holding every pack note, with the core's text swapped. */
function frStory(coreContent: string): StoryData {
  const notes = FANTASTIC_REALMS.packs.flatMap((p) => p.notes);
  const story = mockStory({
    lore: notes.map((n) => lore(n, n.id === CORE_NOTE.id ? coreContent : n.content)),
  });
  return story;
}

describe("BUILTIN_NOTE_HISTORY", () => {
  it("ends every note's list on the hash of its current text", () => {
    for (const sys of BUILTIN_SYSTEMS) {
      for (const pack of sys.packs) {
        for (const n of pack.notes) {
          const list = BUILTIN_NOTE_HISTORY[n.id];
          expect(list, `${n.id} is missing from BUILTIN_NOTE_HISTORY`).toBeDefined();
          expect(list[list.length - 1], n.id).toBe(hashNoteContent(n.content));
        }
      }
    }
  });

  it("records the older core and creation note beside the current one", () => {
    expect(BUILTIN_NOTE_HISTORY[CORE_NOTE.id]).toHaveLength(2);
    expect(BUILTIN_NOTE_HISTORY[CREATION_NOTE.id]).toHaveLength(2);
    expect(BUILTIN_NOTE_HISTORY[CORE_NOTE.id][0]).not.toBe(hashNoteContent(CORE_NOTE.content));
  });

  it("records only the current hash for every Blood & Bone note", () => {
    for (const n of BLOOD_AND_BONE.packs.flatMap((p) => p.notes)) {
      expect(BUILTIN_NOTE_HISTORY[n.id], n.id).toHaveLength(1);
    }
  });
});

describe("updateBuiltinNotes", () => {
  it("replaces an unedited pre-E2 core, a pinned note, with the current one", () => {
    const story = frStory(PRE_E2_CORE.content);
    const res = updateBuiltinNotes(story);
    expect(res.updated).toEqual(["FR — Core rules"]);
    expect(res.keptEdited).toEqual([]);
    const core = story.lore!.find((l) => l.libraryNoteId === CORE_NOTE.id)!;
    expect(core.content).toBe(CORE_NOTE.content);
    expect(core.type).toBe("dm_instructions");
    expect(core.on).toBe(true);
    expect(core.title).toBe("FR — Core rules");
  });

  it("replaces an unedited pre-E2 character creation note too", () => {
    const notes = FANTASTIC_REALMS.packs.flatMap((p) => p.notes);
    const story = mockStory({
      lore: notes.map((n) => lore(n, n.id === CREATION_NOTE.id ? PRE_E2_CREATION.content : n.content)),
    });
    expect(updateBuiltinNotes(story).updated).toEqual(["FR — Character creation"]);
    expect(story.lore!.find((l) => l.libraryNoteId === CREATION_NOTE.id)!.content).toBe(
      CREATION_NOTE.content,
    );
  });

  it("keeps the previous releases hashes in the history", () => {
    expect(BUILTIN_NOTE_HISTORY[CORE_NOTE.id][0]).toBe(hashNoteContent(PRE_E2_CORE.content));
    expect(BUILTIN_NOTE_HISTORY[CREATION_NOTE.id][0]).toBe(hashNoteContent(PRE_E2_CREATION.content));
  });

  it("keeps an edited core and says it was the player's edit", () => {
    const edited = "# FR — Core rules\n\nMy house rules.";
    const story = frStory(edited);
    const res = updateBuiltinNotes(story);
    expect(res.updated).toEqual([]);
    expect(res.keptEdited).toEqual(["FR — Core rules"]);
    expect(story.lore!.find((l) => l.libraryNoteId === CORE_NOTE.id)!.content).toBe(edited);
  });

  it("leaves a current note alone and reports nothing", () => {
    const story = frStory(CORE_NOTE.content);
    const before = JSON.stringify(story.lore);
    expect(updateBuiltinNotes(story)).toEqual({ updated: [], keptEdited: [] });
    expect(JSON.stringify(story.lore)).toBe(before);
  });

  it("does not touch a story that runs no built-in system", () => {
    const story = mockStory({
      lore: [lore({ id: "x", title: "FR — Core rules", type: "dm_instructions" }, "mine")],
    });
    const before = JSON.stringify(story);
    expect(updateBuiltinNotes(story)).toEqual({ updated: [], keptEdited: [] });
    expect(JSON.stringify(story)).toBe(before);
  });

  it("does not touch a story that switched the system tools off", () => {
    const story = frStory(PRE_E2_CORE.content);
    story.systemState = { sessionCount: 0, dedupKeys: [], usesSystemTools: false };
    expect(updateBuiltinNotes(story).updated).toEqual([]);
  });

  it("leaves a Blood & Bone story byte for byte as it was", () => {
    const notes = BLOOD_AND_BONE.packs.flatMap((p) => p.notes);
    const story = mockStory({
      lore: [
        ...notes.map((n) => lore(n, n.content)),
        // an edited one and an older-release one: both kept, neither reported.
        lore(notes[1], "an edit"),
      ],
    });
    const before = JSON.stringify(story);
    expect(updateBuiltinNotes(story)).toEqual({ updated: [], keptEdited: [] });
    expect(JSON.stringify(story)).toBe(before);
  });

  it("adds the new rules notes to an older Fantastic Realms story after the update", () => {
    const old = FANTASTIC_REALMS.packs[0].notes.filter((n) =>
      ["core", "character-creation", "foes", "levels"].some((s) => n.id.endsWith(`:${s}`)),
    );
    const story = mockStory({ lore: old.map((n) => lore(n, n.content)) });
    updateBuiltinNotes(story);
    const added = addMissingBuiltinNotes(story);
    expect(added).toBeGreaterThanOrEqual(9);
    const titles = story.lore!.map((l) => l.title);
    for (const t of [
      "FR — Magic",
      "FR — Gear",
      "FR — Conditions",
      "FR — Callings",
      "FR — Bestiary",
      "FR — Legends",
      "FR — Travel",
      "FR — Downtime",
      "FR — Group play",
    ]) {
      expect(titles, t).toContain(t);
    }
  });
});
