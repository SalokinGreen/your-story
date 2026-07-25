import { ScenePart, Choice } from "@/app/misc/structs";
import { ChatMessage } from "@/app/misc/chatMessage";

export type { ChatMessage };

/**
 * Strip <thinking>...</thinking> tags, <output> tags, and other GM markers from content
 * Used to hide GM's internal reasoning from the player
 *
 * STRICT BEHAVIOR: If <output> or <story> tags are detected, ONLY content inside
 * those tags is returned. Everything else is hidden. No fallback cleaning.
 */
export function stripThinkingTags(content: string): string {
  if (!content) return "";

  // 1. Check for <output> tags (new standard) - STRICT: only return content inside tags
  const outputStartRegex = /<\s*output[^>]*>/i;
  if (outputStartRegex.test(content)) {
    const outputBlocks: string[] = [];
    let lastIndex = 0;
    let match;

    // Find all closed <output>...</output> blocks
    const closedBlockRegex = /<\s*output[^>]*>([\s\S]*?)<\s*\/\s*output\s*>/gi;
    while ((match = closedBlockRegex.exec(content)) !== null) {
      outputBlocks.push(match[1].trim());
      lastIndex = closedBlockRegex.lastIndex;
    }

    // Check for an open <output> tag after the last closed block (for streaming)
    const remainingContent = content.slice(lastIndex);
    // Stop at the next structured tag or end of string to avoid including choices/memory in story
    const openTagMatch =
      /<\s*output[^>]*>([\s\S]*?)(?=<\s*(?:memory|choices|commands|thinking|output|story)|!!!|$)/i.exec(
        remainingContent
      );
    if (openTagMatch) {
      outputBlocks.push(openTagMatch[1].trim());
    }

    // STRICT: If we detected <output> tags, ONLY return content from inside them
    // Even if no content was extracted, return empty string - don't fall through
    return outputBlocks.join("\n\n").trim();
  }

  // 2. Check for <story> tags (legacy standard) - STRICT: only return content inside tags
  const storyStartRegex = /<\s*story[^>]*>/i;
  if (storyStartRegex.test(content)) {
    const storyBlocks: string[] = [];
    let lastIndex = 0;
    let match;

    const closedBlockRegex = /<\s*story[^>]*>([\s\S]*?)<\s*\/\s*story\s*>/gi;
    while ((match = closedBlockRegex.exec(content)) !== null) {
      storyBlocks.push(match[1].trim());
      lastIndex = closedBlockRegex.lastIndex;
    }

    const remainingContent = content.slice(lastIndex);
    const openTagMatch =
      /<\s*story[^>]*>([\s\S]*?)(?=<\s*(?:memory|choices|commands|thinking|output|story)|!!!|$)/i.exec(
        remainingContent
      );
    if (openTagMatch) {
      storyBlocks.push(openTagMatch[1].trim());
    }

    // STRICT: If we detected <story> tags, ONLY return content from inside them
    return storyBlocks.join("\n\n").trim();
  }

  // 3. No <output> or <story> tags found - return content as-is
  return content.trim();
}

/**
 * Extract <thinking>...</thinking> content from a string
 * Returns array of thinking blocks found
 * Handles spaces inside tags like < thinking > that some models output
 * Also handles malformed tags like <thinking::label] ... </thinking>
 */
export function extractThinkingTags(content: string): string[] {
  if (!content) return [];
  // Match standard thinking tags
  const standardMatches =
    content.match(/<\s*thinking\s*>[\s\S]*?<\s*\/\s*thinking\s*>/gi) || [];
  // Match malformed thinking tags with labels: <thinking::label] ... </thinking>
  const malformedMatches =
    content.match(
      /<\s*thinking\s*:+[^\]>]*[\]>][\s\S]*?<\s*\/\s*thinking\s*>/gi
    ) || [];
  const allMatches = [...standardMatches, ...malformedMatches];
  return allMatches.map((m) =>
    m
      .replace(/<\s*thinking\s*:+[^\]>]*[\]>]/gi, "") // Remove malformed opening tags
      .replace(/<\s*\/?\s*thinking\s*>/gi, "") // Remove standard tags
      .trim()
  );
}

