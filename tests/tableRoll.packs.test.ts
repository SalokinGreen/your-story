/**
 * Every built-in table note is either rolled by roll_table (parsed, and each
 * sub-table lands on an entry 200 times out of 200), or listed here by title
 * as a note the engine does not roll: the GM reads those and rolls with
 * formula_roll (docs/randomness-plan.md, R1).
 */
import { describe, expect, it } from "vitest";
import { BUILTIN_SYSTEMS } from "@/app/misc/systems";
import { parseTableNote, rollTable } from "@/app/misc/tableRoll";

interface Found {
  title: string;
  content: string;
}

function allBuiltinTableNotes(): Found[] {
  const byTitle = new Map<string, Found>();
  for (const sys of BUILTIN_SYSTEMS) {
    for (const pack of sys.packs) {
      for (const n of pack.notes) {
        if (n.type === "table") byTitle.set(n.title, { title: n.title, content: n.content });
      }
    }
    for (const st of sys.starters) {
      for (const l of st.adventure.storyTemplate?.lore ?? []) {
        if (l.type === "table") byTitle.set(l.title, { title: l.title, content: l.content });
      }
    }
  }
  return [...byTitle.values()];
}

function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Table notes the engine cannot roll in one call; the GM reads and rolls them. */
const NOT_MACHINE_ROLLABLE_PREFIXES = ["B&B — Miss tables", "B&B — Creation prompts: "];
const NOT_MACHINE_ROLLABLE_TITLES = new Set<string>([]);

function isAllowListed(title: string): boolean {
  return (
    NOT_MACHINE_ROLLABLE_TITLES.has(title) ||
    NOT_MACHINE_ROLLABLE_PREFIXES.some((p) => title.startsWith(p))
  );
}

describe("built-in table notes", () => {
  const notes = allBuiltinTableNotes();

  it("finds a good number of them", () => {
    expect(notes.length).toBeGreaterThanOrEqual(30);
  });

  it("parses every note not on the allow-list, and every roll lands on an entry", () => {
    const failures: string[] = [];
    let rolled = 0;
    for (const n of notes) {
      if (isAllowListed(n.title)) continue;
      const parsed = parseTableNote(n.content);
      if (!parsed.ok) {
        failures.push(`${n.title}: ${parsed.reason}`);
        continue;
      }
      expect(parsed.tables.length, n.title).toBeGreaterThan(0);
      for (const t of parsed.tables) {
        const rng = seeded(t.entries.length * 7 + 1);
        for (let i = 0; i < 200; i++) {
          const r = rollTable(t, rng);
          expect(r.entry.text.length, `${n.title} / ${t.path.join(" > ")}`).toBeGreaterThan(0);
          rolled++;
        }
      }
    }
    expect(failures).toEqual([]);
    expect(rolled).toBeGreaterThan(1000);
  });

  it("the allow-list holds only notes that really cannot be parsed", () => {
    for (const n of notes) {
      if (!isAllowListed(n.title)) continue;
      expect(parseTableNote(n.content).ok, n.title).toBe(false);
    }
  });
});
