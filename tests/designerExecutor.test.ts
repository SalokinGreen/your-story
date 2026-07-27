/**
 * Tests for the Game Designer tool executor.
 *
 * The executor is the deterministic half of the creator: the model asks for
 * changes, this decides what actually lands in the draft. Malformed tool calls
 * must fail loudly rather than corrupting the draft.
 */

import { describe, it, expect } from "vitest";
import {
  AdventureDraft,
  DesignerToolCall,
  adventureToDraft,
  createEmptyDraft,
  draftReadiness,
  draftToAdventure,
  executeDesignerTool,
  executeDesignerTools,
  summarizeDraft,
} from "@/app/misc/designer_executor";

function call(
  name: string,
  args: Record<string, unknown>,
  id = "call_1",
): DesignerToolCall {
  return { id, name, arguments: args };
}

function run(
  name: string,
  args: Record<string, unknown>,
  draft: AdventureDraft = createEmptyDraft(),
) {
  return executeDesignerTool(call(name, args), draft);
}

describe("set_adventure_info", () => {
  it("updates only the fields it was given", () => {
    const before = createEmptyDraft();
    const { draft } = run("set_adventure_info", {
      title: "Ashfall",
      tags: ["noir", "mystery"],
    });
    expect(draft.title).toBe("Ashfall");
    expect(draft.tags).toEqual(["noir", "mystery"]);
    // Untouched fields keep their defaults.
    expect(draft.difficulty).toBe(before.difficulty);
    expect(draft.description).toBe("");
  });

  it("ignores a difficulty outside the allowed set", () => {
    const { draft } = run("set_adventure_info", { difficulty: "impossible" });
    expect(draft.difficulty).toBe("medium");
  });

  it("reports an error when no recognised field is present", () => {
    const { result } = run("set_adventure_info", { nonsense: true });
    expect(result.error).toBeDefined();
    expect(result.content).toContain("ERROR");
  });

  it("does not mutate the draft it was given", () => {
    const original = createEmptyDraft();
    run("set_adventure_info", { title: "Ashfall" }, original);
    expect(original.title).toBe("");
  });
});

describe("write_note", () => {
  it("creates a lore note by default", () => {
    const { draft } = run("write_note", {
      title: "The Guild",
      content: "They run the docks.",
    });
    expect(draft.lore).toHaveLength(1);
    expect(draft.lore[0].type).toBe("lore");
    expect(draft.lore[0].content).toBe("They run the docks.");
  });

  it("forces mechanics and character notes to always be loaded", () => {
    // These are useless to the GM unless they're always in context, so the
    // executor overrides whatever the model asked for.
    const { draft } = run("write_note", {
      title: "Rules",
      content: "Roll 2d6.",
      type: "mechanics",
      alwaysOn: false,
    });
    expect(draft.lore[0].alwaysOn).toBe(true);

    const sheet = run("write_note", {
      title: "You",
      content: "A tired detective.",
      type: "character_sheet",
    });
    expect(sheet.draft.lore[0].alwaysOn).toBe(true);
  });

  it("leaves ordinary lore notes keyword-triggered", () => {
    const { draft } = run("write_note", {
      title: "The Docks",
      content: "Fog and rust.",
      keys: ["docks", "harbour"],
    });
    expect(draft.lore[0].alwaysOn).toBe(false);
    expect(draft.lore[0].keys).toEqual(["docks", "harbour"]);
  });

  it("overwrites an existing note with the same title, case-insensitively", () => {
    const first = run("write_note", { title: "The Guild", content: "v1" });
    const second = run(
      "write_note",
      { title: "the guild", content: "v2" },
      first.draft,
    );
    expect(second.draft.lore).toHaveLength(1);
    expect(second.draft.lore[0].content).toBe("v2");
  });

  it("marks secret-typed notes as secret", () => {
    const { draft } = run("write_note", {
      title: "The Twist",
      content: "The mayor did it.",
      type: "secret",
    });
    expect(draft.lore[0].secrtet).toBe(true);
  });

  it("rejects a note with no title", () => {
    const { draft, result } = run("write_note", { content: "orphaned" });
    expect(result.error).toBeDefined();
    expect(draft.lore).toHaveLength(0);
  });

  it("falls back to lore for an unknown type", () => {
    const { draft } = run("write_note", {
      title: "Odd",
      content: "x",
      type: "not_a_real_type",
    });
    expect(draft.lore[0].type).toBe("lore");
  });
});

