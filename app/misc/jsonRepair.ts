/**
 * Generic JSON parsing/repair helpers for streamed LLM output.
 *
 * Extracted from the (now removed) staged adventure generator so the OCR
 * pipeline — which is unrelated to adventure authoring — keeps working.
 * Nothing here knows about adventures, stages, or any particular schema.
 */

/**
 * Check if JSON content appears to be incomplete (cut off mid-generation)
 * Returns info about the incomplete state if detected
 */
export function detectIncompleteJSON(content: string): {
  isIncomplete: boolean;
  lastValidPosition: number;
  truncatedContent: string;
} {
  let jsonContent = content.trim();

  // Remove markdown code blocks if present
  const jsonBlockMatch = jsonContent.match(
    /```(?:json)?\s*([\s\S]*?)(?:\s*```)?$/
  );
  if (jsonBlockMatch) {
    jsonContent = jsonBlockMatch[1].trim();
  }

  // Find JSON start
  const startIndex = jsonContent.indexOf("{");
  if (startIndex === -1) {
    return {
      isIncomplete: true,
      lastValidPosition: 0,
      truncatedContent: jsonContent,
    };
  }

  // Count brackets to detect incomplete JSON
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  let escaped = false;
  let lastValidPosition = startIndex;

  for (let i = startIndex; i < jsonContent.length; i++) {
    const char = jsonContent[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"' && !escaped) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === "{") braceCount++;
      else if (char === "}") {
        braceCount--;
        if (braceCount === 0) lastValidPosition = i;
      } else if (char === "[") bracketCount++;
      else if (char === "]") bracketCount--;
    }
  }

  // JSON is incomplete if braces/brackets don't balance
  const isIncomplete = braceCount !== 0 || bracketCount !== 0 || inString;

  return {
    isIncomplete,
    lastValidPosition,
    truncatedContent: jsonContent.slice(startIndex),
  };
}

/**
 * Clean continuation content to handle common issues:
 * - Overlap with original content (AI repeating the end of prefill)
 * - Extra leading whitespace/newlines
 * - Markdown code block markers
 * - Content that starts with a fresh JSON object
 */
export function cleanContinuationContent(
  originalContent: string,
  continuationContent: string
): string {
  let cleaned = continuationContent;

  // Remove leading whitespace/newlines
  cleaned = cleaned.replace(/^[\s\n]+/, "");

  // Remove any markdown code block markers
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "");
  cleaned = cleaned.replace(/```\s*$/g, "");

  // If continuation starts with "{" and original doesn't end with a comma or opening bracket,
  // the AI might have started over - this is a bad continuation
  const originalTrimmed = originalContent.trimEnd();
  if (
    cleaned.startsWith("{") &&
    !originalTrimmed.endsWith(",") &&
    !originalTrimmed.endsWith("[") &&
    !originalTrimmed.endsWith(":")
  ) {
    // AI started a fresh JSON object - try to detect overlap
    // Look for the last 50-100 chars of original in the continuation
    const overlapCheckLength = Math.min(100, originalContent.length);
    const originalEnd = originalContent.slice(-overlapCheckLength);

    // Check if continuation starts with something that looks like original content
    const overlapIndex = cleaned.indexOf(originalEnd.slice(-30));
    if (overlapIndex !== -1 && overlapIndex < 50) {
      // Found overlap - skip the overlapping part
      cleaned = cleaned.slice(overlapIndex + originalEnd.slice(-30).length);
    } else {
      // No clear overlap found - this continuation is probably bad
      // Return empty to let the repair fallback handle it
      console.warn(
        "Continuation appears to have restarted JSON, discarding continuation"
      );
      return "";
    }
  }

  // Detect and remove overlap where AI repeated the end of the prefill
  // Check if first 20-50 chars of continuation match end of original
  const checkLengths = [50, 40, 30, 20, 15, 10];
  for (const len of checkLengths) {
    if (cleaned.length < len) continue;
    const continuationStart = cleaned.slice(0, len);
    const originalEndCheck = originalContent.slice(-len);

    if (continuationStart === originalEndCheck) {
      // Found exact overlap - remove it
      cleaned = cleaned.slice(len);
      console.log(`Removed ${len} chars of overlap from continuation`);
      break;
    }
  }

  return cleaned;
}

/**
 * Build a repair prompt to close truncated JSON without generating more content.
 * This is cheaper than continuation - we just want valid parseable JSON.
 */
export function buildContinuationPrompt(
  truncatedContent: string,
  _stage?: string
): string {
  // Get the last ~800 characters to provide context for closing
  const contextLength = Math.min(800, truncatedContent.length);
  const lastContent = truncatedContent.slice(-contextLength);

  return `Your previous response was cut off. Here's the end of what you generated:

...${lastContent}

CRITICAL INSTRUCTIONS:
1. DO NOT generate any new content items
2. Just close/finish the current JSON object so it's valid
3. If you're mid-string, close the string with "
4. Close any open arrays with ]
5. Close any open objects with }
6. Output ONLY the closing characters needed - nothing else

Example: if cut off at {"name": "Test, your output should be: "}
Example: if cut off at [{"a":1},{"b":2, your output should be: }]

Output ONLY the minimal characters to make the JSON valid.`;
}

/**
 * Attempt to repair incomplete or malformed JSON
 * This is a best-effort fallback that handles:
 * - Unclosed brackets/braces
 * - Malformed property names (e.g., `" "name"` instead of `"name"`)
 * - Markdown code blocks
 */
