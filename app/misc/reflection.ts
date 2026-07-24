/**
 * Memory reflection: Generative Agents (Park et al.) scores memories by
 * recency + importance + relevance for retrieval (see embeddings.ts /
 * semanticSearchFallback.ts's memory-boost reranking for that half), but its
 * actual differentiator is a second mechanism this codebase didn't have -
 * periodically synthesizing higher-level insights from clusters of
 * memories, not just storing them flat. Without it, the memory system can
 * recall "the player negotiated with the guard" and "the player negotiated
 * with the merchant" as two separate facts but never derive "the player
 * consistently prefers negotiation over combat" - the kind of insight that
 * should inform how the director/GM treats the player going forward.
 *
 * This mirrors compaction.ts's shape closely on purpose: a pure planning
 * function, a prompt builder, an API-calling orchestrator that's safe/cheap
 * to call every turn (a no-op unless enough new memory has accumulated),
 * and non-fatal failure handling.
 */

import { StoryData, MemoryEntry, getMemoryContent } from "./structs";

// Cumulative importance (sum of each new memory's 0-10 importance, or a
// mid-value default for memories with no self-rated importance) that must
// accumulate since the last reflection pass before another one runs. Keeps
// reflection from firing on every single memory addition - it's meant to
// synthesize a *batch*, not react to one fact at a time.
const REFLECTION_IMPORTANCE_THRESHOLD = 30;

// Importance assigned to memories with no self-rated importance, for the
// purpose of accumulating toward the reflection threshold - a neutral
// mid-point, same convention as elsewhere in this codebase treating
// "unrated" as "moderate" rather than zero or maximum.
const DEFAULT_MEMORY_IMPORTANCE = 5;

// At most this many synthesized insights get appended per reflection pass -
// bounded so a single pass can't flood memory with speculative insights.
const MAX_INSIGHTS_PER_PASS = 3;

// Importance assigned to a synthesized insight itself. Insights are
// meta-level conclusions drawn from multiple underlying memories, so they
// default to a higher significance than the median individual memory.
const REFLECTION_INSIGHT_IMPORTANCE = 8;

export interface ReflectionPlan {
  cutoffIndex: number; // memory[0, cutoffIndex) will be marked as covered
  sourceEntries: MemoryEntry[]; // the newly-accumulated memories being reflected on
}

function toMemoryEntry(memory: string | MemoryEntry): MemoryEntry {
  return typeof memory === "string" ? { content: memory } : memory;
}

/**
 * Pure decision logic: has enough new, sufficiently-important memory
 * accumulated since the last reflection pass to warrant synthesizing
 * insights from it? Returns null when nothing new needs reflecting on.
 */
export function planReflection(storyData: StoryData): ReflectionPlan | null {
  const memories = storyData.memory || [];
  const alreadyReflected = storyData.memoryReflectedThroughIndex || 0;
  if (alreadyReflected >= memories.length) return null;

  const newEntries = memories.slice(alreadyReflected).map(toMemoryEntry);
  const cumulativeImportance = newEntries.reduce(
    (sum, entry) => sum + (entry.importance ?? DEFAULT_MEMORY_IMPORTANCE),
    0
  );

  if (cumulativeImportance < REFLECTION_IMPORTANCE_THRESHOLD) {
    return null;
  }

  return { cutoffIndex: memories.length, sourceEntries: newEntries };
}

