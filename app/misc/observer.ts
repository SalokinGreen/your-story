/**
 * Layer 5 hardening, active variant (see docs/five-layer-architecture-changelog.md
 * and docs/architecture-frontier.md's "adjudication" layer).
 *
 * checkNarrationConsistency (consistencyCheck.ts) is diagnostic-only: it runs
 * after narration has already streamed to the player and just records a
 * warning. This module is the judge counterpart - it reviews a completed GM
 * turn for violations of rules the GM was already given.
 *
 * EVERY JUDGE IS ON BY DEFAULT (decision 220, revising 187's flag-only
 * defaults; docs/judge-layer-design.md). The three that judge the prose
 * (REWRITABLE_FLAG_TYPES) rewrite a flagged turn automatically, the other three
 * flag. A rewrite never replaces text the player has seen: generateStoryTurn
 * holds the turn's output until the judging is done (decision 221,
 * heldTurnOutput.ts), and the background wave only flags. Nothing rerolls a
 * turn on its own. A "major"
 * flag can make generateStoryTurn (generation.ts) call rewriteFlaggedNarration
 * below: the GM is shown the exact narration it wrote and the specific reason
 * it was flagged, and rewrites just the prose - dice rolls/tool calls/state
 * changes are left untouched, since every rewritable complaint is about the
 * narration text alone. The rewrite is checked before it replaces anything
 * (validateRewriteResponse); if it fails, or is rejected, the turn is KEPT with
 * its flag. It is never answered by rolling StoryData back and rerolling the
 * dice. (The one full-turn retry left is tier_escalation_missed's, at a
 * heavier tier, reachable only by a config that sets its triggersReset
 * directly; Settings does not offer it.)
 *
 * Three things scope every check below:
 * - Deferral (plausibleResetFlagTypes): whether the player WAITS on any of
 *   this is decided per-turn, before a single call is made, from free
 *   deterministic signals - the word count, which tier the turn used and
 *   whether the engine ruled on a check. A turn where none of them could
 *   produce a reset-eligible flag hands control straight back to the player
 *   and gets judged in generateStoryTurn's background wave instead, which
 *   only flags. See that function's comment for why player_agency is
 *   deliberately not on the list (so it is never rewritten).
 * - Suspension (observerSuspensionReason): session zero - a brand-new story
 *   up to and including the turn that calls start_game - is never judged.
 *   Setup turns legitimately run long and legitimately propose character
 *   details, so every check there is a false positive waiting to happen.
 * - Character context (buildObserverCharacterContext /
 *   formatCharacterContextBlock): the judges are told who the player
 *   character is, what their sheet says, and which names are NPCs. Without
 *   it checkPlayerAgencyViolation was guessing at the single distinction its
 *   whole verdict rests on.
 *
 * Five checks (six flag types):
 *
 * Can be allowed to rewrite (REWRITABLE_FLAG_TYPES):
 * - checkResponseLength: the word-count trip itself is deterministic and
 *   free - catches a single turn blowing way past the Reply Length setting's
 *   ceiling. But "too long" isn't automatically a mistake - a session-zero
 *   opening dump, a big reveal, or a pivotal climax can legitimately need the
 *   room - so a trip doesn't flag on its own: it's followed by an LLM
 *   justification pass (a real call, so this check is not free) that reads the
 *   turn in context and decides whether the overage was earned. Only an
 *   unjustified overage becomes a flag; a judge that could not answer is
 *   "unknown" and says nothing.
 * - checkPlayerAgencyViolation: an LLM call that judges whether the GM took a
 *   decision away from the player (new meaningful dialogue, a significant
 *   choice, a decided feeling, a new action past the declared one). Narrating
 *   the character carrying out the declared action, in second person, is
 *   fine (decision 185).
 * - checkOutcomeMismatch: an LLM call that judges whether the finished
 *   narration contradicts the outcomes the engine decided this turn. The
 *   results are ground truth - the same "LLM proposes, deterministic engine
 *   disposes" thesis the whole app is built on, just checked directly. It is
 *   handed typed verdicts only (extractOutcomeVerdicts: action_roll and
 *   progress_roll tiers, recorded challenge results, and a calculate only when
 *   it held a comparison), each on its own line.
 *
 * Flag only by type (FLAG_ONLY_FLAG_TYPES; a rewrite cannot call a tool):
 * - checkToolUsageGaps: an LLM call that judges whether the turn invented an
 *   uncertain outcome instead of consulting fate_question/roll_table, or
 *   narrated a scene transition without calling increment_scene.
 * - checkTierEscalation: whether the turn's own stakes warranted a higher
 *   reasoning tier. Never rewritten either; see the note above on its retry.
 *
 * All LLM-backed checks go through callSideModel() (sideModelCall.ts), the
 * same as reflection.ts's callReflectionApi - non-streaming, caller-supplied
 * model, fails open (no flag) on any API error. A cancelled call is the
 * exception: its AbortError (the player's Stop) passes through every judge
 * (isAbortError) instead of being read as "nothing to say". Regex can't
 * reliably judge any of these; they need actual reading comprehension.
 *
 * Configuration: each of the six ObserverFlagTypes has its own independent
 * { enabled, triggersReset, sensitivity } (see ObserverCheckSettings).
 * `enabled` skips the check entirely; `triggersReset` gates whether a "major"
 * instance of that type is ever allowed to correct the turn (Settings shows
 * the pair as Off / Flag / Rewrite automatically); `sensitivity` (0-10)
 * scales how readily each check fires - the overage multiplier for
 * checkResponseLength, a strictness instruction for every LLM-backed check,
 * and (for the two tool-usage-gap checks specifically, which have no severity
 * gradient of their own) whether a hit is reported as "minor" or "major" in
 * the first place. DEFAULT_OBSERVER_SETTINGS is the flag-only table of
 * decision 187, frozen; a stored config that predates it is replaced once
 * (layerSettings.ts, OBSERVER_SETTINGS_VERSION).
 */

import {
  ObserverFlag,
  ObserverFlagType,
  GMConversationMessage,
  StoryData,
} from "./structs";
import { ReplyLength, getLengthGuidance } from "./ai_staged";
import { ChatMessage } from "./chatMessage";
import { PACING_BANDS, countNarrationWords } from "./pacingFeedback";
import { parseTaggedContent, extractVisibleText } from "./turnTimeline";
import { deAiifyText } from "./deAiify";
import { logger } from "./logger";
import { SideCallCostContext } from "./turnCost";
import { callSideModel, ProviderKeys } from "./sideModelCall";
import { getEffectiveTiers, ReasoningTier, TOP_TIER } from "./reasoningTiers";

// ============================================================
// PER-FLAG-TYPE CONFIGURATION
// ============================================================
// Read and written by Settings (ArchitectureSettingsTab.tsx, through
// layerSettings.ts) and threaded through GenerationOptions. Each
// ObserverFlagType gets its own independent { enabled, triggersReset,
// sensitivity } - "which judges run, which may correct the turn, and how
// sensitive each one is."

export interface ObserverCheckSettings {
  /** Skip this check entirely (no API call for LLM-backed checks). */
  enabled: boolean;
  /**
   * Whether a "major"-severity instance of this flag type is allowed to
   * trigger generateStoryTurn's reset-and-retry. Independent of `enabled` -
   * a check can stay on (still logged/surfaced to the player) while never
   * being allowed to reset. Independent of severity, too: player_agency and
   * the tool-usage-gap checks decide "major" vs "minor" per-instance (see
   * `sensitivity` below); this only gates whether a "major" verdict is
   * ever acted on.
   */
  triggersReset: boolean;
  /**
   * 0-10, default 5. Meaning depends on the check:
   * - checkResponseLength: scales the single-turn overage multiplier
   *   (higher sensitivity = fires on a smaller overage).
   * - LLM-backed checks: becomes a strictness instruction in the judge
   *   prompt (lenient/balanced/strict), biasing how readily it flags a
   *   violation at all.
   * - checkToolUsageGaps specifically: also raises severity to "major"
   *   (making it reset-eligible if triggersReset is also on) once
   *   sensitivity crosses TOOL_USAGE_MAJOR_SENSITIVITY_THRESHOLD - these
   *   two checks otherwise have no natural major/minor gradient of their
   *   own the way player_agency/outcome_narration_mismatch do.
   */
  sensitivity: number;
}

export type ObserverSettings = Record<ObserverFlagType, ObserverCheckSettings>;

/**
 * The stored-settings version the current defaults belong to. A stored config
 * overrides the defaults, so a change of defaults would never reach a player
 * who had saved one. layerSettings.ts replaces a stored config that lacks this
 * version, once, and keeps the player's choices after. Version 2 was the
 * flag-only defaults (decision 187); version 3 turns every judge back on
 * (decision 220).
 */
export const OBSERVER_SETTINGS_VERSION = 3;

function frozenCheckSettings(
  enabled: boolean,
  sensitivity: number,
  rewrite = false,
): Readonly<ObserverCheckSettings> {
  return Object.freeze({ enabled, triggersReset: rewrite, sensitivity });
}

/**
 * Decision 220 (revising 187's "flag only"): every judge is on. The three
 * prose judges (REWRITABLE_FLAG_TYPES) rewrite a flagged turn automatically,
 * the "Rewrite automatically" choice Settings offers, through the checked
 * rewrite path decisions 187-189 built: a rewrite is validated before it
 * replaces anything, a failed one keeps the turn with its flag, nothing is
 * rerolled, and the turn carries "Undo revision". The other three only flag:
 * the two tool-usage gaps are flag-only by type, and tier_escalation_missed's
 * heavier-tier retry stays off. Settings can turn each one off or down.
 *
 * Frozen, and every reader gets a copy (settingsFor, layerSettings.ts): the
 * first edit in Settings used to assign into this very object, so the
 * "defaults" changed for the rest of the session and Reset handed the changed
 * ones back (Codex review finding 9).
 */
export const DEFAULT_OBSERVER_SETTINGS: Readonly<ObserverSettings> =
  Object.freeze({
    response_length: frozenCheckSettings(true, 5, true),
    player_agency: frozenCheckSettings(true, 3, true),
    outcome_narration_mismatch: frozenCheckSettings(true, 2, true),
    missing_oracle_or_table: frozenCheckSettings(true, 5),
    missing_scene_increment: frozenCheckSettings(true, 5),
    tier_escalation_missed: frozenCheckSettings(true, 5),
  });

/**
 * What a check function runs with when it is called directly with no settings:
 * on, at balanced sensitivity. Whether a check runs at all is decided by the
 * app's configuration (DEFAULT_OBSERVER_SETTINGS, the player's stored choices)
 * before a check is called - runObserver passes settingsFor(...) to every one -
 * so a function's own fallback is "do the check you were asked to do", not
 * "consult the app's defaults a second time".
 */
const CHECK_RUNS_BALANCED: Readonly<ObserverCheckSettings> = Object.freeze({
  enabled: true,
  triggersReset: false,
  sensitivity: 5,
});

/** A fresh, mutable copy of the defaults - what every reader of them gets. */
export function cloneDefaultObserverSettings(): ObserverSettings {
  const copy = {} as ObserverSettings;
  for (const type of Object.keys(
    DEFAULT_OBSERVER_SETTINGS,
  ) as ObserverFlagType[]) {
    copy[type] = { ...DEFAULT_OBSERVER_SETTINGS[type] };
  }
  return copy;
}

/**
 * Judges whose finding is about a tool that did not run, not about the words.
 * A rewrite cannot call increment_scene or consult an oracle, so these are
 * flag-only by type (Codex finding 4): the prose is never rewritten for them
 * and they are never recorded as "corrected". Their "reset" toggle is gone
 * from Settings, and settingsFor reports them as unable to reset whatever a
 * stored config says.
 */
export const FLAG_ONLY_FLAG_TYPES: ReadonlySet<ObserverFlagType> = new Set([
  "missing_oracle_or_table",
  "missing_scene_increment",
]);

/**
 * The flag types whose correction is a rewrite of the prose: the complaint is
 * about the text and a new text can answer it. tier_escalation_missed is not
 * one (its only fix was a heavier-tier retry; a prose rewrite adds no
 * brainpower), and neither are the two tool-usage gaps.
 */
export const REWRITABLE_FLAG_TYPES: ReadonlySet<ObserverFlagType> = new Set([
  "response_length",
  "player_agency",
  "outcome_narration_mismatch",
]);

