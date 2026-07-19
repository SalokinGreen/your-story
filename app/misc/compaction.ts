/**
 * Compaction: when scene history ages out of a stage's token budget
 * (getPartsWithinTokenBudget in ai_staged.ts), it's currently just dropped -
 * a pure sliding window with no memory of what fell out. For a long-running
 * campaign that silently erases earlier plot the GM never happened to write
 * down as a `memory`/lore entry.
 *
 * This adds a rolling summary instead: whenever parts are about to fall
 * outside the budget for the first time, they get folded into
 * storyData.scene.summary (extending any prior summary, not restarting it),
 * and storyData.scene.summarizedThroughIndex tracks how much has already
 * been covered so re-summarizing the same parts every turn is avoided.
 */

import { StoryData, ScenePart } from "./structs";
import { getPartsWithinTokenBudget, cleanString } from "./ai_staged";
import { estimateTokens } from "./tokenCounter";

// Below this many uncovered tokens, summarizing isn't worth an extra LLM
// call yet - wait for more to accumulate.
const MIN_UNCOVERED_TOKENS_TO_SUMMARIZE = 1500;

// Keep the summary itself bounded so it can't grow without limit over a
// very long campaign and start eating the budget it's meant to protect.
const MAX_SUMMARY_TOKENS = 1500;

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
  kind: "npc" | "item" | "lore";
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
  for (const item of storyData.inventory || []) {
    if (!item.name) continue;
    entities.push({ name: item.name, kind: "item", deceasedOrGone: false });
  }
  for (const lore of storyData.lore || []) {
    if (!lore.title) continue;
    entities.push({ name: lore.title, kind: "lore", deceasedOrGone: false });
  }
  return entities;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countNameMentions(text: string, name: string): number {
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
const ACTIVE_PRESENCE_PHRASES = [
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
const CONTRADICTION_WINDOW_CHARS = 60;

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

function partToText(part: ScenePart): string {
  const text = part.raw || part.content || "";
  return part.user ? `> ${text}` : text;
}

/**
 * Pure decision logic: given the current scene state and the token budget
 * about to be used for history, decide whether compaction is needed and, if
 * so, what needs to be summarized. Returns null when nothing new needs
 * summarizing (either everything still fits, or the newly-dropped content
 * is too small to bother with yet).
 */
export function planCompaction(
  storyData: StoryData,
  historyBudget: number
): CompactionPlan | null {
  const parts = storyData.scene.parts;
  if (!parts || parts.length === 0) return null;

  const included = getPartsWithinTokenBudget(parts, historyBudget);
  const cutoffIndex = parts.length - included.length;

  const alreadyCovered = storyData.scene.summarizedThroughIndex || 0;
  if (cutoffIndex <= alreadyCovered) {
    return null; // nothing new has aged out since the last summary
  }

  const newlyDroppedParts = parts.slice(alreadyCovered, cutoffIndex);
  const textToSummarize = newlyDroppedParts.map(partToText).join("\n\n");

  if (estimateTokens(textToSummarize) < MIN_UNCOVERED_TOKENS_TO_SUMMARIZE) {
    return null;
  }

  return {
    cutoffIndex,
    textToSummarize,
    priorSummary: storyData.scene.summary,
  };
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

function buildCompactionPrompt(plan: CompactionPlan): {
  system: string;
  user: string;
} {
  const system = `You maintain a running summary of an interactive story's earlier events, so later turns don't lose context once the full text ages out of the AI's context window.

Write a dense, factual summary covering: key plot developments, decisions the player made and their consequences, important NPCs introduced and how relationships stand, locations discovered, items/quests gained or resolved, and any unresolved threads. Skip prose flourishes - this is a reference for another AI, not entertainment. Keep it under roughly ${MAX_SUMMARY_TOKENS} tokens.

${
  plan.priorSummary
    ? "You are given the EXISTING summary plus NEW events that happened after it. Produce one updated summary that merges them - do not just append, actually integrate and re-condense so the whole thing stays compact."
    : "You are given the story's earliest events. Produce the summary from scratch."
}`;

  const user = plan.priorSummary
    ? `EXISTING SUMMARY:\n${plan.priorSummary}\n\nNEW EVENTS TO FOLD IN:\n${plan.textToSummarize}\n\nWrite the updated combined summary.`
    : `EVENTS TO SUMMARIZE:\n${plan.textToSummarize}\n\nWrite the summary.`;

  return { system, user };
}

export interface CompactionApiOptions {
  model: string;
  token: string | null;
  openRouterKey?: string;
  deepseekKey?: string;
  googleKey?: string;
  abortSignal?: AbortSignal;
}

export interface CompactionResult {
  ran: boolean;
  summary?: string;
  warnings?: CompactionWarning[];
}

async function callSummarizeApi(
  messages: { role: string; content: string }[],
  apiOptions: CompactionApiOptions
): Promise<string | null> {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiOptions.token}`,
    },
    body: JSON.stringify({
      messages,
      model: apiOptions.model,
      maxTokens: Math.ceil(MAX_SUMMARY_TOKENS * 1.3),
      temperature: 0.2,
      openRouterKey: apiOptions.openRouterKey,
      deepseekKey: apiOptions.deepseekKey,
      googleKey: apiOptions.googleKey,
    }),
    signal: apiOptions.abortSignal,
  });

  if (!response.ok) return null;

  const data = await response.json();
  const summary = (data.content || "").trim();
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
 * Check whether compaction is needed for the given history budget and, if
 * so, run one summarization call and fold it into storyData in place.
 * Safe to call every turn - it's a no-op unless enough new history has
 * aged out of the budget since the last summary.
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
export async function ensureStoryCompacted(
  storyData: StoryData,
  historyBudget: number,
  apiOptions: CompactionApiOptions
): Promise<CompactionResult> {
  const plan = planCompaction(storyData, historyBudget);
  if (!plan) return { ran: false };

  const { system, user } = buildCompactionPrompt(plan);
  const messages = [
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
    const revisionMessages = [
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
