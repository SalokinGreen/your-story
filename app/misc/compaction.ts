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
 */
export function applyCompaction(
  storyData: StoryData,
  plan: CompactionPlan,
  newSummary: string
): void {
  storyData.scene.summary = cleanString(newSummary);
  storyData.scene.summarizedThroughIndex = plan.cutoffIndex;
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
  token: string;
  openRouterKey?: string;
  deepseekKey?: string;
  googleKey?: string;
  abortSignal?: AbortSignal;
}

export interface CompactionResult {
  ran: boolean;
  summary?: string;
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

  const { system, user } = buildCompactionPrompt(plan);

  const response = await fetch("/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiOptions.token}`,
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      model: apiOptions.model,
      maxTokens: Math.ceil(MAX_SUMMARY_TOKENS * 1.3),
      temperature: 0.2,
      openRouterKey: apiOptions.openRouterKey,
      deepseekKey: apiOptions.deepseekKey,
      googleKey: apiOptions.googleKey,
    }),
    signal: apiOptions.abortSignal,
  });

  if (!response.ok) {
    // Non-fatal: compaction failing just means we retry next turn: the
    // sliding window still drops old parts either way, so this can't make
    // context management worse than before, only sometimes not-better yet.
    return { ran: false };
  }

  const data = await response.json();
  const summary = (data.content || "").trim();
  if (!summary) return { ran: false };

  applyCompaction(storyData, plan, summary);
  return { ran: true, summary };
}
