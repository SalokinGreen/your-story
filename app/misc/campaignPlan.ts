/**
 * Campaign Plan — Phase 2 (deterministic re-planning gate) + Phase 3 (spine
 * presets by campaign length).
 *
 * Phase 1 (docs/gm-plan-notes-design.md) is prompt-only: the GM is *told* to
 * keep its `gm_plan` spine one beat ahead. Phase 2 adds the structural
 * enforcement, mirroring the M2 roll-invariant gate in reasoningTiers.ts /
 * generation.ts. A lightweight `PlanState` tracks which fixed beat is being
 * run and whether the GM has marked it complete without yet detailing the
 * next one; when it has, `isPlanAwaitingNextBeat` is true and the GM-stage
 * loop refuses to end the turn on prose alone until `advance_plan` writes the
 * next beat. Fail-open, same as M2: it nudges, it never hard-blocks play.
 *
 * The beat NAMES within a preset are fixed (a product decision - see the
 * design doc) so the gate has stable identifiers to advance through, and so
 * campaigns of a given length share a recognizable dramatic spine instead of
 * bespoke per-story naming. Phase 3 adds three presets (short/medium/long) so
 * a one-shot and a long campaign don't share the same beat count - the GM
 * picks one at spine-note creation time based on the campaign's scope.
 *
 * Two more gates guard the *start* of the plan's life, since a campaign that
 * never got a spine can't be kept a beat ahead of anything:
 * `hasCampaignPlan` is the hard precondition `start_game` checks (no spine =
 * session zero isn't over), and `getSetupReminder` is the soft, escalating
 * prompt nudge for a story that's several turns old with setup still unfinished.
 */
import type { StoryData, StoryLore, PlanState, SpineLength } from "./structs";
import type { CampaignRecord } from "./campaign/types";
import { hasPartBeyondPitch } from "./campaign/styles";
import {
  describeMissing,
  getCreationProgress,
  setupParticipants,
  type CreationProgress,
} from "./setupSteps";

/** One-shot / short-arc spine: a few sessions, no room for a slow build. */
export const CAMPAIGN_SPINE_SHORT = [
  "Opening Image (Session 0)",
  "Inciting Incident",
  "Rising Action",
  "Climax",
  "Resolution",
] as const;

/** Default spine for an ordinary multi-session campaign. */
export const CAMPAIGN_SPINE_MEDIUM = [
  "Opening Image (Session 0)",
  "Inciting Incident (Session 1)",
  "Rising Complications",
  "Midpoint Turn",
  "Crisis",
  "Climax",
  "Resolution",
] as const;

/** Extended-campaign spine: a fuller Save-the-Cat-style beat sheet, for
 * long-form campaigns that need more medium-horizon texture than the medium
 * preset's single "Rising Complications" catch-all beat provides. */
export const CAMPAIGN_SPINE_LONG = [
  "Opening Image (Session 0)",
  "Setup / Ordinary World",
  "Theme Stated",
  "Inciting Incident (Session 1)",
  "Debate",
  "Break Into Rising Action",
  "B-Story (Allies & Relationships)",
  "Fun and Games (Early Wins)",
  "Midpoint Turn",
  "Bad Guys Close In (Escalating Complications)",
  "All Is Lost",
  "Dark Night of the Soul",
  "Break Into Finale",
  "Climax",
  "Resolution (Final Image)",
] as const;

/** @deprecated Use CAMPAIGN_SPINE_MEDIUM (same beats) or CAMPAIGN_SPINE_PRESETS. */
export const CAMPAIGN_SPINE_BEATS = CAMPAIGN_SPINE_MEDIUM;

export const CAMPAIGN_SPINE_PRESETS: Record<SpineLength, readonly string[]> = {
  short: CAMPAIGN_SPINE_SHORT,
  medium: CAMPAIGN_SPINE_MEDIUM,
  long: CAMPAIGN_SPINE_LONG,
};

/** The gm_plan note that is the campaign spine (as opposed to a per-player arc
 * note or a side-beat note). Prefers the title captured in planState, then a
 * title matching "Campaign Plan", then the first gm_plan note that isn't the
 * active side beat. */
