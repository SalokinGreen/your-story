/**
 * Layer 5 hardening, active variant (see docs/five-layer-architecture-changelog.md
 * and docs/architecture-frontier.md's "adjudication" layer).
 *
 * checkNarrationConsistency (consistencyCheck.ts) is diagnostic-only: it runs
 * after narration has already streamed to the player and just records a
 * warning. This module is the active counterpart - it reviews a completed GM
 * turn for violations of rules the GM was already given, and a "major" flag
 * can trigger generateStoryTurn (generation.ts) to call
 * rewriteFlaggedNarration below: the GM is shown the exact narration it
 * wrote and the specific reason it was flagged, and rewrites just the prose
 * - dice rolls/tool calls/state changes are left untouched, since every
 * major-eligible check here is a complaint about the narration text alone.
 * Only if that rewrite call itself fails does generateStoryTurn fall back to
 * rolling StoryData back to its pre-turn snapshot and forcing a completely
 * fresh, blind attempt. Same fail-open posture as the M2 roll-invariant gate
 * (reasoningTiers.ts/generation.ts): never block play indefinitely.
 *
 * Two things scope every check below:
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
 * Five checks, two severities:
 *
 * Major (can trigger generateStoryTurn's rewrite-or-reset correction):
 * - checkResponseLength: the word-count trip itself is deterministic and
 *   free - catches a single turn blowing way past the Reply Length setting's
 *   ceiling. pacingFeedback.ts already nudges based on a trailing 3-turn
 *   average; this catches one egregious turn on the spot instead of waiting
 *   for the average to drift. But "too long" isn't automatically a mistake -
 *   a session-zero opening dump, a big reveal, or a pivotal climax can
 *   legitimately need the room - so a trip doesn't flag on its own: it's
 *   followed by an LLM justification pass (same fail-open/API-error posture
 *   as the checks below) that reads the turn in context and decides whether
 *   the overage was earned. Only an unjustified overage becomes a flag.
 * - checkPlayerAgencyViolation: an LLM call that judges whether the GM
 *   decided/narrated what the player character says, thinks, or does beyond
 *   what the player declared - the "PLAYER AGENCY (NON-NEGOTIABLE)" rule
 *   already in ai_staged.ts's GM system prompt.
 * - checkOutcomeMismatch: an LLM call that judges whether the finished
 *   narration contradicts the mechanical result (SUCCESS/FAILURE) of the
 *   last roll/check made this turn. The roll result is ground truth - this
 *   is the same "LLM proposes, deterministic engine disposes" thesis the
 *   whole app is built on, just checked directly for the first time.
 *
 * Minor by default (log-only, surfaced as a warning - see below on how that
 * default can be changed):
 * - checkToolUsageGaps: an LLM call that judges whether the turn invented an
 *   uncertain outcome instead of consulting fate_question/roll_table, or
 *   narrated a scene transition without calling increment_scene.
 *
 * All LLM-backed checks use the same fetch("/api/generate") pattern as
 * reflection.ts's callReflectionApi - non-streaming, caller-supplied model,
 * fails open (no flag) on any API error. Regex can't reliably judge any of
 * these; they need actual reading comprehension. checkResponseLength's
 * justification pass is the one exception to "fails open (no flag)": failing
 * open there means falling back to the deterministic flag its word-count
 * trip already produced, since that's what shipped before the judge existed
 * - an infra failure never gets to invent a NEW reset that wouldn't have
 * happened otherwise, but it also doesn't get to erase one that would have.
 *
 * Configuration (backend only - no settings UI exists yet, but the plumbing
 * is here for one to read/write later, the same way replyLength etc. flow
 * from localStorage through GenerationOptions): each of the five
 * ObserverFlagTypes has its own independent { enabled, triggersReset,
 * sensitivity } (see ObserverCheckSettings). `enabled` skips the check
 * entirely; `triggersReset` gates whether a "major" instance of that type
 * is ever allowed to reset (independent of the type's own severity logic);
 * `sensitivity` (0-10, default 5) scales how readily each check fires - the
 * overage multiplier for checkResponseLength, a strictness instruction for
 * every LLM-backed check, and (for the two tool-usage-gap checks
 * specifically, which have no severity gradient of their own) whether a hit
 * is reported as "minor" or "major" in the first place.
 * DEFAULT_OBSERVER_SETTINGS reproduces exactly what shipped before this
 * config existed.
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
import { parseTaggedContent } from "./turnTimeline";
import { getCustomModelIfUUID } from "./user_settings";
import { recordSideCall, SideCallCostContext } from "./turnCost";
import { getEffectiveTiers, ReasoningTier, TOP_TIER } from "./reasoningTiers";

// ============================================================
// PER-FLAG-TYPE CONFIGURATION
// ============================================================
// Backend for a future settings UI (not built yet - this just needs to
// exist and be threaded through so a UI can read/write it later, the same
// way replyLength/storytellerMode/etc. already flow from localStorage
// through GenerationOptions). Each of the five ObserverFlagTypes gets its
// own independent { enabled, triggersReset, sensitivity } - "which flags
// call for a reset, and how sensitive each one is."

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

const DEFAULT_CHECK_SETTINGS: ObserverCheckSettings = {
  enabled: true,
  triggersReset: true,
  sensitivity: 5,
};

/**
 * Current shipped behavior, reproduced exactly as the default config:
 * response_length/player_agency/outcome_narration_mismatch can reset (as
 * they always could), the two tool-usage-gap checks stay log-only (as they
 * always were) unless a future UI cranks their sensitivity up.
 */
