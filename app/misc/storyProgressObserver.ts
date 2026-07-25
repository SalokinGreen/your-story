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
 *
 * Riding the same window and cadence: repeated-phrase detection
 * (findRepeatedPhrases below). Word-tics ("white-knuckled", "amber eyes")
 * are exactly the kind of thing a GM writing one turn at a time can't
 * notice about itself but a multi-turn read can. Detection itself is plain
 * n-gram counting - free and exact, and more reliable than asking an LLM to
 * spot its own repetition - but deciding which counted repeats are lazy
 * tics versus a name/setting that's supposed to recur is still handed to
 * the same LLM call as the pacing judgment, one extra conditional section
 * in the same prompt rather than a second API call.
 *
 * Also riding the same call: NPC knowledge-consistency - an NPC narrated as
 * reacting to or acting on something they had no established way of
 * knowing (not present when it was revealed, never told). Unlike the
 * repeated-phrase check, there's no deterministic pre-filter possible here:
 * this codebase has no structured "who was present"/"who was told what"
 * data (secrets and knowledge live in freeform lore notes and prose, per
 * this app's "notes, not stat blocks" design), so it's pure LLM judgment
 * reading the same narration window. That makes it exactly the kind of
 * "general-purpose consistency grading of arbitrary prose" this codebase is
 * normally wary of (see consistencyCheck.ts's doc comment) - deliberately
 * scoped down to compensate: judged only against what's visible in the
 * window itself (never assumes something couldn't have happened offscreen
 * or before the window), always advisory/log-only (see
 * DEFAULT_OBSERVER_SETTINGS-style posture - this has no reset path at all,
 * unlike observer.ts's major-severity checks), and folded into the same
 * note the GM sees next turn rather than surfaced as its own alarm.
 */

import { StoryData } from "./structs";
import { getCustomModelIfUUID } from "./user_settings";
import { recordSideCall, SideCallCostContext } from "./turnCost";
import { storyProgress, targetTensionForProgress } from "./mythic";

/** Turns between check-ins when no interval is explicitly configured (see layerSettings.ts). */
export const DEFAULT_STORY_PROGRESS_CHECK_INTERVAL = 10;

/** How many recent assistant narration turns (including the one just written) feed the judge. */
const NARRATION_WINDOW = 6;

// ============================================================
// REPEATED-PHRASE DETECTION
// ============================================================
// Deterministic word-tic detector: the LLM judge above is bad at noticing
// its OWN stock phrases ("white-knuckled", "amber eyes") because it's
// reading each turn fresh, not comparing across turns. Counting is free and
// exact, so it runs as a pre-pass over the same NARRATION_WINDOW turns
// already collected for the pacing judge; the candidates it finds are then
// handed to that same API call so the model - not a regex - decides which
// are genuine lazy repetition worth calling out versus a name/setting/term
// that's supposed to recur.

const STOPWORDS = new Set([
  "a", "an", "the", "of", "in", "on", "at", "to", "for", "and", "or", "but",
  "is", "was", "were", "are", "be", "been", "being", "he", "she", "it",
  "his", "her", "its", "they", "their", "them", "i", "you", "we", "as",
  "with", "that", "this", "these", "those", "had", "have", "has", "from",
  "into", "up", "down", "out", "over", "under", "not", "no", "so", "then",
  "than", "too", "very", "just", "if", "when", "while", "there", "here",
  "who", "what", "which", "how", "all", "some", "my", "your", "our",
]);

const MIN_PHRASE_WORDS = 2;
const MAX_PHRASE_WORDS = 4;
// A phrase has to show up in this many DISTINCT turns of the window (not
// just this many total times, which one turn using it twice could satisfy)
// before it counts as a cross-turn tic worth surfacing to the judge.
const MIN_PHRASE_TURN_REPEATS = 3;
const MAX_PHRASE_CANDIDATES = 8;

export interface RepeatedPhraseCandidate {
  phrase: string;
  /** Number of distinct turns in the window this phrase appeared in. */
  turnCount: number;
}

function normalizeWords(text: string): string[] {
  return text.toLowerCase().match(/[a-z']+(?:-[a-z']+)*/g) || [];
}

function isAllStopwords(words: string[]): boolean {
  return words.every((w) => STOPWORDS.has(w));
}

/**
 * Scans a window of narration turns for 2-4 word phrases repeated verbatim
 * across at least MIN_PHRASE_TURN_REPEATS distinct turns. Pure string
 * counting - no API call - so it's safe to run every time the pacing judge
 * would otherwise fire. Longer, more specific phrases are preferred over
 * shorter substrings they contain when both clear the threshold (e.g.
 * "white-knuckled grip" over the bare "white-knuckled" it's built from).
 */
export function findRepeatedPhrases(turns: string[]): RepeatedPhraseCandidate[] {
  const turnsByPhrase = new Map<string, Set<number>>();

  turns.forEach((turn, turnIndex) => {
    const words = normalizeWords(turn);
    const seenInThisTurn = new Set<string>();
    for (let n = MIN_PHRASE_WORDS; n <= MAX_PHRASE_WORDS; n++) {
      for (let i = 0; i + n <= words.length; i++) {
        const gram = words.slice(i, i + n);
        if (isAllStopwords(gram)) continue;
        const phrase = gram.join(" ");
        if (seenInThisTurn.has(phrase)) continue;
        seenInThisTurn.add(phrase);
        if (!turnsByPhrase.has(phrase)) turnsByPhrase.set(phrase, new Set());
        turnsByPhrase.get(phrase)!.add(turnIndex);
      }
    }
  });

  const candidates: RepeatedPhraseCandidate[] = [];
  for (const [phrase, turnIndices] of turnsByPhrase) {
    if (turnIndices.size >= MIN_PHRASE_TURN_REPEATS) {
      candidates.push({ phrase, turnCount: turnIndices.size });
    }
  }

  // Prefer longer/more specific phrases over shorter substrings they
  // contain once both clear the threshold, so the judge sees "white-
  // knuckled grip" instead of also getting the redundant "white-knuckled".
  candidates.sort(
    (a, b) => b.turnCount - a.turnCount || b.phrase.length - a.phrase.length,
  );
  const deduped: RepeatedPhraseCandidate[] = [];
  for (const candidate of candidates) {
    const supersededBy = deduped.find(
      (kept) =>
        kept.phrase.includes(candidate.phrase) &&
        kept.turnCount >= candidate.turnCount,
    );
    if (supersededBy) continue;
    deduped.push(candidate);
  }

  return deduped.slice(0, MAX_PHRASE_CANDIDATES);
}

export type StoryProgressStatus = "on_track" | "dragging" | "rushing";

export interface StoryProgressApiOptions extends SideCallCostContext {
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
  /** Phrases the judge confirmed as genuine repeated tics, out of the deterministically-detected candidates. Undefined if none were flagged. */
  repeatedPhrases?: string[];
  /** 1-2 sentence GM-facing note calling out the repeated phrases and asking for variety. Undefined if none were flagged. */
  repetitionNote?: string;
  /** 1-2 sentence GM-facing note calling out an NPC who displayed knowledge they had no established way of having, per the visible narration window. Undefined if none was flagged. */
  knowledgeNote?: string;
}

const SYSTEM_PROMPT_BASE = `You are the story-progress reviewer for an interactive fiction game's AI game master ("GM"). You check in periodically - not every turn - to judge how the *overall pacing and forward momentum* of the story has been over the recent stretch, not any single turn's prose quality.

Judge the recent stretch as one of:
- "on_track": moving forward at a healthy pace - scenes resolve, plot threads advance, stakes rise and fall appropriately.
- "dragging": stalling - repeating the same beat, active threads sitting untouched, no meaningful forward movement across these turns.
- "rushing": moving too fast - skipping over character or emotional beats, resolving things without letting them breathe, cramming too much into too little space.

Give the GM one or two sentences of direct, concrete, actionable feedback - speak to it directly ("You've..."). If it's on track, say what's working so it keeps doing that. If it isn't, name the specific problem (which thread has stalled, what needs to breathe, what needs to move) rather than generic advice.`;

const REPETITION_SYSTEM_ADDENDUM = `

You're also given a list of phrases a mechanical word-counter found repeated verbatim across several of these turns. Some repetition is expected and fine - a character's name, an established location, a recurring in-world term. Others are lazy prose tics - the same stock description, sensory beat, or turn of phrase reused instead of varied. Decide which of the candidates (if any) are the latter, list only those in "repeated_phrases", and if you flagged any, write one or two direct sentences in "repetition_note" telling the GM which phrases it's leaning on too hard and to vary its language. If none of the candidates are worth flagging, return an empty array and omit "repetition_note".`;

const KNOWLEDGE_SYSTEM_ADDENDUM = `

You're also watching for one specific consistency problem: an NPC in this narration displaying knowledge of something they had no established way of knowing - reacting to, referencing, or acting on a fact, secret, or discovery that, as far as THIS WINDOW of narration shows, they were never present for and were never told. This is easy to get wrong, so be conservative: only flag a case where the window itself makes the impossibility clear (the information was revealed in one turn to someone else, in this NPC's clear absence, and nothing in the window shows them being told before they act on it). If the NPC could plausibly have learned it offscreen, before this window, from someone or something not shown here - or you're just not sure - do NOT flag it; silence is the safe default. If you do flag one, set "knowledge_issue" to true and write one or two direct sentences in "knowledge_note" naming the NPC and what they shouldn't know. Otherwise set "knowledge_issue" to false and omit "knowledge_note".`;

function buildSystemPrompt(hasPhraseCandidates: boolean): string {
  const repetitionJsonField = hasPhraseCandidates
    ? `, "repeated_phrases": [<flagged phrases, empty array if none>], "repetition_note": "<1-2 sentences, omit or empty if none flagged>"`
    : "";
  return `${SYSTEM_PROMPT_BASE}${hasPhraseCandidates ? REPETITION_SYSTEM_ADDENDUM : ""}${KNOWLEDGE_SYSTEM_ADDENDUM}

Respond with ONLY a JSON object, no other text:
{"status": "on_track"|"dragging"|"rushing", "note": "<1-2 sentences>"${repetitionJsonField}, "knowledge_issue": true|false, "knowledge_note": "<1-2 sentences, omit or empty if false>"}`;
}

interface StoryProgressJudgment {
  status: StoryProgressStatus;
  note: string;
  repeatedPhrases: string[];
  repetitionNote: string;
  knowledgeNote: string;
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
    const repeatedPhrases = Array.isArray(parsed.repeated_phrases)
      ? parsed.repeated_phrases.filter((p: unknown): p is string => typeof p === "string")
      : [];
    const repetitionNote =
      typeof parsed.repetition_note === "string" ? parsed.repetition_note.trim() : "";
    const knowledgeNote =
      parsed.knowledge_issue === true && typeof parsed.knowledge_note === "string"
        ? parsed.knowledge_note.trim()
        : "";
    return { status, note, repeatedPhrases, repetitionNote, knowledgeNote };
  } catch {
    return null;
  }
}

/** Recent assistant narration turns (including the one just written), oldest first - shared by the pacing judge's window and the repeated-phrase detector. */
function collectRecentNarrationTurns(
  storyData: StoryData,
  latestNarration: string,
): string[] {
  const priorTurns: string[] = [];
  for (let i = storyData.scene.parts.length - 1; i >= 0; i--) {
    const part = storyData.scene.parts[i];
    if (part.user || part.role !== "assistant" || !part.content?.trim()) continue;
    priorTurns.push(part.content.trim());
    if (priorTurns.length >= NARRATION_WINDOW - 1) break;
  }
  priorTurns.reverse();
  return [...priorTurns, latestNarration.trim()];
}

function buildNarrationWindow(turns: string[]): string {
  return turns.map((turn, i) => `[Turn ${i + 1}]\n${turn}`).join("\n\n");
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
  turns: string[],
  phraseCandidates: RepeatedPhraseCandidate[],
  apiOptions: StoryProgressApiOptions,
): Promise<StoryProgressJudgment | null> {
  const phraseCandidatesBlock = phraseCandidates.length
    ? `\n\nPhrases a mechanical word-counter found repeated verbatim across multiple of these turns:\n${phraseCandidates
        .map((c) => `- "${c.phrase}" (used in ${c.turnCount} of the last ${turns.length} turns)`)
        .join("\n")}`
    : "";
  const user = `${buildContextSummary(storyData)}\n\nRecent narration:\n"""\n${buildNarrationWindow(turns)}\n"""${phraseCandidatesBlock}`;

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiOptions.token}`,
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: buildSystemPrompt(phraseCandidates.length > 0) },
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
    recordSideCall(
      "progress_observer",
      "Story Progress Observer",
      apiOptions.model,
      data,
      apiOptions,
    );
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

  const turns = collectRecentNarrationTurns(storyData, narration);
  const phraseCandidates = findRepeatedPhrases(turns);

  const judgment = await callStoryProgressApi(
    storyData,
    turns,
    phraseCandidates,
    apiOptions,
  );
  if (!judgment) {
    return { ran: true };
  }

  return {
    ran: true,
    status: judgment.status,
    note: judgment.note,
    repeatedPhrases: judgment.repeatedPhrases.length ? judgment.repeatedPhrases : undefined,
    repetitionNote: judgment.repetitionNote || undefined,
    knowledgeNote: judgment.knowledgeNote || undefined,
  };
}