export function findSpinePlanNote(state: StoryData): StoryLore | undefined {
  const plans = (state.lore || []).filter(
    (l) => l.enabled !== false && l.type === "gm_plan",
  );
  if (plans.length === 0) return undefined;

  const capturedTitle = state.planState?.spineNoteTitle;
  if (capturedTitle) {
    const match = plans.find((l) => l.title === capturedTitle);
    if (match) return match;
  }
  const named = plans.find((l) => /campaign plan/i.test(l.title));
  if (named) return named;
  return plans.find((l) => l.title !== state.activeSideBeatTitle);
}

/** Build a fresh PlanState anchored to a spine note, using the beat preset
 * for the given campaign length (defaults to "medium" when unspecified or
 * unrecognized). */
export function initPlanState(
  spineNoteTitle: string,
  spineLength: SpineLength = "medium",
): PlanState {
  const beats = CAMPAIGN_SPINE_PRESETS[spineLength] ?? CAMPAIGN_SPINE_MEDIUM;
  return {
    beats: [...beats],
    currentBeatIndex: 0,
    spineNoteTitle,
    spineLength,
  };
}

/** The name of the beat currently being run, or undefined if state is absent/exhausted. */
export function currentBeatName(state: StoryData): string | undefined {
  const ps = state.planState;
  if (!ps) return undefined;
  return ps.beats[ps.currentBeatIndex];
}

/**
 * Plan-advance gate: the GM marked the current beat complete
 * (advance_plan action:"complete_current") but has not yet written and moved
 * to the next beat (action:"write_next"). While true, the turn must not end
 * on prose - the plan would be left a beat behind itself.
 */
export function isPlanAwaitingNextBeat(state: StoryData): boolean {
  return !!state.planState?.awaitingNextBeat;
}

/**
 * Does this story have a campaign plan at all? True once the spine note
 * exists (or once planState was initialized for one - kept as a separate
 * check so a plan whose note was later renamed/deleted by the player still
 * counts as "planned", rather than re-blocking a campaign mid-flight).
 *
 * This is the precondition for `start_game` (see executeStartGame,
 * gmExecutor.ts): session zero doesn't end until the spine exists.
 */
export function hasCampaignPlan(state: StoryData): boolean {
  if (state.planState) return true;
  return !!findSpinePlanNote(state) || campaignRecordReady(state);
}

/**
 * Whether the story's campaign record is enough to start on (design section 8,
 * plan slice 3): a style, and at least one part beyond the pitch. A record the
 * timer migration made and nothing else has (`origin: "migrated"`) never counts:
 * readiness follows the old plan note until the record gains a style (plan,
 * "Legacy precedence").
 */
export function campaignRecordReady(state: StoryData): boolean {
  const record = state.campaign;
  if (!record || record.origin === "migrated") return false;
  return !!record.style && hasPartBeyondPitch(record);
}

/** How many player turns this story is old - the cadence the setup reminders
 * escalate on. Compaction keeps pruned parts in `scene.parts` (it only adds a
 * rolling `summary` over the prefix), so this stays monotonic. */
export function countPlayerTurns(state: StoryData): number {
  return (state.scene?.parts || []).filter((p) => p.user).length;
}

/** Turn counts at which the setup reminders start, and at which they escalate
 * from a nudge to an explicit "do it this turn". */
export const SETUP_REMINDER_SOFT_TURNS = 5;
export const SETUP_REMINDER_URGENT_TURNS = 10;

export interface SetupReminder {
  /** "soft" from SETUP_REMINDER_SOFT_TURNS, "urgent" from SETUP_REMINDER_URGENT_TURNS. */
  level: "soft" | "urgent";
  /** Player turns elapsed (countPlayerTurns). */
  turns: number;
  /** No spine note / planState yet. */
  missingPlan: boolean;
  /** start_game hasn't been called - the story is still in session zero. */
  missingStart: boolean;
}

