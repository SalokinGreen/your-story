/**
 * The table-note parser and the roll_table executor on a note (randomness
 * plan R1, docs/randomness-design.md 3.3). The packs are held by
 * tableRoll.packs.test.ts.
 */
import { describe, expect, it } from "vitest";
import { renderNoteTitleList } from "@/app/misc/ai_staged";
import { executeGMTools } from "@/app/misc/gmExecutor";
import { ORACLE_USE_TOOL_NAMES } from "@/app/misc/mythic";
import { publicSummary } from "@/app/misc/turnTimeline";
import type { StoryData, StoryLore } from "@/app/misc/structs";
import { parseTableNote, rollTable, selectTable, summarizeTables } from "@/app/misc/tableRoll";
import type { TableSpec } from "@/app/misc/tableRoll";

const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

function tables(content: string): TableSpec[] {
  const p = parseTableNote(content);
  if (!p.ok) throw new Error(p.reason);
  return p.tables;
}

describe("parseTableNote", () => {
  it("reads a heading die and numbered entries, keeping the text around the table", () => {
    const p = parseTableNote(
      "# Title\n\nIntro line.\n\n## Weather (1d4)\nRoll when the party travels.\n1. Rain\n2. Fog\n3. Clear\n4. Storm\n\nUse when the road is long.",
    );
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.tables).toHaveLength(1);
    expect(p.tables[0].path).toEqual(["Weather"]);
    expect(p.tables[0].die).toEqual({ kind: "nd", count: 1, sides: 4 });
    expect(p.tables[0].entries.map((e) => e.text)).toEqual(["Rain", "Fog", "Clear", "Storm"]);
    expect(p.tables[0].instructions).toBe("Roll when the party travels.");
    expect(p.noteInstructions).toContain("Intro line.");
    expect(p.noteInstructions).toContain("Use when the road is long.");
  });

  it("reads ranged entries with a hyphen or an en dash, and a Roll 1dN: lead-in", () => {
    const [t] = tables("Roll 1d10:\n1-3. Few\n4–7. Some\n8-10. Many");
    expect(t.path).toEqual([]);
    expect(t.entries.map((e) => [e.lo, e.hi])).toEqual([
      [1, 3],
      [4, 7],
      [8, 10],
    ]);
  });

  it("reads a multi-line entry as one", () => {
    const [t] = tables("## Odd (1d2)\n1. First line\ncontinues here\n2. Second");
    expect(t.entries[0].text).toBe("First line continues here");
  });

  it("reads d66 as two d6 with the first as the tens", () => {
    const keys = Array.from({ length: 36 }, (_, i) => `${Math.floor(i / 6) + 1}${(i % 6) + 1} entry${i}`);
    const [t] = tables(`## Look (d66: roll ["1d6","1d6"], first die is the tens)\n${keys.join("\n")}`);
    expect(t.die).toEqual({ kind: "d66" });
    const r = rollTable(t, seq(2.5 / 6, 4.5 / 6));
    expect(r.dice).toEqual([3, 5]);
    expect(r.roll).toBe(35);
    expect(r.entry.text).toBe("entry16"); // key 35 is entry (3-1)*6+(5-1)
  });

  it("refuses a d66 table with a missing key", () => {
    const keys = Array.from({ length: 35 }, (_, i) => `${Math.floor(i / 6) + 1}${(i % 6) + 1} x`);
    expect(parseTableNote(`## L (d66: roll ["1d6","1d6"], first die is the tens)\n${keys.join("\n")}`).ok).toBe(false);
  });

  it("nests ### headings under a per-Kind list, as a path", () => {
    const ts = tables(
      "## Tell (1d2, on the Kind's list)\nPick the creature's Kind.\n### Ghost\n1. cold\n2. quiet\n### Wolf\n1. hair\n2. howl",
    );
    expect(ts.map((t) => t.path)).toEqual([
      ["Tell", "Ghost"],
      ["Tell", "Wolf"],
    ]);
    expect(ts[0].instructions).toContain("Pick the creature's Kind.");
    expect(summarizeTables(ts)).toBe("Tell d2 by 2 sub-headings");
  });

  it("returns ok:false, with a reason, for layouts outside the contract", () => {
    for (const bad of [
      "",
      "Just some prose about a table.",
      "Roll 1d6 on the table for the move.\n\n**Face Danger**\n1. a\n2. b\n3. c\n4. d\n5. e\n6. f",
      "## Gap (1d4)\n1. a\n2. b\n4. d",
      "## Short (1d6)\n1. a\n2. b",
      "## Empty (1d6)\nNothing here.",
    ]) {
      const p = parseTableNote(bad);
      expect(p.ok, bad).toBe(false);
      if (!p.ok) expect(p.reason.length).toBeGreaterThan(0);
    }
  });
});

