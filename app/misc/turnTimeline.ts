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
 *   narration the player sees, written directly with no wrapper tag
 *   (tool calls happen between rounds, not inside this text)
 *   more narration
 *
 * Claude-style visibility: everything is visible by default EXCEPT text
 * inside <thinking>...</thinking>. `<output>` is only recognized as a
 * legacy/defensive tag - old saves used it, and a model that reverts to
 * old habits and wraps prose in it anyway should still render cleanly - but
 * it no longer changes what's hidden vs shown; only <thinking> does.
 */

import { stripLeakedToolCallMarkup } from "./toolCallFallback";

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
  // Never rendered to the player (a `gm_roll` made behind the GM's screen).
  // The block is still produced and kept in the list rather than omitted,
  // because updateLiveRoundBlocks uses "tool" blocks as the boundary between
  // completed and still-streaming rounds - dropping one would let the next
  // round's text merge into the previous round's blocks. It's filtered at
  // render time instead; see TimelineEntryPill in story.tsx.
  hidden?: boolean;
}

let blockIdCounter = 0;
function nextId(): string {
  blockIdCounter += 1;
  return `tlb-${blockIdCounter}`;
}

const TAG_NAMES = ["thinking", "output"];
// Tag names from leaked tool-call markup (see toolCallFallback.ts). They are
// never rendered, but they have to be recognized while streaming so a
// half-arrived `<||DSML||inv` is held back instead of flashing on screen for
// a chunk before stripLeakedToolCallMarkup can see the whole opener.
const LEAKED_MARKUP_TAG_NAMES = [
  "invoke",
  "parameter",
  "tool_calls",
  "function_calls",
];
const NAMESPACE_PREFIX = /^(?:\|+[^|<>\s]*\|+|[a-z][\w.-]*:)\s*/;

/** Could `tail` (a suffix starting with "<") still grow into a recognized tag? */
function isPossibleTagPrefix(tail: string): boolean {
  const body = tail.slice(1).replace(/^\s*\/\s*/, "").trimStart().toLowerCase();
  if (body.length === 0) return true;
  // A pipe-opened namespace token (`<|DSML|…`, `<||DSML||…`) can only be the
  // start of leaked markup, however little of it has arrived so far.
  if (body.startsWith("|")) return true;
  const name = body.replace(NAMESPACE_PREFIX, "");
  return [...TAG_NAMES, ...LEAKED_MARKUP_TAG_NAMES].some(
    (tag) => tag.startsWith(name) || name.startsWith(tag),
  );
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
  const { safe: rawSafe } = splitPendingTag(raw);
  // Tool-call markup the inference backend failed to strip from `content`
  // is never narration - drop it before anything else looks at the text, so
  // it can't reach the player mid-stream or get saved into the scene.
  const safe = stripLeakedToolCallMarkup(rawSafe);
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
  let mode: "thinking" | "text" = "text"; // untagged runs are visible by default
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
    // Only <thinking> toggles visibility - <output> is a legacy no-op kept
    // around so old saves (and a model that reverts to old habits) still
    // parse cleanly instead of leaking the literal tag text.
    if (tagName === "thinking") mode = isClosing ? "text" : "thinking";
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

/**
 * The mirror of extractVisibleText: the <thinking> segments only, with the
 * player-visible prose dropped. Used to recover the reasoning behind a turn
 * from models that write their thinking inline in `content` rather than in a
 * native reasoning channel - see generation.ts, which hands it to the
 * observer's rewrite so the rewrite knows what the draft was trying to do.
 */
export function extractThinkingText(raw: string): string {
  return parseTaggedContent(raw)
    .filter((b) => b.kind === "thinking")
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
  hiddenFromPlayer?: boolean;
}): TimelineBlock {
  const hidden = isHiddenFromPlayer(result.toolName, result);
  return {
    id: nextId(),
    kind: "tool",
    toolName: result.toolName,
    toolCallId: result.toolCallId,
    success: result.success,
    // A hidden roll carries no detail either - the pill is skipped at render
    // time, but nothing about the dice should sit in client state waiting to
    // be surfaced by some future view that forgets to check `hidden`.
    contextForStory: hidden ? undefined : result.contextForStory,
    hidden: hidden || undefined,
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
  // Native reasoning (see updateLiveReasoningBlock) is tracked separately
  // from the tagged content buffer parsed below - preserve it instead of
  // letting this reparse silently drop it the moment content/tool deltas
  // start arriving for the round.
  const reasoningBlock = prevLive.find((b) => b.isReasoning);
  const prevContentLive = prevLive.filter((b) => !b.isReasoning);
  const liveBlocks: TimelineBlock[] = parseTaggedContent(roundBuffer).map(
    (b, i) => ({ id: prevContentLive[i]?.id ?? nextId(), ...b }),
  );
  if (liveBlocks.length > 0) {
    liveBlocks[liveBlocks.length - 1].streaming = true;
  }
  const merged = reasoningBlock ? [reasoningBlock, ...liveBlocks] : liveBlocks;
  return [...frozen, ...merged];
}

/**
 * Live-streaming helper for native provider reasoning (DeepSeek/OpenRouter
 * `reasoning` delta) for the current round - inserted as the first block
 * of the round so it appears before any <thinking>/narration text.
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
  hiddenFromPlayer?: boolean;
}

/**
 * Tool calls the player must never see rendered in the turn timeline, even
 * as a bare name with no result attached - a "gm_roll" row would announce
 * that the GM rolled for something, which is the one thing that tool exists
 * to avoid. Matched by name as well as by the result's `hiddenFromPlayer`
 * flag, because the timeline falls back to the raw tool-call name whenever
 * the result is missing (an aborted round, a save from a partial turn).
 */
const HIDDEN_FROM_PLAYER_TOOLS = new Set(["gm_roll"]);

function isHiddenFromPlayer(
  toolName: string,
  result: { hiddenFromPlayer?: boolean } | undefined,
): boolean {
  return (
    result?.hiddenFromPlayer === true || HIDDEN_FROM_PLAYER_TOOLS.has(toolName)
  );
}

function normalizeForCompare(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * On the common path, the GM stage's own visible (non-<thinking>) segments
 * ARE the saved narration (ScenePart.content) - the "separate story stage"
 * only runs when the GM stage produced no narratable text at all. There's
 * no persisted flag recording which happened (no need for one - it's cheap
 * to detect): if concatenating every round's visible text reproduces
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
        const toolName = result?.toolName || tc.function.name;
        const hidden = isHiddenFromPlayer(toolName, result);
        blocks.push({
          id: nextId(),
          kind: "tool",
          toolName,
          toolCallId: tc.id,
          success: result?.success,
          contextForStory: hidden ? undefined : result?.contextForStory,
          hidden: hidden || undefined,
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