/**
 * Setup-overdue reminder: several turns into a story, the GM should have both
 * a campaign plan and a completed session-zero handoff. In practice it
 * sometimes has neither and just keeps narrating, so the prompt escalates a
 * reminder (see buildGMStagePrompt) instead of relying on the one-shot
 * fresh-story/START OF PLAY blocks being noticed on turn one.
 *
 * Returns null while nothing is missing, or while the story is still young
 * enough that setup running long is normal.
 */
export function getSetupReminder(state: StoryData): SetupReminder | null {
  const missingPlan = !hasCampaignPlan(state);
  const missingStart = state.sessionZeroActive === true;
  if (!missingPlan && !missingStart) return null;

  const turns = countPlayerTurns(state);
  if (turns < SETUP_REMINDER_SOFT_TURNS) return null;

  return {
    level: turns >= SETUP_REMINDER_URGENT_TURNS ? "urgent" : "soft",
    turns,
    missingPlan,
    missingStart,
  };
}

// ============================================
// SESSION-ZERO SETUP PROGRESS (docs/session-zero-design.md 3.1)
// ============================================

/**
 * Whether this story has a character_sheet note with anything in it - the
 * same "has setup happened yet?" test buildGMStagePrompt uses to decide
 * between its FRESH STORY setup block and normal play. (Lives here, and is
 * re-exported by observer.ts, so setup progress and the observer share one
 * definition without an import cycle.)
 */
export function hasCharacterSheetNote(storyData: StoryData): boolean {
  return populatedSheets(storyData).length > 0;
}

function populatedSheets(story: StoryData): StoryLore[] {
  return (story.lore || []).filter(
    (l) =>
      l.enabled !== false &&
      l.type === "character_sheet" &&
      Boolean(l.content?.trim()),
  );
}

/**
 * A stable string hash of notes' titles and contents (FNV-1a over UTF-16
 * code units, hex). No crypto API, so it runs everywhere the engine does.
 * Order-independent: notes are sorted by title first.
 */
