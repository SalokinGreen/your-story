/**
 * Small, dependency-free text utilities shared across prompt-building modules
 * (ai.ts, ai_staged.ts, big_adventure_ai.ts, ...). Kept dependency-free to
 * avoid circular imports between those modules.
 */

// Cleans text by removing problematic characters and normalizing whitespace
export function cleanString(text: string): string {
  if (!text) return "";
  return (
    text
      // Remove null bytes and other control characters (except newlines and tabs)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      // Normalize different types of whitespace to standard space
      .replace(/[   -​  　]/g, " ")
      // Replace multiple spaces with single space
      .replace(/ {2,}/g, " ")
      // Replace more than 2 consecutive newlines with exactly 2
      .replace(/\n{3,}/g, "\n\n")
      // Trim spaces at start/end of lines
      .replace(/[ \t]+$/gm, "")
      .replace(/^[ \t]+/gm, "")
      // Trim overall
      .trim()
  );
}