/** What Settings shows per judge: off, a flag in the turn's details, or an automatic rewrite. */
export type ObserverMode = "off" | "flag" | "rewrite";

export function observerModeOf(settings: ObserverCheckSettings): ObserverMode {
  if (!settings.enabled) return "off";
  return settings.triggersReset ? "rewrite" : "flag";
}

export function observerModePatch(
  mode: ObserverMode,
): Partial<ObserverCheckSettings> {
  if (mode === "off") return { enabled: false, triggersReset: false };
  return { enabled: true, triggersReset: mode === "rewrite" };
}

/**
 * Settings for one flag type, falling back to its default for any field a
 * partial/future config omits. Always a copy, so a caller can never write
 * through to DEFAULT_OBSERVER_SETTINGS; a flag-only type reads as unable to
 * reset whatever was stored.
 */
export function settingsFor(
  settings: ObserverSettings | undefined,
  type: ObserverFlagType,
): ObserverCheckSettings {
  const merged: ObserverCheckSettings = {
    ...DEFAULT_OBSERVER_SETTINGS[type],
    ...settings?.[type],
  };
  if (FLAG_ONLY_FLAG_TYPES.has(type)) merged.triggersReset = false;
  return merged;
}

/**
 * True if the current config makes an automatic reset-and-retry (see
 * runObserver/generateStoryTurn) possible at all - i.e. at least one flag
 * type is both enabled and allowed to trigger a reset. Mirrors the gate
 * generateStoryTurn actually applies (`majorFlag` + `settingsFor(...).
 * triggersReset`), so the UI can warn the player a turn might get reset
 * only when that's actually true, and stay silent when every check is off
 * or none of them can reset.
 */
export function canObserverTriggerReset(
  settings: ObserverSettings | undefined,
): boolean {
  return (Object.keys(DEFAULT_OBSERVER_SETTINGS) as ObserverFlagType[]).some(
    (type) => {
      const s = settingsFor(settings, type);
      return s.enabled && s.triggersReset;
    },
  );
}

/**
 * Which flag types could plausibly produce a reset-eligible "major" flag for
 * THIS turn, judged only from signals that are free and deterministic - the
 * word count, which tools ran, which comparisons resolved, what tier the turn
 * used. No API call, no reading comprehension, no guessing.
 *
 * canObserverTriggerReset above answers "can a rewrite ever happen with this
 * config", which is true by default and therefore true on nearly every turn.
 * That made the observer block the player behind a full round of judge calls
 * on every single turn, including the overwhelming majority where no check
 * could have fired in the first place: a turn inside the length ceiling, with
 * no comparisons to contradict, already at the top tier, that used the oracle.
 * This answers the narrower and much more useful question - "could a rewrite
 * happen HERE" - so generateStoryTurn can hand control straight back to the
 * player and run the observer in the background whenever the answer is no.
 *
 * player_agency has no free pre-signal: telling "the GM decided what the
 * player character does" apart from "the GM narrated an NPC" needs the judge.
 * Decision 237 ("Check before release"): with the text held until it is
 * checked, the agency judge could otherwise only rewrite when another judge
 * made the turn blocking, so it counts as plausible on every turn with a
 * non-empty player line while it is enabled and rewriting. The cost is about
 * one cheap call and a second of wait per turn.
 *
 * Erring toward NOT listing a type is safe: a missed one still gets judged in
 * the background wave, as a flag. What is lost is the automatic rewrite.
 */
export function plausibleResetFlagTypes(params: {
  narration: string;
  replyLength?: ReplyLength;
  /** This turn's typed outcome verdicts (extractOutcomeVerdicts). */
  rollResults?: RollOutcomeForCheck[];
  /** Kept for callers; the tool-usage gaps are flag-only now and no longer gate on it. */
  toolNames?: string[];
  tierUsed?: number;
  /**
   * Whether this turn carried a deterministic high-stakes marker - active
   * combat, an active challenge, or a high/deadly-stakes roll declared this
   * scene. reasoningTiers.ts's isSceneGatedForRoll is exactly this predicate
   * and is what callers should pass. See the tier_escalation_missed branch
   * below for why it gates that check specifically.
   */
  highStakes?: boolean;
  /** The player's line this turn; player_agency is plausible when it is non-empty (decision 237). */
  playerChoice?: string;
  settings?: ObserverSettings;
}): ObserverFlagType[] {
  const { narration, rollResults = [], tierUsed } = params;
  if (!narration.trim()) return [];

  const types: ObserverFlagType[] = [];
  const canReset = (type: ObserverFlagType): boolean => {
    const s = settingsFor(params.settings, type);
    return s.enabled && s.triggersReset;
  };

  // Free and exact: this is the same word count checkResponseLength runs, and
  // if it doesn't trip there is no length flag for the judge to justify.
  if (
    canReset("response_length") &&
    prospectiveLengthFlag(
      narration,
      params.replyLength,
      settingsFor(params.settings, "response_length"),
    )
  ) {
    types.push("response_length");
  }

  // checkOutcomeMismatch returns null without a call when the engine made no
  // ruling this turn (extractOutcomeVerdicts), which is decided from the
  // typed verdicts alone, so it can be decided here too.
  if (
    canReset("outcome_narration_mismatch") &&
    rollResults.some((r) => OUTCOME_CHECK_TOOL_NAMES.has(r.toolName))
  ) {
    types.push("outcome_narration_mismatch");
  }

  if (canReset("player_agency") && (params.playerChoice ?? "").trim()) {
    types.push("player_agency");
  }

  // The two tool-usage gaps (missing_oracle_or_table, missing_scene_increment)
  // are flag-only by type: nothing a rewrite does fixes a tool that did not
  // run, so they can never reset (settingsFor) and never make a player wait.

  // Two conditions, and the second is the interesting one.
  //
  // "Below the top tier" is only checkTierEscalation's own precondition (it
  // bails before making its call at TOP_TIER) - and with a baseline of
  // SCENE_BASELINE_TIER and a top of TOP_TIER, it is true on the great
  // majority of turns. On its own it would make this type permanently
  // plausible, which is the always-block behavior this whole function exists
  // to end.
  //
  // So it is also gated on the turn carrying a real stakes marker. This is
  // the one check whose correction is a FULL-TURN reset rather than a
  // rewrite - the turn is re-run at a higher tier and the dice come out
  // differently - which is both the most expensive correction in the system
  // and the only one the background pass can't perform (it can't roll a turn
  // back underneath a player who has already read it). Spending that on
  // banter and NPC chatter, where a shallower adjudication costs nothing, is
  // a bad trade; spending it on a combat round or a deadly-stakes check,
  // where it costs the fiction, is the trade it was designed for. Ordinary
  // turns therefore get judged in the background and their flag stays
  // advisory - the GM still hears about it next turn via
  // buildObserverWarningNote and can self-escalate.
  if (
    canReset("tier_escalation_missed") &&
    tierUsed !== undefined &&
    tierUsed < TOP_TIER &&
    params.highStakes === true
  ) {
    types.push("tier_escalation_missed");
  }

  return types;
}

/**
 * Splits a config between the pass the player waits on and the background
 * wave, so each enabled judge runs once per turn. `blocking` keeps only the
 * judges that are enabled AND allowed to rewrite; `background` is everything
 * else. When no blocking pass runs, the background keeps the whole config (it
 * flags only, whatever a judge's reset setting).
 */
export function splitObserverSettings(
  settings: ObserverSettings | undefined,
  blockingRuns: boolean,
  /** When given, only these types count as blocking (a pause runs the prose judges alone). */
  blockingTypes?: ReadonlySet<ObserverFlagType>,
): { blocking: ObserverSettings; background: ObserverSettings } {
  const blocking = {} as ObserverSettings;
  const background = {} as ObserverSettings;
  for (const type of Object.keys(
    DEFAULT_OBSERVER_SETTINGS,
  ) as ObserverFlagType[]) {
    const s = settingsFor(settings, type);
    const rewriting =
      s.enabled && s.triggersReset && (!blockingTypes || blockingTypes.has(type));
    blocking[type] = rewriting ? s : { ...s, enabled: false };
    background[type] =
      blockingRuns && rewriting ? { ...s, enabled: false } : s;
  }
  return { blocking, background };
}

/**
 * A copy of a config with only the judges `keep` accepts left on, each as the
 * player set it. Used for the flag-only passes over text a blocking pass did not
 * read (a paused turn's whole length, a stretch released unjudged).
 */
export function restrictObserverSettings(
  settings: ObserverSettings | undefined,
  keep: (type: ObserverFlagType) => boolean,
): ObserverSettings {
  const out = {} as ObserverSettings;
  for (const type of Object.keys(
    DEFAULT_OBSERVER_SETTINGS,
  ) as ObserverFlagType[]) {
    const s = settingsFor(settings, type);
    out[type] = keep(type) ? s : { ...s, enabled: false };
  }
  return out;
}

function clampSensitivity(sensitivity: number): number {
  return Math.max(0, Math.min(10, sensitivity));
}

// A single turn has to run at least this multiple of the trailing-average
// "high" band before it's flagged as a standalone blowout, not just a
// legitimately long climax beat. Sensitivity 5 (default) reproduces the
// original fixed 2x; 0 is the most lenient (3x), 10 the strictest (1x).
function overageMultiplierForSensitivity(sensitivity: number): number {
  return 3 - (clampSensitivity(sensitivity) / 10) * 2;
}

/** Strictness instruction appended to an LLM-judged check's system prompt. */
function sensitivityInstruction(sensitivity: number): string {
  const s = clampSensitivity(sensitivity);
  if (s <= 2) {
    return "Sensitivity: VERY LENIENT - only flag flagrant, unambiguous violations. Give the benefit of the doubt on anything borderline.";
  }
  if (s <= 4) {
    return "Sensitivity: LENIENT - only flag clear violations. Let ambiguous or borderline cases pass.";
  }
  if (s <= 6) {
    return "Sensitivity: BALANCED - flag clear violations and reasonably confident borderline cases.";
  }
  if (s <= 8) {
    return "Sensitivity: STRICT - flag violations readily, including many borderline or ambiguous cases.";
  }
  return "Sensitivity: VERY STRICT - flag anything that could plausibly be read as a violation, even if ambiguous.";
}

// checkToolUsageGaps has no natural major/minor gradient of its own (unlike
// player_agency's LLM-decided severity, or outcome_narration_mismatch's
// always-major nature) - past this sensitivity, a hit is reported as
// "major" instead of "minor", making it eligible to reset if the type's
// triggersReset is also on.
const TOOL_USAGE_MAJOR_SENSITIVITY_THRESHOLD = 8;

// ============================================================
// WHO IS WHO (character context for the judges)
// ============================================================
// Every LLM-backed check here used to see exactly two things: the player's
// declared action and the narration. That's not enough to judge the one rule
// that matters most - checkPlayerAgencyViolation cannot tell the player
// character apart from an NPC without being told who the player character
// IS, so it flagged NPC dialogue as "the GM spoke for the player" and waved
// through real violations as "that was just a character talking". This block
// is the missing half of that prompt: the PC's name/aliases, their sheet (so
// the judge can recognise them by trait/title as well as by name), and the
// known NPC names the GM legitimately controls.

export interface ObserverCharacterContext {
  /** The player character's name (StoryData.player_name). */
  playerName?: string;
  /** One-line character summary (StoryData.player_summary). */
  playerSummary?: string;
  /** The character_sheet lore note(s), truncated - traits/bonds/flaws the judge should recognise as the PC's. */
  characterSheet?: string;
  /** Extra names that also refer to a player character (couch co-op players). */
  playerAliases?: string[];
  /** Names the GM legitimately speaks and acts for - everyone who is NOT the player character. */
  npcNames?: string[];
  /**
   * The mechanics-type lore note(s), truncated - this adventure's own dice
   * system, as improvised by the GM (see the "GM is tool-calling, not a fixed
   * dice system" design). Without it the judges fall back on generic
   * pass/fail d20 intuition, which is what made checkOutcomeMismatch flag a
   * correctly-narrated Starforged weak hit: nothing in its prompt defined a
   * weak hit, so "beat one challenge die but not the other" could only read
   * as a failed roll narrated as a success. Handed to the judges that rule on
   * rules - the outcome-mismatch check and the tool-usage-gap check (a system
   * with its own built-in oracle shouldn't be scolded for not calling
   * fate_question).
   */
  mechanicsNote?: string;
}

const CHARACTER_SHEET_CONTEXT_LIMIT = 1500;

