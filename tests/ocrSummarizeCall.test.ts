/**
 * processParserResult tests - the OCR-import pipeline that turns the AI's
 * JSON response into StoryLore entries (see ocrSummarizeCall.ts).
 *
 * Previously this never read relatedCharacters/relatedLocations/keys from
 * the AI's output at all - every OCR-imported note came in with those
 * fields empty, even when the source document clearly named connected NPCs,
 * locations, or recognizable keywords. That silently starved both the notes
 * UI's related-entity search (lore.tsx) and the search_notes tool's
 * keyword/related-entity ranking, since imported notes had nothing in those
 * fields to match against. These tests cover the fix.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockProviderFetch = vi.fn();
vi.mock("@/app/misc/platformFetch", () => ({
  getProviderFetch: () => mockProviderFetch,
}));

import {
  processParserResult,
  summarizeOCR,
  splitIntoWindows,
  MAX_PROMPT_CHARS,
} from "@/app/misc/ocrSummarizeCall";

describe("processParserResult", () => {
  it("carries relatedCharacters, relatedLocations, and keys through from the AI response", () => {
    const result = processParserResult({
      summary: "A tavern and its owner.",
      lore: [
        {
          title: "The Rusty Tankard",
          content: "A cozy tavern in the old quarter.",
          type: "lore",
          folder: "Locations",
          tags: ["tavern"],
          aliases: [],
          relatedCharacters: ["Gregor Stonebeard"],
          relatedLocations: ["Old Quarter"],
          keys: ["tavern", "the rusty tankard"],
          secrtet: false,
        },
      ],
    });

    expect(result.lore).toHaveLength(1);
    expect(result.lore[0].relatedCharacters).toEqual(["Gregor Stonebeard"]);
    expect(result.lore[0].relatedLocations).toEqual(["Old Quarter"]);
    expect(result.lore[0].keys).toEqual(["tavern", "the rusty tankard"]);
  });

  it("defaults to empty arrays when the AI omits the new fields", () => {
    const result = processParserResult({
      lore: [{ title: "Mystery Note", content: "No metadata here." }],
    });

    expect(result.lore[0].relatedCharacters).toEqual([]);
    expect(result.lore[0].relatedLocations).toEqual([]);
    expect(result.lore[0].keys).toEqual([]);
  });

  it("filters out non-string entries and trims whitespace", () => {
    const result = processParserResult({
      lore: [
        {
          title: "Odd Data",
          content: "test",
          relatedCharacters: ["  Gregor  ", 42, null, "Mira"],
          keys: ["  keyword  ", ""],
        },
      ],
    });

    expect(result.lore[0].relatedCharacters).toEqual(["Gregor", "Mira"]);
    expect(result.lore[0].keys).toEqual(["keyword"]);
  });

  it("gives mechanic notes empty relatedCharacters/relatedLocations arrays, not undefined", () => {
    const result = processParserResult({
      mechanicNotes: [{ title: "Combat Rules", content: "Roll d20 plus modifier." }],
    });

    expect(result.mechanicNotes[0].relatedCharacters).toEqual([]);
    expect(result.mechanicNotes[0].relatedLocations).toEqual([]);
  });
});

/**
 * Continuation-round tests.
 *
 * A whole .md file is imported as a single chunk, so the model routinely
 * runs out of output tokens partway through writing its notes. Previously
 * the only recovery was a "close the JSON" call, which salvaged the entries
 * already written and silently dropped everything the model hadn't reached
 * yet. summarizeOCR now keeps asking for the rest until the model stops
 * running out of room.
 */
function aiResponse(payload: object, finishReason: "stop" | "length" = "stop") {
  return {
    ok: true,
    json: async () => ({
      choices: [
        { message: { content: JSON.stringify(payload) }, finish_reason: finishReason },
      ],
    }),
  };
}

function queueResponses(responses: unknown[]) {
  let call = 0;
  mockProviderFetch.mockImplementation(async () => {
    const response = responses[Math.min(call, responses.length - 1)];
    call++;
    return response;
  });
}

const baseBody = {
  markdown: "# The Sunken Temple\n\nA long adventure document with many sections.",
  model: "mistral-large-latest",
  mistralKey: "test-key",
};

function loreEntry(title: string, content = `Details about ${title}.`) {
  return { title, content };
}