export const DEFAULT_OBSERVER_SETTINGS: ObserverSettings = {
  response_length: { ...DEFAULT_CHECK_SETTINGS },
  player_agency: { ...DEFAULT_CHECK_SETTINGS },
  outcome_narration_mismatch: { ...DEFAULT_CHECK_SETTINGS },
  missing_oracle_or_table: { ...DEFAULT_CHECK_SETTINGS, triggersReset: false },
  missing_scene_increment: { ...DEFAULT_CHECK_SETTINGS, triggersReset: false },
  tier_escalation_missed: { ...DEFAULT_CHECK_SETTINGS },
};

/** Settings for one flag type, falling back to its default for any field a partial/future config omits. */
export function settingsFor(
  settings: ObserverSettings | undefined,
  type: ObserverFlagType,
): ObserverCheckSettings {
  const defaults = DEFAULT_OBSERVER_SETTINGS[type];
  const override = settings?.[type];
  return override ? { ...defaults, ...override } : defaults;
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
}

const CHARACTER_SHEET_CONTEXT_LIMIT = 1500;

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

/**
 * Whether this story has a character_sheet note with anything in it - the
 * same "has setup happened yet?" test buildGMStagePrompt uses to decide
 * between its FRESH STORY setup block and normal play. See
 * observerSuspensionReason, which treats a missing sheet as "still in setup".
 */