/**
 * Cap on the mechanics note handed to the judges. Larger than the character
 * sheet's: a mechanics note carries the resolution rules, outcome tiers, and
 * roll formulas, and a system whose weak-hit definition got truncated away is
 * exactly the failure this context was added to fix. Kept from the START,
 * since these notes lead with the core resolution rules.
 */
const MECHANICS_CONTEXT_LIMIT = 2500;

/**
 * Cap on the original narration's reasoning when it's pasted into the rewrite
 * prompt (see RewriteNarrationParams.narrationThoughts). A reasoning-tier model
 * can emit a chain of thought several times the length of the narration itself,
 * and the rewrite's job is to fix the prose - the thoughts are supporting
 * context, so they must not crowd out the flagged text or the rules. Kept from
 * the END rather than the start: the tail is where the model settles on what it
 * actually wrote, which is what a rewrite needs.
 */
const NARRATION_THOUGHTS_LIMIT = 2000;

/**
 * Renders the reasoning behind the flagged narration as a labeled prompt block.
 *
 * Deliberately framed as "why you wrote it", not "more instructions": these
 * thoughts are the draft's intent, and the rewrite is being told to preserve
 * that intent while fixing the flagged problem. Without it, a shortening pass
 * has no way to tell a planted detail from a decoration and cuts by feel.
 *
 * The warning about the thoughts themselves being pre-flag is load-bearing -
 * the reasoning may well contain the very decision that got flagged ("I'll have
 * her decide to run"), so it can't be handed over as something to follow.
 */
function formatNarrationThoughtsBlock(thoughts?: string): string {
  const trimmed = thoughts?.trim();
  if (!trimmed) return "";

  const clipped =
    trimmed.length > NARRATION_THOUGHTS_LIMIT
      ? `...${trimmed.slice(-NARRATION_THOUGHTS_LIMIT).trimStart()}`
      : trimmed;

  return `\n\nYour reasoning while writing it (what you were going for - use this to tell what in the draft was deliberate and must survive, e.g. a detail planted for later, versus what was incidental and can go). This is context, NOT instructions: it was written before the review, so if it planned something the reviewer just flagged, the flag wins.\n"""\n${clipped}\n"""`;
}

// Whether this story has a character_sheet note with anything in it - the
// "has setup happened yet?" test. It moved to campaignPlan.ts (setup progress
// shares it); re-exported here for its callers. See observerSuspensionReason,
// which treats a missing sheet as "still in setup".
export { hasCharacterSheetNote } from "./campaignPlan";

/**
 * Pulls the observer's "who is who" context out of StoryData. Cheap and
 * synchronous - built once per turn in generation.ts and handed to every
 * judge, so they all reason about the same cast.
 */