describe("delete_note", () => {
  it("removes matching notes and reports the count", () => {
    let draft = run("write_note", { title: "A", content: "a" }).draft;
    draft = run("write_note", { title: "B", content: "b" }, draft).draft;
    const { draft: after, result } = run("delete_note", { titles: ["A"] }, draft);
    expect(after.lore.map((l) => l.title)).toEqual(["B"]);
    expect(result.error).toBeUndefined();
  });

  it("errors when nothing matched", () => {
    const { result } = run("delete_note", { titles: ["Nope"] });
    expect(result.error).toBeDefined();
  });
});

describe("write_npcs", () => {
  it("creates NPCs with sane defaults", () => {
    const { draft } = run("write_npcs", {
      npcs: [{ name: "Vela", description: "A fixer.", role: "Broker" }],
    });
    expect(draft.npcs).toHaveLength(1);
    expect(draft.npcs[0].attitude).toBe("neutral");
    expect(draft.npcs[0].status).toBe("alive");
    expect(draft.npcs[0].id).toBeTruthy();
  });

  it("updates an existing NPC instead of duplicating it", () => {
    const first = run("write_npcs", {
      npcs: [{ name: "Vela", description: "A fixer.", role: "Broker" }],
    });
    const second = run(
      "write_npcs",
      { npcs: [{ name: "Vela", description: "A traitor.", role: "Broker" }] },
      first.draft,
    );
    expect(second.draft.npcs).toHaveLength(1);
    expect(second.draft.npcs[0].description).toBe("A traitor.");
    expect(second.draft.npcs[0].id).toBe(first.draft.npcs[0].id);
  });

  it("coerces an invalid attitude to neutral", () => {
    const { draft } = run("write_npcs", {
      npcs: [{ name: "X", description: "d", role: "r", attitude: "furious" }],
    });
    expect(draft.npcs[0].attitude).toBe("neutral");
  });

  it("skips entries with no name", () => {
    const { draft, result } = run("write_npcs", {
      npcs: [{ description: "nameless" }],
    });
    expect(draft.npcs).toHaveLength(0);
    expect(result.error).toBeDefined();
  });
});

describe("write_goals", () => {
  it("defaults description to the short description and active to true", () => {
    const { draft } = run("write_goals", {
      goals: [{ title: "Escape", shortDescription: "Get out alive" }],
    });
    expect(draft.goals[0].description).toBe("Get out alive");
    expect(draft.goals[0].active).toBe(true);
    expect(draft.goals[0].fulfilled).toBe(false);
  });
});

describe("set_starting_choices", () => {
  it("replaces the list wholesale", () => {
    const first = run("set_starting_choices", {
      choices: [{ text: "Kick the door" }, { text: "Pick the lock" }],
    });
    expect(first.draft.startingChoices).toHaveLength(2);

    const second = run(
      "set_starting_choices",
      { choices: [{ text: "Walk away" }] },
      first.draft,
    );
    expect(second.draft.startingChoices).toHaveLength(1);
    expect(second.draft.startingChoices[0].text).toBe("Walk away");
  });

  it("accepts an empty array to clear the choices", () => {
    const first = run("set_starting_choices", {
      choices: [{ text: "Kick the door" }],
    });
    const cleared = run("set_starting_choices", { choices: [] }, first.draft);
    expect(cleared.draft.startingChoices).toHaveLength(0);
    expect(cleared.result.error).toBeUndefined();
  });

  it("drops choices with blank text", () => {
    const { draft } = run("set_starting_choices", {
      choices: [{ text: "  " }, { text: "Real" }],
    });
    expect(draft.startingChoices).toHaveLength(1);
  });
});

describe("write_tables", () => {
  it("defaults entry weights to 1 and keeps only non-empty entries", () => {
    const { draft } = run("write_tables", {
      tables: [
        {
          name: "Complications",
          entries: [{ text: "Sirens" }, { text: "" }, { text: "Rain", weight: 3 }],
        },
      ],
    });
    expect(draft.customTables[0].entries).toHaveLength(2);
    expect(draft.customTables[0].entries[0].weight).toBe(1);
    expect(draft.customTables[0].entries[1].weight).toBe(3);
  });

  it("rejects a table with no usable entries", () => {
    const { draft, result } = run("write_tables", {
      tables: [{ name: "Empty", entries: [] }],
    });
    expect(draft.customTables).toHaveLength(0);
    expect(result.error).toBeDefined();
  });
});

describe("set_character_sheet_template", () => {
  it("parses placeholder fields out of the template", () => {
    const { draft } = run("set_character_sheet_template", {
      template: "# {{Name | Your name | Alex}}\n{{Job | What you do | Courier}}",
    });
    expect(draft.characterSheetTemplate?.fields).toHaveLength(2);
    expect(draft.characterSheetTemplate?.fields[0].name).toBe("Name");
  });
});

