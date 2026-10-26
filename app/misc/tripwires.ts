/**
 * Tripwires for surprises (randomness plan R4, design 3.4, decision 261).
 * When a turn crosses a line (a session's end, a rest, travel or time passing,
 * a long quiet run) and nothing else has already fired, the engine rolls one
 * die; a hit queues a pending random event for the next turn's live block.
 * Pure but for the injected `rng`, `evaluateTripwire`'s bookkeeping stamps and
 * `applyTripwireRoll`, which mutate.
 *
 * "Too strong is too random" (decision 259): every rule here errs toward NOT
 * firing. Turn counts are player turns (user parts), and the stamps are scene
 * part indexes, the unit `agmtState.lastOracleTurn` already uses.
 */
import type { PendingRandomEvent, StoryData } from "./structs";
import { MAX_PENDING_RANDOM_EVENTS } from "./structs";
import { generateEventFocus, generateEventMeaning } from "./mythic";
import { currentTint, rollPortent, selectFrame } from "./primaMateria";

export type Tripwire = "rest" | "session" | "travel" | "quiet_run";

/** Player turns with no oracle or table use, and no earlier quiet-run roll, before one is rolled. */
export const QUIET_RUN_TURNS = 6;
/** At most one tripwire roll of any kind in this many player turns. */
export const TRIPWIRE_MIN_GAP = 3;

// ---------------------------------------------------------------------------
// Travel and time passing: a completed crossing, in the GM's own narration or
// the player's own line. Quotes, questions, plans, negations, recaps and
// speech never count.
// ---------------------------------------------------------------------------

