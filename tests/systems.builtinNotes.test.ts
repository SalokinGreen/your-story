/**
 * Blood & Bone expansion E1, slice 1 (docs/bb-expansion-design.md 3.1-3.3,
 * decisions 150-159): the compact note lists in the live block, built-in notes
 * reaching older stories on load, and the scoped starter.
 *
 * Live block of The Hollow Hour (starter lore, no session zero), cl100k:
 *   before the slice: 1,397 tokens (one line per note, all 38 pack notes + 2)
 *   compact list alone (still 38 notes): 1,314
 *   after the slice (compact list and the starter: 33 pack notes, London only): 1,304
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { getEncoding } from "js-tiktoken";
import { buildGMStagePrompt, renderNoteTitleList } from "@/app/misc/ai_staged";
import type { StoryData, StoryLore } from "@/app/misc/structs";
import { BLOOD_AND_BONE } from "@/app/misc/systems/blood-and-bone";
import { PEOPLE_NOTE } from "@/app/misc/systems/blood-and-bone/oracles/people";
import {
  addMissingBuiltinNotes,
  missingBuiltinNotes,
  pushedBuiltinNotes,
} from "@/app/misc/systems/builtinNotes";
import { resolveSystem } from "@/app/misc/systems/resolve";
import { mockStory } from "./helpers/systemsHarness";
import { checkTableShape } from "./helpers/tableShape";
import { warmTokenizer } from "./helpers/turnHarness";

vi.setConfig({ testTimeout: 60_000 });
beforeAll(async () => {
  await warmTokenizer();
});

const enc = getEncoding("cl100k_base");
const sys = BLOOD_AND_BONE;
const rules = sys.packs[0];
const europe = sys.packs[1];
const starter = sys.starters[0];
const template = starter.adventure.storyTemplate!;

const LIVE_BEFORE = 1397;

function loreOf(ids: string[]): StoryLore[] {
  return [...rules.notes, ...europe.notes]
    .filter((n) => ids.includes(n.id))
    .map((n) => ({
      title: n.title,
      content: n.content,
      relatedCharacters: [],
      relatedLocations: [],
      secrtet: false,
      keys: [],
      type: n.type,
      on: true,
      libraryNoteId: n.id,
    }));
}

function oldSave(): StoryData {
  // A story that started before the expansion: the rules and the whole of
  // Europe by Night, as the starter used to copy them.
  return mockStory({
    lore: loreOf([...rules.notes, ...europe.notes].map((n) => n.id)),
  });
}

describe("the table shape check", () => {
  it("passes the People note", () => {
    expect(checkTableShape(PEOPLE_NOTE.title, PEOPLE_NOTE.content)).toEqual([]);
  });

  it("catches a missing entry, a bad d66 key, a missing Kind and a missing Use when", () => {
    const c = PEOPLE_NOTE.content;
    expect(checkTableShape("t", c.replace(/^50\. .*\n/m, ""))).not.toEqual([]);
    expect(checkTableShape("t", c.replace(/^36 /m, "37 "))).not.toEqual([]);
    expect(checkTableShape("t", c.replace(/^### Ghost\n/m, ""))).not.toEqual([]);
    expect(checkTableShape("t", c.replace(/Use when [\s\S]*$/, "End."))).not.toEqual([]);
    expect(checkTableShape("t", c.replace("## Names (d100)", "## Names"))).not.toEqual([]);
    expect(checkTableShape("t", "Just prose.")).not.toEqual([]);
    expect(checkTableShape("t", "Roll 1d6:\n1. a\n2. b\n")).not.toEqual([]);
    expect(checkTableShape("t", "Roll 1d4:\n1. a\n2. b\n3. c\n4. d\n")).toEqual([]);
  });
});

describe("the compact note list", () => {
  it("folds built-in notes into one line per prefix and keeps story notes whole", () => {
    const out = renderNoteTitleList(
      [
        { title: "B&B — Moves", libraryNoteId: "builtin:blood-and-bone:moves" },
        { title: "B&B — Progress, vows and XP", libraryNoteId: "builtin:blood-and-bone:progress" },
        { title: "My house rules" },
        { title: "B&B — Mine", libraryNoteId: "custom-1" },
      ],
      "rules",
    );
    expect(out.split("\n")).toEqual([
      "- My house rules.md",
      "- B&B — Mine.md",
      '- B&B rules (read_notes "B&B — <name>", <name> as listed here): Moves; Progress, vows and XP',
    ]);
  });

  it("lets the GM rebuild every built-in title exactly", () => {
    const notes = rules.notes.filter((n) => n.type === "mechanics");
    const line = renderNoteTitleList(
      notes.map((n) => ({ title: n.title, libraryNoteId: n.id })),
      "rules",
    );
    const [, names] = line.split("): ");
    const rebuilt = names.split("; ").map((x) => `B&B — ${x}`);
    expect(rebuilt).toEqual(notes.map((n) => n.title));
  });

  function liveBlock(story: StoryData): string {
    const prompt = buildGMStagePrompt({ storyData: story, userChoice: "I go" });
    const live = prompt.messages.find(
      (m) => typeof m.content === "string" && m.content.includes("LIVE GAME STATE"),
    );
    return String(live!.content);
  }

  function starterStory(): StoryData {
    return mockStory({
      lore: template.lore!,
      npcs: template.npcs,
      meters: template.meters,
      progressTracks: template.progressTracks,
    });
  }

  it("lists the starter's tables and creation prompts under their own labels", () => {
    const block = liveBlock(starterStory());
    expect(block).toContain("## 🎲 TABLES");
    expect(block).toContain("## 🎭 CHARACTER CREATION PROMPTS");
    const tables = block.slice(block.indexOf("## 🎲 TABLES"), block.indexOf("## 🎭"));
    expect(tables).toContain("Oracles: complication");
    expect(tables).not.toContain("Creation prompts");
    const prompts = block.slice(block.indexOf("## 🎭"));
    expect(prompts).toContain("Creation prompts: Vampire");
    expect(prompts).not.toContain("Oracles");
    // The pack's notes no longer take a line each.
    expect(block).not.toContain("- B&B — Vampire.md");
    expect(block).toContain('read_notes "B&B — <name>"');
    // A note the story wrote keeps its own line.
    expect(block).toContain("- The truth about Runa.md");
  });

  it("costs fewer live-block tokens than one line per note", () => {
    const tokens = enc.encode(liveBlock(starterStory())).length;
    expect(tokens).toBeLessThan(LIVE_BEFORE);
    // Pinned loosely: a growing pack must not bring back a line per note.
    expect(tokens).toBeLessThan(1350);
  });
});

describe("new built-in notes on load", () => {
  it("pushes the rules and the cross-Europe notes, never a city", () => {
    const pushed = pushedBuiltinNotes(sys);
    expect(pushed.length).toBe(rules.notes.length + 1);
    expect(pushed.every((n) => n.scope === undefined || n.scope === "cross-europe")).toBe(true);
    expect(pushed.some((n) => n.title.endsWith("— London"))).toBe(false);
  });

  const grownSystem = () => {
    const extra = {
      id: "builtin:blood-and-bone:new-family",
      title: "B&B — New family",
      type: "table" as const,
      content: "x",
    };
    return { extra, system: { ...sys, packs: [{ ...rules, notes: [...rules.notes, extra] }, europe] } };
  };

  it("an old save without the list is given a note the pack gained, once", () => {
    const story = oldSave();
    expect(story.systemState).toBeUndefined();
    const { extra, system } = grownSystem();
    expect(missingBuiltinNotes(story, system).map((n) => n.id)).toEqual([extra.id]);
    expect(addMissingBuiltinNotes(story, [system])).toBe(1);
    expect(story.lore.find((l) => l.libraryNoteId === extra.id)?.title).toBe(extra.title);
    expect(story.systemState?.builtinNotesOffered).toContain(extra.id);
    expect(story.systemState?.builtinNotesOffered).toContain(rules.notes[0].id);
    expect(addMissingBuiltinNotes(story, [system])).toBe(0);
  });

  it("adds notes the story never held when the list says only what it was given", () => {
    const story = oldSave();
    const target = rules.notes.find((n) => n.title === "B&B — Oracles: scene")!;
    story.lore = story.lore.filter((l) => l.libraryNoteId !== target.id);
    story.systemState = {
      sessionCount: 0,
      dedupKeys: [],
      builtinNotesOffered: story.lore.map((l) => l.libraryNoteId!),
    };
    expect(addMissingBuiltinNotes(story)).toBe(1);
    const added = story.lore.find((l) => l.libraryNoteId === target.id)!;
    expect(added.title).toBe(target.title);
    expect(added.content).toBe(target.content);
    expect(added.on).toBe(true);
    expect(story.systemState.builtinNotesOffered).toContain(target.id);
    // A second load adds nothing.
    const count = story.lore.length;
    expect(addMissingBuiltinNotes(story)).toBe(0);
    expect(story.lore).toHaveLength(count);
  });

  it("never overwrites a note the player edited", () => {
    const story = oldSave();
    const target = rules.notes.find((n) => n.title === "B&B — Havens")!;
    const edited = story.lore.find((l) => l.libraryNoteId === target.id)!;
    edited.content = "My own havens.";
    story.systemState = { sessionCount: 0, dedupKeys: [], builtinNotesOffered: [] };
    addMissingBuiltinNotes(story);
    expect(story.lore.filter((l) => l.libraryNoteId === target.id)).toHaveLength(1);
    expect(story.lore.find((l) => l.libraryNoteId === target.id)!.content).toBe(
      "My own havens.",
    );
  });

  it("never re-adds a note the player deleted", () => {
    const story = oldSave();
    expect(addMissingBuiltinNotes(story)).toBe(0); // records what it holds
    const target = rules.notes.find((n) => n.title === "B&B — Rites")!;
    story.lore = story.lore.filter((l) => l.libraryNoteId !== target.id);
    expect(addMissingBuiltinNotes(story)).toBe(0);
    expect(story.lore.some((l) => l.libraryNoteId === target.id)).toBe(false);
    expect(missingBuiltinNotes(story, sys)).toEqual([]);
  });

  it("a note added to the pack after a story was offered the old ones arrives once", () => {
    const story = oldSave();
    expect(addMissingBuiltinNotes(story)).toBe(0);
    const { extra, system } = grownSystem();
    expect(addMissingBuiltinNotes(story, [system])).toBe(1);
    expect(story.lore.some((l) => l.libraryNoteId === extra.id)).toBe(true);
    expect(addMissingBuiltinNotes(story, [system])).toBe(0);
  });

  it("leaves a story with no built-in system alone", () => {
    const story = mockStory({ lore: [{ title: "Mine", content: "c", relatedCharacters: [], relatedLocations: [], secrtet: false, keys: [], type: "lore" } as StoryLore] });
    const before = JSON.stringify(story);
    expect(addMissingBuiltinNotes(story)).toBe(0);
    expect(JSON.stringify(story)).toBe(before);
    expect(story.systemState).toBeUndefined();
  });

  it("does not add a note whose title the story already uses for its own", () => {
    const story = oldSave();
    const target = rules.notes.find((n) => n.title === "B&B — Rites")!;
    story.lore = story.lore.filter((l) => l.libraryNoteId !== target.id);
    story.lore.push({ title: "b&b — rites", content: "mine", relatedCharacters: [], relatedLocations: [], secrtet: false, keys: [], type: "lore" } as StoryLore);
    story.systemState = { sessionCount: 0, dedupKeys: [], builtinNotesOffered: [] };
    expect(addMissingBuiltinNotes(story)).toBe(0);
    expect(story.systemState.builtinNotesOffered).toContain(target.id);
  });

  it("keeps the system found, and the tools on, after adding", () => {
    const story = oldSave();
    addMissingBuiltinNotes(story);
    expect(resolveSystem(story).usesSystemTools).toBe(true);
  });
});

describe("the starter's notes", () => {
  it("copies the rules, the cross-Europe notes and London, and no other city", () => {
    const linked = (template.lore ?? [])
      .filter((l) => l.libraryNoteId)
      .map((l) => l.title);
    expect(linked).toContain("Europe by Night — Overview");
    expect(linked).toContain("Europe by Night — London");
    for (const city of ["Paris", "Prague", "Rome", "Berlin", "Vienna"]) {
      expect(linked, city).not.toContain(`Europe by Night — ${city}`);
    }
    for (const n of rules.notes) expect(linked, n.title).toContain(n.title);
  });

  it("is set in London", () => {
    expect(template.intro).toMatch(/Underground|tunnel/);
    expect(template.premise).toMatch(/Underground/);
  });
});
