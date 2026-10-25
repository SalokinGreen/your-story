/**
 * Drafts a judge fixture from material the author already has (plan slice 4,
 * `scripts/export-eval-turn.mjs`). Two inputs:
 *
 * - **a story's JSON export** (`StoryData`): the turn is one assistant part and
 *   the user part before it. A part keeps the typed tool results of its turn
 *   (`gmToolCalls`), so rulings and clock reports survive; an older part that
 *   kept only the conversation gets text-only results.
 * - **a "Copy GM context" export** (the message list): the last assistant
 *   message is the narration, the last user message before it the player's
 *   line, and the tool messages the results, as text.
 *
 * A Debug Logs export has no turn structure to read, so it is not an input:
 * label from the story export and read the Debug Logs beside it.
 *
 * What a draft cannot know, it says: a story export holds the state *after* the
 * turn, so `storyBefore` is a copy of it and the author edits it when the turn
 * changed something a check reads (a secret revealed, an NPC who died). The
 * draft is `published: false` with `labels: []`; the author checks every label
 * and decides what is published (decision 233).
 */
import { buildObserverCharacterContext } from "../observer";
import { extractVisibleText } from "../turnTimeline";
import type { StoryData } from "../structs";
import type { JudgeFixture } from "./evalFormat";
import type { JudgeStoryView, JudgeToolResult } from "./types";

interface MessageLike {
  role?: unknown;
  content?: unknown;
  tool_calls?: unknown;
  tool_call_id?: unknown;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function textOf(content: unknown): string {
  return typeof content === "string" ? content : "";
}

/** The visible words of a raw GM message: its reasoning tags removed. */
function visible(content: unknown): string {
  return extractVisibleText(textOf(content));
}

function successOf(text: string): boolean {
  const t = text.trimStart();
  return !t.startsWith("[ERROR") && !t.startsWith("[State Failed");
}

/** Pairs assistant tool calls with the tool messages that answer them. */
function resultsFromMessages(messages: readonly MessageLike[]): JudgeToolResult[] {
  const names = new Map<string, string>();
  for (const m of messages) {
    if (m.role !== "assistant" || !Array.isArray(m.tool_calls)) continue;
    for (const call of m.tool_calls) {
      if (!isRecord(call) || typeof call.id !== "string" || !isRecord(call.function)) continue;
      if (typeof call.function.name === "string") names.set(call.id, call.function.name);
    }
  }
  const results: JudgeToolResult[] = [];
  for (const m of messages) {
    if (m.role !== "tool" || typeof m.tool_call_id !== "string") continue;
    const text = textOf(m.content);
    results.push({
      toolName: names.get(m.tool_call_id) ?? "unknown",
      toolCallId: m.tool_call_id,
      success: successOf(text),
      contextForStory: text,
    });
  }
  return results;
}

function viewOf(story: Partial<StoryData>): JudgeStoryView {
  return {
    npcs: story.npcs ?? [],
    meters: story.meters ?? [],
    campaign: story.campaign,
    systemState: story.systemState,
    // Only the sheet(s) are read by the facts; the rest of the lore stays out of a draft.
    lore: (story.lore ?? []).filter((n) => n.type === "character_sheet"),
  };
}

export interface ExportOptions {
  id: string;
  /** The assistant part to export; the last one by default. */
  partIndex?: number;
  note?: string;
}

export type ExportResult = { ok: true; fixture: JudgeFixture } | { ok: false; error: string };

function baseFixture(id: string, note: string | undefined): Pick<JudgeFixture, "v" | "kind" | "id" | "published" | "labels"> & {
  note?: string;
} {
  return { v: 1, kind: "judge", id, published: false, ...(note ? { note } : {}), labels: [] };
}

function fromStory(story: Partial<StoryData>, options: ExportOptions): ExportResult {
  const parts = story.scene?.parts ?? [];
  let index = options.partIndex;
  if (index === undefined) {
    for (let i = parts.length - 1; i >= 0; i--) {
      if (!parts[i].user && parts[i].content?.trim()) {
        index = i;
        break;
      }
    }
  }
  if (index === undefined || !parts[index]) return { ok: false, error: "the story has no assistant part to export" };
  const part = parts[index];
  if (part.user) return { ok: false, error: `part ${index} is the player's line, not a GM turn` };

  let playerLine = "";
  for (let i = index - 1; i >= 0; i--) {
    if (parts[i].user) {
      playerLine = parts[i].content ?? "";
      break;
    }
  }

  const typed = (part.gmToolCalls ?? []).filter(
    (r): r is Record<string, unknown> =>
      isRecord(r) && typeof r.toolName === "string" && typeof r.toolCallId === "string",
  );
  const toolResults: JudgeToolResult[] =
    typed.length > 0
      ? typed.map((r) => ({
          toolName: r.toolName as string,
          toolCallId: r.toolCallId as string,
          success: r.success !== false,
          result: r.result,
          contextForStory: typeof r.contextForStory === "string" ? r.contextForStory : undefined,
          ...(Array.isArray(r.clockReports) ? { clockReports: r.clockReports } : {}),
        }))
      : resultsFromMessages(part.gmConversation ?? []);

  const view = viewOf(story);
  const fixture: JudgeFixture = {
    ...baseFixture(options.id, options.note),
    storyBefore: structuredClone(view),
    storyAfter: view,
    toolResults,
    playerLine,
    narration: part.content,
    characterContext: buildObserverCharacterContext(story as StoryData),
    ...(part.reasoning ? { narrationThoughts: part.reasoning } : {}),
  };
  return { ok: true, fixture };
}

function fromMessages(messages: readonly MessageLike[], options: ExportOptions): ExportResult {
  let assistantAt = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant" && visible(messages[i].content)) {
      assistantAt = i;
      break;
    }
  }
  if (assistantAt < 0) return { ok: false, error: "no assistant message with words in it" };
  let playerLine = "";
  for (let i = assistantAt - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      playerLine = textOf(messages[i].content);
      break;
    }
  }
  const view: JudgeStoryView = { npcs: [], meters: [] };
  return {
    ok: true,
    fixture: {
      ...baseFixture(options.id, options.note),
      storyBefore: view,
      storyAfter: structuredClone(view),
      toolResults: resultsFromMessages(messages.slice(0, assistantAt + 1)),
      playerLine,
      narration: visible(messages[assistantAt].content),
    },
  };
}

/** Drafts a fixture from a story export or a GM context message list. Never throws. */
export function exportJudgeFixture(raw: unknown, options: ExportOptions): ExportResult {
  if (Array.isArray(raw)) return fromMessages(raw as MessageLike[], options);
  if (isRecord(raw) && isRecord(raw.scene) && Array.isArray(raw.scene.parts)) {
    return fromStory(raw as Partial<StoryData>, options);
  }
  return {
    ok: false,
    error:
      "not a story export (an object with scene.parts) or a GM context export (a list of messages); a Debug Logs export has no turn to read",
  };
}
