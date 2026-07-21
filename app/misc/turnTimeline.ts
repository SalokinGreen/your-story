/**
 * Shared, streaming-safe parser for GM-stage output. Replaces the old
 * pattern of re-parsing <thinking>/<output> tag boundaries independently in
 * several call sites (live buffer, final save, historical re-render) with a
 * single implementation, so the boundaries can never drift out of sync and
 * a truncated generation can never leak a raw tag fragment into what the
 * player sees or what gets saved.
 *
 * A GM-stage completion looks like:
 *   <thinking>private reasoning</thinking>
 *   <output>narration the player sees</output>
 *   (tool calls happen between rounds, not inside this text)
 *   <output>more narration</output>
 *
 * Untagged text is treated as hidden reasoning (matching the prompt's own
 * "anything outside <output> is hidden" rule) UNLESS no tag appears in the
 * buffer at all, in which case the whole thing is visible text - this
 * covers the tag-free story stage, which no longer asks the model to wrap
 * its prose in <output>.
 */

export type TimelineBlockKind = "thinking" | "tool" | "text";

export interface TimelineBlock {
  id: string;
  kind: TimelineBlockKind;
  // thinking / text
  content?: string;
  // true when `content` is the model's native reasoning/CoT field rather
  // than parsed <thinking> tag text - the "real" thinking output.
  isReasoning?: boolean;
  // still growing (live rendering only, never persisted)
  streaming?: boolean;
  // tool
  toolName?: string;
  toolCallId?: string;
  success?: boolean;
  contextForStory?: string;
}

let blockIdCounter = 0;
function nextId(): string {
  blockIdCounter += 1;
  return `tlb-${blockIdCounter}`;
}

const TAG_NAMES = ["thinking", "output"];

/** Could `tail` (a suffix starting with "<") still grow into a recognized tag? */
function isPossibleTagPrefix(tail: string): boolean {
  const body = tail.slice(1).replace(/^\s*\/\s*/, "").trimStart().toLowerCase();
  if (body.length === 0) return true;
  return TAG_NAMES.some((name) => name.startsWith(body) || body.startsWith(name));
}

/**
 * Splits off a trailing partial tag (e.g. "<out" or "</think") that hasn't
 * arrived in full yet, so callers never render or parse a dangling
 * fragment as literal text. `pending` should be held back and re-prepended
 * to the next chunk rather than displayed.
 */
export function splitPendingTag(buffer: string): { safe: string; pending: string } {
  if (!buffer) return { safe: "", pending: "" };
  const lastLt = buffer.lastIndexOf("<");
  if (lastLt === -1) return { safe: buffer, pending: "" };
  // A ">" after the last "<" means that tag (if it is one) already closed.
  if (buffer.indexOf(">", lastLt) !== -1) return { safe: buffer, pending: "" };
  const tail = buffer.slice(lastLt);
  if (isPossibleTagPrefix(tail)) {
    return { safe: buffer.slice(0, lastLt), pending: tail };
  }
  return { safe: buffer, pending: "" };
}

const TAG_BOUNDARY = /<\s*(\/)?\s*(thinking|output)\s*>/gi;

/**
 * Splits raw GM-stage text into ordered thinking/text segments. Safe to
 * call repeatedly on a growing buffer while streaming.
 */
export function parseTaggedContent(raw: string): Array<Omit<TimelineBlock, "id">> {
  if (!raw) return [];
  const { safe } = splitPendingTag(raw);
  if (!safe.trim()) return [];

  TAG_BOUNDARY.lastIndex = 0;
  if (!TAG_BOUNDARY.test(safe)) {
    // No tags anywhere - the whole buffer is plain visible text (tag-free
    // story stage, or a model that ignored the tag instruction entirely).
    const text = safe.trim();
    return text ? [{ kind: "text", content: text }] : [];
  }

  TAG_BOUNDARY.lastIndex = 0;
  const blocks: Array<Omit<TimelineBlock, "id">> = [];
  let mode: "thinking" | "text" = "thinking"; // untagged runs are hidden by default
  let cursor = 0;
  let match: RegExpExecArray | null;

  const pushSegment = (text: string, kind: "thinking" | "text") => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const last = blocks[blocks.length - 1];
    if (last && last.kind === kind) {
      last.content = `${last.content}\n\n${trimmed}`;
    } else {
      blocks.push({ kind, content: trimmed });
    }
  };

  while ((match = TAG_BOUNDARY.exec(safe)) !== null) {
    pushSegment(safe.slice(cursor, match.index), mode);
    const isClosing = !!match[1];
    const tagName = match[2].toLowerCase();
    if (!isClosing && tagName === "thinking") mode = "thinking";
    else if (!isClosing && tagName === "output") mode = "text";
    else mode = "thinking"; // any closing tag reverts to hidden-by-default
    cursor = TAG_BOUNDARY.lastIndex;
  }
  pushSegment(safe.slice(cursor), mode);

  return blocks;
}

