/**
 * Tripwires for surprises (randomness plan R4, design 3.4, decision 261).
 * When a turn crosses a line (a session's end, a rest, travel or time passing,
 * a long quiet run) and nothing else has already fired, the engine rolls one
 * die; a hit queues a pending random event for the next turn's live block.
 * Pure but for the injected `rng` and `applyTripwireHit`, which mutates.
 */
import type { PendingRandomEvent, StoryData } from "./structs";
import { MAX_PENDING_RANDOM_EVENTS } from "./structs";
import type { SystemTurnEndCheck } from "./systems/types";
import { textCrosses } from "./turnEndChecks";
import {
  currentTurnIndex,
  generateEventFocus,
  generateEventMeaning,
} from "./mythic";
import { currentTint, rollPortent, selectFrame } from "./primaMateria";

export type Tripwire = "rest" | "session" | "travel" | "quiet_run";

/** Turns with no oracle or table use, and no earlier quiet-run roll, before one is rolled. */
export const QUIET_RUN_TURNS = 6;

// Local to a sentence: a question, a plan, a condition, a negation or a memory
// there is not a crossing.
const SENTENCE_WITH = (words: string): RegExp =>
  new RegExp(String.raw`[^.!?\n]*\b(?:${words})\b[^.!?\n]*`, "i");

/**
 * Travel or time passing, as a completed crossing. Past and arriving forms
 * only; the exceptions drop questions, plans, conditions, negations and
 * memories, each over the whole sentence it sits in.
 */
export const TRAVEL_CHECK: SystemTurnEndCheck["trigger"] = {
  phrases: [
    /\b(?:we|I|you|they)\s+(?:ride|rode|walk|walked|travel|travelled|traveled|sail|sailed|march|marched|trek|trekked|hike|hiked|drive|drove|journey|journeyed|head|headed|set out|set off)\b[^.!?\n]{0,60}?\b(?:to|for|toward|towards|into)\b/i,
    /\barrive[sd]?\s+(?:at|in)\b/i,
    /\breach(?:ed|es)\s+the\s+(?:town|city|village|gates?|harbou?r|port|camp|inn|ruins|border|keep|castle)\b/i,
    /\bby\s+(?:evening|nightfall|noon|midday|dusk)\b/i,
    /\b(?:an hour|a few hours|several hours|hours|a day|two days|three days|days|weeks?)\s+(?:later|pass(?:es|ed)?)\b/i,
    /\bthe\s+next\s+(?:morning|day|evening)\b/i,
  ],
  exceptions: [
    /[^.!?\n]*\?/,
    SENTENCE_WITH("if|unless|plan|plans|planning|will|won't|let's|should|shall|might|maybe|going to|want to|wanna|need to|have to|must|ought|would|could|can we|how long|how far"),
    SENTENCE_WITH("not|never|no|don't|didn't|won't|can't|cannot|couldn't|refuse|refused|instead of"),
    SENTENCE_WITH("remember|remembered|recall|used to|back when|once"),
  ],
};

const TRAVEL_AS_CHECK: SystemTurnEndCheck = {
  id: "travel",
  trigger: TRAVEL_CHECK,
  satisfiedBy: { toolName: "", resultType: "" },
  message: "",
};

/** 1-in-N for N = 8, 7, 6, 5, 4 at chaos 1-2, 3-4, 5, 6-7, 8-9. */
export function tripwireOdds(chaos: number): number {
  if (chaos <= 2) return 8;
  if (chaos <= 4) return 7;
  if (chaos === 5) return 6;
  if (chaos <= 7) return 5;
  return 4;
}

export interface TripwireInput {
  story: StoryData;
  results: ReadonlyArray<{ toolName: string; success: boolean; result?: unknown }>;
  gmProse: string;
  playerLines: string[];
  /** Pending event ids at the start of the turn. */
  eventsBefore: string[];
  resolvedThisTurn: boolean;
  sessionZero: boolean;
}

export type TripwireOutcome =
  | { rolled: false; why: string; tripwire?: Tripwire }
  | { rolled: true; tripwire: Tripwire; die: number; odds: number; hit: boolean };

/** Which line this turn crossed, first match winning, or null. */
export function crossingOf(input: TripwireInput): Tripwire | null {
  const ok = (name: string) => input.results.some((r) => r.success && r.toolName === name);
  if (ok("end_session")) return "session";
  if (ok("take_rest")) return "rest";
  if (textCrosses(TRAVEL_AS_CHECK, { gmProse: input.gmProse, playerLines: input.playerLines })) {
    return "travel";
  }
  const a = input.story.agmtState;
  if (a) {
    const last = Math.max(a.lastOracleTurn ?? 0, a.lastQuietRunRoll ?? 0);
    if (currentTurnIndex(input.story) - last >= QUIET_RUN_TURNS) return "quiet_run";
  }
  return null;
}

export function evaluateTripwire(
  input: TripwireInput,
  rng: () => number = Math.random,
): TripwireOutcome {
  if (input.sessionZero) return { rolled: false, why: "session zero" };
  const tripwire = crossingOf(input);
  if (!tripwire) return { rolled: false, why: "no crossing" };
  const pending = input.story.pendingRandomEvents ?? [];
  if (input.resolvedThisTurn) return { rolled: false, tripwire, why: "an event was resolved this turn" };
  if (pending.some((e) => !input.eventsBefore.includes(e.id))) {
    return { rolled: false, tripwire, why: "an event was added this turn" };
  }
  if (pending.length > 0) return { rolled: false, tripwire, why: "an event is pending" };
  if (!input.story.agmtState) return { rolled: false, tripwire, why: "no oracle state" };
  const odds = tripwireOdds(input.story.agmtState.chaosFactor ?? 5);
  const die = Math.min(odds, Math.floor(rng() * odds) + 1);
  return { rolled: true, tripwire, die, odds, hit: die === 1 };
}

/**
 * Records a rolled tripwire on the story: a quiet-run roll restarts its
 * counter, hit or miss, and a hit queues a pending event built like the scene
 * check's (a focus, a meaning pair and a portent). Mutates `story`.
 */
export function applyTripwireRoll(
  story: StoryData,
  outcome: Extract<TripwireOutcome, { rolled: true }>,
): PendingRandomEvent | null {
  if (outcome.tripwire === "quiet_run" && story.agmtState) {
    story.agmtState.lastQuietRunRoll = currentTurnIndex(story);
  }
  if (!outcome.hit) return null;
  const meaning = generateEventMeaning();
  const event: PendingRandomEvent = {
    id: `event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    source: "tripwire",
    tripwire: outcome.tripwire,
    focus: generateEventFocus().focus,
    action: meaning.action,
    subject: meaning.subject,
    portent: rollPortent("portent", selectFrame(story), currentTint(story)).statement,
    context: `Tripwire: ${outcome.tripwire} (d${outcome.odds}=${outcome.die})`,
    createdAt: Date.now(),
  };
  story.pendingRandomEvents = [...(story.pendingRandomEvents ?? []), event].slice(
    -MAX_PENDING_RANDOM_EVENTS,
  );
  return event;
}

/** The Debug Logs line for a roll or a skipped crossing. */
export function tripwireLogLine(outcome: TripwireOutcome): string | null {
  if (outcome.rolled) {
    return `Tripwire ${outcome.tripwire}: d${outcome.odds}=${outcome.die} vs 1-in-${outcome.odds}, ${outcome.hit ? "event queued" : "no event"}`;
  }
  return outcome.tripwire ? `Tripwire ${outcome.tripwire}: skipped (${outcome.why})` : null;
}
