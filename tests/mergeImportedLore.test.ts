import { describe, expect, it } from "vitest";
import type { StoryLore } from "@/app/misc/structs";
import { mergeImportedLore } from "@/app/misc/localNotesLibraryManager";

function note(overrides: Partial<StoryLore> & { title: string }): StoryLore {
  return {
    content: "x",
    relatedCharacters: [],
    relatedLocations: [],
    keys: [],
    type: "lore",
    on: true,
    ...overrides,
  } as StoryLore;
}

describe("mergeImportedLore", () => {
  it("appends a note that matches nothing", () => {
    const existing = [note({ title: "Harbour" })];
    const { lore, added, replaced } = mergeImportedLore(existing, [
      note({ title: "Castle", libraryNoteId: "n1" }),
    ]);
    expect(lore.map((l) => l.title)).toEqual(["Harbour", "Castle"]);
    expect(added).toEqual(["Castle"]);
    expect(replaced).toEqual([]);
  });

  it("matches by libraryNoteId even when the title changed, keeping flags", () => {
    const existing = [
      note({ title: "Old name", libraryNoteId: "n1", on: false, pinned: true }),
    ];
    const { lore, replaced } = mergeImportedLore(existing, [
      note({ title: "New name", libraryNoteId: "n1", content: "fresh" }),
    ]);
    expect(lore).toHaveLength(1);
    expect(lore[0].title).toBe("New name");
    expect(lore[0].content).toBe("fresh");
    expect(lore[0].pinned).toBe(true); // a flag the incoming note does not set survives
    expect(replaced).toEqual(["New name"]);
  });

  it("matches an unlinked note by case-insensitive title", () => {
    const existing = [note({ title: "  The Harbour ", content: "mine" })];
    const { lore, replaced } = mergeImportedLore(existing, [
      note({ title: "the harbour", libraryNoteId: "n2", content: "library" }),
    ]);
    expect(lore).toHaveLength(1);
    expect(lore[0].content).toBe("library");
    expect(lore[0].libraryNoteId).toBe("n2");
    expect(replaced).toHaveLength(1);
  });

  it("does not match by title a note linked to a different library note", () => {
    const existing = [note({ title: "Harbour", libraryNoteId: "n1" })];
    const { lore, added } = mergeImportedLore(existing, [
      note({ title: "Harbour", libraryNoteId: "n2" }),
    ]);
    expect(lore).toHaveLength(2);
    expect(added).toEqual(["Harbour"]);
  });

  it("importing the same note twice leaves one copy and does not mutate its input", () => {
    const existing: StoryLore[] = [];
    const incoming = [note({ title: "Rules", libraryNoteId: "builtin:t:core" })];
    const first = mergeImportedLore(existing, incoming);
    const second = mergeImportedLore(first.lore, incoming);
    expect(second.lore).toHaveLength(1);
    expect(existing).toHaveLength(0);
    expect(first.lore).toHaveLength(1);
  });
});