export function hasCharacterSheetNote(storyData: StoryData): boolean {
  return (storyData.lore || []).some(
    (l) =>
      l.enabled !== false &&
      l.type === "character_sheet" &&
      Boolean(l.content?.trim()),
  );
}

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
  settings: ObserverCheckSettings = DEFAULT_OBSERVER_SETTINGS.response_length,
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
  settings: ObserverCheckSettings = DEFAULT_OBSERVER_SETTINGS.response_length,
  characterContext?: ObserverCharacterContext,
  gmStoryContext?: string,
): Promise<ObserverFlag | null> {
  const flag = prospectiveLengthFlag(narration, replyLength, settings);
  if (!flag) return null;

  const band = PACING_BANDS[replyLength] ?? PACING_BANDS.medium;
  const words = countNarrationWords(narration);

  // Give the GM a chance to justify the overage before treating it as a
  // mistake. If there's no apiOptions to call the judge with, or the judge
  // call itself fails, fall back to the pre-existing mechanical-only
  // behavior (flag it) rather than silently dropping a check that used to
  // always fire - the judge can only ever reduce resets, never add new ones
  // beyond what shipped before it existed.
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
    if (judgment?.justified) return null;
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
  player_agency: `if the narration decides what the player character says, thinks, feels, chooses, or does beyond what the player actually declared, cut that back - describe what the world does and leave the player's response to the player`,
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
 * Returns null (fail open) on any API error or empty response - the caller
 * falls back to the old full-turn reset rather than silently keeping
 * flagged content.
 */
export async function rewriteFlaggedNarration(
  params: RewriteNarrationParams,
): Promise<string | null> {
  const { narration, playerChoice, gmStoryContext, flag, apiOptions } = params;
  const replyLength = params.replyLength || "medium";
  const storytellerMode = params.storytellerMode || "narrator";
  const { paragraphs } = getLengthGuidance(replyLength);
  const band = PACING_BANDS[replyLength] ?? PACING_BANDS.medium;

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
- ${paragraphs} ${voiceGuidance}
- Output ONLY the corrected narration prose - no meta-commentary, no explanation of what you changed, no notes to yourself, no tool calls.`;

  const flaggedBlock = `Your previous narration for this turn was flagged by an automated reviewer.

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
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiOptions.token}`,
      },
      body: JSON.stringify({
        messages,
        model: apiOptions.model,
        maxTokens: Math.max(400, Math.ceil(band.high * 3)),
        temperature: 0.7,
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
      "observer_rewrite",
      "Narration rewrite",
      apiOptions.model,
      data,
      apiOptions,
    );
    const content = (data.content || "").trim();
    return content || null;
  } catch {
    return null;
  }
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
        maxTokens: 200,
        temperature: 0,
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
      "observer",
      "response_length judge",
      apiOptions.model,
      data,
      apiOptions,
    );
    const content = (data.content || "").trim();
    if (!content) return null;

    return extractLengthJustificationJson(content);
  } catch {
    return null;
  }
}

export interface ObserverApiOptions extends SideCallCostContext {
  model: string;
  token: string | null;
  openRouterKey?: string;
  deepseekKey?: string;
  googleKey?: string;
  mistralKey?: string;
  deepinfraKey?: string;
  abortSignal?: AbortSignal;
  /** Optional override from layerSettings.ts's observer model/effort override - unset preserves prior behavior of never sending this field. */
  reasoningEffort?: string;
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
  } catch {
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
  const system = `You are a strict but fair reviewer for a tabletop-style interactive fiction game. The Game Master AI you're reviewing was given this non-negotiable rule:

"NEVER decide what the player character says, thinks, feels, or does next. You resolve outcomes for the action they already declared - you don't invent their next action."

Given the player's declared action and the GM's narration written in response, decide whether the GM violated this rule by putting new dialogue, thoughts, feelings, or actions into the player character that the player didn't declare.

IDENTIFY WHO IS WHO FIRST. The "WHO IS WHO" block below names the player character; everyone else in the scene is an NPC. This distinction decides the whole judgment, so make it explicitly before you rule:
- Dialogue, thoughts, feelings, and actions belonging to an NPC are the GM's job. They are NEVER a violation, no matter how much of the turn they take up.
- Dialogue, thoughts, feelings, or decisions attributed to the PLAYER CHARACTER - by name, or in second person ("you say...", "you decide...", "you feel...") - that the player did not declare ARE a violation.
- Do not excuse a violation on the grounds that the line "sounds like a character talking": if the speaker is the player character, it is a violation regardless of how in-character it reads. Equally, do not flag a line just because it is emotive or first-person-sounding when the speaker is an NPC.
- If the player's declared action itself includes dialogue or intent, the GM restating or lightly rephrasing it is not a violation.

Resolving the CONSEQUENCES of the player's stated action (what happens around them, how NPCs react, dice outcomes) is fine and expected - that is not a violation. Describing involuntary physical results the world imposes on the player character (taking a hit, being shoved, losing their footing) is also fine; deciding how they CHOOSE to respond is not.

${sensitivityInstruction(sensitivity)}

Respond with ONLY a JSON object, no other text:
{"violation": true|false, "severity": "minor"|"major", "reason": "<one sentence naming who was spoken/acted for, empty string if no violation>"}

"major" = the GM clearly wrote new dialogue, a new decision, or a new action for the player character that the player never declared. "minor" = borderline/ambiguous phrasing that leans that way but could reasonably be read as just narrating the player's own stated action.`;

  const user = `Player's declared action:\n"""\n${
    playerChoice.trim() || "(none - opening scene)"
  }\n"""${formatCharacterContextBlock(
    characterContext,
  )}\n\nGM's narration in response:\n"""\n${narration.trim()}\n"""`;

  try {
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
        maxTokens: 200,
        temperature: 0,
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
      "observer",
      "player_agency judge",
      apiOptions.model,
      data,
      apiOptions,
    );
    const content = (data.content || "").trim();
    if (!content) return null;

    return extractAgencyCheckJson(content);
  } catch {
    return null;
  }
}

