import { describe, it, expect } from "vitest";
import {
  customTableToNote,
  migrateCustomTablesToNotes,
  renderTableEntries,
} from "@/app/misc/tableNotes";
import { CustomTable, StoryLore } from "@/app/misc/structs";

function table(overrides: Partial<CustomTable> = {}): CustomTable {
  return {
    id: "t1",
    name: "Weather",
    description: "Roll at dawn.",
    entries: [
      { text: "Clear", weight: 1 },
      { text: "Rain", weight: 1 },
    ],
    ...overrides,
  };
}

describe("renderTableEntries", () => {
  it("names a die matching the number of even-weighted entries", () => {
    const out = renderTableEntries([
      { text: "Clear", weight: 1 },
      { text: "Rain", weight: 1 },
      { text: "Fog", weight: 1 },
    ]);
    expect(out).toContain("Roll 1d3:");
    expect(out).toContain("1. Clear");
    expect(out).toContain("3. Fog");
  });

  it("turns weights into ranges over the summed die", () => {
    // 3/4/3 is a d10 with 1-3, 4-7, 8-10 - the same distribution the old
    // weighted pick produced, written the way a table is written on paper.
    const out = renderTableEntries([
      { text: "Clear", weight: 3 },
      { text: "Rain", weight: 4 },
      { text: "Fog", weight: 3 },
    ]);
    expect(out).toContain("Roll 1d10:");
    expect(out).toContain("1-3. Clear");
    expect(out).toContain("4-7. Rain");
    expect(out).toContain("8-10. Fog");
  });

  it("clamps unusable weights to 1 so every entry stays rollable", () => {
    const out = renderTableEntries([
      { text: "Clear", weight: 0 },
      { text: "Rain", weight: -2 },
    ]);
    expect(out).toContain("Roll 1d2:");
    expect(out).toContain("1. Clear");
    expect(out).toContain("2. Rain");
  });

  it("drops entries with no text", () => {
    const out = renderTableEntries([
      { text: "Clear", weight: 1 },
      { text: "   ", weight: 1 },
    ]);
    expect(out).toContain("Roll 1d1:");
    expect(out).not.toContain("2.");
  });

  it("returns nothing for an empty table", () => {
    expect(renderTableEntries([])).toBe("");
  });
});

describe("customTableToNote", () => {
  it("keeps the description as context above the listing", () => {
    const note = customTableToNote(table());
    expect(note.type).toBe("table");
    expect(note.title).toBe("Weather");
    expect(note.content).toContain("Roll at dawn.");
    expect(note.content.indexOf("Roll at dawn.")).toBeLessThan(
      note.content.indexOf("Roll 1d2:"),
    );
  });

  it("triggers on its own name instead of loading always", () => {
    const note = customTableToNote(table());
    expect(note.keys).toContain("Weather");
    expect(note.alwaysOn).toBe(false);
    expect(note.enabled).toBe(true);
  });

  it("carries a library link across to the note's own field", () => {
    const note = customTableToNote(table({ libraryTableId: "lib_7" }));
    expect(note.libraryNoteId).toBe("lib_7");
  });
});

describe("migrateCustomTablesToNotes", () => {
  it("returns null when there's nothing to migrate", () => {
    expect(migrateCustomTablesToNotes([], [])).toBeNull();
    expect(migrateCustomTablesToNotes([], undefined)).toBeNull();
  });

  it("appends converted tables to the existing notes", () => {
    const existing: StoryLore[] = [
      {
        title: "The City",
        content: "...",
        relatedCharacters: [],
        relatedLocations: [],
        secrtet: false,
        keys: [],
        type: "lore",
      },
    ];
    const result = migrateCustomTablesToNotes(existing, [table()]);
    expect(result).toHaveLength(2);
    expect(result![1].title).toBe("Weather");
    expect(result![1].type).toBe("table");
  });

  it("is idempotent - a second pass adds no duplicates", () => {
    const first = migrateCustomTablesToNotes([], [table()])!;
    expect(migrateCustomTablesToNotes(first, [table()])).toBeNull();
  });

  it("matches an already-migrated table by library id even if renamed", () => {
    const linked = table({ libraryTableId: "lib_7" });
    const first = migrateCustomTablesToNotes([], [linked])!;
    first[0].title = "Renamed by the author";
    expect(migrateCustomTablesToNotes(first, [linked])).toBeNull();
  });

  it("skips tables with no usable name", () => {
    // These were never rollable - roll_table matched on name - and they
    // can't become a findable note either.
    expect(migrateCustomTablesToNotes([], [table({ name: "  " })])).toBeNull();
  });
});
