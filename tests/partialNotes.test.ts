/**
 * parsePartialExtraction tests - the tolerant reader that turns a
 * half-written summarize response into previewable notes so the PDF
 * importer can show them appearing live (see partialNotes.ts).
 */
import { describe, it, expect } from "vitest";
import {
  parsePartialExtraction,
  mergePartialExtraction,
  emptyPartialExtraction,
  countPartialExtraction,
} from "@/app/misc/partialNotes";

/** Feed a response one character at a time, the way a stream arrives. */
function parseAtEveryPrefix(full: string) {
  const seen: number[] = [];
  for (let i = 1; i <= full.length; i++) {
    seen.push(countPartialExtraction(parsePartialExtraction(full.slice(0, i))));
  }
  return seen;
}

describe("parsePartialExtraction", () => {
  it("returns nothing for an empty or pre-JSON buffer", () => {
    expect(parsePartialExtraction("")).toEqual(emptyPartialExtraction());
    expect(parsePartialExtraction("Here is the JSON you asked for:")).toEqual(
      emptyPartialExtraction(),
    );
  });

  it("reads a complete response", () => {
    const result = parsePartialExtraction(
      JSON.stringify({
        summary: "A short rulebook.",
        lore: [
          {
            title: "Karth",
            content: "A port city.",
            folder: "Locations",
            tags: ["city"],
            keys: ["Karth"],
            secrtet: false,
          },
        ],
        mechanicNotes: [
          { title: "Checks", content: "Roll 2d6.", type: "mechanics" },
        ],
        tableNotes: [
          {
            title: "Weather",
            content: "Daily weather.\n\nRoll 1d4:\n1-3. Rain\n4. Fog",
            type: "table",
          },
        ],
      }),
    );

    expect(result.summary).toBe("A short rulebook.");
    expect(result.lore).toHaveLength(1);
    expect(result.lore[0]).toMatchObject({
      title: "Karth",
      content: "A port city.",
      folder: "Locations",
      tags: ["city"],
    });
    expect(result.lore[0].streaming).toBeUndefined();
    expect(result.mechanicNotes[0].title).toBe("Checks");
    expect(result.tableNotes[0]).toMatchObject({
      title: "Weather",
      type: "table",
    });
    expect(result.tableNotes[0].content).toContain("1-3. Rain");
  });

  it("keeps finished entries and shows the one being written", () => {
    const buffer = `{"summary":"Notes","lore":[{"title":"Karth","content":"A port city."},{"title":"The Deep Guild","content":"A cartel of divers who`;
    const result = parsePartialExtraction(buffer);

    expect(result.lore).toHaveLength(2);
    expect(result.lore[0]).toMatchObject({
      title: "Karth",
      content: "A port city.",
    });
    expect(result.lore[1]).toMatchObject({
      title: "The Deep Guild",
      content: "A cartel of divers who",
      streaming: true,
    });
  });

  it("shows an entry whose key is half typed", () => {
    const result = parsePartialExtraction(
      `{"lore":[{"title":"Karth","conte`,
    );
    expect(result.lore).toHaveLength(1);
    expect(result.lore[0]).toMatchObject({
      title: "Karth",
      content: "",
      streaming: true,
    });
  });

  it("drops an unfinished trailing value it cannot close", () => {
    const result = parsePartialExtraction(
      `{"lore":[{"title":"Karth","content":"A port city.","secrtet":fal`,
    );
    expect(result.lore).toHaveLength(1);
    expect(result.lore[0]).toMatchObject({
      title: "Karth",
      content: "A port city.",
      streaming: true,
    });
  });

  it("handles escaped quotes and newlines inside content", () => {
    const content = 'The sign reads "Ale & Anchor".\nInside, it is dark.';
    const buffer = `{"lore":[${JSON.stringify({ title: "Tavern", content })}`;
    const result = parsePartialExtraction(buffer);
    expect(result.lore[0].content).toBe(content);
  });

  it("is not fooled by a key-like string inside prose", () => {
    const buffer = JSON.stringify({
      summary: 'The document says "mechanicNotes": [ nothing ] verbatim.',
      lore: [{ title: "Real", content: "Real note." }],
      mechanicNotes: [{ title: "Rule", content: "Real rule." }],
    });
    const result = parsePartialExtraction(buffer);
    expect(result.lore.map((n) => n.title)).toEqual(["Real"]);
    expect(result.mechanicNotes.map((n) => n.title)).toEqual(["Rule"]);
  });

  it("ignores a leading markdown fence", () => {
    const result = parsePartialExtraction(
      '```json\n{"lore":[{"title":"Karth","content":"A port city."}]}\n```',
    );
    expect(result.lore[0].title).toBe("Karth");
  });

  it("shows a table note as it is being written", () => {
    const buffer = `{"tableNotes":[{"title":"Weather","content":"Roll 1d6:\\n1-3. Rain\\n4-6. Fo`;
    const result = parsePartialExtraction(buffer);
    expect(result.tableNotes).toHaveLength(1);
    expect(result.tableNotes[0]).toMatchObject({
      title: "Weather",
      streaming: true,
    });
    expect(result.tableNotes[0].content).toContain("1-3. Rain");
  });

  /**
   * A model can still answer with the structured table shape the extractor
   * used to ask for. The committed result renders those into table notes
   * (see processParserResult), so the live preview has to show the same
   * thing - otherwise the tables appear to be missing until the round ends.
   */
  it("renders a legacy structured table into a note as it streams", () => {
    const buffer = `{"customTables":[{"name":"Weather","description":"Daily weather.","entries":[{"text":"Rain","weight":3},{"text":"Fo`;
    const result = parsePartialExtraction(buffer);
    expect(result.tableNotes).toHaveLength(1);
    expect(result.tableNotes[0]).toMatchObject({
      title: "Weather",
      type: "table",
      streaming: true,
    });
    // The half-typed row shows up too, so the table fills in as it is
    // written rather than jumping a row at a time.
    expect(result.tableNotes[0].content).toBe(
      "Daily weather.\n\nRoll 1d4:\n1-3. Rain\n4. Fo",
    );
  });

  it("never loses entries as more of the response arrives", () => {
    const full = JSON.stringify({
      summary: "A short rulebook.",
      lore: [
        { title: "Karth", content: "A port city on the black coast." },
        { title: "The Deep Guild", content: "A cartel of divers." },
      ],
      mechanicNotes: [{ title: "Checks", content: "Roll 2d6 + skill." }],
      tableNotes: [
        { title: "Weather", content: "Roll 1d6:\n1-3. Rain\n4-6. Fog" },
      ],
    });

    const counts = parseAtEveryPrefix(full);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    }
    expect(counts[counts.length - 1]).toBe(4);
  });
});

describe("mergePartialExtraction", () => {
  it("folds a later round into an earlier one, keyed by title", () => {
    const first = parsePartialExtraction(
      JSON.stringify({
        summary: "Round one.",
        lore: [{ title: "Karth", content: "A port city" }],
      }),
    );
    const second = parsePartialExtraction(
      JSON.stringify({
        summary: "",
        lore: [
          { title: "Karth", content: "A port city on the black coast." },
          { title: "The Deep Guild", content: "Divers." },
        ],
      }),
    );

    const merged = mergePartialExtraction(first, second);
    expect(merged.summary).toBe("Round one.");
    expect(merged.lore).toHaveLength(2);
    expect(merged.lore[0].content).toBe("A port city on the black coast.");
    expect(merged.lore[1].title).toBe("The Deep Guild");
  });

  it("keeps an untitled entry that is still being written", () => {
    const base = parsePartialExtraction(
      JSON.stringify({ lore: [{ title: "Karth", content: "A port city." }] }),
    );
    const live = parsePartialExtraction(`{"lore":[{"tit`);

    const merged = mergePartialExtraction(base, live);
    expect(merged.lore).toHaveLength(2);
    expect(merged.lore[1].streaming).toBe(true);
  });
});
