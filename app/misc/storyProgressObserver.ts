/**
 * Story Progress Observer (Layer 3 - director/pacing).
 *
 * Everything else in this layer reacts turn-to-turn: pacingFeedback.ts
 * tracks a trailing word-count average, targetTensionForProgress (mythic.ts)
 * silently nudges selectDirectorMove when live tension falls behind the
 * story's own dramatic arc, and directorAssistant.ts tracks which threads/
 * NPCs got the spotlight on each scene increment. None of them ever step
 * back and say, in plain language, "here's how the story is actually
 * going" - a holistic read a human co-GM would give after a session, not a
 * single-turn rule check.
 *
 * This module is that read: an LLM side-call that fires every N accepted
 * turns (not every turn, and not on scene increments - N is a plain turn
 * count, since scenes vary wildly in length), looks at a window of recent
 * narration plus the deterministic signals already available (active
 * threads/goals, spotlight neglect, tension vs. its arc target), and hands
 * the GM one or two sentences of direct feedback: keep doing what's
 * working, or fix a named, concrete problem (a stalled thread, a scene that
 * won't end). GM-facing only - never surfaced to the player.
 *
 * Same posture as every other side-call here: fails open (an infra failure
 * just means no note this turn, never blocks or resets the turn), and only
 * ever produces advisory text - it has no power to mutate StoryData beyond
 * its own cadence counter.
 */

import { StoryData } from "./structs";
import { getCustomModelIfUUID } from "./user_settings";
import { storyProgress, targetTensionForProgress } from "./mythic";

/** Turns between check-ins when no interval is explicitly configured (see layerSettings.ts). */
export const DEFAULT_STORY_PROGRESS_CHECK_INTERVAL = 10;

/** How many recent assistant narration turns (including the one just written) feed the judge. */
const NARRATION_WINDOW = 6;

export type StoryProgressStatus = "on_track" | "dragging" | "rushing";

export interface StoryProgressApiOptions {
  model: string;
  token: string | null;
  openRouterKey?: string;
  deepseekKey?: string;
  googleKey?: string;
  mistralKey?: string;
  deepinfraKey?: string;
  abortSignal?: AbortSignal;
  /** Optional override from layerSettings.ts's story-progress-observer model/effort override. */
  reasoningEffort?: string;
}

export interface StoryProgressResult {
  /** True when this turn was the check-in turn (the cadence counter fired and reset), regardless of whether a judgment came back. */
  ran: boolean;
  status?: StoryProgressStatus;
  /** 1-2 sentence GM-facing note. Undefined if the check didn't run or the API call failed. */
  note?: string;
}

const SYSTEM_PROMPT = `You are the story-progress reviewer for an interactive fiction game's AI game master ("GM"). You check in periodically - not every turn - to judge how the *overall pacing and forward momentum* of the story has been over the recent stretch, not any single turn's prose quality.

Judge the recent stretch as one of:
- "on_track": moving forward at a healthy pace - scenes resolve, plot threads advance, stakes rise and fall appropriately.
- "dragging": stalling - repeating the same beat, active threads sitting untouched, no meaningful forward movement across these turns.
- "rushing": moving too fast - skipping over character or emotional beats, resolving things without letting them breathe, cramming too much into too little space.

Give the GM one or two sentences of direct, concrete, actionable feedback - speak to it directly ("You've..."). If it's on track, say what's working so it keeps doing that. If it isn't, name the specific problem (which thread has stalled, what needs to breathe, what needs to move) rather than generic advice.

Respond with ONLY a JSON object, no other text:
{"status": "on_track"|"dragging"|"rushing", "note": "<1-2 sentences>"}`;

interface StoryProgressJudgment {
  status: StoryProgressStatus;
  note: string;
}

function extractJudgment(content: string): StoryProgressJudgment | null {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : content;
  const objectMatch = candidate.match(/\{[\s\S]*\}/);
  if (!objectMatch) return null;

  try {
    const parsed = JSON.parse(objectMatch[0]);
    if (!parsed || typeof parsed !== "object") return null;
    const status = parsed.status;
    const note = typeof parsed.note === "string" ? parsed.note.trim() : "";
    if (status !== "on_track" && status !== "dragging" && status !== "rushing") {
      return null;
    }
    if (!note) return null;
    return { status, note };
  } catch {
    return null;
  }
}