/**
 * Plain visible story text extracted from tagged GM/story content - the
 * robust, streaming-safe replacement for the old stripThinkingTags() at
 * extraction sites that produce ScenePart.content.
 */
export function extractVisibleText(raw: string): string {
  return parseTaggedContent(raw)
    .filter((b) => b.kind === "text")
    .map((b) => b.content)
    .join("\n\n")
    .trim();
}

function withIds(blocks: Array<Omit<TimelineBlock, "id">>): TimelineBlock[] {
  return blocks.map((b) => ({ id: nextId(), ...b }));
}

export function toolResultBlock(result: {
  toolName: string;
  toolCallId: string;
  success: boolean;
  contextForStory: string;
}): TimelineBlock {
  return {
    id: nextId(),
    kind: "tool",
    toolName: result.toolName,
    toolCallId: result.toolCallId,
    success: result.success,
    contextForStory: result.contextForStory,
  };
}

/**
 * Live-streaming helper: given the timeline blocks built so far and the
 * GM stage's current-round buffer (which generation.ts resets to "" at the
 * start of every round), returns the updated block list - blocks from
 * completed rounds (frozen behind a "tool" block) are left untouched, and
 * only the trailing, still-growing round is re-parsed.
 */
export function updateLiveRoundBlocks(
  prevBlocks: TimelineBlock[],
  roundBuffer: string,
): TimelineBlock[] {
  let roundStart = prevBlocks.length;
  for (let i = prevBlocks.length - 1; i >= 0; i--) {
    if (prevBlocks[i].kind === "tool") {
      roundStart = i + 1;
      break;
    }
    if (i === 0) roundStart = 0;
  }
  const frozen = prevBlocks.slice(0, roundStart);
  // Reuse ids from the previous parse of this same round's buffer, matched
  // by position - re-parsing from scratch on every streamed delta rebuilds
  // the block array every call, but for a growing buffer the block
  // sequence only ever extends or appends, so the block at a given index
  // is still the same logical block it was last call. Handing out a fresh
  // id here regardless (the old behavior) defeats React's key-based
  // reconciliation: it sees "removed old block, added new block" on nearly
  // every token and unmounts/remounts the DOM node, which is what caused
  // the text to visibly disappear and re-fade-in while streaming.
  const prevLive = prevBlocks.slice(roundStart);
  const liveBlocks: TimelineBlock[] = parseTaggedContent(roundBuffer).map(
    (b, i) => ({ id: prevLive[i]?.id ?? nextId(), ...b }),
  );
  if (liveBlocks.length > 0) {
    liveBlocks[liveBlocks.length - 1].streaming = true;
  }
  return [...frozen, ...liveBlocks];
}

/**
 * Live-streaming helper for native provider reasoning (DeepSeek/OpenRouter
 * `reasoning` delta) for the current round - inserted as the first block
 * of the round so it appears before any <thinking>/<output> text.
 */
export function updateLiveReasoningBlock(
  prevBlocks: TimelineBlock[],
  fullReasoning: string,
): TimelineBlock[] {
  let roundStart = prevBlocks.length;
  for (let i = prevBlocks.length - 1; i >= 0; i--) {
    if (prevBlocks[i].kind === "tool") {
      roundStart = i + 1;
      break;
    }
    if (i === 0) roundStart = 0;
  }
  const frozen = prevBlocks.slice(0, roundStart);
  const rest = prevBlocks.slice(roundStart);
  const restWithoutReasoning = rest.filter((b) => !b.isReasoning);
  const reasoningBlock: TimelineBlock = {
    id: rest.find((b) => b.isReasoning)?.id ?? nextId(),
    kind: "thinking",
    content: fullReasoning,
    isReasoning: true,
    streaming: true,
  };
  return [...frozen, reasoningBlock, ...restWithoutReasoning];
}

