/**
 * Compaction: the GM's history is every scene part after
 * storyData.scene.summarizedThroughIndex (a fixed start - see getHistoryParts
 * in ai_staged.ts), so between summaries it only grows at its end and the
 * provider's prompt cache keeps hitting. When that history, measured as it is
 * actually sent (stubs and all, historyStubs.ts), passes the history budget,
 * the oldest parts are folded into storyData.scene.summary - extending the
 * prior summary, not restarting it - until what is left is about half the
 * budget (decisions 94 and 101). A summary therefore runs every few dozen
 * turns, not every turn.
 *
 * The summariser is given the folded parts' tool calls and results as well as
 * their prose (decision 95), writes fixed sections, and obeys the adventure's
 * `summary_instructions` note and a "Compact now" focus, when there is one.
 */

import { StoryData, ScenePart } from "./structs";
import { cleanString } from "./ai_staged";
import { ChatMessage } from "./chatMessage";
import { callSideModel, ProviderKeys } from "./sideModelCall";
import {
  estimateRenderedPartTokens,
  stripThinkingForHistory,
} from "./historyStubs";

// A summary folds history back to this share of the history budget (decision
// 101), so the next one is a few dozen turns away and the prefix stays cached
// in between.
export const FOLD_TARGET_RATIO = 0.5;

// The summary's own size target (decision 103: a constant, tuned in
// playtests). It is asked for in the prompt and bounds the call's output.
export const SUMMARY_TARGET_TOKENS = 2000;

// The summary's fixed headings, in order (decision 95). The whole summary is
// rewritten each time, so every section is always present.
export const SUMMARY_SECTIONS = [
  "Where things stand now",
  "What the player is pursuing",
  "Open threads, clocks and pressures",
  "People",
  "Places and things",
  "Promises, debts and secrets revealed",
  "What the GM has established from notes and rolls",
] as const;

// If a recorded scene boundary (Scene.lastSceneBoundaryIndex, set on
// increment_scene - see §3.2 in
// docs/research-paper-ttrpg-theory-gap-analysis.md) falls within this many
// parts AFTER the token-budget cutoff, extend the cutoff out to it instead
// of cutting mid-scene. Only ever extends FORWARD (summarizes a few extra
// parts) - never pulled backward, which would leave a content-loss gap
// between the summary and the live tail.
const SCENE_BOUNDARY_SNAP_WINDOW = 6;

export interface CompactionPlan {
  cutoffIndex: number; // parts[0, cutoffIndex) are the ones to fold into the summary
  textToSummarize: string;
  priorSummary: string | undefined;
}

// A named, tracked entity the summary could drop or contradict. Built from
// structured StoryData (never from the LLM's own output), so this list is
// canonical by construction.
interface TrackedEntity {
  name: string;
  kind: "npc" | "lore";
  deceasedOrGone: boolean; // NPC status dead/departed - contradiction risk
}

function buildTrackedEntities(storyData: StoryData): TrackedEntity[] {
  const entities: TrackedEntity[] = [];
  for (const npc of storyData.npcs || []) {
    if (!npc.name) continue;
    entities.push({
      name: npc.name,
      kind: "npc",
      deceasedOrGone: npc.status === "dead" || npc.status === "departed",
    });
  }
  for (const lore of storyData.lore || []) {
    if (!lore.title) continue;
    entities.push({ name: lore.title, kind: "lore", deceasedOrGone: false });
  }
  return entities;
}

// Exported for reuse by consistencyCheck.ts, which needs the identical
// name-matching/active-presence-phrase pattern for narration (not just
// compaction summaries) - keeping one definition rather than a second,
// possibly-drifting copy.
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function countNameMentions(text: string, name: string): number {
  if (!name.trim()) return 0;
  const pattern = new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi");
  return (text.match(pattern) || []).length;
}

// Small, deliberately narrow set of present-tense/active phrases. These are
// picked to imply the named entity is *currently, actively participating*
// (arriving, speaking, acting on the player right now) - the kind of phrase
// a summary would only use if it were narrating them as alive/present, not
// recapping past history. Kept short and specific to minimize false
// positives on ordinary retrospective mentions ("...Marcus, now dead...").
export const ACTIVE_PRESENCE_PHRASES = [
  "arrives",
  "joins you",
  "joins the party",
  "greets you",
  "hands you",
  "gives you",
  "attacks you",
  "confronts you",
  "leads you",
  "guides you",
  "warns you",
];