export function attemptJSONRepair(content: string): string {
  let jsonContent = content.trim();

  // Remove markdown code blocks if present (at start/end)
  const jsonBlockMatch = jsonContent.match(
    /```(?:json)?\s*([\s\S]*?)(?:\s*```)?$/
  );
  if (jsonBlockMatch) {
    jsonContent = jsonBlockMatch[1].trim();
  }

  // Handle embedded markdown code block markers that may appear mid-JSON
  // This handles cases where AI inserts ```json mid-response
  // First, handle case where backticks appear inside a string value - close the string first
  // Pattern: text.```json -> text."  (close the string before the fence)
  jsonContent = jsonContent.replace(
    /([^\\])"([^"]*?)\\?`{3,}(?:json)?\s*/gi,
    '$1"$2"'
  );

  // Remove remaining embedded markdown markers outside of strings
  jsonContent = jsonContent.replace(/```json\s*/gi, "");
  jsonContent = jsonContent.replace(/```\s*/g, "");

  // Fix Python-style triple-quoted strings (""") to proper JSON strings
  // The AI sometimes outputs: "html": """<div>...</div>""" instead of "html": "<div>...</div>"
  // We need to convert these to properly escaped JSON strings
  jsonContent = jsonContent.replace(
    /:\s*"""([\s\S]*?)"""/g,
    (match, innerContent) => {
      // Escape the inner content for JSON: escape backslashes, quotes, and newlines
      const escaped = innerContent
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
      return `: "${escaped}"`;
    }
  );

  // Fix malformed property names like `" "name"` or `"  "name"` -> `"name"`
  // This handles AI mistakes where a space appears before the property name
  jsonContent = jsonContent.replace(/"[ \t]+"([^"]+)"(\s*:)/g, '"$1"$2');

  // Fix cases like `" "name":` (orphaned quote with space before actual name)
  jsonContent = jsonContent.replace(/"[ \t]+"/g, '"');

  // Fix unquoted emoji values like "symbol": ⚔️ -> "symbol": "⚔️"
  // Matches: colon, optional whitespace, emoji(s) with optional variation selectors, optional whitespace before comma/bracket/brace/newline
  // Emoji ranges include: Emoticons, Dingbats, Symbols, Supplemental Symbols, Variation Selectors, Zero-Width Joiner, etc.
  jsonContent = jsonContent.replace(
    /:\s*([\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{FE00}-\u{FE0F}\u{200D}]+)\s*([,}\]\r\n])/gu,
    ': "$1"$2'
  );

  const startIndex = jsonContent.indexOf("{");
  if (startIndex === -1) return jsonContent;

  jsonContent = jsonContent.slice(startIndex);

  // Track what needs closing
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let lastValidPosition = 0; // Last position where JSON was structurally valid

  for (let i = 0; i < jsonContent.length; i++) {
    const char = jsonContent[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"' && !escaped) {
      inString = !inString;
      if (!inString) {
        // Just closed a string - check if this completes a valid element
        const nextNonSpace = jsonContent.slice(i + 1).match(/^\s*([,}\]:])/);
        if (nextNonSpace) {
          lastValidPosition = i;
        }
      }
      continue;
    }

    if (!inString) {
      if (char === "{") {
        stack.push("}");
      } else if (char === "[") {
        stack.push("]");
      } else if (char === "}" || char === "]") {
        if (stack.length > 0 && stack[stack.length - 1] === char) {
          stack.pop();
          lastValidPosition = i;
        }
      } else if (char === ",") {
        // After a comma is a good truncation point if followed by valid content
        lastValidPosition = i;
      }
    }
  }

  // If we're in an unterminated string or have unclosed brackets, truncate to last valid position
  if (inString || stack.length > 0) {
    // Find the last complete array/object element before truncation
    // Look for patterns like: }, or }, { or ], or ]
    const truncated = jsonContent.slice(0, lastValidPosition + 1);

    // Remove any trailing partial element after a comma
    // This handles cases like: [..., {"name": "test", "value":
    let cleaned = truncated.replace(/,\s*\{[^}]*$/, ""); // Partial object at end of array
    cleaned = cleaned.replace(/,\s*\[[^\]]*$/, ""); // Partial array at end
    cleaned = cleaned.replace(/,\s*"[^"]*"?\s*:?\s*(?:"[^"]*)?$/, ""); // Partial key-value
    cleaned = cleaned.replace(/,\s*$/, ""); // Trailing comma

    jsonContent = cleaned;

    // Recount stack after truncation
    stack.length = 0;
    inString = false;
    escaped = false;
    for (let i = 0; i < jsonContent.length; i++) {
      const char = jsonContent[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === "{") stack.push("}");
        else if (char === "[") stack.push("]");
        else if (char === "}" || char === "]") {
          if (stack.length > 0) stack.pop();
        }
      }
    }
  }

  // Final cleanup - remove trailing incomplete elements more aggressively
  // Handle case where we have a trailing comma before closing bracket
  jsonContent = jsonContent.replace(/,(\s*[}\]])/, "$1");

  // Close remaining brackets/braces
  while (stack.length > 0) {
    jsonContent += stack.pop();
  }

  return jsonContent;
}
