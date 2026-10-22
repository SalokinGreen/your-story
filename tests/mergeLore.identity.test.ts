/**
 * merge_lore keeps what makes a note a system's note: its library link, its
 * type when the sources agree, and the most restrictive visibility.
 */
import { describe, it, expect } from "vitest";
import { executeTools, mergedLoreIdentity } from "@/app/misc/toolExecutor";
import type { StoryData, StoryLore } from "@/app/misc/structs";
import { resolveSystem } from "@/app/misc/systems/resolve";
import { TEST_SYSTEM } from "./helpers/systemsHarness";

function note(over: Partial<StoryLore> & { title: string }): StoryLore {
  return {
    content: `${over.title} text`,
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    ...over,
  };
}

function story(lore: StoryLore[]): StoryData {
  return {
    story_name: "S",
    premise: "p",
    player_name: "P",
    scene: { parts: [] },
    stats: [],
    resources: [],
    inventory: [],
    abilities: [],
    achievements: [],
    lore,
    memory: [],
  } as unknown as StoryData;
}

function merge(s: StoryData, titles: string[], deleteSources = true) {
  return executeTools(
    [
      {
        id: "m1",
        type: "function",
        function: {
          name: "merge_lore",
          // The names the model is given by the schema. The executor used to
          // read only snake_case spellings, so a real call always failed.
          arguments: JSON.stringify({
            targetTitle: "Merged",
            sourcesTitles: titles,
            delete_sources: deleteSources,
          }),
        },
      },
    ],
    s,
  );
}

describe("mergedLoreIdentity", () => {
  it("keeps the libraryNoteId of the first source that has one", () => {
    const out = mergedLoreIdentity([
      note({ title: "a" }),
      note({ title: "b", libraryNoteId: "builtin:x:1" }),
      note({ title: "c", libraryNoteId: "builtin:x:2" }),
    ]);
    expect(out.libraryNoteId).toBe("builtin:x:1");
  });

  it("keeps type only when every source shares it", () => {
    expect(
      mergedLoreIdentity([
        note({ title: "a", type: "mechanics" }),
        note({ title: "b", type: "mechanics" }),
      ]).type,
    ).toBe("mechanics");
    expect(
      mergedLoreIdentity([
        note({ title: "a", type: "mechanics" }),
        note({ title: "b", type: "table" }),
      ]).type,
    ).toBeUndefined();
    expect(
      mergedLoreIdentity([
        note({ title: "a", type: "mechanics" }),
        note({ title: "b" }),
      ]).type,
    ).toBeUndefined();
  });

  it("takes the most restrictive visibility", () => {
    const v = (...vis: (StoryLore["visibility"] | undefined)[]) =>
      mergedLoreIdentity(
        vis.map((x, i) => note({ title: `n${i}`, visibility: x })),
      ).visibility;
    expect(v(undefined, "always_reveal")).toBeUndefined();
    expect(v("always_reveal", "check_per_turn")).toBe("check_per_turn");
    expect(v("check_per_turn", "to_be_revealed")).toBe("to_be_revealed");
    expect(v("to_be_revealed", "hidden", undefined)).toBe("hidden");
    expect(v("hidden", "always_reveal")).toBe("hidden");
  });
});

describe("merge_lore through the executor", () => {
  it("a hidden note merged into a visible one stays hidden", () => {
    const s = story([
      note({ title: "Open" }),
      note({ title: "Secret", visibility: "hidden", type: "secret" }),
    ]);
    const { responses } = merge(s, ["Open", "Secret"]);
    expect(responses[0].success).toBe(true);
    const merged = s.lore.find((l) => l.title === "Merged");
    expect(merged?.visibility).toBe("hidden");
    expect(merged?.type).toBeUndefined();
    expect(s.lore.map((l) => l.title)).toEqual(["Merged"]);
  });

  it("merged system notes still resolve the system", () => {
    const s = story([
      note({ title: "One", type: "mechanics", libraryNoteId: "builtin:test:core" }),
      note({ title: "Two", type: "mechanics" }),
    ]);
    merge(s, ["One", "Two"]);
    const merged = s.lore.find((l) => l.title === "Merged");
    expect(merged?.libraryNoteId).toBe("builtin:test:core");
    expect(merged?.type).toBe("mechanics");
    expect(resolveSystem(s, [TEST_SYSTEM]).usesSystemTools).toBe(true);
  });
});