// How far past a name mention to look for an active-presence phrase before
// treating it as unrelated. Generous enough to cover "Marcus arrives" and
// "Marcus, grinning, arrives" without spanning into unrelated sentences.
export const CONTRADICTION_WINDOW_CHARS = 60;

// At least this many mentions in the *source* material is required before a
// dropped-entity warning fires - a single incidental mention disappearing
// from a condensed summary isn't meaningful signal, but an entity that came
// up repeatedly and then vanishes entirely usually is.
const MIN_SOURCE_MENTIONS_FOR_DROP_CHECK = 2;

export type CompactionWarningType = "dropped_entity" | "status_contradiction";

export interface CompactionWarning {
  type: CompactionWarningType;
  entity: string;
  detail: string;
}

/**
 * Deterministic cross-check of a freshly-generated compaction summary
 * against canonical StoryData - the check the audit (H3) found was
 * completely absent. This intentionally does NOT attempt general-purpose
 * consistency grading of arbitrary prose (that's unreliable and prone to
 * false positives - see Phase 2 of ai-gm-integration-plan.md for that
 * broader, separate effort). It only checks two narrow, high-precision
 * signals built from exact name matching against known entities:
 *
 * 1. An entity (NPC/item/lore) mentioned repeatedly in the material being
 *    folded into the summary vanishes entirely from the summary text -
 *    likely an omission that will quietly erase a plot thread.
 * 2. An NPC whose tracked status is dead/departed is described with an
 *    active-presence phrase (arrives, hands you, attacks you, ...) in the
 *    new summary - likely a hallucinated detail contradicting known state.
 *
 * Both are advisory: callers decide whether to retry or just record them
 * (see `ensureStoryCompacted`), matching this codebase's existing
 * "non-fatal, record and move on" posture for compaction (see module intro).
 */
export function validateCompactionSummary(
  plan: CompactionPlan,
  summary: string,
  storyData: StoryData
): CompactionWarning[] {
  const warnings: CompactionWarning[] = [];
  const entities = buildTrackedEntities(storyData);

  for (const entity of entities) {
    const mentionsInSource = countNameMentions(plan.textToSummarize, entity.name);
    const mentionsInSummary = countNameMentions(summary, entity.name);

    if (
      mentionsInSource >= MIN_SOURCE_MENTIONS_FOR_DROP_CHECK &&
      mentionsInSummary === 0
    ) {
      warnings.push({
        type: "dropped_entity",
        entity: entity.name,
        detail: `"${entity.name}" (${entity.kind}) appeared ${mentionsInSource}x in the material being summarized but is not mentioned at all in the summary.`,
      });
    }

    if (entity.kind === "npc" && entity.deceasedOrGone && mentionsInSummary > 0) {
      const lowerSummary = summary.toLowerCase();
      const namePattern = new RegExp(`\\b${escapeRegExp(entity.name)}\\b`, "gi");
      let match: RegExpExecArray | null;
      while ((match = namePattern.exec(summary)) !== null) {
        const windowStart = match.index;
        const windowEnd = Math.min(
          summary.length,
          match.index + entity.name.length + CONTRADICTION_WINDOW_CHARS
        );
        const window = lowerSummary.slice(windowStart, windowEnd);
        const hitPhrase = ACTIVE_PRESENCE_PHRASES.find((phrase) =>
          window.includes(phrase)
        );
        if (hitPhrase) {
          warnings.push({
            type: "status_contradiction",
            entity: entity.name,
            detail: `"${entity.name}" is tracked as dead/departed, but the summary describes them with an active-presence phrase ("${hitPhrase}").`,
          });
          break; // one warning per entity is enough signal
        }
      }
    }
  }

  return warnings;
}

function compactToolArgs(argumentsJson: string | undefined): string {
  if (!argumentsJson) return "{}";
  try {
    return JSON.stringify(JSON.parse(argumentsJson));
  } catch {
    return argumentsJson;
  }
}

/**
 * One part as the summariser reads it (decision 95): the prose the player saw,
 * preceded by what the GM did to produce it - every tool call with its
 * arguments and its full result (the notes it read, the dice it rolled, the
 * state it changed). The GM's private <thinking> is left out: it is cost, not
 * memory.
 */