describe("summarizeOCR continuation rounds", () => {
  beforeEach(() => {
    mockProviderFetch.mockReset();
  });

  it("keeps generating while the model runs out of output length", async () => {
    queueResponses([
      aiResponse(
        { summary: "A temple adventure.", lore: [loreEntry("Vashti")] },
        "length",
      ),
      aiResponse({ lore: [loreEntry("The Drowned Hall")] }, "length"),
      aiResponse(
        {
          lore: [loreEntry("Tide Cultists")],
          mechanicNotes: [loreEntry("Breath Checks")],
        },
        "stop",
      ),
    ]);

    const result = await summarizeOCR(baseBody);

    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(mockProviderFetch).toHaveBeenCalledTimes(3);
    expect(result.extractionRounds).toBe(3);
    expect(result.incomplete).toBe(false);
    expect(result.lore.map((e) => e.title)).toEqual([
      "Vashti",
      "The Drowned Hall",
      "Tide Cultists",
    ]);
    expect(result.mechanicNotes.map((e) => e.title)).toEqual(["Breath Checks"]);
    // The first round's summary is kept even though later rounds omit it.
    expect(result.summary).toBe("A temple adventure.");
  });

  it("tells the continuation round what has already been extracted", async () => {
    queueResponses([
      aiResponse({ lore: [loreEntry("Vashti")] }, "length"),
      aiResponse({ lore: [loreEntry("The Drowned Hall")] }, "stop"),
    ]);

    await summarizeOCR(baseBody);

    const secondCallBody = JSON.parse(
      mockProviderFetch.mock.calls[1][1].body as string,
    );
    const userPrompt = secondCallBody.messages[1].content as string;
    expect(userPrompt).toContain("CONTINUATION ROUND");
    expect(userPrompt).toContain("- Vashti");
    // The source document has to come along, since the model has no memory
    // of the previous call.
    expect(userPrompt).toContain("The Sunken Temple");
  });

  it("does not run continuation rounds when the model finished on its own", async () => {
    queueResponses([aiResponse({ lore: [loreEntry("Vashti")] }, "stop")]);

    const result = await summarizeOCR(baseBody);
    if ("error" in result) throw new Error(result.error);

    expect(mockProviderFetch).toHaveBeenCalledTimes(1);
    expect(result.extractionRounds).toBe(1);
    expect(result.incomplete).toBe(false);
  });

  it("stops once a round has nothing new to add, even if it hits the limit again", async () => {
    queueResponses([
      aiResponse({ lore: [loreEntry("Vashti")] }, "length"),
      // The model just repeats itself - no reason to keep paying for rounds.
      aiResponse({ lore: [loreEntry("Vashti")] }, "length"),
    ]);

    const result = await summarizeOCR(baseBody);
    if ("error" in result) throw new Error(result.error);

    expect(mockProviderFetch).toHaveBeenCalledTimes(2);
    expect(result.lore).toHaveLength(1);
    expect(result.incomplete).toBe(false);
  });

  it("replaces an entry that was cut off mid-way when a later round re-sends it in full", async () => {
    queueResponses([
      aiResponse({ lore: [loreEntry("Vashti", "The high priestess of the")] }, "length"),
      aiResponse(
        {
          lore: [
            loreEntry("Vashti", "The high priestess of the drowned god, exiled for heresy."),
            loreEntry("The Drowned Hall"),
          ],
        },
        "stop",
      ),
    ]);

    const result = await summarizeOCR(baseBody);
    if ("error" in result) throw new Error(result.error);

    expect(result.lore).toHaveLength(2);
    expect(result.lore[0].title).toBe("Vashti");
    expect(result.lore[0].content).toBe(
      "The high priestess of the drowned god, exiled for heresy.",
    );
  });

  it("appends new rows to a table the model continued in a later round", async () => {
    queueResponses([
      aiResponse(
        {
          customTables: [
            { name: "Wandering Horrors", entries: [{ text: "Brine wraith", weight: 1 }] },
          ],
        },
        "length",
      ),
      aiResponse(
        {
          customTables: [
            {
              name: "Wandering Horrors",
              entries: [
                { text: "Brine wraith", weight: 1 },
                { text: "Coral golem", weight: 2 },
              ],
            },
          ],
        },
        "stop",
      ),
    ]);

    const result = await summarizeOCR(baseBody);
    if ("error" in result) throw new Error(result.error);

    expect(result.customTables).toHaveLength(1);
    expect(result.customTables[0].entries.map((e) => e.text)).toEqual([
      "Brine wraith",
      "Coral golem",
    ]);
  });

  it("gives up after maxContinuationRounds and reports the result as incomplete", async () => {
    let n = 0;
    mockProviderFetch.mockImplementation(async () => {
      n++;
      return aiResponse({ lore: [loreEntry(`Section ${n}`)] }, "length");
    });

    const result = await summarizeOCR({ ...baseBody, maxContinuationRounds: 2 });
    if ("error" in result) throw new Error(result.error);

    expect(mockProviderFetch).toHaveBeenCalledTimes(3);
    expect(result.extractionRounds).toBe(3);
    expect(result.incomplete).toBe(true);
    expect(result.lore).toHaveLength(3);
  });

  it("keeps the notes from earlier rounds when a continuation round fails", async () => {
    queueResponses([
      aiResponse({ lore: [loreEntry("Vashti")] }, "length"),
      { ok: false, status: 429, statusText: "Too Many Requests", text: async () => "rate limited" },
    ]);

    const result = await summarizeOCR(baseBody);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.lore.map((e) => e.title)).toEqual(["Vashti"]);
  });

  it("still errors when the very first round fails", async () => {
    queueResponses([
      { ok: false, status: 401, statusText: "Unauthorized", text: async () => "bad key" },
    ]);

    const result = await summarizeOCR(baseBody);
    expect("error" in result).toBe(true);
  });

  it("falls back to bracket balance when the provider reports no finish reason", async () => {
    // Truncated JSON, no finish_reason field at all (some providers omit it).
    queueResponses([
      {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '{"summary": "x", "lore": [{"title": "Vashti", "content": "The high',
              },
            },
          ],
        }),
      },
      aiResponse({ lore: [loreEntry("The Drowned Hall")] }, "stop"),
    ]);

    const result = await summarizeOCR(baseBody);
    if ("error" in result) throw new Error(result.error);

    expect(result.extractionRounds).toBeGreaterThan(1);
    expect(result.lore.map((e) => e.title)).toContain("The Drowned Hall");
  });
});