/** Text outside double quotes (straight or curly); an unclosed quote runs to the end of its line. */
function stripQuotes(text: string): string {
  return text
    .replace(/"[^"\n]*"/g, " ")
    .replace(/“[^”\n]*”/g, " ")
    .replace(/["“][^\n]*$/gm, " ");
}

function sentencesOf(text: string): string[] {
  return (text.match(/[^.!?\n]+[.!?]*/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

// A sentence with any of these is a question, speech, a recap, a plan, a
// condition or a negation, and never a crossing.
const NOT_A_CROSSING =
  /\?|\b(?:says?|said|asks?|asked|tells?|told|telling|replies|replied|whispers?|whispered|remember(?:s|ed)?|recall(?:s|ed)?|used to|once|if|unless|plans?|planning|will|won't|let's|should|shall|might|maybe|going to|want to|wants to|need to|needs to|have to|must|ought|would|could|can we|not|never|no|don't|didn't|can't|cannot|couldn't|refuse[sd]?|instead of)\b/i;

const SETTLEMENT =
  /^(?:the\s+)?(?:town|city|village|hamlet|coast|capital|border|frontier|port|harbou?r|mainland|mountains?|kingdom|isles?|valley|north|south|east|west|next (?:town|village|city))\b/i;

/** A destination: a settlement word, or a capitalised proper noun (read from the original case). */
function isDestination(rest: string): boolean {
  const t = rest.trim();
  if (SETTLEMENT.test(t)) return true;
  return /^(?:the\s+)?[A-Z][a-z]+/.test(t) && !/^(?:The|A|An|His|Her|Its|Their|My|Your|Our|It|He|She|They|You|We|I)\b/.test(t);
}

const JOURNEY_VERB =
  /\b(?:travel(?:s|led|ed)?|journey(?:s|ed)?|rid(?:e|es)|rode|sail(?:s|ed)?|fl(?:y|ies|ew)|driv(?:e|es)|drove|trek(?:s|ked)?|hik(?:e|es|ed)|(?:take|takes|took) (?:the|a) (?:train|bus|ferry|boat|coach|ship|carriage|barge|caravan|stagecoach))((?:\s+\w+){0,2})\s+(?:to|toward|towards|into|across|for)\s+(\S+(?:\s+\S+)?)/gi;

const LEAVE_FOR =
  /\b(?:sets? (?:out|off) for|leav(?:e|es|ing) for|left for|head(?:s|ed)? out for|make(?:s)? for|made for)\s+(\S+(?:\s+\S+)?)/gi;

const ON_THE_ROAD = /\bspen(?:d|ds|t) the (?:day|night|week|month|days|nights|weeks) on the road\b/i;

const TIME_SKIP_AT_START =
  /^(?:the next (?:morning|day|evening)|at dawn the next day|by (?:nightfall|evening|dawn|noon|midday|dusk)|(?:an hour|a few hours|several hours|hours|a day|two days|three days|a few days|several days|days|a week|two weeks|a few weeks|weeks|a month) later)\b/i;

function sentenceCrossesTravel(sentence: string, fromPlayer: boolean): boolean {
  if (NOT_A_CROSSING.test(sentence)) return false;
  void fromPlayer;
  if (TIME_SKIP_AT_START.test(sentence)) return true;
  if (ON_THE_ROAD.test(sentence)) return true;
  for (const m of sentence.matchAll(JOURNEY_VERB)) {
    if (isDestination(m[2])) return true;
  }
  for (const m of sentence.matchAll(LEAVE_FOR)) {
    if (isDestination(m[1])) return true;
  }
  return false;
}

/** The first completed travel or time-passing crossing in this turn's words, or null. */
export function travelCrossing(gmProse: string, playerLines: readonly string[]): string | null {
  for (const line of playerLines) {
    for (const s of sentencesOf(stripQuotes(line.replace(/^\s*>\s*/, "")))) {
      if (sentenceCrossesTravel(s, true)) return s;
    }
  }
  for (const s of sentencesOf(stripQuotes(gmProse))) {
    if (sentenceCrossesTravel(s, false)) return s;
  }
  return null;
}

/** 1-in-N for N = 8, 7, 6, 5, 4 at chaos 1-2, 3-4, 5, 6-7, 8-9. */
export function tripwireOdds(chaos: number): number {
  if (chaos <= 2) return 8;
  if (chaos <= 4) return 7;
  if (chaos === 5) return 6;
  if (chaos <= 7) return 5;
  return 4;
}

/** Player turns (user parts) from scene part index `fromIndex` to now. */
export function playerTurnsSince(story: StoryData, fromIndex: number): number {
  return (story.scene?.parts ?? []).slice(Math.max(0, fromIndex)).filter((p) => p.user).length;
}

function partsNow(story: StoryData): number {
  return story.scene?.parts?.length ?? 0;
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

/** Which line this turn crossed, first match winning, or null. Reads the story; changes nothing. */
export function crossingOf(input: TripwireInput): Tripwire | null {
  const ok = (name: string) => input.results.some((r) => r.success && r.toolName === name);
  if (ok("end_session")) return "session";
  if (ok("take_rest")) return "rest";
  if (travelCrossing(input.gmProse, input.playerLines)) return "travel";
  const a = input.story.agmtState;
  if (a) {
    // With neither stamp set there is no base to count from: no quiet run.
    const base =
      a.lastOracleTurn === undefined && a.lastQuietRunRoll === undefined
        ? null
        : Math.max(a.lastOracleTurn ?? 0, a.lastQuietRunRoll ?? 0);
    if (base !== null && playerTurnsSince(input.story, base) >= QUIET_RUN_TURNS) return "quiet_run";
  }
  return null;
}

export function evaluateTripwire(
  input: TripwireInput,
  rng: () => number = Math.random,
): TripwireOutcome {
  const a = input.story.agmtState;
  // Session zero (the start-game turn included) stamps the quiet-run base, so
  // the first played turn never rolls on a run that was only setup.
  if (input.sessionZero) {
    if (a) a.lastQuietRunRoll = partsNow(input.story);
    return { rolled: false, why: "session zero" };
  }
  // An old save, or a story that never consulted the oracle: this turn is the base.
  if (a && a.lastOracleTurn === undefined && a.lastQuietRunRoll === undefined) {
    a.lastQuietRunRoll = partsNow(input.story);
  }
  const tripwire = crossingOf(input);
  if (!tripwire) return { rolled: false, why: "no crossing" };
  const pending = input.story.pendingRandomEvents ?? [];
  if (input.resolvedThisTurn) return { rolled: false, tripwire, why: "an event was resolved this turn" };
  if (pending.some((e) => !input.eventsBefore.includes(e.id))) {
    return { rolled: false, tripwire, why: "an event was added this turn" };
  }
  if (pending.length > 0) return { rolled: false, tripwire, why: "an event is pending" };
  if (!a) return { rolled: false, tripwire, why: "no oracle state" };
  if (a.lastTripwireRoll !== undefined && playerTurnsSince(input.story, a.lastTripwireRoll) < TRIPWIRE_MIN_GAP) {
    return { rolled: false, tripwire, why: `a tripwire rolled within the last ${TRIPWIRE_MIN_GAP} player turns` };
  }
  const odds = tripwireOdds(a.chaosFactor ?? 5);
  const die = Math.min(odds, Math.floor(rng() * odds) + 1);
  return { rolled: true, tripwire, die, odds, hit: die === 1 };
}

/**
 * Records a rolled tripwire on the story: any roll stamps the 3-turn gap, a
 * quiet-run roll restarts its counter (hit or miss), and a hit queues a pending
 * event built like the scene check's (a focus, a meaning pair and a portent).
 * Mutates `story`.
 */
export function applyTripwireRoll(
  story: StoryData,
  outcome: Extract<TripwireOutcome, { rolled: true }>,
): PendingRandomEvent | null {
  if (story.agmtState) {
    story.agmtState.lastTripwireRoll = partsNow(story);
    if (outcome.tripwire === "quiet_run") story.agmtState.lastQuietRunRoll = partsNow(story);
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
