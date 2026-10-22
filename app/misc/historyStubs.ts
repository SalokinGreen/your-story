/**
 * How a past turn is replayed to the GM (token-savings plan, slice 2;
 * decisions 90, 99 and 103).
 *
 * Each story part keeps its full `gmConversation` - every tool call, every
 * result, the GM's private <thinking> - because the summary reads it and the
 * debug views show it. But replaying all of that in every later turn costs
 * far more than the prose the player saw (the measured replay was 3.5x the
 * budget when the GM read a note every fourth turn, 11x when it read one every
 * turn). So when a turn becomes history it is rendered once, deterministically,
 * in a smaller form:
 *
 * - a tool result longer than STUB_RESULT_THRESHOLD_TOKENS becomes a one-line
 *   stub that says what it was and how big, and that the GM can read it again;
 * - a long string inside a tool call's arguments (an `edit_note` body) becomes
 *   a size marker, the JSON still valid;
 * - the <thinking> text is dropped; the prose the player saw stays.
 *
 * "Deterministically" is the point: a given part renders to the same bytes
 * every time, so a turn changes form once, at the end of the cached prefix,
 * and never again. Nothing here is applied to the CURRENT turn's rounds.
 */

import type { ScenePart } from "./structs";
import type { ChatMessage } from "./chatMessage";
import { cleanString } from "./textUtils";
import { estimateTokens } from "./tokenCounter";
import { extractVisibleText } from "./turnTimeline";

// Decision 103: a constant, tuned in playtests.
export const STUB_RESULT_THRESHOLD_TOKENS = 150;

/**
 * Tools whose results are what a later turn most needs to stay consistent
 * (what the dice showed, how the oracle answered). They are short in practice;
 * naming them keeps a rare long one (a roll echoing both consequence branches)
 * whole instead of losing the outcome to a stub.
 */
// What an assistant part is replayed as when nothing else of it survives.
export const EMPTY_TURN_PLACEHOLDER = "(no narration was saved for this turn)";

const KEEP_WHOLE_TOOLS = new Set([
  "increment_scene",
  "formula_roll",
  "opposed_formula",
  "gm_roll",
  "npc_roll",
  "calculate",
  "fate_question",
  "roll_table",
  "roll_portent",
  "ask_for_roll",
  "ask_question",
]);

function formatTokens(n: number): string {
  return n.toLocaleString("en-US");
}

function titlesOf(args: Record<string, unknown> | undefined): string[] {
  if (!args) return [];
  const out: string[] = [];
  const titles = args.titles;
  if (Array.isArray(titles)) {
    for (const t of titles) if (typeof t === "string") out.push(t);
  }
  for (const key of ["title", "note", "name"]) {
    const v = args[key];
    if (typeof v === "string" && v.trim()) out.push(v);
  }
  return out;
}

/** A past turn's tool result as it is replayed: itself if short, else a one-line stub. */
export function stubToolResult(
  toolName: string,
  args: Record<string, unknown> | undefined,
  content: string,
): string {
  if (KEEP_WHOLE_TOOLS.has(toolName)) return content;
  const tokens = estimateTokens(content);
  if (tokens <= STUB_RESULT_THRESHOLD_TOKENS) return content;

  // An error keeps its first line, so the GM still knows the call failed and why.
  const errorLine = content.startsWith("**ERROR**")
    ? `${content.split("\n")[0].slice(0, 240)} `
    : "";

  if (toolName === "read_notes") {
    const titles = titlesOf(args);
    if (titles.length > 0) {
      const label = titles.map((t) => `"${t}"`).join(", ");
      return `${errorLine}[read_notes ${label}: ${formatTokens(tokens)} tokens, cleared from history. Read it again if you need it.]`;
    }
  }
  return `${errorLine}[${toolName}: ${formatTokens(tokens)}-token result cleared from history.]`;
}

function stubLongStrings(value: unknown): { value: unknown; changed: boolean } {
  if (typeof value === "string") {
    const tokens = estimateTokens(value);
    if (tokens > STUB_RESULT_THRESHOLD_TOKENS) {
      return { value: `[${formatTokens(tokens)} tokens, saved]`, changed: true };
    }
    return { value, changed: false };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((v) => {
      const r = stubLongStrings(v);
      if (r.changed) changed = true;
      return r.value;
    });
    return { value: changed ? next : value, changed };
  }
  if (value && typeof value === "object") {
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const r = stubLongStrings(v);
      if (r.changed) changed = true;
      next[k] = r.value;
    }
    return { value: changed ? next : value, changed };
  }
  return { value, changed: false };
}