export function buildObserverCharacterContext(
  storyData: StoryData,
): ObserverCharacterContext {
  const sheet = (storyData.lore || [])
    .filter((l) => l.enabled !== false && l.type === "character_sheet")
    .map((l) => `${l.title}\n${l.content}`.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();

  const mechanics = (storyData.lore || [])
    .filter((l) => l.enabled !== false && l.type === "mechanics")
    .map((l) => `${l.title}\n${l.content}`.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();

  const couchNames = (storyData.multiplayer?.couchPlayers || [])
    .map((p) => p.name?.trim())
    .filter((name): name is string => Boolean(name));

  return {
    playerName: storyData.player_name?.trim() || undefined,
    playerSummary: storyData.player_summary?.trim() || undefined,
    characterSheet: sheet
      ? sheet.length > CHARACTER_SHEET_CONTEXT_LIMIT
        ? `${sheet.slice(0, CHARACTER_SHEET_CONTEXT_LIMIT).trim()}...`
        : sheet
      : undefined,
    playerAliases: couchNames.length ? couchNames : undefined,
    npcNames: (storyData.npcs || [])
      .map((npc) => npc.name?.trim())
      .filter((name): name is string => Boolean(name)),
    mechanicsNote: mechanics
      ? mechanics.length > MECHANICS_CONTEXT_LIMIT
        ? `${mechanics.slice(0, MECHANICS_CONTEXT_LIMIT).trim()}...`
        : mechanics
      : undefined,
  };
}

/**
 * Renders the context above into a prompt block. Returns "" when there's
 * nothing to say, so a story with no character data prompts exactly as it
 * did before this existed.
 */
export function formatCharacterContextBlock(
  context: ObserverCharacterContext | undefined,
): string {
  if (!context) return "";

  const lines: string[] = [];
  const names = [
    ...(context.playerName ? [context.playerName] : []),
    ...(context.playerAliases || []),
  ].filter((name, i, all) => all.indexOf(name) === i);

  if (names.length === 1) {
    lines.push(
      `- The PLAYER CHARACTER is **${names[0]}**${
        context.playerSummary ? ` - ${context.playerSummary}` : ""
      }. Second-person narration ("you") also refers to this character.`,
    );
  } else if (names.length > 1) {
    lines.push(
      `- The PLAYER CHARACTERS are ${names
        .map((n) => `**${n}**`)
        .join(", ")}. Second-person narration ("you") refers to them.`,
    );
  } else if (context.playerSummary) {
    lines.push(
      `- The PLAYER CHARACTER (unnamed) is: ${context.playerSummary}. Second-person narration ("you") refers to this character.`,
    );
  }

  if (context.npcNames?.length) {
    lines.push(
      `- These are NPCs the GM legitimately controls, speaks for, and acts for - dialogue or actions from them are NOT a violation: ${context.npcNames.join(
        ", ",
      )}.`,
    );
  }

  if (lines.length === 0 && !context.characterSheet) return "";

  const sheetBlock = context.characterSheet
    ? `\n\nThe player character's sheet (traits, bonds, flaws - these belong to the player, and the GM may reference them but may not decide how the character acts on them):\n"""\n${context.characterSheet}\n"""`
    : "";

  return `\n\nWHO IS WHO (use this to tell the player character apart from NPCs):\n${lines.join(
    "\n",
  )}${sheetBlock}`;
}

/**
 * Renders the adventure's own mechanics note for a judge that has to rule on
 * whether the GM applied the rules correctly.
 *
 * Deliberately separate from formatCharacterContextBlock rather than folded
 * into it: that block is "WHO IS WHO", it answers a casting question, and it
 * goes to the agency judge and the rewrite, neither of which has any business
 * reasoning about dice. This block answers a rules question and goes only to
 * the judges that ask one.
 *
 * The "these rules, not generic pass/fail" framing is the load-bearing part.
 * There is no fixed dice system in this app - every adventure improvises one
 * in this note - so a judge given the narration and a bare TRUE/FALSE has no
 * choice but to substitute its own d20 assumptions, and will call any outcome
 * tier those assumptions don't have (a weak hit, a partial, a success-at-a-
 * cost) a contradiction.
 */
export function formatMechanicsBlock(
  context: ObserverCharacterContext | undefined,
): string {
  const mechanics = context?.mechanicsNote?.trim();
  if (!mechanics) return "";

  return `\n\nTHIS ADVENTURE'S RULES (the dice system actually in play - judge against THESE, not against generic pass/fail assumptions from other games). Note especially any outcome tiers it defines between total success and total failure - partial successes, mixed results, successes at a cost - and treat narration matching one of those tiers as correct:\n"""\n${mechanics}\n"""`;
}

/**
 * Renders the GM's own reasoning for a JUDGE, as opposed to
 * formatNarrationThoughtsBlock which renders it for the REWRITE. The two want
 * opposite things from the same text and so cannot share a formatter: the
 * rewrite is told "this is what you were going for, preserve it", while a
 * judge must be told the reasoning is testimony, not evidence.
 *
 * The reason this is worth handing over at all: when a GM correctly resolves a
 * multi-comparison outcome, the reasoning is usually where the rules
 * interpretation lives ("beat one die, not both - that's a weak hit, so she
 * gets through but the alarm trips"), and a judge that can read it stops
 * mistaking a correct partial for a reversal.
 *
 * The risk it cuts against - a judge that reads a rationalization and nods
 * along - is why the framing here is explicitly subordinate to the numbers.
 * A GM that talks itself into an outcome the comparisons don't support is
 * still a mismatch, and the prompt says so.
 */
function formatJudgeReasoningBlock(thoughts?: string): string {
  const trimmed = thoughts?.trim();
  if (!trimmed) return "";

  const clipped =
    trimmed.length > NARRATION_THOUGHTS_LIMIT
      ? `...${trimmed.slice(-NARRATION_THOUGHTS_LIMIT).trimStart()}`
      : trimmed;

  return `\n\nThe GM's own reasoning while writing that narration, for context on how it read the rules:\n"""\n${clipped}\n"""\nWeigh this as the GM's ACCOUNT of its ruling, not as proof the ruling was right. If it explains the outcome correctly under this adventure's rules, that counts against a mismatch. If it rationalizes an outcome the mechanical results above do not support, that is still a mismatch - the numbers outrank the explanation.`;
}

// ============================================================
// SUSPENSION (turns the observer must not judge)
// ============================================================

/**
 * Why the observer should sit this turn out entirely, or null if it should
 * run normally. Setup is not play: while the GM is interviewing the player,
 * writing the character sheet/mechanics/campaign plan, and narrating an
 * opening, it legitimately needs far more room than any reply-length band
 * allows and legitimately proposes things about the player character.
 * Judging that produces nothing but false positives - a length flag on a
 * setup dump, an agency flag on a character concept - and the correction it
 * triggers damages the one turn the whole campaign is built on.
 *
 * Three signals, because no single one covers every way a story starts:
 * - `sessionZeroActive` (StoryData) - set by the guided freeform flow, true
 *   until the GM calls start_game.
 * - a `start_game` call this turn - the flag flips false the moment the tool
 *   executes, mid-turn, so without this the wrap-up turn would be the one
 *   turn of session zero that DID get judged.
 * - no character_sheet note yet (`hasCharacterSheet: false`) - the same
 *   condition buildGMStagePrompt uses for its "FRESH STORY - SETUP NEEDED"
 *   block. This is what covers stories started from an adventure
 *   (startAdventureLocally never sets sessionZeroActive) and any older save:
 *   if the GM's own prompt still considers this setup, the observer has no
 *   business grading it.
 */
export function observerSuspensionReason(params: {
  sessionZeroActive?: boolean;
  toolNames?: string[];
  hasCharacterSheet?: boolean;
}): string | null {
  if (params.sessionZeroActive) {
    return "session zero is still active (the GM hasn't called start_game yet)";
  }
  if ((params.toolNames || []).includes("start_game")) {
    return "this turn called start_game (the session-zero wrap-up turn)";
  }
  if (params.hasCharacterSheet === false) {
    return "this story has no character sheet yet (still in setup/character creation)";
  }
  return null;
}

/**
 * The deterministic half of checkResponseLength: the word count, the ceiling
 * math, and the exact flag the check WOULD produce if the justification judge
 * came back "unjustified". Pure, free, and synchronous - it makes no API call
 * and reads nothing but the narration and the settings.
 *
 * Split out because the flag's text depends only on the counter, never on the
 * judge, so generation.ts can know what a length flag would say before the
 * judge has been asked. That's what lets it start the shortened rewrite
 * speculatively, concurrently with the judge, instead of waiting for a verdict
 * it can already describe (see generateStoryTurn's speculative rewrite).
 *
 * Returns null when the check is off, the narration is empty, or the turn came
 * in under the ceiling - i.e. exactly when checkResponseLength returns null
 * without spending a call.
 */
export function prospectiveLengthFlag(
  narration: string,
  replyLength: ReplyLength = "medium",
  settings: ObserverCheckSettings = CHECK_RUNS_BALANCED,
): ObserverFlag | null {
  if (!settings.enabled) return null;

  const words = countNarrationWords(narration);
  if (words === 0) return null;

  const band = PACING_BANDS[replyLength] ?? PACING_BANDS.medium;
  const ceiling = band.high * overageMultiplierForSensitivity(settings.sensitivity);
  if (words <= ceiling) return null;

  return {
    type: "response_length",
    severity: "major",
    detail: `This turn ran ${words} words, well past the "${replyLength}" reply-length setting's usual ceiling (~${band.high} words).`,
    correctivePrompt: `Your previous attempt at this turn was reset because it was far too long for the "${replyLength}" reply-length setting (${words} words, vs. a usual ceiling of ~${band.high}). Here is what you wrote last time, so you can see what to cut:\n"""\n${narration.trim()}\n"""\nRewrite this turn much shorter - state the outcome and stop, per the LENGTH & PACING rules you were already given.`,
  };
}

export async function checkResponseLength(
  narration: string,
  playerChoice: string = "",
  replyLength: ReplyLength = "medium",
  apiOptions?: ObserverApiOptions,
  settings: ObserverCheckSettings = CHECK_RUNS_BALANCED,
  characterContext?: ObserverCharacterContext,
  gmStoryContext?: string,
): Promise<ObserverFlag | null> {
  const flag = prospectiveLengthFlag(narration, replyLength, settings);
  if (!flag) return null;

  const band = PACING_BANDS[replyLength] ?? PACING_BANDS.medium;
  const words = countNarrationWords(narration);

  // Give the GM a chance to justify the overage before treating it as a
  // mistake. With no apiOptions there is no judge to ask, and the word count
  // stands alone. When the judge was asked and could not answer (the call
  // failed, or its JSON would not parse) the answer is UNKNOWN, and an
  // unknown is no flag: it used to keep the major length flag, and a failed
  // rewrite after it rolled the whole turn back and re-rolled its dice because
  // the prose was long (finding 8).
  if (apiOptions) {
    const judgment = await callLengthJustificationApi(
      narration,
      playerChoice,
      replyLength,
      words,
      band.high,
      apiOptions,
      settings.sensitivity,
      characterContext,
      gmStoryContext,
    );
    if (!judgment || judgment.justified) return null;
  }

  return flag;
}

export interface RewriteNarrationParams {
  /** The exact narration text that was flagged - the GM rewrites this, not a fresh attempt. */
  narration: string;
  playerChoice: string;
  /** The turn's already-executed tool/roll results (GMToolResult context strings, joined) - ground truth, unaffected by any check that can trigger a reset. */
  gmStoryContext?: string;
  flag: ObserverFlag;
  replyLength?: ReplyLength;
  storytellerMode?: "narrator" | "dm";
  /** Who the player character is (and who the NPCs are) - the rewrite has to keep the same cast straight the judge did. */
  characterContext?: ObserverCharacterContext;
  /**
   * The reasoning/chain-of-thought the model produced while writing the
   * flagged narration (ScenePart.reasoning, or the reasoning attached to the
   * GM's terminal assistant message). Rendered into the prompt as plain text
   * rather than relied on as a message field, because sanitizeMessages
   * (providerCall.ts) only forwards `reasoning`/`reasoning_details` to
   * OpenRouter and Google - on DeepSeek, Mistral, and DeepInfra they are
   * stripped before the request goes out, so a rewrite continuing the turn's
   * own conversation would still see the prose with no idea what it was for.
   *
   * This is what tells the rewrite which parts of the draft were load-bearing:
   * a shortening pass that can see "the merchant's tell is the setup for the
   * ambush two beats from now" cuts the scenery instead of the plant.
   */
  narrationThoughts?: string;
  /**
   * The exact conversation that produced this turn (GM system prompt + game
   * state + scene history + this turn's tool calls and results, ending with
   * the narration turn itself - see GenerationResult.gmPromptMessages). When
   * present the rewrite CONTINUES
   * that conversation instead of being prompted from scratch, which is the
   * difference between "rewrite this paragraph" and "write a paragraph about
   * something, good luck". Omitted only when a caller has no conversation to
   * hand over, in which case the old standalone prompt is used.
   */
  conversationMessages?: ChatMessage[];
  /**
   * Other reset-eligible checks whose verdicts aren't in yet, to be fixed
   * conditionally ("if it's also true of this narration") alongside the flag
   * that actually triggered the rewrite. See ALSO_FIX_CLAUSES - only the
   * text-based checks have a clause, since a rewrite can't fix a missing tool
   * call or too low a reasoning tier.
   *
   * This exists for the speculative rewrite (generation.ts): it starts before
   * the observer has finished, so it knows what the OTHER checks are looking
   * for but not yet whether any of them fired. Rather than waste the one
   * rewrite the turn gets on the length problem alone and leave a second
   * violation standing, it asks for both in the same pass. Purely additive -
   * an empty/omitted list produces exactly the prompt it always did.
   */
  alsoFixIfPresent?: ObserverFlagType[];
  /** Swap the AI vocabulary tics in the result, like the story stage does (default on). */
  deAiifyWords?: boolean;
  /**
   * Prose the player has already read (released at a pause, decision 240). It is
   * final: `narration` is only the continuation after it, and the rewrite is
   * told so and asked for a continuation-sized answer, not a whole turn.
   */
  alreadyRead?: string;
  /** `narration` ends where the turn pauses on the player (a question, a roll, a dice tray). */
  endsAtPause?: boolean;
  apiOptions: ObserverApiOptions;
}

/**
 * The "while you're in there" clause for each check that a prose rewrite could
 * plausibly fix. Deliberately conditional and self-limiting: the rewrite is
 * being told what the other reviewers look for, not that they found anything,
 * so every clause has to be safe to hand to a narration that has no such
 * problem. Confidently "fixing" a violation that isn't there is worse than
 * leaving a real one for the next turn's warning note.
 *
 * The three types with no entry are excluded on purpose:
 * missing_oracle_or_table and missing_scene_increment are complaints about
 * tool calls that didn't happen, and tier_escalation_missed is a complaint
 * about the reasoning tier the turn ran at - no amount of rewriting the prose
 * addresses any of them.
 */
const ALSO_FIX_CLAUSES: Partial<Record<ObserverFlagType, string>> = {
  player_agency: `if the narration gives the player character new meaningful dialogue, makes a significant choice for them or decides what they feel, cut that back and leave that choice to the player; narrating them carrying out what they declared, in second person, stays`,
  outcome_narration_mismatch: `if the narration contradicts what a roll or check mechanically resolved to this turn, correct the narration to match the result - the result is ground truth and never changes to suit the prose`,
};

/**
 * Layer 5 hardening's answer to "just regenerate and hope for something
 * different": every check that can trigger a reset (checkResponseLength,
 * checkPlayerAgencyViolation, checkOutcomeMismatch) is a complaint about the
 * NARRATION TEXT specifically, never about which tools were called or what
 * a roll resolved to. So instead of discarding the whole turn - dice rolls,
 * tool calls, state changes and all - and re-running the entire GM/story
 * pipeline from scratch (which can reroll dice into a completely different
 * outcome), this shows the GM the exact narration it just wrote plus the
 * specific reason it was flagged, and asks it to rewrite only the prose.
 * The turn's mechanical results (gmStoryContext) are passed through as
 * ground truth the rewrite must stay consistent with, not redone.
 *
 * It runs as a CONTINUATION of the turn's own conversation whenever the
 * caller hands one over (conversationMessages), exactly like the story
 * stage's buildStoryContinuationPrompt path. It used to be a standalone
 * two-message prompt holding nothing but the player's action, the flagged
 * text, and the roll results - no premise, no scene history, no lore, no
 * character sheet - so a rewrite could only guess at everything the draft
 * had been grounded in, and produced prose that read like it belonged to a
 * different story. The standalone prompt survives as the fallback for
 * callers with no conversation to give.
 *
 * Returns null (and the caller keeps the turn, with its flag) on any API
 * error, and when the reply fails validateRewriteResponse (cut off, tool
 * calls, a refusal, empty, or unchanged), and for any flag type that is not a
 * prose complaint (REWRITABLE_FLAG_TYPES). It used to fall back to a full-turn
 * reset, which could reroll the dice because a rewrite call failed. A Stop
 * (AbortError) is thrown, not swallowed.
 */
export async function rewriteFlaggedNarration(
  params: RewriteNarrationParams,
): Promise<string | null> {
  const { narration, playerChoice, gmStoryContext, flag, apiOptions } = params;
  // A missing tool call or a too-low tier is not something words can fix, and
  // a rewrite must never be recorded as having fixed one (finding 4).
  if (!REWRITABLE_FLAG_TYPES.has(flag.type)) return null;
  const replyLength = params.replyLength || "medium";
  const storytellerMode = params.storytellerMode || "narrator";
  const { paragraphs } = getLengthGuidance(replyLength);
  const band = PACING_BANDS[replyLength] ?? PACING_BANDS.medium;
  const alreadyRead = params.alreadyRead?.trim() ?? "";
  // A stretch of a turn is not a turn: never ask it for a whole turn's length.
  const lengthLine =
    alreadyRead || params.endsAtPause
      ? `This is only part of the turn, so do not write a whole turn's length: stay about as long as the text you were given${
          flag.type === "response_length" ? ", or shorter, as the flag asks" : ""
        }.`
      : paragraphs;
  const pauseLine = params.endsAtPause
    ? `\n- This text ends where the turn pauses on the player: a question, a roll or a dice throw follows it. Keep the lead-in to that, so the question or roll still makes sense after it.`
    : "";

  const voiceGuidance =
    storytellerMode === "dm"
      ? `Write as a Dungeon Master narrating to the player. You may reference dice results naturally. Use second person ("You swing your sword...").`
      : `Write immersive prose - show, don't tell. No dice results or mechanical language.`;

  // A rewrite gets one shot per turn (MAX_OBSERVER_RESETS), so when the caller
  // knows other reviewers are still deciding, their complaints ride along as
  // conditional instructions - "fix this too, IF it's also true" - instead of
  // being lost. Nothing here asserts a second problem exists; a clean
  // narration should come back with only the flagged issue changed.
  const alsoFixClauses = (params.alsoFixIfPresent || [])
    .filter((type) => type !== flag.type)
    .map((type) => ALSO_FIX_CLAUSES[type])
    .filter((clause): clause is string => Boolean(clause));

  const alsoFixBlock = alsoFixClauses.length
    ? `\n- The same reviewers also check for the problems below. They have NOT necessarily been found here - check the narration yourself, and only change something if it genuinely applies. Do not invent a problem to fix:\n${alsoFixClauses
        .map((clause) => `  - ${clause}`)
        .join("\n")}`
    : "";

  // The rules every rewrite has to obey, whether it runs as a continuation of
  // the turn's own conversation or from the standalone fallback prompt. The
  // "same moment" clause is load-bearing: a rewrite that quietly advances the
  // story, invents a new scene, or introduces people who weren't there is a
  // worse outcome than the flag it was fixing.
  const rewriteRules = `Rewrite that narration to fix exactly that problem, and nothing else.
- Same moment, same scene, same events, same outcome. Do NOT advance the story, start a new scene, skip time, or introduce people, places, or events that weren't already in it.
- Any dice rolls, checks, and state changes this turn already resolved are ground truth - the rewrite must stay consistent with them. They are NOT re-rolled.
- Keep everything that was already correct (the tone, the details, the beat it lands on). Fix only what was flagged.${alsoFixBlock}
- ${lengthLine} ${voiceGuidance}${pauseLine}
- Output ONLY the corrected narration prose - no meta-commentary, no explanation of what you changed, no notes to yourself, no tool calls.`;

  const readBlock = alreadyRead
    ? `The player has already read this opening of the turn, and it stays exactly as it is:
"""
${alreadyRead}
"""
Rewrite only the continuation that follows it. Do not repeat, change or summarise what the player has read.

`
    : "";

  const flaggedBlock = `${readBlock}Your previous narration for this turn was flagged by an automated reviewer.

What you wrote (FLAGGED - do not repeat it as-is):
"""
${narration.trim()}
"""${formatNarrationThoughtsBlock(params.narrationThoughts)}

What was wrong: ${flag.detail}

${rewriteRules}`;

  // Preferred path: continue the conversation that produced the turn, so the
  // rewrite still has the premise, the scene history, the notes, the character
  // sheet, and this turn's own tool results in front of it.
  const conversation = params.conversationMessages || [];
  const messages: ChatMessage[] = conversation.length
    ? [...conversation, { role: "user" as const, content: flaggedBlock }]
    : (() => {
        // Fallback for callers with no conversation: the old standalone
        // prompt, which has to restate everything it can from the flag alone.
        const system = `You are the Game Master for a tabletop-style interactive fiction game. You just wrote a turn of narration in response to the player's action, but an automated reviewer flagged it for a specific problem - see below.

${rewriteRules}`;

        const contextBlock = gmStoryContext?.trim()
          ? `\n\nMechanical results this turn (ground truth, do not contradict):\n"""\n${gmStoryContext.trim()}\n"""`
          : "";

        const user = `Player's declared action:\n"""\n${
          playerChoice.trim() || "(none - opening scene)"
        }\n"""${formatCharacterContextBlock(
          params.characterContext,
        )}${contextBlock}\n\n${flaggedBlock}`;

        return [
          { role: "system" as const, content: system },
          { role: "user" as const, content: user },
        ];
      })();

  try {
    const result = await callSideModel({
      stage: "observer_rewrite",
      label: "Narration rewrite",
      model: apiOptions.model,
      messages,
      keys: apiOptions,
      maxTokens: Math.max(400, Math.ceil(band.high * 3)),
      temperature: 0.7,
      reasoningEffort: apiOptions.reasoningEffort,
      abortSignal: apiOptions.abortSignal,
      costTurnId: apiOptions.costTurnId,
    });
    if (!result.ok) return null;

    // A successful HTTP answer is not yet a rewritten narration (finding 5).
    const checked = validateRewriteResponse(result.data, narration);
    if (!checked.ok) {
      logger.action("Observer rewrite rejected, keeping the original", {
        reason: checked.reason,
        type: flag.type,
      });
      return null;
    }
    return params.deAiifyWords === false
      ? checked.text
      : deAiifyText(checked.text);
  } catch (error) {
    // A cancelled turn is the caller's decision, not a judge failure (finding 8).
    if (isAbortError(error)) throw error;
    return null;
  }
}

// A reply that talks ABOUT the rewrite instead of being it. The rewrite prompt
// says "output only the corrected narration", and a model that refuses, or
// introduces its work, is not writing narration.
const REWRITE_META_OPENERS =
  /^\s*(?:i(?:'m| am)?\s+(?:sorry|unable|not able)|i\s+(?:can(?:no|')t|won't|will not)|sorry[,.!]|as an ai\b|here(?:'s| is| are)\s+(?:the |a |your )?(?:rewritten|revised|corrected|updated|fixed|new)\b|sure[,!.]|certainly[,!.]|of course[,!.]|(?:the )?(?:rewritten|revised|corrected) (?:narration|version|text)\b|note:)/i;

export type RewriteValidation =
  | { ok: true; text: string }
  | { ok: false; reason: string };

/**
 * Whether a rewrite call's answer may replace the narration the player read.
 * Rejected, and the original kept, when the reply was cut off at the token
 * limit, carries tool calls, is a refusal or an introduction rather than
 * prose, is empty once the normal narration cleanup (extractVisibleText, the
 * same strip the story stage uses) has run, or is the original unchanged - a
 * "fix" that fixed nothing is not evidence that the flag was addressed.
 */
export function validateRewriteResponse(
  data: { content?: string; toolCalls?: unknown[]; finishReason?: string },
  original: string,
): RewriteValidation {
  if (data.finishReason === "length") {
    return { ok: false, reason: "the reply was cut off at the token limit" };
  }
  if (Array.isArray(data.toolCalls) && data.toolCalls.length > 0) {
    return { ok: false, reason: "the reply carried tool calls" };
  }
  const text = extractVisibleText(data.content || "");
  if (!text) return { ok: false, reason: "the reply was empty after cleanup" };
  if (REWRITE_META_OPENERS.test(text)) {
    return { ok: false, reason: "the reply was a refusal or an introduction" };
  }
  if (normalizeProse(text) === normalizeProse(original)) {
    return { ok: false, reason: "the reply was the original text unchanged" };
  }
  return { ok: true, text };
}

function normalizeProse(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

interface LengthJustificationResult {
  justified: boolean;
  reason: string;
}

function extractLengthJustificationJson(
  content: string,
): LengthJustificationResult | null {
  const parsed = extractJsonObject(content);
  if (!parsed || typeof parsed.justified !== "boolean") return null;
  return {
    justified: parsed.justified,
    reason: typeof parsed.reason === "string" ? parsed.reason.trim() : "",
  };
}

async function callLengthJustificationApi(
  narration: string,
  playerChoice: string,
  replyLength: ReplyLength,
  words: number,
  ceilingWords: number,
  apiOptions: ObserverApiOptions,
  sensitivity: number,
  characterContext?: ObserverCharacterContext,
  gmStoryContext?: string,
): Promise<LengthJustificationResult | null> {
  const system = `You are a strict but fair reviewer for a tabletop-style interactive fiction game. The Game Master AI you're reviewing was given a "${replyLength}" reply-length setting with a usual ceiling of ~${ceilingWords} words for a turn, and this turn ran to ${words} words - well past that ceiling.

Running long is NOT automatically wrong. The ceiling is a pacing default for ordinary back-and-forth play, and a good GM breaks it when the moment earns it. Treat the overage as JUSTIFIED when the turn is doing work that genuinely takes words, for example:
- Setup/session-zero material: establishing the setting, the character, the premise, or the house rules.
- Answering the player out-of-character: explaining a rule, a mechanic, the dice math, or their options. A real question deserves a real answer, and a truncated explanation is worse than a long one.
- A major reveal, a turning point, or a pivotal climax the whole campaign has been building toward.
- Resolving several mechanical results at once (multiple rolls, a combat round with several combatants, a challenge wrapping up) - each result needs its own beat of narration.
- A time skip, montage, or transition the player explicitly asked for.
- Necessary exposition the player asked for or could not act without.

Treat it as UNJUSTIFIED when the extra words are doing no work, for example: padding and flourish around a routine action, restating a beat already narrated, incidental scenery or banter nobody asked about, or narrating past the point where the player should have gotten control back (chaining a second scene or unrequested event onto the turn).

The question is what the words are DOING, not whether the prose is good. Given the player's declared action and the GM's narration, decide whether running this long was earned by the content of the turn.

${sensitivityInstruction(sensitivity)}

Respond with ONLY a JSON object, no other text:
{"justified": true|false, "reason": "<one sentence, empty string if not justified>"}`;

  const contextBlock = gmStoryContext?.trim()
    ? `\n\nMechanical results this turn (each one legitimately needs narrating):\n"""\n${gmStoryContext.trim()}\n"""`
    : "";

  const user = `Player's declared action:\n"""\n${
    playerChoice.trim() || "(none - opening scene)"
  }\n"""${formatCharacterContextBlock(
    characterContext,
  )}${contextBlock}\n\nGM's narration (${words} words, vs. a ~${ceilingWords} word ceiling):\n"""\n${narration.trim()}\n"""`;

  try {
    const result = await callSideModel({
      stage: "observer",
      label: "response_length judge",
      model: apiOptions.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      keys: apiOptions,
      maxTokens: 200,
      temperature: 0,
      reasoningEffort: apiOptions.reasoningEffort,
      abortSignal: apiOptions.abortSignal,
      costTurnId: apiOptions.costTurnId,
    });
    if (!result.ok) return null;

    const content = (result.data.content || "").trim();
    if (!content) return null;

    return extractLengthJustificationJson(content);
  } catch (error) {
    // A cancelled turn is the caller's decision, not a judge failure (finding 8).
    if (isAbortError(error)) throw error;
    return null;
  }
}

export interface ObserverApiOptions
  extends SideCallCostContext,
    ProviderKeys {
  model: string;
  token: string | null;
  abortSignal?: AbortSignal;
  /** Optional override from layerSettings.ts's observer model/effort override - unset preserves prior behavior of never sending this field. */
  reasoningEffort?: string;
}

/**
 * True for the AbortError callSideModel re-throws when the player stops the
 * turn. Every judge's catch used to swallow it as an ordinary failure, so a
 * Stop was read as "the judge had nothing to say" and the turn carried on to a
 * commit or a retry (Codex finding 8). A cancelled call passes through.
 */
export function isAbortError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

/** Strips a ```json ... ``` fence if present and parses the first {...} block. */
function extractJsonObject(content: string): Record<string, unknown> | null {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : content;
  const braceMatch = candidate.match(/\{[\s\S]*\}/);
  if (!braceMatch) return null;

  try {
    const parsed = JSON.parse(braceMatch[0]);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    // A cancelled turn is the caller's decision, not a judge failure (finding 8).
    if (isAbortError(error)) throw error;
    return null;
  }
}

interface AgencyCheckResult {
  violation: boolean;
  severity: "minor" | "major";
  reason: string;
}

function extractAgencyCheckJson(content: string): AgencyCheckResult | null {
  const parsed = extractJsonObject(content);
  if (!parsed || typeof parsed.violation !== "boolean") return null;
  return {
    violation: parsed.violation,
    severity: parsed.severity === "major" ? "major" : "minor",
    reason: typeof parsed.reason === "string" ? parsed.reason.trim() : "",
  };
}

async function callAgencyCheckApi(
  playerChoice: string,
  narration: string,
  apiOptions: ObserverApiOptions,
  sensitivity: number,
  characterContext?: ObserverCharacterContext,
): Promise<AgencyCheckResult | null> {
  // Loosened after the author's playtest (2026-10-24, decision 185): "that
  // use of you and describing the player actions is completely okay for a
  // DM." A GM at a real table narrates the character carrying out what the
  // player said, in second person, including the ordinary steps it takes.
  // What stays a violation is the GM taking a decision away from the player.
  const system = `You are a fair reviewer for a tabletop-style interactive fiction game. The Game Master AI you're reviewing follows this rule:

"Don't take the player's decisions away from them. Narrate the character doing what the player declared, and the world's answer; leave the player's next choice to the player."

Given the player's declared action and the GM's narration written in response, decide whether the GM took a decision away from the player.

WHAT IS FINE (never a violation):
- Second-person narration of the player character carrying out what the player declared, including the ordinary steps it takes: "go on" or "I check the light" becomes "you walk the gravel toward the Rise"; "I climb down" becomes "you take the ladder, rung by rung". Describing how they move, what they see and hear, and small natural gestures while doing it is normal GM narration.
- A short continuation the declared intent clearly implies (getting there, opening the door they were heading for, picking up the radio they said they'd use).
- Everything NPCs say, think and do, however much of the turn it takes. The "WHO IS WHO" block below names the player character; everyone else is an NPC.
- The consequences of the action: what happens around them, how NPCs react, dice outcomes, and involuntary results the world imposes (taking a hit, being shoved, losing their footing).
- Restating or lightly rephrasing dialogue or intent the player gave.

WHAT IS A VIOLATION (the player character, by name or as "you"):
- New dialogue the player didn't give: the character says something meaningful (a promise, an answer, a lie, a confession, a decision spoken aloud).
- A significant choice the player didn't make: attacking, fleeing, agreeing, refusing, revealing a secret, spending or giving away something that matters, choosing between options the scene offered.
- Telling the player what their character feels, believes or wants, as a decided fact ("you decide to trust her", "you feel nothing for him"), beyond a passing physical sensation.
- Continuing past the declared action into a new one the player should have chosen (they asked to look at the stone; the GM has them dig it up).

${sensitivityInstruction(sensitivity)}

Respond with ONLY a JSON object, no other text:
{"violation": true|false, "severity": "minor"|"major", "reason": "<one sentence naming who was spoken/acted for, empty string if no violation>"}

"major" = any of the four violations above, clearly (new meaningful dialogue, a significant choice, a decided feeling or belief, or a new action past the declared one). "minor" = borderline: it leans that way but could reasonably be read as narrating the declared action.`;

  const user = `Player's declared action:\n"""\n${
    playerChoice.trim() || "(none - opening scene)"
  }\n"""${formatCharacterContextBlock(
    characterContext,
  )}\n\nGM's narration in response:\n"""\n${narration.trim()}\n"""`;

  try {
    const result = await callSideModel({
      stage: "observer",
      label: "player_agency judge",
      model: apiOptions.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      keys: apiOptions,
      maxTokens: 200,
      temperature: 0,
      reasoningEffort: apiOptions.reasoningEffort,
      abortSignal: apiOptions.abortSignal,
      costTurnId: apiOptions.costTurnId,
    });
    if (!result.ok) return null;

    const content = (result.data.content || "").trim();
    if (!content) return null;

    return extractAgencyCheckJson(content);
  } catch (error) {
    // A cancelled turn is the caller's decision, not a judge failure (finding 8).
    if (isAbortError(error)) throw error;
    return null;
  }
}

export async function checkPlayerAgencyViolation(
  playerChoice: string,
  narration: string,
  apiOptions: ObserverApiOptions,
  settings: ObserverCheckSettings = CHECK_RUNS_BALANCED,
  characterContext?: ObserverCharacterContext,
): Promise<ObserverFlag | null> {
  if (!settings.enabled || !narration.trim()) return null;

  const result = await callAgencyCheckApi(
    playerChoice,
    narration,
    apiOptions,
    settings.sensitivity,
    characterContext,
  );
  if (!result || !result.violation) return null;

  const reason =
    result.reason || "The GM appeared to speak or act for the player character.";

  return {
    type: "player_agency",
    severity: result.severity,
    detail: reason,
    correctivePrompt: `Your previous attempt at this turn was reset because it broke the PLAYER AGENCY rule: it took a decision away from the player. ${reason} Rewrite this turn: narrate the character carrying out what the player declared (second person is fine) and the world's answer, but give them no new meaningful dialogue, no significant choice and no decided feeling the player didn't give.`,
  };
}

// ============================================================
// TYPED OUTCOME VERDICTS (the outcome judge's input)
// ============================================================
// The outcome judge used to be handed every `calculate` result, labelled
// SUCCESS or FAILURE from the executor's outer `success` flag. That flag is
// only "the call went through" for a plain sum (`success: true`, so a
// remaining-gold calculation arrived as a SUCCESS) and "the call errored" for
// an evaluation failure (`success: false`, so it arrived as a FAILURE). Neither
// is a ruling the narration could contradict (Codex review finding 6).
//
// So the judge is given only real adjudications, each with the outcome tier the
// engine decided:
// - action_roll and a manage_track progress_roll: strong hit / weak hit / miss;
// - feat_roll (Fantastic Realms): strong hit (with its magnitude) / hit / weak hit / miss;
// - record_challenge_result: the outcome the GM recorded (the engine accepted it);
// - calculate: only when its expression held a comparison (`>=`, `<`, ...) and
//   evaluated, as success (TRUE) or failure (FALSE) - never a plain sum, never
//   an evaluation error.
// The dice tools (formula_roll and the rest) report what the dice showed and
// never judge it, and fate_question is a four-way oracle answer; neither is a
// verdict.

export type OutcomeTier =
  | "strong_hit"
  | "hit"
  | "weak_hit"
  | "miss"
  | "success"
  | "failure";

export const OUTCOME_TIER_LABELS: Record<OutcomeTier, string> = {
  strong_hit: "STRONG HIT (full success)",
  hit: "HIT (it works)",
  weak_hit: "WEAK HIT (partial success: the goal is reached at a cost, with a complication, or only partway)",
  miss: "MISS (failure)",
  success: "SUCCESS (the comparison was TRUE)",
  failure: "FAILURE (the comparison was FALSE)",
};

/** One adjudication the engine made this turn, as the outcome judge receives it. */
export interface OutcomeVerdict {
  /** The tool call's id: one line per check, so two checks are never merged. */
  checkId: string;
  /** action_roll | progress_roll | record_challenge_result | calculate. */
  toolName: string;
  tier: OutcomeTier;
  /** What the GM was shown for that call (the numbers behind the tier). */
  contextForStory: string;
}

/** The shape of a tool result the extractor reads (a subset of GMToolResult). */
export interface ToolResultForOutcome {
  toolName: string;
  toolCallId: string;
  success: boolean;
  result?: unknown;
  contextForStory: string;
}

const OUTCOME_TIERS: ReadonlySet<string> = new Set([
  "strong_hit",
  "hit",
  "weak_hit",
  "miss",
  "success",
  "failure",
]);

/** The tool names that can produce a verdict (after progress_roll is told apart). */
const OUTCOME_CHECK_TOOL_NAMES = new Set([
  "calculate",
  "record_challenge_result",
  "action_roll",
  "feat_roll",
  "progress_roll",
]);

/** Turns a turn's tool results into the verdicts the outcome judge may see. */
export function extractOutcomeVerdicts(
  results: ReadonlyArray<ToolResultForOutcome>,
): OutcomeVerdict[] {
  const verdicts: OutcomeVerdict[] = [];
  for (const r of results) {
    // An engine error is never a ruling, whatever its outer flag says.
    if (r.contextForStory?.trimStart().startsWith("[ERROR")) continue;
    const res = r.result as
      | {
          type?: string;
          action?: string;
          outcome?: string;
          comparison?: { isTrue?: boolean };
        }
      | undefined;
    if (!res) continue;

    let tier: OutcomeTier | null = null;
    let toolName = r.toolName;
    if (r.toolName === "action_roll" && res.type === "action_roll") {
      if (res.outcome && OUTCOME_TIERS.has(res.outcome)) {
        tier = res.outcome as OutcomeTier;
      }
    } else if (r.toolName === "feat_roll" && res.type === "feat_roll") {
      // Fantastic Realms: miss, weak hit, hit or strong hit; the magnitude
      // ("STRONG HIT +2") is in the executor's text the judge is shown.
      if (res.outcome && OUTCOME_TIERS.has(res.outcome)) {
        tier = res.outcome as OutcomeTier;
      }
    } else if (
      r.toolName === "manage_track" &&
      res.type === "manage_track" &&
      res.action === "progress_roll"
    ) {
      if (res.outcome && OUTCOME_TIERS.has(res.outcome)) {
        tier = res.outcome as OutcomeTier;
        toolName = "progress_roll";
      }
    } else if (
      r.toolName === "record_challenge_result" &&
      res.type === "record_challenge_result"
    ) {
      if (res.outcome && OUTCOME_TIERS.has(res.outcome)) {
        tier = res.outcome as OutcomeTier;
      }
    } else if (r.toolName === "calculate" && res.type === "calculate") {
      // Only a comparison is a verdict; a sum has no `comparison`.
      if (typeof res.comparison?.isTrue === "boolean") {
        tier = res.comparison.isTrue ? "success" : "failure";
      }
    }
    if (!tier) continue;
    verdicts.push({
      checkId: r.toolCallId,
      toolName,
      tier,
      contextForStory: r.contextForStory,
    });
  }
  return verdicts;
}

/** What the page-side callers pass the Observer: typed verdicts, nothing else. */
export type RollOutcomeForCheck = OutcomeVerdict;

interface OutcomeMismatchResult {
  mismatch: boolean;
  reason: string;
}

function extractOutcomeMismatchJson(content: string): OutcomeMismatchResult | null {
  const parsed = extractJsonObject(content);
  if (!parsed || typeof parsed.mismatch !== "boolean") return null;
  return {
    mismatch: parsed.mismatch,
    reason: typeof parsed.reason === "string" ? parsed.reason.trim() : "",
  };
}

async function callOutcomeMismatchApi(
  narration: string,
  verdicts: OutcomeVerdict[],
  apiOptions: ObserverApiOptions,
  sensitivity: number,
  playerChoice: string,
  characterContext?: ObserverCharacterContext,
  narrationThoughts?: string,
): Promise<OutcomeMismatchResult | null> {
  const system = `You are a strict reviewer for a tabletop-style interactive fiction game. One or more checks were just mechanically resolved this turn, with the outcome the engine decided for each - those outcomes are ground truth and cannot be overridden by narration. Your only job is to check whether the GM's narration agrees with them.

EACH NUMBERED RESULT IS ITS OWN RULING. Judge each one against the part of the narration it governs; one result that the narration honours never excuses another that it reverses. The outcome tiers mean:
- STRONG HIT / SUCCESS: the character gets what they wanted.
- WEAK HIT: a PARTIAL success - the character gets what they wanted, but at a cost, with a complication, or only partway. Narration describing one is CORRECT; do not mistake it for a failure or for a full success.
- MISS / FAILURE: the character does not get what they wanted (the failure may carry a cost or a consequence).
A SUCCESS or FAILURE that comes from a bare comparison (TRUE / FALSE) may be one part of a check that this adventure's rules build out of several comparisons (an action score against two challenge dice, say). When the rules below say how comparisons combine, judge the combined outcome rather than a single FALSE on its own.

Only flag a DIRECT REVERSAL - a result that supports failure while the narration describes clear, unqualified success of the same thing, or a result that supports success while the narration describes clear failure of it. Narration that adds a complication or a cost on top of what a result supports is NOT a contradiction. Neither is narration that lands on an intermediate outcome tier this adventure's rules define.

${sensitivityInstruction(sensitivity)}

Respond with ONLY a JSON object, no other text:
{"mismatch": true|false, "reason": "<one sentence naming which numbered result is reversed, empty string if no mismatch>"}`;

  const resultLines = verdicts
    .map(
      (v, i) =>
        `${i + 1}. ${OUTCOME_TIER_LABELS[v.tier]} (${v.toolName})\n${v.contextForStory}`,
    )
    .join("\n\n");

  const user = `Player's declared action:\n"""\n${
    playerChoice.trim() || "(none - opening scene)"
  }\n"""${formatMechanicsBlock(characterContext)}\n\nResult${
    verdicts.length > 1 ? "s" : ""
  } this turn, in the order they were resolved (ground truth):\n${resultLines}\n\nGM's narration:\n"""\n${narration.trim()}\n"""${formatJudgeReasoningBlock(
    narrationThoughts,
  )}`;

  try {
    const result = await callSideModel({
      stage: "observer",
      label: "outcome_narration_mismatch judge",
      model: apiOptions.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      keys: apiOptions,
      maxTokens: 200,
      temperature: 0,
      reasoningEffort: apiOptions.reasoningEffort,
      abortSignal: apiOptions.abortSignal,
      costTurnId: apiOptions.costTurnId,
    });
    if (!result.ok) return null;

    const content = (result.data.content || "").trim();
    if (!content) return null;

    return extractOutcomeMismatchJson(content);
  } catch (error) {
    // A cancelled turn is the caller's decision, not a judge failure (finding 8).
    if (isAbortError(error)) throw error;
    return null;
  }
}

/**
 * Checks whether the finished narration contradicts the engine's rulings from
 * this turn (see extractOutcomeVerdicts for what counts as one).
 *
 * Every verdict is judged on its own line. There used to be a turn-wide cap
 * that made every mismatch "minor" whenever the turn's comparisons came out
 * mixed - written for Starforged-style outcomes built from several
 * comparisons, where one TRUE and one FALSE is a weak hit. It also meant one
 * successful attack excused a completely reversed escape, and a single engine
 * weak hit (`success: true`) never got the protection at all (finding 6). The
 * verdicts now carry the tier the engine decided (weak hit is a tier, not a
 * mix of booleans), and a bare-comparison group is explained to the judge by
 * the adventure's own rules note instead of being capped after the fact.
 *
 * Severity is "major" so a player who opts into automatic rewriting gets one;
 * by default the flag only appears in the turn's details (decision 187). The
 * roll results are ground truth the model can't override - the same "LLM
 * proposes, deterministic engine disposes" thesis the whole app is built on.
 */
export async function checkOutcomeMismatch(
  narration: string,
  verdicts: OutcomeVerdict[],
  apiOptions: ObserverApiOptions,
  settings: ObserverCheckSettings = CHECK_RUNS_BALANCED,
  playerChoice: string = "",
  characterContext?: ObserverCharacterContext,
  narrationThoughts?: string,
): Promise<ObserverFlag | null> {
  if (!settings.enabled || !narration.trim()) return null;

  const relevant = verdicts.filter(
    (v) => OUTCOME_CHECK_TOOL_NAMES.has(v.toolName) && Boolean(v.tier),
  );
  if (relevant.length === 0) return null;

  const result = await callOutcomeMismatchApi(
    narration,
    relevant,
    apiOptions,
    settings.sensitivity,
    playerChoice,
    characterContext,
    narrationThoughts,
  );
  if (!result || !result.mismatch) return null;

  const outcomeLabel = relevant
    .map((v) => OUTCOME_TIER_LABELS[v.tier].split(" (")[0])
    .join(", ");
  const reason =
    result.reason ||
    `The mechanical result was ${outcomeLabel}, but the narration says otherwise.`;

  return {
    type: "outcome_narration_mismatch",
    severity: "major",
    detail: reason,
    correctivePrompt: `Your previous attempt at this turn was reset because the narration didn't match the mechanical result of this turn's checks (${outcomeLabel}): ${reason} Rewrite the narration so it agrees with what the rolls actually determined - the roll results are ground truth and narration cannot override them.`,
  };
}

// The two tool names that count as "consulted the oracle/a table" - either
// one is enough, they serve the same purpose (letting randomness rather
// than narrative convenience decide an uncertain outcome).
const ORACLE_OR_TABLE_TOOL_NAMES = new Set([
  "fate_question",
  "roll_table",
  "roll_portent",
]);

interface ToolUsageJudgment {
  missedOracleOrTable: boolean;
  oracleReason: string;
  missedSceneIncrement: boolean;
  sceneReason: string;
}

function extractToolUsageJson(content: string): ToolUsageJudgment | null {
  const parsed = extractJsonObject(content);
  if (!parsed) return null;
  return {
    missedOracleOrTable: parsed.missed_oracle_or_table === true,
    oracleReason:
      typeof parsed.oracle_reason === "string" ? parsed.oracle_reason.trim() : "",
    missedSceneIncrement: parsed.missed_scene_increment === true,
    sceneReason:
      typeof parsed.scene_reason === "string" ? parsed.scene_reason.trim() : "",
  };
}

async function callToolUsageApi(
  narration: string,
  askAboutOracle: boolean,
  oracleSensitivity: number,
  askAboutScene: boolean,
  sceneSensitivity: number,
  apiOptions: ObserverApiOptions,
  characterContext?: ObserverCharacterContext,
): Promise<ToolUsageJudgment | null> {
  const system = `You are a strict but fair reviewer for a tabletop-style interactive fiction game. Two of the Game Master AI's mechanics are relevant here:
${
  askAboutOracle
    ? `1. THE ORACLE: for a genuinely uncertain in-world question the GM doesn't already know the answer to (e.g. "is the door locked?", "did the guard notice?"), or for random flavor content, the GM is supposed to consult a fate_question oracle roll or roll_table - not just invent an answer for narrative convenience. ${sensitivityInstruction(oracleSensitivity)}\n`
    : ""
}${
  askAboutScene
    ? `${askAboutOracle ? "2" : "1"}. SCENE TRANSITIONS: when the narration moves to a clearly new scene (a new location, a time skip like "the next morning" or "hours later", a new chapter), the GM is supposed to call increment_scene to run the scene-pacing system - not just narrate the transition directly. ${sensitivityInstruction(sceneSensitivity)}\n`
    : ""
}
Given the GM's narration below, judge only the question(s) above. Respond with ONLY a JSON object, no other text:
{${askAboutOracle ? `"missed_oracle_or_table": true|false, "oracle_reason": "<one sentence, empty string if not applicable>", ` : ""}${askAboutScene ? `"missed_scene_increment": true|false, "scene_reason": "<one sentence, empty string if not applicable>"` : ""}}`;

  // The rules note matters most to the oracle half: this adventure may define
  // its own oracle/table procedure, and a GM following it to the letter was
  // getting flagged for not calling the generic fate_question tool.
  const user = `GM's narration:\n"""\n${narration.trim()}\n"""${formatMechanicsBlock(
    characterContext,
  )}`;

  try {
    const result = await callSideModel({
      stage: "observer",
      label: "tool-usage-gap judge",
      model: apiOptions.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      keys: apiOptions,
      maxTokens: 200,
      temperature: 0,
      reasoningEffort: apiOptions.reasoningEffort,
      abortSignal: apiOptions.abortSignal,
      costTurnId: apiOptions.costTurnId,
    });
    if (!result.ok) return null;

    const content = (result.data.content || "").trim();
    if (!content) return null;

    return extractToolUsageJson(content);
  } catch (error) {
    // A cancelled turn is the caller's decision, not a judge failure (finding 8).
    if (isAbortError(error)) throw error;
    return null;
  }
}

/**
 * Checks for two tool-usage gaps, in a single LLM call: an uncertain
 * outcome or random flavor decided by narration instead of fate_question/
 * roll_table, and a narrated scene transition that never called
 * increment_scene. Both default to advisory (minor severity, log-only -
 * neither rule was ever stated to the GM as a hard requirement the way
 * PLAYER AGENCY was) - but unlike the other checks, these two have no
 * natural major/minor gradient of their own, so cranking a type's
 * sensitivity past TOOL_USAGE_MAJOR_SENSITIVITY_THRESHOLD is what makes it
 * report "major" (and therefore reset-eligible, if that type's
 * triggersReset is also on). Deterministically skips whichever half is
 * disabled or was already satisfied this turn, and skips the whole call if
 * both were.
 */
export async function checkToolUsageGaps(
  narration: string,
  toolNames: string[],
  apiOptions: ObserverApiOptions,
  oracleSettings: ObserverCheckSettings = CHECK_RUNS_BALANCED,
  sceneSettings: ObserverCheckSettings = CHECK_RUNS_BALANCED,
  characterContext?: ObserverCharacterContext,
): Promise<ObserverFlag[]> {
  if (!narration.trim()) return [];

  const usedOracleOrTable = toolNames.some((name) =>
    ORACLE_OR_TABLE_TOOL_NAMES.has(name),
  );
  const usedSceneIncrement = toolNames.includes("increment_scene");

  const askAboutOracle = oracleSettings.enabled && !usedOracleOrTable;
  const askAboutScene = sceneSettings.enabled && !usedSceneIncrement;
  if (!askAboutOracle && !askAboutScene) return [];

  const judgment = await callToolUsageApi(
    narration,
    askAboutOracle,
    oracleSettings.sensitivity,
    askAboutScene,
    sceneSettings.sensitivity,
    apiOptions,
    characterContext,
  );
  if (!judgment) return [];

  const flags: ObserverFlag[] = [];

  if (askAboutOracle && judgment.missedOracleOrTable) {
    const reason =
      judgment.oracleReason ||
      "This turn may have invented an uncertain outcome instead of consulting the oracle or a table.";
    flags.push({
      type: "missing_oracle_or_table",
      severity:
        oracleSettings.sensitivity >= TOOL_USAGE_MAJOR_SENSITIVITY_THRESHOLD
          ? "major"
          : "minor",
      detail: reason,
      correctivePrompt: `Consider using fate_question (for uncertain yes/no world questions) or roll_table (for random flavor) instead of deciding an outcome narratively: ${reason}`,
    });
  }

  if (askAboutScene && judgment.missedSceneIncrement) {
    const reason =
      judgment.sceneReason ||
      "This turn may have narrated a scene transition without calling increment_scene.";
    flags.push({
      type: "missing_scene_increment",
      severity:
        sceneSettings.sensitivity >= TOOL_USAGE_MAJOR_SENSITIVITY_THRESHOLD
          ? "major"
          : "minor",
      detail: reason,
      correctivePrompt: `This turn narrated a scene transition without calling increment_scene: ${reason} Call increment_scene when the narration moves to a clearly new scene (new location, time skip).`,
    });
  }

  return flags;
}

interface TierEscalationResult {
  shouldEscalate: boolean;
  reason: string;
}

function extractTierEscalationJson(content: string): TierEscalationResult | null {
  const parsed = extractJsonObject(content);
  if (!parsed || typeof parsed.should_escalate !== "boolean") return null;
  return {
    shouldEscalate: parsed.should_escalate,
    reason: typeof parsed.reason === "string" ? parsed.reason.trim() : "",
  };
}

async function callTierEscalationApi(
  narration: string,
  playerChoice: string,
  tierUsed: number,
  tiers: ReasoningTier[],
  apiOptions: ObserverApiOptions,
  sensitivity: number,
): Promise<TierEscalationResult | null> {
  const usedNote = tiers[tierUsed]?.note ?? "default";
  const higherTierNotes = tiers
    .map((t, i) => ({ i, note: t.note }))
    .filter(({ i }) => i > tierUsed)
    .map(({ i, note }) => `- tier ${i}: ${note}`)
    .join("\n");

  const system = `You are a strict but fair reviewer for a tabletop-style interactive fiction game. This turn's Game Master AI ran at reasoning tier ${tierUsed} (reserved for: ${usedNote}). Higher tiers exist for turns that need more careful adjudication:
${higherTierNotes}

Given the player's declared action and the GM's narration, judge whether this turn's own content - not its writing quality - was actually complex or high-stakes enough (a pivotal decision, a nuanced multi-step consequence, a moment demanding careful rules adjudication) that it should have run at a higher tier than tier ${tierUsed}.

${sensitivityInstruction(sensitivity)}

Respond with ONLY a JSON object, no other text:
{"should_escalate": true|false, "reason": "<one sentence, empty string if not applicable>"}`;

  const user = `Player's declared action:\n"""\n${playerChoice.trim() || "(none - opening scene)"}\n"""\n\nGM's narration (ran at tier ${tierUsed}):\n"""\n${narration.trim()}\n"""`;

  try {
    const result = await callSideModel({
      stage: "observer",
      label: "tier_escalation judge",
      model: apiOptions.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      keys: apiOptions,
      maxTokens: 200,
      temperature: 0,
      reasoningEffort: apiOptions.reasoningEffort,
      abortSignal: apiOptions.abortSignal,
      costTurnId: apiOptions.costTurnId,
    });
    if (!result.ok) return null;

    const content = (result.data.content || "").trim();
    if (!content) return null;

    return extractTierEscalationJson(content);
  } catch (error) {
    // A cancelled turn is the caller's decision, not a judge failure (finding 8).
    if (isAbortError(error)) throw error;
    return null;
  }
}

/**
 * Checks whether this turn's own complexity/stakes warranted a higher
 * reasoning tier than it actually ran at - the model failing to recognize a
 * turn needed more "brainpower" and self-escalate via set_reasoning_tier
 * (reasoningTiers.ts), when nothing else (combat, declared stakes, the
 * deterministic classifier) caught it either. Skipped once the turn is
 * already at TOP_TIER - there's nowhere higher to escalate to. A miss can't be
 * fixed by rewriting the narration (the turn already ran at an insufficient
 * tier), so this flag is never rewritten. It is off by default (decision 187)
 * and Settings offers it as Off / Flag only; generateStoryTurn still has the
 * heavier-tier full-turn retry for a config that sets its triggersReset
 * directly, and refuses it on a path that cannot re-run the tools
 * (GenerationOptions.allowMechanicalRetry).
 */
export async function checkTierEscalation(
  narration: string,
  playerChoice: string,
  tierUsed: number,
  apiOptions: ObserverApiOptions,
  settings: ObserverCheckSettings = CHECK_RUNS_BALANCED,
): Promise<ObserverFlag | null> {
  if (!settings.enabled || !narration.trim()) return null;
  if (tierUsed >= TOP_TIER) return null;

  const tiers = getEffectiveTiers();
  const result = await callTierEscalationApi(
    narration,
    playerChoice,
    tierUsed,
    tiers,
    apiOptions,
    settings.sensitivity,
  );
  if (!result || !result.shouldEscalate) return null;

  const reason =
    result.reason ||
    `This turn's complexity called for more careful adjudication than tier ${tierUsed} provides.`;

  return {
    type: "tier_escalation_missed",
    severity: "major",
    detail: reason,
    correctivePrompt: `Your previous attempt at this turn was reset because it needed more careful adjudication than it got: ${reason} This retry is running at a higher reasoning tier - take the extra room to think the stakes and consequences through before resolving the action.`,
  };
}