export function partToCompactionText(part: ScenePart): string {
  const text = stripThinkingForHistory(part.raw || part.content || "");
  if (part.user) return `> ${text}`;

  const lines: string[] = [];
  if (part.gmConversation && part.gmConversation.length > 0) {
    const nameById = new Map<string, string>();
    for (const msg of part.gmConversation) {
      if (msg.role === "assistant") {
        for (const tc of msg.tool_calls || []) {
          const name: string = tc?.function?.name ?? "?";
          if (tc?.id) nameById.set(tc.id, name);
          lines.push(`[GM called ${name} ${compactToolArgs(tc?.function?.arguments)}]`);
        }
      } else if (msg.role === "tool") {
        const name = (msg.tool_call_id && nameById.get(msg.tool_call_id)) || "tool";
        lines.push(`[${name} result: ${msg.content}]`);
      }
    }
  }
  lines.push(text);
  return lines.join("\n");
}

/**
 * Rendered tokens of every part after the summary: what the GM is sent as
 * history (stubs, no <thinking>), counted the same way getHistoryParts counts.
 */
export function measureHistoryTokens(storyData: StoryData): number {
  const parts = storyData.scene.parts || [];
  const start = Math.max(0, storyData.scene.summarizedThroughIndex || 0);
  let total = 0;
  for (let i = start; i < parts.length; i++) {
    total += estimateRenderedPartTokens(parts[i], i);
  }
  return total;
}

/**
 * Pure decision logic. Null while the history, as sent, fits `historyBudget`.
 * Past it, the cutoff is the earliest index that leaves the remaining parts at
 * or under historyBudget * FOLD_TARGET_RATIO, moved FORWARD (never back) to
 * keep a user action with its reply and to land on a recorded scene boundary
 * within SCENE_BOUNDARY_SNAP_WINDOW. The last part always stays live.
 */
export function planCompaction(
  storyData: StoryData,
  historyBudget: number
): CompactionPlan | null {
  const parts = storyData.scene.parts;
  if (!parts || parts.length === 0) return null;

  const alreadyCovered = Math.max(0, storyData.scene.summarizedThroughIndex || 0);
  if (measureHistoryTokens(storyData) <= historyBudget) return null;

  const target = historyBudget * FOLD_TARGET_RATIO;
  let kept = 0;
  let rawCutoffIndex = parts.length;
  for (let i = parts.length - 1; i >= alreadyCovered; i--) {
    kept += estimateRenderedPartTokens(parts[i], i);
    if (kept > target) break;
    rawCutoffIndex = i;
  }
  // The latest part always stays live, even if it alone is over the target.
  let cutoffIndex = Math.min(rawCutoffIndex, parts.length - 1);

  // Keep a reply with the action that prompted it.
  if (
    cutoffIndex > alreadyCovered &&
    cutoffIndex < parts.length - 1 &&
    !parts[cutoffIndex].user &&
    parts[cutoffIndex - 1]?.user
  ) {
    cutoffIndex += 1;
  }

  // Prefer cutting exactly at a scene boundary over an arbitrary mid-scene
  // token cutoff, when one is close by - see SCENE_BOUNDARY_SNAP_WINDOW.
  const boundary = storyData.scene.lastSceneBoundaryIndex;
  if (
    boundary !== undefined &&
    boundary > alreadyCovered &&
    boundary >= cutoffIndex &&
    boundary - cutoffIndex <= SCENE_BOUNDARY_SNAP_WINDOW &&
    boundary < parts.length
  ) {
    cutoffIndex = boundary;
  }

  if (cutoffIndex <= alreadyCovered) {
    return null; // nothing to fold that is not already in the summary
  }

  const textToSummarize = parts
    .slice(alreadyCovered, cutoffIndex)
    .map(partToCompactionText)
    .join("\n\n");

  return {
    cutoffIndex,
    textToSummarize,
    priorSummary: storyData.scene.summary,
  };
}

/**
 * Every enabled `summary_instructions` note, joined: the author's standing
 * instructions for every summary of this adventure (decision 95). Read only
 * here - never by the GM or the narrator.
 */
export function getSummaryInstructions(storyData: StoryData): string | undefined {
  const notes = (storyData.lore || []).filter(
    (l) => l.enabled !== false && l.type === "summary_instructions" && l.content?.trim(),
  );
  if (notes.length === 0) return undefined;
  return notes.map((l) => cleanString(l.content).trim()).join("\n\n");
}

/**
 * Apply a freshly-generated summary back onto storyData (mutates in place,
 * matching the rest of this codebase's storyData-mutation convention).
 *
 * `warnings` are whatever `validateCompactionSummary` still found after
 * `ensureStoryCompacted`'s retry (or all of them, if the caller skipped
 * retrying) - persisted onto the scene so a hallucinated/dropped detail that
 * slipped through is at least visible (in the AI Config/debug UI, or to a
 * future consistency checker) rather than silently unrecoverable. An empty
 * array clears any warnings left over from a prior compaction pass.
 */