/**
 * A past tool call's arguments with long string values replaced, still valid
 * JSON. Arguments that are short, or that do not parse (a truncated call),
 * come back untouched.
 */
export function stubToolCallArguments(argumentsJson: string): string {
  if (!argumentsJson || estimateTokens(argumentsJson) <= STUB_RESULT_THRESHOLD_TOKENS) {
    return argumentsJson;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(argumentsJson);
  } catch {
    return argumentsJson;
  }
  const { value, changed } = stubLongStrings(parsed);
  return changed ? JSON.stringify(value) : argumentsJson;
}

/** A past assistant message's content without its <thinking> (decision 99). */
export function stripThinkingForHistory(content: string): string {
  if (!content) return "";
  return extractVisibleText(content);
}

function parseArgs(json: string | undefined): Record<string, unknown> | undefined {
  if (!json) return undefined;
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

export interface RenderHistoryOptions {
  /**
   * True for the last assistant part in the replayed history: it keeps its
   * `reasoning` and `reasoning_details` (the round immediately being
   * continued). Older rounds drop `reasoning_details` - a stale
   * `reasoning.encrypted` replayed later causes a 400 on OpenRouter's Gemini
   * (OpenRouterTeam/ai-sdk-provider#491) - and keep only the plain
   * `reasoning` of a round that made tool calls, which DeepSeek's thinking
   * mode requires (api-docs.deepseek.com/guides/thinking_mode).
   */
  isMostRecentRound?: boolean;
}

function stubToolCalls<T extends { function?: { arguments?: unknown } }>(
  toolCalls: T[],
): T[] {
  return toolCalls.map((tc) => {
    const args = tc?.function?.arguments;
    if (typeof args !== "string") return tc;
    const stubbed = stubToolCallArguments(args);
    return stubbed === args
      ? tc
      : { ...tc, function: { ...tc.function, arguments: stubbed } };
  });
}

/**
 * The messages one past story part replays as: stubbed, thinking dropped.
 * Deterministic - the same part and index always give the same messages.
 * `index` is the part's position in `scene.parts`; it only names the
 * synthetic tool-call ids of legacy saves, so it must not depend on where the
 * history window happens to start.
 */
export function renderHistoryPart(
  part: ScenePart,
  index: number,
  options: RenderHistoryOptions = {},
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const isMostRecentRound = !!options.isMostRecentRound;

  if (part.user) {
    // Comment-only user parts have empty content; never include them in AI context.
    const text = part.raw || part.content;
    if (!cleanString(text).trim()) return [];
    messages.push({
      role: "user",
      content: cleanString(`> ${part.content.replace(/^>\s*/, "")}`),
    });
    return messages;
  }

  const hasGmConversation = !!(part.gmConversation && part.gmConversation.length > 0);

  if (hasGmConversation) {
    // The actual saved conversation: exact tool_calls and tool responses.
    const callsById = new Map<
      string,
      { name: string; args: Record<string, unknown> | undefined }
    >();
    for (const msg of part.gmConversation!) {
      if (msg.role === "assistant") {
        const hasToolCalls = !!(msg.tool_calls && msg.tool_calls.length > 0);
        const content = cleanString(stripThinkingForHistory(msg.content || ""));
        if (!hasToolCalls && !content) continue; // pure thinking: nothing left to replay
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content,
          ...(isMostRecentRound
            ? {
                reasoning: msg.reasoning,
                reasoning_details: msg.reasoning_details,
              }
            : hasToolCalls
              ? { reasoning: msg.reasoning }
              : {}),
        };
        if (hasToolCalls) {
          for (const tc of msg.tool_calls!) {
            if (tc?.id) {
              callsById.set(tc.id, {
                name: tc.function?.name ?? "",
                args: parseArgs(tc.function?.arguments),
              });
            }
          }
          // Stubbed for every past turn, the most recent included: a turn
          // changes form once, when it becomes history, never again.
          assistantMsg.tool_calls = stubToolCalls(msg.tool_calls!);
        }
        messages.push(assistantMsg);
      } else if (msg.role === "tool") {
        const call = msg.tool_call_id ? callsById.get(msg.tool_call_id) : undefined;
        messages.push({
          role: "tool",
          content: call
            ? stubToolResult(call.name, call.args, msg.content)
            : msg.content,
          tool_call_id: msg.tool_call_id,
        });
      }
    }
  } else if (part.gmThinking && part.gmThinking.length > 0) {
    // LEGACY FALLBACK: synthesize the conversation from gmThinking +
    // gmToolCalls, for stories saved before gmConversation existed.
    const gmToolResults = (part.gmToolCalls || []) as Array<{
      toolName: string;
      toolCallId: string;
      success: boolean;
      contextForStory: string;
    }>;
    const resultText = (r: (typeof gmToolResults)[number]) =>
      stubToolResult(
        r.toolName,
        undefined,
        r.contextForStory ||
          `[Tool: ${r.toolName}] ${r.success ? "Success" : "Failed"}`,
      );

    if (gmToolResults.length > 0) {
      const thinkingEntries = part.gmThinking;
      for (let roundIdx = 0; roundIdx < thinkingEntries.length; roundIdx++) {
        const toolResult = gmToolResults[roundIdx];
        if (toolResult) {
          const syntheticToolCall = {
            id:
              toolResult.toolCallId ||
              `call_${index}_${roundIdx}_${toolResult.toolName}`,
            type: "function",
            function: { name: toolResult.toolName, arguments: "{}" },
          };
          // The thinking is dropped (decision 99); the call and its result stay.
          messages.push({
            role: "assistant",
            content: "",
            tool_calls: [syntheticToolCall],
          });
          messages.push({
            role: "tool",
            content: resultText(toolResult),
            tool_call_id: syntheticToolCall.id,
          });
        }
      }
      for (
        let toolIdx = thinkingEntries.length;
        toolIdx < gmToolResults.length;
        toolIdx++
      ) {
        const toolResult = gmToolResults[toolIdx];
        const syntheticToolCall = {
          id:
            toolResult.toolCallId ||
            `call_${index}_${toolIdx}_${toolResult.toolName}`,
          type: "function",
          function: { name: toolResult.toolName, arguments: "{}" },
        };
        messages.push({
          role: "assistant",
          content: `Executing ${toolResult.toolName}`,
          tool_calls: [syntheticToolCall],
        });
        messages.push({
          role: "tool",
          content: resultText(toolResult),
          tool_call_id: syntheticToolCall.id,
        });
      }
    }
    // Thinking with no tool calls is pure reasoning: dropped.
  }
  // A part with only gmStoryContext (the GM's context string, wrapped in
  // <thinking> before) is reasoning too: dropped (decision 99).

  // The story output after the GM's work. Skipped when gmConversation was used
  // (the story is already in it) and, for a GM-direct output, written bare.
  const isGMDirectOutput = part.gmThinking?.length && !part.gmToolCalls?.length;
  if (part.content && part.content.trim() && !hasGmConversation) {
    messages.push({
      role: "assistant",
      content: isGMDirectOutput
        ? cleanString(part.content)
        : cleanString(`[STORY OUTPUT]\n${part.content}`),
    });
  } else if (part.content && part.content.trim() && hasGmConversation) {
    // A turn where the GM only called tools and the narration call wrote the
    // prose: the prose is in part.content, not in the conversation. Unless the
    // conversation already ends on visible prose, replay it.
    const last = messages[messages.length - 1];
    const endsOnProse =
      !!last &&
      last.role === "assistant" &&
      !(last.tool_calls && last.tool_calls.length > 0) &&
      !!last.content.trim();
    if (!endsOnProse) {
      messages.push({ role: "assistant", content: cleanString(part.content) });
    }
  }

  // An assistant part that renders to nothing (a thinking-only turn, status
  // report 6.19) would leave two user messages in a row.
  if (messages.length === 0) {
    messages.push({ role: "assistant", content: EMPTY_TURN_PLACEHOLDER });
  }

  return messages;
}

/** Tokens of renderHistoryPart(part), for budgeting (stubs, not raw results). */
export function estimateRenderedPartTokens(
  part: ScenePart,
  index: number,
  options: RenderHistoryOptions = {},
): number {
  const messages = renderHistoryPart(part, index, options);
  if (messages.length === 0) return 0;
  let tokens = 0;
  for (const m of messages) {
    tokens += 4; // per-message framing
    tokens += estimateTokens(m.content || "");
    if (m.tool_calls?.length) tokens += estimateTokens(JSON.stringify(m.tool_calls));
    // Reasoning is deliberately not counted: whether it is replayed at all is
    // per provider (providerCall.ts never replays plain `reasoning` to Claude,
    // and slice 6 narrows the rest), so counting it would overstate the history
    // for the default models. Decision 94 counts what is sent.
  }
  return tokens;
}