export interface ObserverParams {
  narration: string;
  playerChoice: string;
  replyLength?: ReplyLength;
  toolNames?: string[];
  rollResults?: RollOutcomeForCheck[];
  /** Tier the GM stage actually ran at this turn (see reasoningTiers.ts) - omit to skip checkTierEscalation entirely. */
  tierUsed?: number;
  /** The turn's executed tool/roll results, joined - context for the length judge (several results legitimately take more words to narrate). */
  gmStoryContext?: string;
  /** Who the player character is vs. who the NPCs are, plus this adventure's mechanics note (see buildObserverCharacterContext) - handed to every judge that has to tell the cast, or the rules, apart. */
  characterContext?: ObserverCharacterContext;
  /**
   * The reasoning the model produced while writing this narration
   * (GenerationResult.narrationThoughts). Handed to checkOutcomeMismatch only:
   * that's the check whose whole question is "did the GM apply the rules
   * correctly", and the ruling usually lives in the reasoning rather than the
   * prose. Deliberately NOT given to checkPlayerAgencyViolation, where the
   * reasoning is as likely to contain the violation itself ("I'll have her
   * decide to run") as an exoneration - see formatJudgeReasoningBlock.
   */
  narrationThoughts?: string;
  /** StoryData.sessionZeroActive as of the START of this turn - suspends every check (see observerSuspensionReason). */
  sessionZeroActive?: boolean;
  /** Whether the story has a character_sheet note yet - false means it's still in setup, which also suspends every check. */
  hasCharacterSheet?: boolean;
  apiOptions: ObserverApiOptions;
  /** Per-flag-type enable/reset/sensitivity config - defaults to DEFAULT_OBSERVER_SETTINGS (today's shipped behavior) for any type a partial/future config omits. */
  settings?: ObserverSettings;
}

