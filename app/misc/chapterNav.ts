import { ScenePart } from "./structs";

export interface ChapterSegment {
  /** 1-based chapter number, for display */
  number: number;
  /** Index into storyData.scene.parts where this chapter begins */
  startIndex: number;
  /** Short label derived from the first assistant part's content */
  preview: string;
}

const PREVIEW_LENGTH = 60;

function firstLine(text: string): string {
  const stripped = text
    .replace(/<[^>]*>/g, "") // strip any leftover tags
    .replace(/^>\s*/, "")
    .trim();
  const line = stripped.split("\n").find((l) => l.trim().length > 0) || stripped;
  return line.length > PREVIEW_LENGTH
    ? `${line.slice(0, PREVIEW_LENGTH).trimEnd()}…`
    : line;
}

/**
 * Compute chapter boundaries directly from ScenePart.endChapter markers
 * (set by outputToScenePart when the AI's output includes "!!! END CHAPTER
 * !!!"), rather than from storyData.chapters - that array isn't reliably
 * populated during normal play, while the per-part flag is.
 */
export function computeChapterSegments(parts: ScenePart[]): ChapterSegment[] {
  if (!parts || parts.length === 0) return [];

  const segments: ChapterSegment[] = [];
  let chapterNumber = 1;
  let expectingNewChapter = true;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (expectingNewChapter && !part.user && part.content?.trim()) {
      segments.push({
        number: chapterNumber,
        startIndex: i,
        preview: firstLine(part.content),
      });
      expectingNewChapter = false;
    }
    if (part.endChapter) {
      chapterNumber++;
      expectingNewChapter = true;
    }
  }

  return segments;
}