describe("selectTable and rollTable", () => {
  const ts = tables("## Names (1d2)\n1. A\n2. B\n\n## Places (1d2)\n1. C\n2. D");

  it("refuses to pick for a note with several tables and no heading, and lists them", () => {
    expect(selectTable(ts)).toEqual({ ok: false, candidates: ["Names", "Places"] });
  });

  it("finds a table by heading, loosely, and lists candidates on a miss", () => {
    expect(selectTable(ts, "places")).toMatchObject({ ok: true });
    expect(selectTable(ts, "weather")).toEqual({ ok: false, candidates: ["Names", "Places"] });
  });

  it("rolls with a seeded rng and lands on the matching entry", () => {
    const [names] = ts;
    expect(rollTable(names, () => 0).entry.text).toBe("A");
    expect(rollTable(names, () => 0.99).entry.text).toBe("B");
    const two = tables("## Pair (2d6)\n2-6. low\n7. mid\n8-12. high")[0];
    const r = rollTable(two, seq(0.99, 0.99));
    expect(r).toMatchObject({ roll: 12, dice: [6, 6] });
    expect(r.entry.text).toBe("high");
  });
});

function noteStory(note: Partial<StoryLore>): StoryData {
  const base = {
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    alwaysOn: false,
    type: "table",
  };
  return {
    story_name: "S",
    premise: "",
    scene: { parts: [] },
    agmtState: {},
    lore: [
      {
        ...base,
        title: "Tables — Town",
        content: "## Names (1d2)\n1. Anna\n2. Bram\n\n## Shops (1d2)\n1. Baker\n2. Smith\n\nUse when a town is met.",
        ...note,
      },
      {
        ...base,
        title: "Prose table",
        content: "Roll 1d6 on the table.\n\n**Bold list**\n1. a",
      },
    ],
    memory: [],
    npcs: [],
  } as unknown as StoryData;
}

async function roll(story: StoryData, args: Record<string, unknown>) {
  const out = await executeGMTools(
    [{ id: "r1", function: { name: "roll_table", arguments: JSON.stringify({ reason: "test", ...args }) } }],
    story,
  );
  return { r: out.results[0], story: out.modifiedStoryData };
}

describe("roll_table on a table note", () => {
  it("rolls the named sub-table in one call, with the surrounding text", async () => {
    const { r } = await roll(noteStory({}), { table_name: "tables - town", table: "Shops" });
    expect(r.success).toBe(true);
    expect(r.contextForStory).toMatch(/Tables — Town > Shops \(d2\) rolled [12]: "(Baker|Smith)"/);
    expect(r.contextForStory).toContain("Use when a town is met.");
    expect(r.hiddenFromPlayer).toBeUndefined();
    expect(publicSummary(r)).not.toBeNull();
  });

  it("refuses an ambiguous note and lists its tables; rolls nothing", async () => {
    const { r } = await roll(noteStory({}), { table_name: "Tables — Town" });
    expect(r.success).toBe(false);
    expect(r.contextForStory).toContain('"Names"');
    expect(r.contextForStory).toContain('"Shops"');
  });

  it("errors for a sub-table that is not there", async () => {
    const { r } = await roll(noteStory({}), { table_name: "Tables — Town", table: "Weather" });
    expect(r.success).toBe(false);
    expect(r.contextForStory).toContain("Its tables:");
  });

  it("points a prose table back to read-and-roll", async () => {
    const { r } = await roll(noteStory({}), { table_name: "Prose table" });
    expect(r.success).toBe(false);
    expect(r.contextForStory).toContain("formula_roll");
  });

  it("names the closest table notes when nothing matches", async () => {
    const { r } = await roll(noteStory({}), { table_name: "Town weather" });
    expect(r.success).toBe(false);
    expect(r.contextForStory).toContain("Tables — Town");
  });

  it("hides the roll of a note that is not always_reveal, and keeps it from the narrator", async () => {
    for (const visibility of ["hidden", "to_be_revealed", "check_per_turn"] as const) {
      const { r } = await roll(noteStory({ visibility }), { table_name: "Tables — Town", table: "Names" });
      expect(r.success, visibility).toBe(true);
      expect(r.hiddenFromPlayer, visibility).toBe(true);
      expect(publicSummary(r), visibility).toBeNull();
    }
    const { r } = await roll(noteStory({ visibility: "always_reveal" }), {
      table_name: "Tables — Town",
      table: "Names",
    });
    expect(r.hiddenFromPlayer).toBeUndefined();
  });

  it("counts as consulting the oracle only when it succeeds", async () => {
    expect(ORACLE_USE_TOOL_NAMES.has("roll_table")).toBe(true);
    expect(ORACLE_USE_TOOL_NAMES.has("formula_roll")).toBe(false);
    const ok = await roll(noteStory({}), { table_name: "Tables — Town", table: "Names" });
    expect(ok.story.agmtState?.lastOracleTurn).toBeDefined();
    const bad = await roll(noteStory({}), { table_name: "Tables — Town" });
    expect(bad.story.agmtState?.lastOracleTurn).toBeUndefined();
  });

  it("still rolls a built-in table by name", async () => {
    const { r } = await roll(noteStory({}), { table_name: "plot_twists" });
    expect(r.success).toBe(true);
  });
});