/**
 * Clean story content for text-to-speech playback.
 * Removes hidden GM notes (||...||), Markdown formatting/syntax, and any
 * leftover structured tags so TTS only reads the visible narrative prose
 * instead of the raw AI output.
 */
export function cleanTextForSpeech(content: string): string {
  if (!content) return "";

  let text = stripThinkingTags(content);

  // Remove hidden messages (||hidden text||) - never spoken aloud
  text = text.replace(/\|\|[\s\S]*?\|\|/g, "");

  // Strip Markdown headings, blockquotes, horizontal rules
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  text = text.replace(/^\s{0,3}>\s?/gm, "");
  text = text.replace(/^\s*([-*_]){3,}\s*$/gm, "");

  // Strip images and links, keeping link/alt text
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");

  // Strip bold/italic/strikethrough/inline code markers
  text = text.replace(/(\*\*\*|___)(.*?)\1/g, "$2");
  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2");
  text = text.replace(/(\*|_)(.*?)\1/g, "$2");
  text = text.replace(/~~(.*?)~~/g, "$1");
  text = text.replace(/`([^`]*)`/g, "$1");

  // Strip list markers
  text = text.replace(/^\s*[-*+]\s+/gm, "");
  text = text.replace(/^\s*\d+\.\s+/gm, "");

  // Collapse excess whitespace left behind by the removals above
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/[ \t]{2,}/g, " ");

  return text.trim();
}

/**
 * Detect if AI output contains repetitive/looping content.
 * This happens when the model gets stuck repeating the same phrase.
 */
export function detectRepetition(content: string): boolean {
  if (!content || content.length < 500) return false;

  // Method 1: Check for repeated phrases (minimum 30 chars repeated 3+ times)
  // Look for patterns like "Let me check X. Let me check X. Let me check X."
  const phrasePattern = /(.{30,100})\1{2,}/;
  if (phrasePattern.test(content)) {
    return true;
  }

  // Method 2: Check for high repetition ratio
  // Split into sentences and check how many are duplicates
  const sentences = content
    .split(/[.!?]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 20);

  if (sentences.length >= 5) {
    const uniqueSentences = new Set(sentences);
    const uniqueRatio = uniqueSentences.size / sentences.length;
    // If less than 30% unique sentences, it's repetitive
    if (uniqueRatio < 0.3) {
      return true;
    }
  }

  // Method 3: Check for specific repetition patterns
  // Count occurrences of common repetitive starters
  const repetitiveStarters = [
    "let me check",
    "let me also check",
    "i need to check",
    "i'll check",
    "checking",
  ];

  for (const starter of repetitiveStarters) {
    const count = (content.toLowerCase().match(new RegExp(starter, "g")) || [])
      .length;
    // If same phrase appears 5+ times, it's stuck in a loop
    if (count >= 5) {
      return true;
    }
  }

  return false;
}

export function outputToScenePart(text: string): ScenePart {
  // Helper: extract inner text of a simple XML-like block
  const extractBlock = (tag: string, src: string): string | null => {
    // Use String.raw so backslashes are preserved for the RegExp constructor
    const re = new RegExp(String.raw`<${tag}[^>]*>([\s\S]*?)<\/${tag}>`, "i");
    const m = src.match(re);
    if (m?.[1]) return m[1];

    // Fallback: naive search, case-insensitive
    const lower = src.toLowerCase();
    const openTag = `<${tag.toLowerCase()}`;
    const closeTag = `</${tag.toLowerCase()}>`;
    const openIdx = lower.indexOf(openTag);
    if (openIdx === -1) return null;

    const gtIdx = lower.indexOf(">", openIdx);
    if (gtIdx === -1) return null;

    const closeIdx = lower.indexOf(closeTag, gtIdx + 1);
    if (closeIdx === -1) {
      // If no closing tag, but we have an opening tag, return content until the next structured tag
      // This handles streaming or truncated responses and prevents including choices/memory in story
      const remaining = src.substring(gtIdx + 1);
      const nextTagMatch = remaining.match(
        /<\s*(?:memory|choices|commands|thinking|output|story)|!!!/i
      );
      if (nextTagMatch && nextTagMatch.index !== undefined) {
        return remaining.substring(0, nextTagMatch.index).trim();
      }
      return remaining.trim();
    }

    return src.substring(gtIdx + 1, closeIdx).trim();
  };

  // Helper: extract story content even when tags are missing
  const extractStoryContent = (src: string): string => {
    // Try to extract from <output> tags first (new standard)
    const outputBlock = extractBlock("output", src);
    if (outputBlock) return outputBlock;

    // Try to extract from <story> tags (legacy standard)
    const storyBlock = extractBlock("story", src);
    if (storyBlock) return storyBlock;

    // If no <output> or <story> tags, try to extract everything before <memory>, <choices>, or <commands> tags
    const lowerSrc = src.toLowerCase();
    let endIndex = src.length;

    // Find the first occurrence of any structured tag
    const tagMatches = [
      { tag: "<memory", index: lowerSrc.indexOf("<memory") },
      { tag: "<choices", index: lowerSrc.indexOf("<choices") },
      { tag: "<commands", index: lowerSrc.indexOf("<commands") },
      {
        tag: "!!! end chapter !!!",
        index: lowerSrc.indexOf("!!! end chapter !!!"),
      },
      {
        tag: "!!! end story !!!",
        index: lowerSrc.indexOf("!!! end story !!!"),
      },
      {
        tag: "!!! game over !!!",
        index: lowerSrc.indexOf("!!! game over !!!"),
      },
    ].filter((m) => m.index !== -1);

    if (tagMatches.length > 0) {
      endIndex = Math.min(...tagMatches.map((m) => m.index));
    }

    // Extract everything up to that point as story content
    const rawContent = src.substring(0, endIndex).trim();

    // Use stripThinkingTags to clean up any untagged reasoning (like [GM] markers)
    return stripThinkingTags(rawContent);
  };

  const parseChoice = (line: string): Choice => {
    // Extract metadata from angle brackets: <use_skill: ...; use_item: ...; etc>
    const metaMatch = line.match(/<([^>]+)>/);
    const text = line.replace(/\s*<[^>]*>\s*$/, "").trim();

    const choice: Choice = { text };

    if (metaMatch) {
      const metadata = metaMatch[1];

      // Parse use_skill: name (DC number/tier) or (X success(es) needed/required)
      // Supports: "Stealth (DC 25)", "Stealth (hard)", "Stealth (DC hard)", "Stealth (2 successes needed)"
      const skillMatch = metadata.match(
        /use_skill:\s*([^(;]+?)(?:\s*\((?:(?:DC\s*)?(\d+|trivial|easy|average|hard|very_hard|impossible)|(?:needs?\s*)?(\d+)\s*succ(?:ess)?(?:es)?\s*(?:needed|required)?)\))?(?:;|$)/i
      );
      if (skillMatch) {
        const skillName = skillMatch[1].trim();
        if (skillName.toLowerCase() !== "none") {
          choice.skill_used = skillName;
          // Try DC format first (group 2), then success count format (group 3)
          const dc = skillMatch[2] || skillMatch[3];
          if (dc) {
            // If it's a tier name, store as string; parser will convert later
            const numericDC = parseInt(dc, 10);
            if (!isNaN(numericDC)) {
              choice.skill_dc = numericDC;
            } else {
              // Store tier name as string - will be converted to number by game logic
              choice.skill_dc_tier = dc.toLowerCase() as any;
            }
          }
        }
      }

      // Parse use_resource: name (automatically at risk on failure)
      const resourceMatch = metadata.match(/use_resource:\s*([^;]+?)(?:;|$)/i);
      if (resourceMatch) {
        // Strip DC notation like "(DC 6)" and clean up the name
        const resourceName = resourceMatch[1]
          .trim()
          .replace(/\s*\(DC\s*\d+\)/gi, "")
          .replace(
            /\s*\(\d+\s*succ(?:ess)?(?:es)?\s*(?:needed|required)?\)/gi,
            ""
          )
          .trim();
        if (resourceName.toLowerCase() !== "none" && resourceName.length > 0) {
          choice.resource_used = resourceName;
        }
      }

      // Parse use_item: name
      const itemMatch = metadata.match(/use_item:\s*([^;]+?)(?:;|$)/i);
      if (itemMatch) {
        // Strip DC notation like "(DC 6)" and clean up the name
        const itemName = itemMatch[1]
          .trim()
          .replace(/\s*\(DC\s*\d+\)/gi, "")
          .replace(
            /\s*\(\d+\s*succ(?:ess)?(?:es)?\s*(?:needed|required)?\)/gi,
            ""
          )
          .trim();
        if (itemName.toLowerCase() !== "none" && itemName.length > 0) {
          choice.item_used = itemName;
        }
      }

      // Parse item_loss: true/false - DEPRECATED, kept for backward compatibility
      // item_loss was intended to signal if item_used should be consumed
      const lossMatch = metadata.match(/item_loss:\s*(true|false)/i);
      if (lossMatch && lossMatch[1].toLowerCase() === "true") {
        // If item_loss is true and item_used is set, store item name as item_loss
        if (choice.item_used) {
          choice.item_loss = choice.item_used;
        }
      }

      // Parse agmt_check: question (likelihood)
      const agmtCheckMatch = metadata.match(/agmt_check:\s*([^;]+?)(?:;|$)/i);
      if (agmtCheckMatch) {
        const agmtCheck = agmtCheckMatch[1].trim();
        if (agmtCheck.toLowerCase() !== "none") {
          choice.agmt_check = agmtCheck;
        }
      }

      // Parse agmt_table: category
      const agmtTableMatch = metadata.match(/agmt_table:\s*([^;]+?)(?:;|$)/i);
      if (agmtTableMatch) {
        const agmtTable = agmtTableMatch[1].trim();
        if (agmtTable.toLowerCase() !== "none") {
          choice.agmt_table = agmtTable;
        }
      }

      // Parse custom_table: table name
      const customTableMatch = metadata.match(
        /custom_table:\s*([^;]+?)(?:;|$)/i
      );
      if (customTableMatch) {
        const customTable = customTableMatch[1].trim();
        if (customTable.toLowerCase() !== "none") {
          choice.custom_table = customTable;
        }
      }
    }

    return choice;
  };

  const blockToChoiceList = (block: string | null): Choice[] => {
    if (!block) return [];
    return (
      block
        .split(/\r?\n/)
        .map((l) => l.trim())
        // strip common bullet prefixes: -, *, •
        .map((l) => l.replace(/^[\-\*\u2022]\s+/, ""))
        .filter((l) => l.length > 0)
        .map(parseChoice)
    );
  };

  const blockToList = (block: string | null): string[] => {
    if (!block) return [];
    return (
      block
        .split(/\r?\n/)
        .map((l) => l.trim())
        // strip common bullet prefixes: -, *, •
        .map((l) => l.replace(/^[\-\*\u2022]\s+/, ""))
        .filter((l) => l.length > 0)
    );
  };

  const story = extractStoryContent(text);
  const memoryBlock = extractBlock("memory", text);
  const choicesBlock = extractBlock("choices", text);
  const commandsBlock = extractBlock("commands", text);

  const content = story.trim();
  const memoryEntries = blockToList(memoryBlock);
  const choices = blockToChoiceList(choicesBlock);
  const commands = blockToList(commandsBlock);

  // Check for markers
  const endChapter = /!!!\s*END\s+CHAPTER\s*!!!/i.test(text);
  const endStory = /!!!\s*END\s+STORY\s*!!!/i.test(text);
  const gameOver = /!!!\s*GAME\s+OVER\s*!!!/i.test(text);

  const part: ScenePart = {
    content: content,
    imageUrl: "",
    user: false,
    role: "assistant",
    raw: text, // Preserve raw AI output for alternative context building
    ...(memoryEntries.length ? { memoryEntries } : {}),
    ...(choices.length ? { choices } : {}),
    ...(commands.length ? { commands } : {}),
    ...(endChapter ? { endChapter: true } : {}),
    ...(endStory ? { endStory: true } : {}),
    ...(gameOver ? { gameOver: true } : {}),
  };

  return part;
}

// Back-compat alias used by the API route
export const coerceToScenePart = outputToScenePart;