/**
 * Long documents used to be cut off at 50k characters before they ever
 * reached the model, so the tail of a big .md file (imported as a single
 * chunk, with no page-range splitting to fall back on) produced no notes at
 * all and nothing said so. They're now walked part by part.
 */
describe("splitIntoWindows", () => {
  it("leaves a document that fits in one prompt alone", () => {
    expect(splitIntoWindows("# Short doc\n\nnot much here")).toEqual([
      "# Short doc\n\nnot much here",
    ]);
  });

  it("covers the whole document across parts", () => {
    const doc = Array.from({ length: 400 }, (_, i) => `Line ${i} of the source text.`).join(
      "\n",
    );
    const windows = splitIntoWindows(doc, 2000, 200);

    expect(windows.length).toBeGreaterThan(1);
    // Every part is within budget, and the last line of the document made it.
    for (const w of windows) expect(w.length).toBeLessThanOrEqual(2000);
    expect(windows[windows.length - 1]).toContain("Line 399");
    expect(windows[0]).toContain("Line 0");
  });

  it("overlaps consecutive parts so a section on the seam isn't lost", () => {
    const doc = Array.from({ length: 400 }, (_, i) => `Line ${i} of the source text.`).join(
      "\n",
    );
    const windows = splitIntoWindows(doc, 2000, 200);
    const tailOfFirst = windows[0].slice(-100);

    expect(windows[1]).toContain(tailOfFirst);
  });
});

