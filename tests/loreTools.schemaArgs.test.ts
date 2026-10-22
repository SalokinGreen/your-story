/**
 * The lore tools read the argument names their schema gives the model
 * (engine review of PR C): merge_lore into an existing target, duplicate_lore
 * and edit_lore_insert, all through the real validate + execute path.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { executeTools } from "@/app/misc/toolExecutor";
import type { StoryData, StoryLore } from "@/app/misc/structs";

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

function call(s: StoryData, name: string, args: Record<string, unknown>) {
  return executeTools(
    [
      {
        id: "t1",
        type: "function",
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
    s,
  ).responses[0];
}

describe("merge_lore into an existing target", () => {
  it("merges one source into the target, target text first, no duplicate title", () => {
    const s = story([
      note({
        title: "Rules",
        content: "base",
        type: "mechanics",
        libraryNoteId: "builtin:x:1",
      }),
      note({ title: "Extra", content: "more" }),
    ]);
    const r = call(s, "merge_lore", {
      targetTitle: "rules",
      sourcesTitles: ["Extra"],
    });
    expect(r.success).toBe(true);
    expect(s.lore.map((l) => l.title)).toEqual(["Rules"]);
    expect(s.lore[0].content.startsWith("base")).toBe(true);
    expect(s.lore[0].content).toContain("## Extra\n\nmore");
    expect(s.lore[0].libraryNoteId).toBe("builtin:x:1");
  });

  it("does not count the target as a source, and keeps the most restrictive visibility", () => {
    const s = story([
      note({ title: "Rules", content: "base" }),
      note({ title: "Hush", content: "shh", visibility: "hidden" }),
    ]);
    const r = call(s, "merge_lore", {
      targetTitle: "Rules",
      sourcesTitles: ["Rules", "Hush"],
    });
    expect(r.success).toBe(true);
    expect(s.lore).toHaveLength(1);
    expect(s.lore[0].visibility).toBe("hidden");
  });

  it("refuses when only the target is listed", () => {
    const s = story([note({ title: "Rules" }), note({ title: "Other" })]);
    const r = call(s, "merge_lore", {
      targetTitle: "Rules",
      sourcesTitles: ["Rules"],
    });
    expect(r.success).toBe(false);
    expect(s.lore).toHaveLength(2);
  });

  it("still needs two sources to create a new target", () => {
    const s = story([note({ title: "A" }), note({ title: "B" })]);
    expect(
      call(s, "merge_lore", { targetTitle: "New", sourcesTitles: ["A"] })
        .success,
    ).toBe(false);
    expect(
      call(s, "merge_lore", { targetTitle: "New", sourcesTitles: ["A", "B"] })
        .success,
    ).toBe(true);
    expect(s.lore.map((l) => l.title)).toEqual(["New"]);
  });
});

describe("duplicate_lore", () => {
  it("reads sourceTitle/newTitle and keeps a hidden note hidden, without the library link", () => {
    const s = story([
      note({
        title: "Vault",
        visibility: "hidden",
        secrtet: true,
        type: "secret",
        libraryNoteId: "builtin:x:9",
      }),
    ]);
    const r = call(s, "duplicate_lore", {
      sourceTitle: "Vault",
      newTitle: "Vault Copy",
    });
    expect(r.success).toBe(true);
    const copy = s.lore.find((l) => l.title === "Vault Copy");
    expect(copy?.visibility).toBe("hidden");
    expect(copy?.secrtet).toBe(true);
    expect(copy?.type).toBe("secret");
    expect(copy?.libraryNoteId).toBeUndefined();
  });
});

describe("edit_lore_insert", () => {
  it("reads pattern, inserts below by default and above on request", () => {
    const s = story([note({ title: "N", content: "one\ntwo\nthree" })]);
    expect(
      call(s, "edit_lore_insert", { title: "N", pattern: "TWO", content: "x" })
        .success,
    ).toBe(true);
    expect(s.lore[0].content).toBe("one\ntwo\nx\nthree");
    call(s, "edit_lore_insert", {
      title: "N",
      pattern: "one",
      content: "y",
      position: "above",
    });
    expect(s.lore[0].content).toBe("y\none\ntwo\nx\nthree");
  });

  it("honours isRegex and reports a missing line or bad regex", () => {
    const s = story([note({ title: "N", content: "a1\nb2" })]);
    expect(
      call(s, "edit_lore_insert", {
        title: "N",
        pattern: "^b\\d$",
        isRegex: true,
        content: "z",
      }).success,
    ).toBe(true);
    expect(s.lore[0].content).toBe("a1\nb2\nz");
    expect(
      call(s, "edit_lore_insert", { title: "N", pattern: "nope", content: "q" })
        .success,
    ).toBe(false);
    expect(
      call(s, "edit_lore_insert", {
        title: "N",
        pattern: "(",
        isRegex: true,
        content: "q",
      }).success,
    ).toBe(false);
  });
});

describe("Google essential tools", () => {
  it("include the session-zero, challenge and scene tools (status report 6.14)", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../app/misc/providerCall.ts"),
      "utf8",
    );
    const start = source.indexOf("const GOOGLE_ESSENTIAL_TOOLS");
    const block = source.slice(start, source.indexOf("]);", start));
    for (const t of [
      "start_game",
      "start_challenge",
      "record_challenge_result",
      "cancel_challenge",
      "increment_scene",
    ]) {
      expect(block).toContain(`"${t}"`);
    }
  });
});