function buildNarrationWindow(storyData: StoryData, latestNarration: string): string {
  const priorTurns: string[] = [];
  for (let i = storyData.scene.parts.length - 1; i >= 0; i--) {
    const part = storyData.scene.parts[i];
    if (part.user || part.role !== "assistant" || !part.content?.trim()) continue;
    priorTurns.push(part.content.trim());
    if (priorTurns.length >= NARRATION_WINDOW - 1) break;
  }
  priorTurns.reverse();
  const window = [...priorTurns, latestNarration.trim()];
  return window
    .map((turn, i) => `[Turn ${i + 1}]\n${turn}`)
    .join("\n\n");
}

function buildContextSummary(storyData: StoryData): string {
  const activeThreads = (storyData.threads || []).filter((t) => t.status === "active");
  const activeGoals = (storyData.goals || []).filter((g) => g.active && !g.fulfilled);
  const neglect = storyData.directorAssistant?.threadSpotlight || {};

  const threadLines = activeThreads.length
    ? activeThreads
        .map((t) => {
          const turnsNeglected = neglect[t.id];
          const neglectNote =
            typeof turnsNeglected === "number" && turnsNeglected > 0
              ? ` (untouched for ${turnsNeglected} turn${turnsNeglected === 1 ? "" : "s"})`
              : "";
          return `- ${t.title}${neglectNote}`;
        })
        .join("\n")
    : "(none)";

  const goalLines = activeGoals.length
    ? activeGoals.map((g) => `- ${g.title}`).join("\n")
    : "(none)";

  const tension = storyData.agmtState?.tension ?? 5;
  const targetTension = Math.round(targetTensionForProgress(storyProgress(storyData)));

  return `Active plot threads:\n${threadLines}\n\nActive goals:\n${goalLines}\n\nCurrent tension: ${tension}/10 (expected ~${targetTension}/10 at this point in the story's arc)`;
}

async function callStoryProgressApi(
  storyData: StoryData,
  latestNarration: string,
  apiOptions: StoryProgressApiOptions,
): Promise<StoryProgressJudgment | null> {
  const user = `${buildContextSummary(storyData)}\n\nRecent narration:\n"""\n${buildNarrationWindow(storyData, latestNarration)}\n"""`;

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiOptions.token}`,
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: user },
        ],
        model: apiOptions.model,
        maxTokens: 250,
        temperature: 0.3,
        openRouterKey: apiOptions.openRouterKey,
        deepseekKey: apiOptions.deepseekKey,
        googleKey: apiOptions.googleKey,
        mistralKey: apiOptions.mistralKey,
        deepinfraKey: apiOptions.deepinfraKey,
        customModel: getCustomModelIfUUID(apiOptions.model),
        reasoningEffort: apiOptions.reasoningEffort,
      }),
      signal: apiOptions.abortSignal,
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = (data.content || "").trim();
    if (!content) return null;

    return extractJudgment(content);
  } catch {
    return null;
  }
}

/**
 * Advances the check-in cadence counter and, once it's due, runs the
 * holistic story-progress judge. Called once per accepted turn from
 * generation.ts, after the turn's narration is final. Mutates
 * storyData.turnsSinceStoryProgressCheck directly (increments every call;
 * resets to 0 whenever a check-in actually fires, whether or not the API
 * call itself succeeds - a transient API failure shouldn't cause every
 * subsequent turn to retry until one finally lands).
 */
export async function runStoryProgressObserver(
  storyData: StoryData,
  narration: string,
  apiOptions: StoryProgressApiOptions,
  checkInterval: number = DEFAULT_STORY_PROGRESS_CHECK_INTERVAL,
): Promise<StoryProgressResult> {
  if (!narration.trim()) {
    return { ran: false };
  }

  const turnsSince = (storyData.turnsSinceStoryProgressCheck ?? 0) + 1;

  if (turnsSince < Math.max(1, checkInterval)) {
    storyData.turnsSinceStoryProgressCheck = turnsSince;
    return { ran: false };
  }

  // Due - reset the counter regardless of what happens below, so a
  // transient API failure doesn't cause every subsequent turn to retry
  // until one finally lands.
  storyData.turnsSinceStoryProgressCheck = 0;

  const judgment = await callStoryProgressApi(storyData, narration, apiOptions);
  if (!judgment) {
    return { ran: true };
  }

  return { ran: true, status: judgment.status, note: judgment.note };
}