export async function checkPlayerAgencyViolation(
  playerChoice: string,
  narration: string,
  apiOptions: ObserverApiOptions,
  settings: ObserverCheckSettings = DEFAULT_OBSERVER_SETTINGS.player_agency,
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
    correctivePrompt: `Your previous attempt at this turn was reset because it violated the PLAYER AGENCY rule you were already given ("Never decide what the player character says, thinks, feels, or does next"): ${reason} Rewrite this turn so you resolve the outcome of the player's declared action without inventing anything further the player character says, thinks, or does.`,
  };
}

// Rolls whose outer `success` is a genuine pass/fail verdict worth checking
// narration against. fate_question is deliberately excluded - its answer is
// a four-way oracle response (Yes/No/Exceptional), not a SUCCESS/FAILURE
// check, and doesn't map onto this same "did narration agree" question.
const OUTCOME_CHECK_TOOL_NAMES = new Set([
  "formula_roll",
  "opposed_formula",
  "formula_challenge_check",
  "npc_roll",
]);

export interface RollOutcomeForCheck {
  toolName: string;
  success: boolean;
  contextForStory: string;
}

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
  roll: RollOutcomeForCheck,
  apiOptions: ObserverApiOptions,
  sensitivity: number,
): Promise<OutcomeMismatchResult | null> {
  const system = `You are a strict reviewer for a tabletop-style interactive fiction game. A dice roll or check was just mechanically resolved with a specific result, shown below - that result is ground truth and cannot be overridden by narration. Your only job is to check whether the GM's narration agrees with it.

Given the mechanical result and the GM's narration that followed it, judge: does the narration directly contradict the mechanical result (e.g. the roll was a FAILURE but the narration describes clear, unqualified success, or vice versa)? A narration that adds partial success, complications, or a costly/Pyrrhic outcome on top of the correct pass/fail result is NOT a contradiction - only flag a direct reversal of the result itself.

${sensitivityInstruction(sensitivity)}

Respond with ONLY a JSON object, no other text:
{"mismatch": true|false, "reason": "<one sentence, empty string if no mismatch>"}`;

  const user = `Mechanical result: ${roll.success ? "SUCCESS" : "FAILURE"}\n${roll.contextForStory}\n\nGM's narration:\n"""\n${narration.trim()}\n"""`;

  try {
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
        maxTokens: 200,
        temperature: 0,
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
      "observer",
      "outcome_narration_mismatch judge",
      apiOptions.model,
      data,
      apiOptions,
    );
    const content = (data.content || "").trim();
    if (!content) return null;

    return extractOutcomeMismatchJson(content);
  } catch {
    return null;
  }
}

/**
 * Checks whether the finished narration contradicts the mechanical result of
 * the last roll/check made this turn. Only the LAST relevant roll is
 * checked - it's the one this turn's final narration is actually resolving;
 * earlier rolls in a multi-round turn were already resolved by intermediate
 * context the model saw before writing this narration. "major" severity:
 * unlike the tool-usage gaps below, a roll's result being ground truth the
 * model can't override is the core "LLM proposes, deterministic engine
 * disposes" thesis this whole app is built on, not a soft best-practice.
 */
