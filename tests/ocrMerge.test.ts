/**
 * mergeDeterministic / validateMergeGroups tests - the post-import cleanup
 * pass that combines OCR-extracted lore/mechanic/table entries fragmented
 * or duplicated across independently-processed PDF chunks (see ocrMerge.ts
 * and ocrMergeCall.ts).
 */
import { describe, it, expect } from "vitest";
import { mergeDeterministic, mergeLoreEntries } from "@/app/misc/ocrMerge";
import { validateMergeGroups } from "@/app/misc/ocrMergeCall";
import { StoryLore } from "@/app/misc/structs";

function makeLore(overrides: Partial<StoryLore>): StoryLore {
  return {
    title: "Untitled",
    content: "",
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    on: true,
    ...overrides,
  };
}

describe("mergeDeterministic", () => {
  it("merges lore entries with the same title", () => {
    const a = makeLore({
      title: "The Rusty Tankard",
      content: "A tavern in the old quarter.",
      tags: ["tavern"],
      keys: ["tavern"],
    });
    const b = makeLore({
      title: "The Rusty Tankard",
      content: "Run by Gregor Stonebeard.",
      relatedCharacters: ["Gregor Stonebeard"],
      keys: ["gregor"],
    });

    const result = mergeDeterministic([a, b], [], []);

    expect(result.lore).toHaveLength(1);
    expect(result.mergedCount).toBe(1);
    expect(result.lore[0].content).toContain("A tavern in the old quarter.");
    expect(result.lore[0].content).toContain("Run by Gregor Stonebeard.");
    expect(result.lore[0].tags).toEqual(["tavern"]);
    expect(result.lore[0].keys).toEqual(["tavern", "gregor"]);
    expect(result.lore[0].relatedCharacters).toEqual(["Gregor Stonebeard"]);
  });

  it("merges entries that share an alias even with different titles", () => {
    const a = makeLore({
      title: "Vashti's Sanctum",
      content: "An ancient underwater shrine.",
      aliases: ["The Sunken Temple"],
    });
    const b = makeLore({
      title: "The Sunken Temple",
      content: "Said to be cursed.",
    });

    const result = mergeDeterministic([a, b], [], []);

    expect(result.lore).toHaveLength(1);
    expect(result.mergedCount).toBe(1);
    expect(result.lore[0].content).toContain("ancient underwater shrine");
    expect(result.lore[0].content).toContain("cursed");
  });

  it("leaves unrelated entries untouched (no-op passthrough)", () => {
    const a = makeLore({ title: "Gregor Stonebeard", content: "A blacksmith." });
    const b = makeLore({ title: "The Whispering Woods", content: "A dark forest." });

    const result = mergeDeterministic([a, b], [], []);

    expect(result.lore).toHaveLength(2);
    expect(result.mergedCount).toBe(0);
    expect(result.lore.map((l) => l.title).sort()).toEqual(
      ["Gregor Stonebeard", "The Whispering Woods"].sort(),
    );
  });

  it("merges mechanic notes independently from lore", () => {
    const lore = [makeLore({ title: "Combat Rules", content: "Roll d20." })];
    const mech = [
      makeLore({ title: "Combat Rules", content: "Add modifier." }),
      makeLore({ title: "Combat Rules", content: "Beat the DC to succeed." }),
    ];

    const result = mergeDeterministic(lore, mech, []);

    expect(result.lore).toHaveLength(1);
    expect(result.mechanicNotes).toHaveLength(1);
    expect(result.mergedCount).toBe(1);
    expect(result.mechanicNotes[0].content).toContain("Add modifier.");
    expect(result.mechanicNotes[0].content).toContain("Beat the DC to succeed.");
  });

  it("merges table notes with the same normalized title", () => {
    const tableA = makeLore({
      title: "Weather Conditions",
      content: "Roll 1d6:\n1-5. Sunny\n6. Rainy",
      type: "table",
      on: false,
    });
    const tableB = makeLore({
      title: "weather conditions",
      content: "Roll for weather each day.\n\nRoll 1d4:\n1-3. Rainy\n4. Stormy",
      type: "table",
      on: false,
    });

    const result = mergeDeterministic([], [], [tableA, tableB]);

    expect(result.tableNotes).toHaveLength(1);
    expect(result.mergedCount).toBe(1);
    expect(result.tableNotes[0].type).toBe("table");
    expect(result.tableNotes[0].content).toContain("1-5. Sunny");
    expect(result.tableNotes[0].content).toContain("4. Stormy");
    // Merging two halves of a table is no reason to start carrying it in
    // every prompt - it stays keyword-triggered reference material.
    expect(result.tableNotes[0].on).toBe(false);
  });

  it("leaves near-miss table titles alone - they are different rolls", () => {
    const forest = makeLore({
      title: "Wilderness Encounters (Forest)",
      content: "Roll 1d6:\n1. Wolves",
      type: "table",
      on: false,
    });
    const swamp = makeLore({
      title: "Wilderness Encounters (Swamp)",
      content: "Roll 1d6:\n1. Leeches",
      type: "table",
      on: false,
    });

    const result = mergeDeterministic([], [], [forest, swamp]);

    expect(result.tableNotes).toHaveLength(2);
    expect(result.mergedCount).toBe(0);
  });
});

describe("mergeLoreEntries", () => {
  it("uses the provided target title when given", () => {
    const a = makeLore({ title: "Vashti's Sanctum", content: "Shrine." });
    const b = makeLore({ title: "The Sunken Temple", content: "Cursed." });

    const merged = mergeLoreEntries([a, b], "The Sunken Shrine");

    expect(merged.title).toBe("The Sunken Shrine");
  });

  it("falls back to the first entry's title when no target given", () => {
    const a = makeLore({ title: "Vashti's Sanctum", content: "Shrine." });
    const b = makeLore({ title: "The Sunken Temple", content: "Cursed." });

    const merged = mergeLoreEntries([a, b]);

    expect(merged.title).toBe("Vashti's Sanctum");
  });
});

describe("validateMergeGroups", () => {
  it("accepts a well-formed group", () => {
    const groups = validateMergeGroups(
      [{ indices: [0, 2], targetTitle: "Merged Entry" }],
      3,
    );
    expect(groups).toEqual([{ indices: [0, 2], targetTitle: "Merged Entry" }]);
  });

  it("drops groups with fewer than 2 valid indices", () => {
    const groups = validateMergeGroups(
      [{ indices: [0], targetTitle: "Solo" }],
      3,
    );
    expect(groups).toEqual([]);
  });

  it("drops a group that falls below 2 valid indices once out-of-range ones are filtered", () => {
    const groups = validateMergeGroups(
      [{ indices: [0, 99], targetTitle: "Bad" }],
      3,
    );
    expect(groups).toEqual([]);
  });

  it("drops a later group that claims an already-claimed index", () => {
    const groups = validateMergeGroups(
      [
        { indices: [0, 1], targetTitle: "First" },
        { indices: [1, 2], targetTitle: "Second" },
      ],
      3,
    );
    expect(groups).toEqual([{ indices: [0, 1], targetTitle: "First" }]);
  });

  it("drops groups missing a targetTitle or with malformed shape", () => {
    const groups = validateMergeGroups(
      [
        { indices: [0, 1] },
        { indices: [0, 1], targetTitle: "" },
        null,
        "not an object",
      ],
      3,
    );
    expect(groups).toEqual([]);
  });

  it("returns an empty array for non-array input", () => {
    expect(validateMergeGroups(undefined, 3)).toEqual([]);
    expect(validateMergeGroups({ groups: [] }, 3)).toEqual([]);
  });
});