export function applyCompaction(
  storyData: StoryData,
  plan: CompactionPlan,
  newSummary: string,
  warnings: CompactionWarning[] = []
): void {
  storyData.scene.summary = cleanString(newSummary);
  storyData.scene.summarizedThroughIndex = plan.cutoffIndex;
  storyData.scene.summaryWarnings = warnings.length
    ? warnings.map((w) => w.detail)
    : undefined;
}

export interface CompactionOptions {
  /** "Compact now": what this summary should keep above all else. */
  focus?: string;
}

function buildCompactionPrompt(
  plan: CompactionPlan,
  extras: { instructions?: string; focus?: string } = {}
): {
  system: string;
  user: string;
} {
  const headings = SUMMARY_SECTIONS.map((h, i) => `${i + 1}. ${h}`).join("\n");
  let system = `You maintain a running summary of an interactive story's earlier events, so later turns don't lose context once the full text ages out of the AI's context window.

Write a dense, factual reference for another AI (not entertainment), as these sections, each under its own heading, in this order:
${headings}
(People: each NPC's state, attitude to the player characters and whereabouts. Promises, debts and secrets revealed: who knows what.)

The input includes the game master's tool calls and results - what it read from notes, rolled, and changed. Keep what it established or learned that later turns will depend on; skip what was only looked up. Skip prose flourishes. Rewrite the WHOLE summary every time, with every section present (write "nothing yet" for an empty one). Aim for about ${SUMMARY_TARGET_TOKENS} tokens in total.

${
  plan.priorSummary
    ? "You are given the EXISTING summary plus NEW events that happened after it. Produce one updated summary that merges them - do not just append, actually integrate and re-condense so the whole thing stays compact."
    : "You are given the story's earliest events. Produce the summary from scratch."
}`;

  if (extras.instructions) {
    system += `\n\nTHE ADVENTURE'S STANDING INSTRUCTIONS FOR EVERY SUMMARY (follow these):\n${extras.instructions}`;
  }
  if (extras.focus?.trim()) {
    system += `\n\nFOCUS FOR THIS SUMMARY - keep everything about this in detail, even at the cost of other material:\n${extras.focus.trim()}`;
  }

  const user = plan.priorSummary
    ? `EXISTING SUMMARY:\n${plan.priorSummary}\n\nNEW EVENTS TO FOLD IN:\n${plan.textToSummarize}\n\nWrite the updated combined summary.`
    : `EVENTS TO SUMMARIZE:\n${plan.textToSummarize}\n\nWrite the summary.`;

  return { system, user };
}

export interface CompactionApiOptions extends ProviderKeys {
  model: string;
  /**
   * The effort the summarising call runs at (decision 53): resolveSideCallModel
   * supplies it. Optional so a hand-built options bag still type-checks;
   * callSideModel sends "none" for a call without one.
   */
  reasoningEffort?: string;
  token: string | null;
  abortSignal?: AbortSignal;
}

export interface CompactionResult {
  ran: boolean;
  summary?: string;
  warnings?: CompactionWarning[];
}

async function callSummarizeApi(
  messages: ChatMessage[],
  apiOptions: CompactionApiOptions
): Promise<string | null> {
  const result = await callSideModel({
    stage: "compaction",
    label: "History summarization",
    model: apiOptions.model,
    messages,
    keys: apiOptions,
    maxTokens: Math.ceil(SUMMARY_TARGET_TOKENS * 1.3),
    temperature: 0.2,
    reasoningEffort: apiOptions.reasoningEffort,
    abortSignal: apiOptions.abortSignal,
  });
  if (!result.ok) return null;

  const summary = (result.data.content || "").trim();
  return summary || null;
}

function buildRevisionUserMessage(
  plan: CompactionPlan,
  firstAttempt: string,
  warnings: CompactionWarning[]
): string {
  const issues = warnings.map((w) => `- ${w.detail}`).join("\n");
  const base = plan.priorSummary
    ? `EXISTING SUMMARY:\n${plan.priorSummary}\n\nNEW EVENTS TO FOLD IN:\n${plan.textToSummarize}`
    : `EVENTS TO SUMMARIZE:\n${plan.textToSummarize}`;
  return `${base}\n\nYOUR PREVIOUS SUMMARY:\n${firstAttempt}\n\nThat summary has problems checked against the game's actual tracked state:\n${issues}\n\nWrite a corrected summary that fixes these issues while still covering the material above.`;
}