describe("unknown tools", () => {
  it("reports an error and leaves the draft untouched", () => {
    const before = createEmptyDraft();
    const { draft, result } = run("summon_demon", { x: 1 }, before);
    expect(result.error).toBeDefined();
    expect(draft).toBe(before);
  });
});

describe("executeDesignerTools", () => {
  it("threads the draft through a batch so later calls see earlier ones", () => {
    const { draft, results } = executeDesignerTools(
      [
        call("set_adventure_info", { title: "Ashfall" }, "a"),
        call("write_note", { title: "Rules", content: "2d6", type: "mechanics" }, "b"),
        call("write_note", { title: "Rules", content: "3d6", type: "mechanics" }, "c"),
      ],
      createEmptyDraft(),
    );
    expect(draft.title).toBe("Ashfall");
    // The third call overwrote the second rather than adding a duplicate.
    expect(draft.lore).toHaveLength(1);
    expect(draft.lore[0].content).toBe("3d6");
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.toolCallId)).toEqual(["a", "b", "c"]);
  });

  it("keeps going after a failed call", () => {
    const { draft, results } = executeDesignerTools(
      [
        call("write_note", { content: "no title" }, "a"),
        call("set_adventure_info", { title: "Still Works" }, "b"),
      ],
      createEmptyDraft(),
    );
    expect(results[0].error).toBeDefined();
    expect(results[1].error).toBeUndefined();
    expect(draft.title).toBe("Still Works");
  });
});

describe("draftReadiness", () => {
  it("lists everything missing from a blank draft", () => {
    const { ready, missing } = draftReadiness(createEmptyDraft());
    expect(ready).toBe(false);
    expect(missing).toContain("a title");
    expect(missing).toContain("a mechanics note");
    expect(missing).toContain("a character sheet");
  });

  it("is ready once the essentials exist", () => {
    let draft = createEmptyDraft();
    draft = run("set_adventure_info", { title: "Ashfall" }, draft).draft;
    draft = run("set_premise", { premise: "A city burns.", intro: "Smoke." }, draft).draft;
    draft = run(
      "write_note",
      { title: "Rules", content: "2d6", type: "mechanics" },
      draft,
    ).draft;
    draft = run(
      "write_note",
      { title: "You", content: "A courier.", type: "character_sheet" },
      draft,
    ).draft;
    expect(draftReadiness(draft).ready).toBe(true);
  });
});

describe("draft <-> adventure round trip", () => {
  it("preserves the authored content", () => {
    let draft = createEmptyDraft();
    draft = run(
      "set_adventure_info",
      { title: "Ashfall", tags: ["noir"], difficulty: "hard" },
      draft,
    ).draft;
    draft = run("set_premise", { premise: "A city burns.", intro: "Smoke." }, draft).draft;
    draft = run(
      "write_note",
      { title: "Rules", content: "2d6", type: "mechanics" },
      draft,
    ).draft;
    draft = run("write_npcs", {
      npcs: [{ name: "Vela", description: "A fixer.", role: "Broker" }],
    }, draft).draft;
    draft = run("set_starting_choices", { choices: [{ text: "Run" }] }, draft).draft;

    const restored = adventureToDraft(draftToAdventure(draft));

    expect(restored.title).toBe("Ashfall");
    expect(restored.tags).toEqual(["noir"]);
    expect(restored.difficulty).toBe("hard");
    expect(restored.premise).toBe("A city burns.");
    expect(restored.intro).toBe("Smoke.");
    expect(restored.lore).toHaveLength(1);
    expect(restored.npcs).toHaveLength(1);
    expect(restored.startingChoices).toHaveLength(1);
  });

  it("puts the notes where the GM reads them", () => {
    const draft = run("write_note", {
      title: "Rules",
      content: "2d6",
      type: "mechanics",
    }).draft;
    const adventure = draftToAdventure(draft);
    // The GM stage reads storyTemplate.lore, so notes must land there.
    expect(adventure.storyTemplate?.lore?.[0].title).toBe("Rules");
  });

  it("survives an adventure with no story template", () => {
    const draft = adventureToDraft({ title: "Legacy" });
    expect(draft.title).toBe("Legacy");
    expect(draft.lore).toEqual([]);
    expect(draft.npcs).toEqual([]);
  });
});

describe("summarizeDraft", () => {
  it("flags a missing mechanics note as unplayable", () => {
    const summary = summarizeDraft(createEmptyDraft());
    expect(summary).toContain("MISSING");
  });

  it("names the notes that exist", () => {
    const draft = run("write_note", {
      title: "The Guild",
      content: "They run the docks.",
    }).draft;
    expect(summarizeDraft(draft)).toContain("The Guild");
  });
});
