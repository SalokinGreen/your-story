/**
 * Splitting a plain-text/markdown import into chunks that each get their own
 * summarize call (see PDFImporter.tsx).
 *
 * A .txt/.md file used to be handed to `summarizeOCR` whole, however big it
 * was, so every part of it had to be walked inside that one call's
 * wall-clock budget. On a book-length document it didn't fit: the budget was
 * spent on the opening chapters and the back half of the file was never sent
 * to the model at all. PDFs never had this problem, because page-range
 * chunking already gave each chunk its own call and its own budget - this
 * gives text imports the same treatment.
 */

/**
 * Target size of one text-import chunk.
 *
 * Deliberately well under `MAX_PROMPT_CHARS` (the most that fits in a single
 * summarize prompt): a chunk should be small enough that the model can write
 * *full-fidelity* notes for all of it inside one output budget, so
 * continuation rounds stay the exception. Bigger chunks don't fail loudly -
 * they just quietly come back as summaries of summaries.
 */
export const TEXT_IMPORT_CHUNK_CHARS = 30000;

/**
 * The shallowest heading level that appears more than once - the one
 * dividing this document into its natural sections (chapters in a rulebook,
 * entries in a bestiary). 0 when the document has no usable headings.
 */
function dividingHeadingLevel(lines: string[]): number {
  for (let level = 1; level <= 4; level++) {
    const marker = "#".repeat(level) + " ";
    let count = 0;
    for (const line of lines) {
      if (line.startsWith(marker)) count++;
      if (count > 1) return level;
    }
  }
  return 0;
}

/**
 * Split a text/markdown document into chunks of roughly `maxChars`, cut on
 * heading boundaries so a rule is never split mid-explanation.
 *
 * A single section larger than the target is left whole rather than cut
 * mid-rule: `summarizeOCR` walks an oversized chunk part by part internally,
 * and now has a budget of its own in which to do it.
 */
export function splitMarkdownIntoImportChunks(
  markdown: string,
  maxChars: number = TEXT_IMPORT_CHUNK_CHARS,
): string[] {
  if (markdown.length <= maxChars) return [markdown];

  const lines = markdown.split("\n");
  const level = dividingHeadingLevel(lines);
  const marker = level > 0 ? "#".repeat(level) + " " : null;

  // Cut into sections at those headings. With no heading to go on, every
  // line becomes its own section, so the packing below falls back to line
  // boundaries rather than handing back the whole document unsplit.
  let sections: string[];
  if (marker === null) {
    sections = lines;
  } else {
    sections = [];
    let current: string[] = [];
    for (const line of lines) {
      if (line.startsWith(marker) && current.length > 0) {
        sections.push(current.join("\n"));
        current = [];
      }
      current.push(line);
    }
    if (current.length > 0) sections.push(current.join("\n"));
  }

  // Pack whole sections into chunks, greedily, never splitting one.
  const chunks: string[] = [];
  let pending = "";
  for (const section of sections) {
    if (!pending) {
      pending = section;
    } else if (pending.length + 1 + section.length <= maxChars) {
      pending = `${pending}\n${section}`;
    } else {
      chunks.push(pending);
      pending = section;
    }
  }
  if (pending) chunks.push(pending);

  return chunks;
}