function buildReflectionPrompt(plan: ReflectionPlan): {
  system: string;
  user: string;
} {
  const system = `You are the memory-reflection layer for an interactive story's AI game master. Review a batch of recent memories and synthesize a small number of higher-level insights - patterns, relationships, or realizations that emerge from looking at several memories together, not stated directly in any single one of them (for example: "The player consistently chooses to negotiate rather than fight" or "Marcus's betrayal has left the player deeply distrustful of authority figures").

Some insights are also concrete changes to the campaign's situation that the GM will need when it re-plans the next beat. When (and only when) an insight is one of these, PREFIX it with the matching tag so the planner can pick it out - otherwise leave it untagged:
- [Neutralized] - a threat, faction (Front), or key NPC the players defused, killed, allied with, or otherwise took off the board.
- [Clock] - a countdown / doom clock / looming danger that advanced or is now imminent.
- [Goal] - a new objective or hook the players adopted, or an old one that shifted.
- [Arc] - a character arc that collapsed toward one direction based on what the player actually did.
Only tag genuine world-state changes; ordinary pattern insights ("the player prefers stealth") stay untagged.

Write each insight on its own line, plain text, no bullet points or numbering (a leading [Tag] is fine), at most ${MAX_INSIGHTS_PER_PASS} lines. If nothing meaningfully new emerges from these memories, write nothing at all.`;

  const user = `RECENT MEMORIES:\n${plan.sourceEntries
    .map((entry) => `- ${getMemoryContent(entry)}`)
    .join("\n")}\n\nWrite up to ${MAX_INSIGHTS_PER_PASS} higher-level insights synthesized from these memories.`;

  return { system, user };
}

/**
 * Apply synthesized insights back onto storyData (mutates in place, matching
 * the rest of this codebase's storyData-mutation convention). Marks the plan's
 * cutoff as covered even if zero insights came back (e.g. the model
 * legitimately found nothing new to synthesize) - it isn't refused, it's a
 * decision this batch had nothing further to add, and re-running reflection
 * on the exact same batch every turn would be wasted.
 */
export function applyReflection(
  storyData: StoryData,
  plan: ReflectionPlan,
  insights: string[]
): void {
  storyData.memoryReflectedThroughIndex = plan.cutoffIndex;
  const sceneIndex = storyData.scene.parts.length;
  const now = Date.now();
  for (const insight of insights.slice(0, MAX_INSIGHTS_PER_PASS)) {
    const trimmed = insight.trim();
    if (!trimmed) continue;
    storyData.memory.push({
      content: trimmed,
      embedded: false,
      timestamp: now,
      sceneIndex,
      importance: REFLECTION_INSIGHT_IMPORTANCE,
      isReflection: true,
    });
  }
}

export interface ReflectionApiOptions {
  model: string;
  token: string | null;
  openRouterKey?: string;
  deepseekKey?: string;
  googleKey?: string;
  abortSignal?: AbortSignal;
  /** Optional override from layerSettings.ts's reflection model/effort override - unset preserves prior behavior of never sending this field. */
  reasoningEffort?: string;
}

export interface ReflectionResult {
  ran: boolean;
  insights?: string[];
}

async function callReflectionApi(
  messages: { role: string; content: string }[],
  apiOptions: ReflectionApiOptions
): Promise<string[] | null> {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiOptions.token}`,
    },
    body: JSON.stringify({
      messages,
      model: apiOptions.model,
      maxTokens: 300,
      temperature: 0.4,
      openRouterKey: apiOptions.openRouterKey,
      deepseekKey: apiOptions.deepseekKey,
      googleKey: apiOptions.googleKey,
      reasoningEffort: apiOptions.reasoningEffort,
    }),
    signal: apiOptions.abortSignal,
  });

  if (!response.ok) return null;

  const data = await response.json();
  const content = (data.content || "").trim();
  if (!content) return [];

  return content
    .split("\n")
    .map((line: string) => line.replace(/^[-*\d.)\s]+/, "").trim())
    .filter((line: string) => line.length > 0);
}

/**
 * Check whether reflection is due and, if so, run one synthesis call and
 * fold the resulting insights into storyData.memory in place. Safe to call
 * every turn - it's a no-op unless enough importance-weighted new memory has
 * accumulated since the last pass (see planReflection). Failure is
 * non-fatal: a skipped reflection just means insights synthesize next time
 * enough new memory accumulates, same posture as compaction.ts.
 */
export async function ensureStoryReflected(
  storyData: StoryData,
  apiOptions: ReflectionApiOptions
): Promise<ReflectionResult> {
  const plan = planReflection(storyData);
  if (!plan) return { ran: false };

  const { system, user } = buildReflectionPrompt(plan);
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const insights = await callReflectionApi(messages, apiOptions);
  if (insights === null) {
    return { ran: false };
  }

  applyReflection(storyData, plan, insights);
  return { ran: true, insights };
}