/**
 * Runs all checks for a completed turn. Safe to call every turn - the
 * length check is free, and every LLM-backed check fails open (returns no
 * flag) on any API error rather than blocking the turn on observer infra
 * issues. Returns no flags at all for a suspended turn (session zero - see
 * observerSuspensionReason), without spending a single API call on it.
 *
 * The checks run CONCURRENTLY. They're fully independent - each reads only
 * the finished turn and its own settings, none of them mutates anything, and
 * every one already fails open on its own - so running them one after another
 * only ever bought latency: up to five sequential API round trips stacked
 * between the end of narration and the choices the player is waiting on.
 * Flags are collected in the same fixed order as before (length, agency,
 * outcome, tool-usage, tier) regardless of which call finishes first, because
 * generateStoryTurn picks the FIRST major flag to correct and that choice has
 * to stay deterministic rather than becoming a race between judges.
 */
export async function runObserver(params: ObserverParams): Promise<ObserverFlag[]> {
  if (
    observerSuspensionReason({
      sessionZeroActive: params.sessionZeroActive,
      toolNames: params.toolNames,
      hasCharacterSheet: params.hasCharacterSheet,
    })
  ) {
    return [];
  }

  const [lengthFlag, agencyFlag, outcomeFlag, toolUsageFlags, tierFlag] =
    await Promise.all([
      checkResponseLength(
        params.narration,
        params.playerChoice,
        params.replyLength,
        params.apiOptions,
        settingsFor(params.settings, "response_length"),
        params.characterContext,
        params.gmStoryContext,
      ),
      checkPlayerAgencyViolation(
        params.playerChoice,
        params.narration,
        params.apiOptions,
        settingsFor(params.settings, "player_agency"),
        params.characterContext,
      ),
      checkOutcomeMismatch(
        params.narration,
        params.rollResults || [],
        params.apiOptions,
        settingsFor(params.settings, "outcome_narration_mismatch"),
        params.playerChoice,
        params.characterContext,
        params.narrationThoughts,
      ),
      checkToolUsageGaps(
        params.narration,
        params.toolNames || [],
        params.apiOptions,
        settingsFor(params.settings, "missing_oracle_or_table"),
        settingsFor(params.settings, "missing_scene_increment"),
        params.characterContext,
      ),
      // Skipped entirely when the caller didn't say which tier the turn ran
      // at - there's nothing to judge the escalation against.
      params.tierUsed !== undefined
        ? checkTierEscalation(
            params.narration,
            params.playerChoice,
            params.tierUsed,
            params.apiOptions,
            settingsFor(params.settings, "tier_escalation_missed"),
          )
        : Promise.resolve(null),
    ]);

  const flags: ObserverFlag[] = [];
  if (lengthFlag) flags.push(lengthFlag);
  if (agencyFlag) flags.push(agencyFlag);
  if (outcomeFlag) flags.push(outcomeFlag);
  flags.push(...toolUsageFlags);
  if (tierFlag) flags.push(tierFlag);

  return flags;
}

