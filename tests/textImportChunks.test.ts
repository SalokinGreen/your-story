/**
 * Text-import chunking tests - see textImportChunks.ts.
 *
 * A book-length .md file used to go to the model as a single summarize call,
 * whose internal walk across the document had to fit in one wall-clock
 * budget. It didn't: on a full rulebook the budget went on the opening
 * chapters and the back half was never read at all. Splitting the file into
 * chunks that each get their own call is what fixes that, so these tests
 * care most about *every* part of the source ending up in some chunk.
 */
import { describe, it, expect } from "vitest";
import {
  splitMarkdownIntoImportChunks,
  TEXT_IMPORT_CHUNK_CHARS,
} from "@/app/misc/textImportChunks";

/** A rulebook-shaped document: top-level chapters, sub-sections inside them. */
function rulebook(chapters: number, linesPerChapter: number): string {
  const parts: string[] = [];
  for (let c = 1; c <= chapters; c++) {
    parts.push(`# CHAPTER ${c}: THE ${c}TH THING`);
    parts.push(`## Overview of chapter ${c}`);
    for (let l = 0; l < linesPerChapter; l++) {
      parts.push(`Chapter ${c} rules line ${l}, stating a number like ${l * 3}.`);
    }
  }
  return parts.join("\n");
}

describe("splitMarkdownIntoImportChunks", () => {
  it("leaves a document that fits in one chunk alone", () => {
    const doc = "# Short doc\n\nnot much here";
    expect(splitMarkdownIntoImportChunks(doc)).toEqual([doc]);
  });

  it("splits a long document into several chunks", () => {
    const doc = rulebook(20, 60);
    expect(doc.length).toBeGreaterThan(TEXT_IMPORT_CHUNK_CHARS);

    const chunks = splitMarkdownIntoImportChunks(doc);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("covers every line of the source across the chunks", () => {
    const doc = rulebook(20, 60);
    const chunks = splitMarkdownIntoImportChunks(doc);

    // Rejoining the chunks reproduces the document exactly - nothing
    // duplicated, and (the point of the exercise) nothing dropped.
    expect(chunks.join("\n")).toBe(doc);
  });

  it("keeps the last chapter of a long document, not just the first few", () => {
    const doc = rulebook(20, 60);
    const chunks = splitMarkdownIntoImportChunks(doc);

    expect(chunks.some((c) => c.includes("# CHAPTER 1:"))).toBe(true);
    expect(chunks.some((c) => c.includes("# CHAPTER 20:"))).toBe(true);
  });

  it("cuts on chapter boundaries rather than mid-chapter", () => {
    const doc = rulebook(20, 60);
    const chunks = splitMarkdownIntoImportChunks(doc);

    // Every chunk after the first opens on a chapter heading, so no rule is
    // split away from the heading that explains it.
    for (const chunk of chunks.slice(1)) {
      expect(chunk.startsWith("# CHAPTER ")).toBe(true);
    }
  });

  it("stays within the target size when the sections allow it", () => {
    const doc = rulebook(20, 60);
    const chunks = splitMarkdownIntoImportChunks(doc);

    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(TEXT_IMPORT_CHUNK_CHARS);
    }
  });

  it("packs several small chapters into one chunk instead of one chunk each", () => {
    const doc = rulebook(20, 60);
    const chunks = splitMarkdownIntoImportChunks(doc);

    // 20 chapters, and each chunk holds more than one of them.
    expect(chunks.length).toBeLessThan(20);
    expect(chunks[0].match(/# CHAPTER /g)?.length).toBeGreaterThan(1);
  });

  it("falls back to a deeper heading level when there is only one top-level heading", () => {
    const parts: string[] = ["# THE ONLY TITLE"];
    for (let s = 1; s <= 40; s++) {
      parts.push(`## Section ${s}`);
      for (let l = 0; l < 40; l++) parts.push(`Section ${s} body line ${l}.`);
    }
    const doc = parts.join("\n");
    expect(doc.length).toBeGreaterThan(TEXT_IMPORT_CHUNK_CHARS);

    const chunks = splitMarkdownIntoImportChunks(doc);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("\n")).toBe(doc);
    for (const chunk of chunks.slice(1)) {
      expect(chunk.startsWith("## Section ")).toBe(true);
    }
  });

  it("still covers a document with no headings at all", () => {
    const doc = Array.from(
      { length: 2000 },
      (_, i) => `Line ${i} of an unstructured transcript with no headings.`,
    ).join("\n");
    expect(doc.length).toBeGreaterThan(TEXT_IMPORT_CHUNK_CHARS);

    const chunks = splitMarkdownIntoImportChunks(doc);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("\n")).toBe(doc);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(TEXT_IMPORT_CHUNK_CHARS);
    }
  });

  it("keeps an oversized section whole rather than cutting mid-rule", () => {
    // One chapter far bigger than the target, with a small one after it.
    const huge = `# HUGE CHAPTER\n${"a rules line that goes on and on.\n".repeat(2000)}`;
    const doc = `${huge}\n# SMALL CHAPTER\nshort.`;
    expect(huge.length).toBeGreaterThan(TEXT_IMPORT_CHUNK_CHARS);

    const chunks = splitMarkdownIntoImportChunks(doc);

    // The oversized chapter is its own chunk, intact - summarizeOCR walks it
    // part by part internally, with a budget of its own to do it in.
    expect(chunks[0]).toBe(huge);
    expect(chunks[1]).toContain("# SMALL CHAPTER");
    expect(chunks.join("\n")).toBe(doc);
  });
});