export function hashNotes(
  notes: ReadonlyArray<{ title: string; content?: string }>,
): string {
  const parts = [...notes]
    .map((n) => `${n.title}\u0000${n.content ?? ""}`)
    .sort();
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x5bd1e995;
  const text = parts.join("\u0001");
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
    h2 = (h2 ^ (h2 >>> 13)) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}-${text.length}`;
}

/** The player-sheet notes and the plan note a setup approval is bound to. */
export function getSetupNotes(story: StoryData): {
  sheets: StoryLore[];
  plan: StoryLore | undefined;
} {
  return { sheets: populatedSheets(story), plan: findSpinePlanNote(story) };
}

// Fields the engine moves during play. Hashing them would cancel an approval
// for a change nobody made to the campaign itself.
const VOLATILE_RECORD_KEYS = new Set(["filled", "crossed", "found", "revealed", "paused"]);

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => !VOLATILE_RECORD_KEYS.has(k) && o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * A hash of the whole campaign record as the player approved it: everything
 * the setup card shows (its public projection) and everything it does not
 * (secrets, dooms, a person's secret), so a later edit to any of it cancels
 * the approval. Play state the engine moves (a clock's fill, a found clue) is
 * left out.
 */
export function hashCampaignRecord(record: CampaignRecord): string {
  return hashNotes([{ title: "campaign", content: stableJson(record) }]);
}

/**
 * The hashes of the current sheet(s), plan note and campaign record, as
 * `setup.approval` stores them. `campaignHash` is present whenever the
 * story has a record (any origin), so an approval on a story with a
 * plan note and no record is exactly what it was before the record existed.
 */
export function currentSetupHashes(story: StoryData): {
  sheetHash: string;
  planHash: string;
  campaignHash?: string;
} {
  const { sheets, plan } = getSetupNotes(story);
  const hashes: { sheetHash: string; planHash: string; campaignHash?: string } = {
    sheetHash: hashNotes(sheets),
    planHash: hashNotes(plan ? [plan] : []),
  };
  // Whatever its origin: a write to a migrated record before it has a style
  // is setup progress too (the hash ignores play state).
  if (story.campaign) {
    hashes.campaignHash = hashCampaignRecord(story.campaign);
  }
  return hashes;
}

/** Most titles `setup.referenceTitles` keeps. */
export const SETUP_REFERENCE_MAX_TITLES = 20;

/**
 * Moves notes the GM just read to the front of `setup.referenceTitles`
 * (newest first, one entry per title, bounded). Mutates `story`; does
 * nothing outside session zero.
 */
export function recordSetupReference(
  story: StoryData,
  titles: ReadonlyArray<string>,
): void {
  if (story.sessionZeroActive !== true || titles.length === 0) return;
  const key = (t: string) => t.toLowerCase().replace(/\.md$/i, "").trim();
  const incoming = new Set(titles.map(key));
  const kept = (story.setup?.referenceTitles ?? []).filter(
    (t) => !incoming.has(key(t)),
  );
  const fresh: string[] = [];
  const seen = new Set<string>();
  for (const t of titles) {
    if (seen.has(key(t))) continue;
    seen.add(key(t));
    fresh.push(t);
  }
  story.setup = {
    ...story.setup,
    referenceTitles: [...fresh, ...kept].slice(0, SETUP_REFERENCE_MAX_TITLES),
  };
}

export type SetupStep =
  | "concept"
  | "interview"
  | "character"
  | "campaign"
  | "confirm"
  | "start_game";

export interface SetupProgress {
  concept: boolean;
  character: boolean;
  campaign: boolean;
  approved: boolean;
  started: boolean;
  /** The first step not yet done, or null once the story has started. */
  next: SetupStep | null;
  /** Players still without a sheet (names), when more than one is required. */
  missingSheetFor: string[];
  /**
   * The creation steps this mode requires (setupSteps.ts): how many are
   * covered, how many there are, and which are missing, in the order to ask.
   */
  creation: CreationProgress;
}

function normaliseTitle(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, " ");
}

/** A sheet belongs to a player by `ownerCouchPlayerId` or a "Character: <name>" title. */
function playerHasSheet(
  sheets: StoryLore[],
  p: { id: string; name: string },
): boolean {
  const title = normaliseTitle(`Character: ${p.name}`);
  return sheets.some(
    (s) =>
      s.ownerCouchPlayerId === p.id ||
      (!s.ownerCouchPlayerId && normaliseTitle(s.title) === title),
  );
}

/**
 * The players who already have a populated, enabled sheet right now (ids as
 * setupParticipants gives them; solo is "solo"). Recorded as
 * `setup.premadeFor` when the setup style is first chosen, so a pre-made
 * character is not asked the per-character steps.
 */
export function premadePlayerIds(
  story: StoryData,
  players?: ReadonlyArray<{ id: string; name: string }>,
): string[] {
  const sheets = populatedSheets(story);
  if (sheets.length === 0) return [];
  const people = setupParticipants(story, players);
  if (people.length === 1) return [people[0].id];
  return people.filter((p) => playerHasSheet(sheets, p)).map((p) => p.id);
}

/**
 * Where session zero stands, derived from live state. `players` names who
 * needs a character sheet; when omitted, couch co-op's `couchPlayers` (two or
 * more) are used, else solo play needs one sheet. A sheet belongs to a player
 * by `ownerCouchPlayerId` or a "Character: <name>" title.
 */
export function getSetupProgress(
  story: StoryData,
  players?: ReadonlyArray<{ id: string; name: string }>,
): SetupProgress {
  const sheets = populatedSheets(story);
  const required =
    players && players.length > 0
      ? players
      : (story.multiplayer?.couchPlayers?.length ?? 0) > 1
        ? (story.multiplayer?.couchPlayers ?? [])
        : [];

  let character: boolean;
  const missingSheetFor: string[] = [];
  if (required.length > 1) {
    for (const p of required) {
      if (!playerHasSheet(sheets, p)) missingSheetFor.push(p.name);
    }
    character = missingSheetFor.length === 0;
  } else {
    character = sheets.length > 0;
  }

  // Ready on a record with a style and a part beyond the pitch, or (older
  // stories, and a record made only by the timer migration) on a plan note.
  const campaign = campaignRecordReady(story) || !!findSpinePlanNote(story);
  const setup = story.setup;
  // No mode dependency: nothing writes setup.mode (it only shapes the strip
  // and the prompt), so a sheet or an answered concept is what ticks Concept.
  const creation = getCreationProgress(story, players);
  const concept =
    !!setup?.conceptDone || sheets.length > 0 || creation.covered > 0;

  const approval = setup?.approval;
  let approved = false;
  if (approval && character && campaign) {
    const now = currentSetupHashes(story);
    approved =
      approval.sheetHash === now.sheetHash &&
      approval.planHash === now.planHash &&
      approval.campaignHash === now.campaignHash;
  }

  const started = story.sessionZeroActive !== true;
  let next: SetupStep | null = null;
  if (!started) {
    // Missing creation steps come first: they ARE the concept questions, and
    // the card must never be pushed while one is outstanding.
    if (creation.missing.length > 0) next = "interview";
    else if (!concept) next = "concept";
    else if (!character) next = "character";
    else if (!campaign) next = "campaign";
    else if (!approved) next = "confirm";
    else next = "start_game";
  }

  return {
    concept,
    character,
    campaign,
    approved,
    started,
    next,
    missingSheetFor,
    creation,
  };
}

// ============================================
// THE SETUP GATE'S WORDS (docs/session-zero-plan.md, slice 4)
// ============================================

/** How many times the setup gate re-prompts one turn before ending it. */
export const MAX_SETUP_PROMPTS = 2;

/**
 * What the player reads for a step, in the engine line: the step, and an
 * invitation to say something about it first (decision 195).
 */
const SETUP_STEP_HANDBACK: Record<SetupStep, string> = {
  concept:
    "Next up: a few questions about the game. Anything you want to tell me first?",
  interview:
    "Next up: the next setup question. Anything you want to tell me first?",
  character:
    "Next up: your character sheet. Anything you want me to know before I write it?",
  campaign:
    "Next up: the campaign. Anything you'd like in it before I build it?",
  confirm: "Next up: the setup card, for your OK. Anything to change first?",
  start_game: "Everything's set.",
};

/**
 * Why the setup gate rejected a round: the GM asked the player a question in
 * prose instead of through ask_question, wrote the sheet or the plan as prose
 * instead of create_note, or ended with nothing to show.
 */
export type SetupGateCause = "prose_question" | "prose_note" | "nothing";

/** Options for {@link setupGateMessage}. */
export interface SetupGateOptions {
  cause?: SetupGateCause;
  /** The rejected round's visible text, quoted back in whole sentences. */
  rejected?: string;
  /** More than one player is at the table (couch, party, online). */
  multiPlayer?: boolean;
}

// A heading (markdown or bold) shaped like a character sheet or a plan.
const SETUP_NOTE_HEADING =
  /^\s*(?:#{1,6}\s+|\*\*)[^\n?]*\b(?:character sheet|campaign plan|spine|fronts?|current beat|opening image)\b[^\n?]*$/im;

/**
 * Names the cause of a rejected setup round from what it said, which tools
 * it called and the step that is next. A sheet- or plan-shaped heading with no
 * create_note is a note written as prose (checked first, since a plan can hold
 * a question mark), but only when the next step is the sheet or the plan; a
 * question mark with no ask_question is a question asked as prose, but only
 * when the next step is a setup question. "nothing" is for a round with no
 * words at all. Anything else has no cause, so the default head is used and
 * the next step's own message does the asking (a "Ready to begin?" when the
 * card is the next step is not a lost question).
 */
export function classifySetupRejection(round: {
  visibleText: string;
  toolNames?: string[];
  next?: SetupStep | null;
}): SetupGateCause | undefined {
  const tools = round.toolNames ?? [];
  const text = round.visibleText ?? "";
  if (!text.trim()) return "nothing";
  const next = round.next;
  if (
    SETUP_NOTE_HEADING.test(text) &&
    !tools.includes("create_note") &&
    (next === undefined || next === "character" || next === "campaign")
  ) {
    return "prose_note";
  }
  if (
    text.includes("?") &&
    !tools.includes("ask_question") &&
    (next === undefined || next === "interview" || next === "concept")
  ) {
    return "prose_question";
  }
  return undefined;
}

/**
 * The opening whole sentences of a rejected round, on one line, up to about
 * `maxChars`. Never cut mid-sentence: when even the first sentence is longer
 * than the limit, nothing is quoted.
 */
export function quoteWholeSentences(text: string, maxChars = 300): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  const sentences = flat.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) ?? [];
  let out = "";
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    const next = out ? `${out} ${sentence}` : sentence;
    if (next.length > maxChars) break;
    out = next;
  }
  return out;
}

/**
 * The user message the setup gate adds when a session-zero turn is about to
 * end on prose without moving setup forward. Names what was wrong with the
 * round (when the cause is known), then the next step and the tool that does
 * it.
 */
export function setupGateMessage(
  next: SetupStep | null,
  creation?: CreationProgress,
  opts: SetupGateOptions = {},
): string {
  const quote = opts.rejected ? quoteWholeSentences(opts.rejected) : "";
  const said = quote ? ` You wrote: "${quote}"` : "";
  let head: string;
  switch (opts.cause) {
    case "prose_question":
      head = `A question for the player has to go through ask_question, so their answer is recorded and the turn moves on.${said}`;
      break;
    case "prose_note":
      head = `The character sheet is saved only by create_note and the campaign only by the campaign tool; text in the reply is not kept.${said}`;
      break;
    case "nothing":
      head =
        "This turn ended with no words and no tool call, and setup is not finished.";
      break;
    default:
      head =
        "Setup is not finished and this turn has not moved it forward, so the turn cannot end on prose alone.";
  }
  switch (next) {
    case "interview": {
      const m = creation?.missing[0];
      if (!m) {
        return `${head} Next step: ask the player the next setup question with ask_question, tagged with its setup_step.`;
      }
      return `${head} Next step: ask ${describeMissing(m)} with ask_question, tagged setup_step "${m.step.id}"${m.player && opts.multiPlayer ? ` and target_player_name "${m.player}"` : ""}. ${m.step.hint} Do not call confirm_setup yet.`;
    }
    case "concept":
      return `${head} Next step: ask the player your setup questions with ask_question (their answers set the concept), then continue.`;
    case "character":
      return `${head} Next step: write the character sheet with create_note (type "character_sheet"), then continue.`;
    case "campaign":
      return `${head} Next step: build the campaign with the campaign tool (part "style", part "pitch", part "safety" if not yet recorded, then at least one more part: a front, a faction, a location, a secret with its clues...), then continue.`;
    case "confirm":
      return `${head} Next step: call confirm_setup so the player can review the sheet and the campaign and press Start.`;
    case "start_game":
      return `${head} The player has approved. Call start_game now, then write the campaign intro.`;
    default:
      return `${head} Call the tool for the next setup step.`;
  }
}

/**
 * The line a session-zero turn ends with when the player closed or sent back
 * the setup card and the GM then said nothing: the player has the floor, and
 * the card is not forced open again.
 */
export const SETUP_CARD_HANDED_BACK_LINE = "(What would you like to change?)";

/**
 * The line a session-zero turn ends with when the GM had nothing valid to
 * say: the gate's prompts ran out, the round limit hit, or the text was
 * empty. It hands the floor back with the next step named, so any reply,
 * "go on" included, starts the next turn of setup (decision 195).
 */
export function setupEngineLine(
  next: SetupStep | null,
  creation?: CreationProgress,
): string {
  const m = next === "interview" ? creation?.missing[0] : undefined;
  const line = m
    ? `Next up: ${describeMissing(m)}. Anything you want to tell me first?`
    : next
      ? SETUP_STEP_HANDBACK[next]
      : "Let's finish setting up.";
  return next === "start_game"
    ? `${line} Say go on and we'll start.`
    : `${line} Or just say go on.`;
}