export async function checkOutcomeMismatch(
  narration: string,
  rollResults: RollOutcomeForCheck[],
  apiOptions: ObserverApiOptions,
  settings: ObserverCheckSettings = DEFAULT_OBSERVER_SETTINGS.outcome_narration_mismatch,
): Promise<ObserverFlag | null> {
  if (!settings.enabled || !narration.trim()) return null;

  const relevantRolls = rollResults.filter((r) =>
    OUTCOME_CHECK_TOOL_NAMES.has(r.toolName),
  );
  if (relevantRolls.length === 0) return null;
  const lastRoll = relevantRolls[relevantRolls.length - 1];

  const result = await callOutcomeMismatchApi(
    narration,
    lastRoll,
    apiOptions,
    settings.sensitivity,
  );
  if (!result || !result.mismatch) return null;

  const outcomeLabel = lastRoll.success ? "SUCCESS" : "FAILURE";
  const reason =
    result.reason ||
    `The mechanical result was ${outcomeLabel}, but the narration says otherwise.`;

  return {
    type: "outcome_narration_mismatch",
    severity: "major",
    detail: reason,
    correctivePrompt: `Your previous attempt at this turn was reset because the narration didn't match the roll's mechanical result (${outcomeLabel}): ${reason} Rewrite the narration so it agrees with what the roll actually determined - the roll result is ground truth and narration cannot override it.`,
  };
}

// The two tool names that count as "consulted the oracle/a table" - either
// one is enough, they serve the same purpose (letting randomness rather
// than narrative convenience decide an uncertain outcome).
const ORACLE_OR_TABLE_TOOL_NAMES = new Set(["fate_question", "roll_table"]);

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

  const user = `GM's narration:\n"""\n${narration.trim()}\n"""`;

  try {
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
        maxTokens: 200,
        temperature: 0,
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
      "observer",
      "tool-usage-gap judge",
      apiOptions.model,
      data,
      apiOptions,
    );
    const content = (data.content || "").trim();
    if (!content) return null;

    return extractToolUsageJson(content);
  } catch {
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
  oracleSettings: ObserverCheckSettings = DEFAULT_OBSERVER_SETTINGS.missing_oracle_or_table,
  sceneSettings: ObserverCheckSettings = DEFAULT_OBSERVER_SETTINGS.missing_scene_increment,
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
        maxTokens: 200,
        temperature: 0,
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
      "observer",
      "tier_escalation judge",
      apiOptions.model,
      data,
      apiOptions,
    );
    const content = (data.content || "").trim();
    if (!content) return null;

    return extractTierEscalationJson(content);
  } catch {
    return null;
  }
}

/**
 * Checks whether this turn's own complexity/stakes warranted a higher
 * reasoning tier than it actually ran at - the model failing to recognize a
 * turn needed more "brainpower" and self-escalate via set_reasoning_tier
 * (reasoningTiers.ts), when nothing else (combat, declared stakes, the
 * deterministic classifier) caught it either. Skipped once the turn is
 * already at TOP_TIER - there's nowhere higher to escalate to. Unlike every
 * other check here, this is never advisory-only in practice: a miss can't be
 * fixed by rewriting the narration (the turn already ran at an insufficient
 * tier), so generateStoryTurn (generation.ts) special-cases this flag type to
 * skip the rewrite-first step and go straight to a full rollback + forced
 * tier escalation before retrying.
 */
export async function checkTierEscalation(
  narration: string,
  playerChoice: string,
  tierUsed: number,
  apiOptions: ObserverApiOptions,
  settings: ObserverCheckSettings = DEFAULT_OBSERVER_SETTINGS.tier_escalation_missed,
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
  /** Who the player character is vs. who the NPCs are (see buildObserverCharacterContext) - handed to every judge that has to tell them apart. */
  characterContext?: ObserverCharacterContext;
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
      ),
      checkToolUsageGaps(
        params.narration,
        params.toolNames || [],
        params.apiOptions,
        settingsFor(params.settings, "missing_oracle_or_table"),
        settingsFor(params.settings, "missing_scene_increment"),
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