describe("a note and a built-in table with the same name", () => {
  const frNames = (): StoryData =>
    noteStory({
      title: "FR — Names",
      libraryNoteId: "builtin:fantastic-realms:table-names",
      content: "## Aurelane names (1d2)\n1. Aurel\n2. Brisa\n\n## Larkenfell names (1d2)\n1. Cob\n2. Dilly",
    });

  it("rolls the note, with its sub-table, when a note has the short name", async () => {
    const { r } = await roll(frNames(), { table_name: "Names", table: "Aurelane names" });
    expect(r.success).toBe(true);
    expect(r.contextForStory).toMatch(/FR — Names > Aurelane names \(d2\) rolled [12]: "(Aurel|Brisa)"/);
    expect(r.contextForStory).toContain('"builtin:names"');
  });

  it("still rolls the built-in when no note matches, and when asked for it by the builtin: prefix", async () => {
    const plain = noteStory({});
    const a = await roll(plain, { table_name: "Names" });
    expect(a.r.success).toBe(true);
    expect((a.r.result as { noteTitle?: string }).noteTitle).toBeUndefined();
    const b = await roll(frNames(), { table_name: "builtin:names" });
    expect(b.r.success).toBe(true);
    expect((b.r.result as { noteTitle?: string }).noteTitle).toBeUndefined();
  });

  it("does not let a loosely named note take over a built-in name", async () => {
    const story = noteStory({ title: "Places in the city" });
    const { r } = await roll(story, { table_name: "city" });
    expect((r.result as { noteTitle?: string }).noteTitle).toBeUndefined();
    expect(r.success).toBe(true);
  });
});

describe("extra words in a heading's parenthesis", () => {
  it("reach the table's instructions", () => {
    const [t] = tables("## Loot (1d2, roll twice and combine)\n1. a\n2. b");
    expect(t.instructions).toBe("roll twice and combine");
    const [k] = tables("## Tell (1d2, on the Kind's list)\n### Ghost\n1. x\n2. y");
    expect(k.instructions).toBeUndefined();
    const d66 = Array.from({ length: 36 }, (_, i) => `${Math.floor(i / 6) + 1}${(i % 6) + 1} e`).join("\n");
    const [d] = tables(`## L (d66: roll ["1d6","1d6"], first die is the tens)\n${d66}`);
    expect(d.instructions).toBeUndefined();
  });

  it("are returned by roll_table", async () => {
    const story = noteStory({ content: "## Loot (1d2, roll twice and combine)\n1. a\n2. b" });
    const { r } = await roll(story, { table_name: "Tables — Town" });
    expect(r.contextForStory).toContain("roll twice and combine");
  });
});

describe("hidden notes and the narrator", () => {
  it("a refusal about a hidden note is hidden, and closest titles leave hidden notes out", async () => {
    const hiddenStory = noteStory({ visibility: "hidden" });
    for (const args of [
      { table_name: "Tables — Town" },
      { table_name: "Tables — Town", table: "Weather" },
    ]) {
      const { r } = await roll(hiddenStory, args);
      expect(r.success).toBe(false);
      expect(r.hiddenFromPlayer).toBe(true);
      expect(publicSummary(r)).toBeNull();
    }
    const miss = await roll(hiddenStory, { table_name: "Town weather" });
    expect(miss.r.contextForStory).not.toContain("Tables — Town");
  });

  it("the text around a table never reaches the narrator's summary", async () => {
    const { r } = await roll(noteStory({}), { table_name: "Tables — Town", table: "Shops" });
    expect(r.contextForStory).toContain("Around the table");
    const summary = publicSummary(r) ?? "";
    expect(summary).toContain("Smith".slice(0, 0) + "Tables");
    expect(summary).not.toContain("Around the table");
    expect(summary).not.toContain("Use when a town is met");
  });
});

describe("the note list in the live block", () => {
  it("shows a parseable table note's sub-tables and dice on its one line, and a prose one plain", () => {
    const story = noteStory({});
    const out = renderNoteTitleList(story.lore, "tables", true);
    expect(out.split("\n")).toHaveLength(2);
    expect(out).toContain("- Tables — Town.md [Names d2, Shops d2]");
    expect(out).toContain("- Prose table.md\n".trim());
    expect(out).not.toContain("Prose table.md [");
    expect(renderNoteTitleList(story.lore, "tables")).not.toContain("[Names");
  });
});