/** Clears the `streaming` flag on every block (call when a stage completes). */
export function freezeBlocks(blocks: TimelineBlock[]): TimelineBlock[] {
  return blocks.map((b) => (b.streaming ? { ...b, streaming: false } : b));
}

/**
 * Live-streaming helper for the tag-free fallback story stage (runs after
 * the GM stage's own thinking/tool blocks, when the GM stage didn't
 * narrate anything itself) - appends/updates one trailing streaming text
 * block, no round-boundary bookkeeping needed since this stage never
 * interleaves tool calls.
 */
export function appendStreamingText(
  prevBlocks: TimelineBlock[],
  fullText: string,
): TimelineBlock[] {
  const trimmed = fullText.trim();
  const last = prevBlocks[prevBlocks.length - 1];
  if (last?.kind === "text" && last.streaming) {
    return [...prevBlocks.slice(0, -1), { ...last, content: trimmed }];
  }
  if (!trimmed) return prevBlocks;
  return [...prevBlocks, { id: nextId(), kind: "text", content: trimmed, streaming: true }];
}

interface SavedGMConversationMessage {
  role: "assistant" | "tool";
  content: string;
  reasoning?: string;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
}

interface SavedToolResult {
  success: boolean;
  contextForStory: string;
  toolName: string;
}

function normalizeForCompare(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * On the common path, the GM stage's own <output> segments ARE the saved
 * narration (ScenePart.content) - the "separate story stage" only runs
 * when the GM stage produced no narratable text at all. There's no
 * persisted flag recording which happened (no need for one - it's cheap to
 * detect): if concatenating every round's <output> text reproduces
 * `content` (modulo whitespace), the GM stage wrote the narration itself,
 * so it's safe to render each round's narration inline, interleaved with
 * that round's tool calls, instead of as a separate block after the fact.
 */
export function narrationCameFromGMStage(
  gmConversation: SavedGMConversationMessage[] | undefined,
  content: string,
): boolean {
  if (!gmConversation || !content.trim()) return false;
  const reconstructed = gmConversation
    .filter((m) => m.role === "assistant" && m.content)
    .map((m) => extractVisibleText(m.content))
    .filter(Boolean)
    .join("\n\n");
  return normalizeForCompare(reconstructed) === normalizeForCompare(content);
}

/**
 * Rebuilds the chronological thinking/tool/text timeline for a saved turn
 * from its persisted gmConversation - no dedicated "timeline" field
 * needed, since gmConversation/gmToolCalls already capture everything in
 * order (this also means it works retroactively on saves from before this
 * feature existed).
 *
 * When `extractNarration` is false, gmConversation content is treated as
 * pure hidden reasoning and the caller is responsible for appending the
 * actual narration (ScenePart.content) separately - see
 * narrationCameFromGMStage() above for when to pass true instead.
 */
export function buildSavedTimeline(
  gmConversation: SavedGMConversationMessage[] | undefined,
  toolResults: Map<string, SavedToolResult> | undefined,
  extractNarration: boolean,
  // The story stage's own native reasoning/CoT (ScenePart.reasoning) - only
  // ever populated when a genuinely separate narrator call happened
  // (continueGMConversation or buildStoryPrompt path), so it's appended
  // after the GM stage's blocks, chronologically where that call occurred.
  storyReasoning?: string,
): TimelineBlock[] {
  if (
    (!gmConversation || gmConversation.length === 0) &&
    !storyReasoning?.trim()
  ) {
    return [];
  }
  const blocks: TimelineBlock[] = [];

  for (const msg of gmConversation || []) {
    if (msg.role !== "assistant") continue;

    if (msg.reasoning?.trim()) {
      blocks.push({
        id: nextId(),
        kind: "thinking",
        content: msg.reasoning.trim(),
        isReasoning: true,
      });
    }

    if (msg.content?.trim()) {
      if (extractNarration) {
        blocks.push(...withIds(parseTaggedContent(msg.content)));
      } else {
        blocks.push({ id: nextId(), kind: "thinking", content: msg.content.trim() });
      }
    }

    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        const result = toolResults?.get(tc.id);
        blocks.push({
          id: nextId(),
          kind: "tool",
          toolName: result?.toolName || tc.function.name,
          toolCallId: tc.id,
          success: result?.success,
          contextForStory: result?.contextForStory,
        });
      }
    }
  }

  if (storyReasoning?.trim()) {
    blocks.push({
      id: nextId(),
      kind: "thinking",
      content: storyReasoning.trim(),
      isReasoning: true,
    });
  }

  return blocks;
}