/**
 * Run the summarize/validate/revise/apply pipeline for an already-built
 * CompactionPlan. Shared by `ensureStoryCompacted` (per-turn, budget-driven
 * plan) and `storyCompaction.ts`'s manual/user-triggered full compaction
 * (count-driven plan via `planManualCompaction`) - the two differ only in
 * how the plan's cutoff is decided, not in how a plan gets turned into a
 * validated summary.
 *
 * The summary is validated against canonical StoryData
 * (`validateCompactionSummary`, H3 fix) before being accepted: if it dropped
 * a heavily-referenced entity or contradicted a tracked NPC's status, one
 * revision attempt is made with the specific issues fed back to the model
 * (the same correctable-feedback pattern `toolValidation.ts` uses for
 * malformed tool args). If problems remain after that, the summary is still
 * used - this stays non-fatal, matching the rest of this module's posture -
 * but the remaining warnings are persisted onto `scene.summaryWarnings`
 * instead of disappearing, so the drift is at least visible somewhere.
 */
export async function runCompactionPlan(
  storyData: StoryData,
  plan: CompactionPlan,
  apiOptions: CompactionApiOptions,
  options: CompactionOptions = {}
): Promise<CompactionResult> {
  const { system, user } = buildCompactionPrompt(plan, {
    instructions: getSummaryInstructions(storyData),
    focus: options.focus,
  });
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const firstSummary = await callSummarizeApi(messages, apiOptions);
  if (!firstSummary) {
    // Non-fatal: compaction failing just means we retry next turn: the
    // sliding window still drops old parts either way, so this can't make
    // context management worse than before, only sometimes not-better yet.
    return { ran: false };
  }

  let finalSummary = firstSummary;
  let warnings = validateCompactionSummary(plan, firstSummary, storyData);

  if (warnings.length > 0) {
    const revisionMessages: ChatMessage[] = [
      { role: "system", content: system },
      { role: "user", content: buildRevisionUserMessage(plan, firstSummary, warnings) },
    ];
    const revisedSummary = await callSummarizeApi(revisionMessages, apiOptions);
    if (revisedSummary) {
      const revisedWarnings = validateCompactionSummary(plan, revisedSummary, storyData);
      // Only take the revision if it actually improved things - a revision
      // that introduces just as many (or different) problems isn't worth
      // preferring over the original for no reason.
      if (revisedWarnings.length < warnings.length) {
        finalSummary = revisedSummary;
        warnings = revisedWarnings;
      }
    }
  }

  applyCompaction(storyData, plan, finalSummary, warnings);
  return { ran: true, summary: finalSummary, warnings };
}

/**
 * Check whether compaction is needed for the given history budget and, if
 * so, run one summarization call and fold it into storyData in place.
 * Safe to call every turn - it's a no-op unless enough new history has
 * aged out of the budget since the last summary.
 */
export async function ensureStoryCompacted(
  storyData: StoryData,
  historyBudget: number,
  apiOptions: CompactionApiOptions
): Promise<CompactionResult> {
  const plan = planCompaction(storyData, historyBudget);
  if (!plan) return { ran: false };
  return runCompactionPlan(storyData, plan, apiOptions);
}

/**
 * Build a CompactionPlan for a manual, user-triggered full-story compaction
 * (see storyCompaction.ts) rather than the per-turn token-budget-driven one
 * above: the cutoff is "everything except the most recent `keepRecentParts`
 * parts", regardless of whether it currently fits the AI's context budget,
 * and there's no minimum-uncovered-tokens threshold - a manual action should
 * do something even if only a little has accumulated since the last pass.
 */
export function planManualCompaction(
  storyData: StoryData,
  keepRecentParts: number
): CompactionPlan | null {
  const parts = storyData.scene.parts;
  if (!parts || parts.length === 0) return null;

  const alreadyCovered = storyData.scene.summarizedThroughIndex || 0;
  const cutoffIndex = Math.max(0, parts.length - Math.max(0, keepRecentParts));

  if (cutoffIndex <= alreadyCovered) {
    return null; // nothing beyond what's already summarized falls outside the kept tail
  }

  const newlyDroppedParts = parts.slice(alreadyCovered, cutoffIndex);
  const textToSummarize = newlyDroppedParts
    .map(partToCompactionText)
    .join("\n\n");
  if (!textToSummarize.trim()) return null;

  return {
    cutoffIndex,
    textToSummarize,
    priorSummary: storyData.scene.summary,
  };
}