describe("summarizeOCR document parts", () => {
  beforeEach(() => {
    mockProviderFetch.mockReset();
  });

  it("works through every part of a document too long for one prompt", async () => {
    const longMarkdown = `# Part one\n${"filler line\n".repeat(6000)}\n# Part two\n${"more filler\n".repeat(
      100,
    )}`;
    expect(longMarkdown.length).toBeGreaterThan(MAX_PROMPT_CHARS);

    let call = 0;
    mockProviderFetch.mockImplementation(async () => {
      call++;
      return aiResponse({ lore: [loreEntry(`Entry from call ${call}`)] }, "stop");
    });

    const result = await summarizeOCR({ ...baseBody, markdown: longMarkdown });
    if ("error" in result) throw new Error(result.error);

    const parts = splitIntoWindows(longMarkdown).length;
    expect(parts).toBeGreaterThan(1);
    expect(result.extractionRounds).toBe(parts);
    expect(result.lore).toHaveLength(parts);
    expect(result.incomplete).toBe(false);

    // The last call carried the tail of the document, not a re-send of the
    // first 50k characters.
    const lastPrompt = JSON.parse(
      mockProviderFetch.mock.calls[parts - 1][1].body as string,
    ).messages[1].content as string;
    expect(lastPrompt).toContain("# Part two");
    expect(lastPrompt).toContain(`PART ${parts} OF ${parts}`);
  });

  it("reports incomplete when the budget runs out before the last part", async () => {
    const longMarkdown = `# Part one\n${"filler line\n".repeat(6000)}\n# Part two\n${"more filler\n".repeat(
      100,
    )}`;

    mockProviderFetch.mockImplementation(async () =>
      aiResponse({ lore: [loreEntry("Only entry")] }, "stop"),
    );

    const result = await summarizeOCR({
      ...baseBody,
      markdown: longMarkdown,
      continuationBudgetMs: 0,
    });
    if ("error" in result) throw new Error(result.error);

    expect(mockProviderFetch).toHaveBeenCalledTimes(1);
    expect(result.incomplete).toBe(true);
  });

  it("does not start a round the budget cannot cover", async () => {
    // A round takes about as long as the whole remaining budget, so
    // starting another one would run past the request timeout and take the
    // entire response - every note already written included - down with it.
    const ROUND_MS = 60;
    mockProviderFetch.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, ROUND_MS));
      return aiResponse({ lore: [loreEntry("Only entry")] }, "length");
    });

    const result = await summarizeOCR({
      ...baseBody,
      // Room for the first round and then some, but nowhere near enough for
      // a second one.
      continuationBudgetMs: ROUND_MS * 1.5,
    });
    if ("error" in result) throw new Error(result.error);

    expect(mockProviderFetch).toHaveBeenCalledTimes(1);
    expect(result.incomplete).toBe(true);
  });
});

/**
 * Notes-recovery tests.
 *
 * Table-heavy source material (a rulebook appendix, a page of random tables)
 * reliably pulls models into filling customTables and calling the job done,
 * leaving the import with no lore or mechanic notes at all - but the notes
 * are what the game engine reads during play, and the tables are meant to be
 * an addition on top of them. summarizeOCR now spots a part that came back
 * as tables and nothing else and asks again for the notes.
 */
function tableResult(name: string, rows: string[]) {
  return {
    name,
    entries: rows.map((text) => ({ text, weight: 1 })),
  };
}

