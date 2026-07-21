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
import { describe, it, expect } from "vitest";
import { processParserResult } from "@/app/misc/ocrSummarizeCall";

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