/**
 * Builds a next-turn warning from a turn's SURVIVING observer flags - ones
 * that reached the final, accepted result rather than being corrected via a
 * same-turn reset. That covers two cases: minor flags (which never trigger
 * a reset at all) and major flags where the reset budget ran out (fail
 * open). Both cases mean the GM was never actually told what it did wrong -
 * generateStoryTurn's reset-and-retry note only ever reaches the model
 * mid-turn, while it's still trying to fix THIS turn. Without this, a
 * flagged mistake reaches the player (via the ScenePart.observerFlags
 * toast) but silently evaporates for the GM the moment the turn is
 * accepted. Called once per turn, in generation.ts, using the PRIOR turn's
 * surviving flags to warn the GM before it writes the next one.
 */
export function buildObserverWarningNote(
  flags: ObserverFlag[] | undefined,
): string | undefined {
  if (!flags || flags.length === 0) return undefined;

  const lines = flags.map((f) => `- ${f.detail}`);
  return `Your previous turn was flagged by the observer for the following - keep this in mind and avoid repeating it:\n${lines.join("\n")}`;
}

/**
 * Mirror case to buildObserverWarningNote above, for flags that WERE fixed
 * this turn via a successful rewriteFlaggedNarration rewrite. Those flags
 * never reach ScenePart.observerFlags (generateStoryTurn filters the
 * rewrite-triggering flag out once it's fixed - see generation.ts), so the
 * GM's own history shows only the clean, already-corrected prose and never
 * learns a correction was needed at all. Left alone, this repeats: e.g.
 * checkResponseLength trips, the turn gets rewritten shorter, and the very
 * next turn runs long again because the GM was never told about the
 * tendency, only shown the fixed result. Read back from the PRIOR turn's
 * ScenePart.correctedObserverFlags, same call site and cadence as
 * buildObserverWarningNote.
 */
export function buildObserverCorrectionNote(
  flags: ObserverFlag[] | undefined,
): string | undefined {
  if (!flags || flags.length === 0) return undefined;

  const lines = flags.map((f) => `- ${f.detail}`);
  return `Your previous turn's first draft had to be corrected by the observer before it reached the player - the version in your history is already fixed, but you should still avoid the habit that caused this:\n${lines.join("\n")}`;
}

// ============================================================
// REWRITE HISTORY RECONCILIATION
// ============================================================
// When rewriteFlaggedNarration replaces a flagged turn's narration, the
// player-visible ScenePart.content is swapped for the corrected prose - but
// the GM's own saved history (ScenePart.gmConversation, and the legacy
// gmThinking fallback) still holds the ORIGINAL discarded draft in its
// assistant-message content. Left as-is, the next turn replays that draft as
// if the GM had written it (buildGMStagePrompt in ai_staged.ts), so the GM
// keeps seeing - and imitating - exactly the prose the observer just rejected,
// while buildObserverCorrectionNote's "the version in your history is already
// fixed" claim is quietly false. These helpers make it true: they strip the
// discarded draft out of the saved history and splice in the corrected prose
// plus a marker naming why it was rewritten.

/** The private reasoning (text inside <thinking>...</thinking>) of a raw GM
 *  content string, with the visible narration - the discarded draft - dropped.
 *  Returns "" when the string carried no reasoning (e.g. a reasoning-tier
 *  model whose chain of thought lived in the separate `reasoning` field and
 *  whose `content` was pure prose). */
function extractGmReasoning(raw: string | undefined): string {
  if (!raw) return "";
  return parseTaggedContent(raw)
    .filter((b) => b.kind === "thinking")
    .map((b) => b.content ?? "")
    .join("\n\n")
    .trim();
}

/** Explains, inside the replayed history, that this turn's narration was
 *  rewritten and why. Kept INSIDE <thinking> tags by the callers below so the
 *  GM reads it as context but it never renders as player-facing narration
 *  (parseTaggedContent classifies it as reasoning, not story text). */
function observerRewriteMarker(flag: ObserverFlag): string {
  return `[OBSERVER CORRECTION: this turn's first-draft narration was rewritten before the player saw it. Reason: ${flag.detail} The narration that follows is the corrected version the player actually saw - treat it as what you wrote here, and don't slip back into the original draft's habit.]`;
}

/**
 * Rebuilds a rewritten turn's gmConversation so the discarded draft no longer
 * survives in replayed history: every assistant message keeps its private
 * <thinking> reasoning and any tool calls but loses its visible prose, and the
 * final assistant message gets the correction marker (folded into <thinking>)
 * plus the corrected narration as its visible text. Non-assistant (tool)
 * messages pass through untouched. Positions/counts are preserved so the
 * assistant/tool pairing the replay relies on is unchanged.
 */
export function reconcileGmConversationAfterRewrite(
  gmConversation: GMConversationMessage[] | undefined,
  rewrittenNarration: string,
  flag: ObserverFlag,
): GMConversationMessage[] | undefined {
  if (!gmConversation || gmConversation.length === 0) return gmConversation;
  const rewritten = rewrittenNarration.trim();
  const marker = observerRewriteMarker(flag);

  let lastAssistantIdx = -1;
  for (let i = gmConversation.length - 1; i >= 0; i--) {
    if (gmConversation[i].role === "assistant") {
      lastAssistantIdx = i;
      break;
    }
  }

  return gmConversation.map((msg, i) => {
    if (msg.role !== "assistant") return msg;
    const reasoning = extractGmReasoning(msg.content);
    if (i !== lastAssistantIdx) {
      return { ...msg, content: reasoning ? `<thinking>\n${reasoning}\n</thinking>` : "" };
    }
    const inner = [reasoning, marker].filter(Boolean).join("\n\n");
    return {
      ...msg,
      content: `<thinking>\n${inner}\n</thinking>\n\n${rewritten}`,
    };
  });
}

/**
 * Legacy-fallback mirror of reconcileGmConversationAfterRewrite for the
 * gmThinking string[] (only replayed for old saves that predate
 * gmConversation - see ai_staged.ts). Strips each round's discarded prose to
 * its reasoning and appends the marker + corrected narration to the last
 * entry, keeping the array length so the gmThinking<->gmToolCalls round
 * pairing is unchanged.
 */
export function reconcileGmThinkingAfterRewrite(
  gmThinking: string[] | undefined,
  rewrittenNarration: string,
  flag: ObserverFlag,
): string[] | undefined {
  if (!gmThinking || gmThinking.length === 0) return gmThinking;
  const rewritten = rewrittenNarration.trim();
  const marker = observerRewriteMarker(flag);

  const stripped = gmThinking.map((entry) => {
    const reasoning = extractGmReasoning(entry);
    return reasoning ? `<thinking>\n${reasoning}\n</thinking>` : "";
  });

  const lastIdx = stripped.length - 1;
  const lastReasoning = extractGmReasoning(gmThinking[lastIdx]);
  const inner = [lastReasoning, marker].filter(Boolean).join("\n\n");
  stripped[lastIdx] = `<thinking>\n${inner}\n</thinking>\n\n${rewritten}`;
  return stripped;
}

/**
 * A prose rewrite made at a pause (decision 240), applied to the raw text of
 * the GM rounds it covers: each keeps its <thinking> reasoning, and the first
 * one that carried visible prose gets the rewrite (and the correction marker,
 * inside <thinking>); the others lose their visible prose. Rounds with no
 * visible prose pass through. Returns the same array when none had any, so the
 * caller can tell nothing was fixed.
 */
export function replaceVisibleProse(
  raws: string[],
  rewritten: string,
  flag: ObserverFlag,
): string[] {
  const firstWithProse = raws.findIndex((r) => extractVisibleText(r || "") !== "");
  if (firstWithProse < 0) return raws;
  const marker = observerRewriteMarker(flag);
  return raws.map((raw, i) => {
    if (i < firstWithProse || extractVisibleText(raw || "") === "") return raw;
    const reasoning = extractGmReasoning(raw);
    if (i !== firstWithProse) {
      return reasoning ? `<thinking>\n${reasoning}\n</thinking>` : "";
    }
    const inner = [reasoning, marker].filter(Boolean).join("\n\n");
    return `<thinking>\n${inner}\n</thinking>\n\n${rewritten.trim()}`;
  });
}

// ============================================================
// WHAT THE JUDGES COST (for the Settings cost line)
// ============================================================

/**
 * How many AI calls the enabled judges can add to a turn, from the settings
 * alone. `always` is calls made on essentially every turn (player agency, the
 * tier judge, the shared tool-usage call); `sometimes` is calls made only when
 * the turn gives them something to judge (the length judge past its ceiling,
 * the outcome judge on a turn with an engine ruling). The oracle and
 * scene-increment judges share one call, so they count once. A rewrite is
 * extra and only when a judge is set to rewrite.
 */
export function countJudgeCalls(settings: ObserverSettings): {
  always: number;
  sometimes: number;
  rewrites: boolean;
} {
  const on = (type: ObserverFlagType) => settingsFor(settings, type).enabled;
  const always =
    (on("player_agency") ? 1 : 0) +
    (on("tier_escalation_missed") ? 1 : 0) +
    (on("missing_oracle_or_table") || on("missing_scene_increment") ? 1 : 0);
  const sometimes =
    (on("response_length") ? 1 : 0) +
    (on("outcome_narration_mismatch") ? 1 : 0);
  const rewrites = (
    ["response_length", "player_agency", "outcome_narration_mismatch"] as const
  ).some((type) => {
    const s = settingsFor(settings, type);
    return s.enabled && s.triggersReset;
  });
  return { always, sometimes, rewrites };
}