describe("summarizeOCR notes recovery", () => {
  beforeEach(() => {
    mockProviderFetch.mockReset();
  });

  it("asks again for the notes when a response is all tables and no notes", async () => {
    queueResponses([
      aiResponse(
        {
          summary: "A book of random tables.",
          lore: [],
          mechanicNotes: [],
          customTables: [tableResult("Wandering Horrors", ["Brine wraith"])],
        },
        "stop",
      ),
      aiResponse(
        {
          lore: [loreEntry("The Brine Wraiths")],
          mechanicNotes: [loreEntry("Rolling for Wandering Horrors")],
          customTables: [],
        },
        "stop",
      ),
    ]);

    const result = await summarizeOCR(baseBody);
    if ("error" in result) throw new Error(result.error);

    expect(mockProviderFetch).toHaveBeenCalledTimes(2);
    expect(result.lore.map((e) => e.title)).toEqual(["The Brine Wraiths"]);
    expect(result.mechanicNotes.map((e) => e.title)).toEqual([
      "Rolling for Wandering Horrors",
    ]);
    // The tables it did extract are kept, not re-requested or lost.
    expect(result.customTables.map((t) => t.name)).toEqual(["Wandering Horrors"]);
  });

  it("tells the recovery round which tables are already saved and to skip them", async () => {
    queueResponses([
      aiResponse(
        { customTables: [tableResult("Wandering Horrors", ["Brine wraith"])] },
        "stop",
      ),
      aiResponse({ lore: [loreEntry("The Brine Wraiths")] }, "stop"),
    ]);

    await summarizeOCR(baseBody);

    const recoveryPrompt = JSON.parse(
      mockProviderFetch.mock.calls[1][1].body as string,
    ).messages[1].content as string;
    expect(recoveryPrompt).toContain("NOTES STILL MISSING");
    expect(recoveryPrompt).toContain("- Wandering Horrors");
    expect(recoveryPrompt).toContain('"customTables": []');
  });

  it("does not fire when the response already has notes alongside its tables", async () => {
    queueResponses([
      aiResponse(
        {
          lore: [loreEntry("The Brine Wraiths")],
          customTables: [tableResult("Wandering Horrors", ["Brine wraith"])],
        },
        "stop",
      ),
    ]);

    const result = await summarizeOCR(baseBody);
    if ("error" in result) throw new Error(result.error);

    expect(mockProviderFetch).toHaveBeenCalledTimes(1);
    expect(result.extractionRounds).toBe(1);
  });

  it("does not fire when the response has neither notes nor tables", async () => {
    queueResponses([aiResponse({ lore: [], mechanicNotes: [] }, "stop")]);

    await summarizeOCR(baseBody);

    expect(mockProviderFetch).toHaveBeenCalledTimes(1);
  });

  it("only retries once per part, even if the retry brings back no notes", async () => {
    mockProviderFetch.mockImplementation(async () =>
      aiResponse(
        { customTables: [tableResult("Wandering Horrors", ["Brine wraith"])] },
        "stop",
      ),
    );

    const result = await summarizeOCR(baseBody);
    if ("error" in result) throw new Error(result.error);

    expect(mockProviderFetch).toHaveBeenCalledTimes(2);
    expect(result.lore).toEqual([]);
  });

  it("still recovers notes when continuation rounds are turned off", async () => {
    queueResponses([
      aiResponse(
        { customTables: [tableResult("Wandering Horrors", ["Brine wraith"])] },
        "stop",
      ),
      aiResponse({ lore: [loreEntry("The Brine Wraiths")] }, "stop"),
    ]);

    const result = await summarizeOCR({ ...baseBody, maxContinuationRounds: 0 });
    if ("error" in result) throw new Error(result.error);

    expect(mockProviderFetch).toHaveBeenCalledTimes(2);
    expect(result.lore.map((e) => e.title)).toEqual(["The Brine Wraiths"]);
  });

  it("does not spend the disabled continuation budget on a truncated response", async () => {
    // maxContinuationRounds: 0 means "don't continue past the output limit" -
    // the recovery allowance must not be repurposed into one.
    queueResponses([
      aiResponse({ lore: [loreEntry("Vashti")] }, "length"),
      aiResponse({ lore: [loreEntry("Should not be requested")] }, "stop"),
    ]);

    const result = await summarizeOCR({ ...baseBody, maxContinuationRounds: 0 });
    if ("error" in result) throw new Error(result.error);

    expect(mockProviderFetch).toHaveBeenCalledTimes(1);
    expect(result.incomplete).toBe(true);
  });

  it("recovers notes per part of a multi-part document", async () => {
    const longMarkdown = `# Tables one\n${"filler line\n".repeat(6000)}\n# Tables two\n${"more filler\n".repeat(
      100,
    )}`;
    const parts = splitIntoWindows(longMarkdown).length;
    expect(parts).toBe(2);

    queueResponses([
      // Part 1: tables only -> recovery -> notes.
      aiResponse({ customTables: [tableResult("Table A", ["a"])] }, "stop"),
      aiResponse({ lore: [loreEntry("Notes for A")] }, "stop"),
      // Part 2: tables only again -> its own recovery -> notes.
      aiResponse({ customTables: [tableResult("Table B", ["b"])] }, "stop"),
      aiResponse({ lore: [loreEntry("Notes for B")] }, "stop"),
    ]);

    const result = await summarizeOCR({ ...baseBody, markdown: longMarkdown });
    if ("error" in result) throw new Error(result.error);

    expect(mockProviderFetch).toHaveBeenCalledTimes(4);
    expect(result.lore.map((e) => e.title)).toEqual(["Notes for A", "Notes for B"]);
    expect(result.customTables.map((t) => t.name)).toEqual(["Table A", "Table B"]);
  });
});
