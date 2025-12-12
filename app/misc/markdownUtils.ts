/**
 * Markdown utilities for consistent rendering across the app.
 */

/**
 * Preprocess markdown content to handle single newlines as line breaks
 * while preserving proper list syntax.
 *
 * Instead of using remark-breaks (which interferes with lists), we:
 * 1. Add two trailing spaces to lines that should have soft breaks
 * 2. Add blank lines around list blocks
 * 3. Keep list items and headers clean
 */
export function preprocessMarkdown(content: string): string {
  if (!content) return "";

  const lines = content.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prevLine = i > 0 ? lines[i - 1] : "";
    const nextLine = i < lines.length - 1 ? lines[i + 1] : "";

    // Check if lines are list items (unordered or ordered)
    const isListItem = /^\s*[-*+]\s/.test(line) || /^\s*\d+\.\s/.test(line);
    const prevIsListItem =
      /^\s*[-*+]\s/.test(prevLine) || /^\s*\d+\.\s/.test(prevLine);
    const nextIsListItem =
      /^\s*[-*+]\s/.test(nextLine) || /^\s*\d+\.\s/.test(nextLine);

    // Check for other block elements
    const isHeader = /^#{1,6}\s/.test(line);
    const isCodeFence = /^```/.test(line);
    const isEmpty = line.trim() === "";
    const prevIsEmpty = prevLine.trim() === "";
    const nextIsEmpty = nextLine.trim() === "";

    // Add blank line before first list item if needed
    if (isListItem && !prevIsListItem && !prevIsEmpty && i > 0) {
      result.push("");
    }

    // For non-list, non-empty, non-header lines that precede content:
    // Add two trailing spaces for soft line breaks (Markdown standard)
    if (
      !isEmpty &&
      !isListItem &&
      !isHeader &&
      !isCodeFence &&
      !nextIsEmpty &&
      !nextIsListItem &&
      !/^#{1,6}\s/.test(nextLine) &&
      i < lines.length - 1
    ) {
      // Add trailing spaces for line break if not already there
      if (!line.endsWith("  ")) {
        result.push(line + "  ");
      } else {
        result.push(line);
      }
    } else {
      result.push(line);
    }

    // Add blank line after last list item if needed
    if (isListItem && !nextIsListItem && !nextIsEmpty && i < lines.length - 1) {
      result.push("");
    }
  }

  return result.join("\n");
}
