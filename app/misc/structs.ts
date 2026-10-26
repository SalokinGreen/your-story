// Collection of the various structs used throughout the application

import type { CampaignRecord } from "./campaign/types";
export type {
  CampaignRecord,
  CampaignStyle,
  Clock,
  ClockTrigger,
  Portent,
  Front,
  Faction,
  Secret,
  Clue,
  Beat,
} from "./campaign/types";

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// CHARACTER SHEET TEMPLATE SYSTEM
// ============================================

// A field in the character sheet template
export interface CharacterSheetField {
  name: string; // Field name/label (e.g., "Name", "Class", "Background")
  description: string; // Help text shown to player (e.g., "Your character's full name")
  defaultValue: string; // Default value if player doesn't fill it in
  category?: string; // Optional category extracted from "FieldName (Category)" syntax
}

// Character sheet template for an adventure
export interface CharacterSheetTemplate {
  template: string; // Markdown template with {{FieldName | Description | Default}} placeholders
  fields: CharacterSheetField[]; // Extracted fields for form rendering
}

// Adventure difficulty setting (affects all tier conversions)
export type AdventureDifficulty = "easy" | "medium" | "hard" | "expert";

// Who rolls the dice for player-character actions (see StoryData.diceMode):
// "ai" = the GM rolls digitally; "manual" = the players roll physical dice
// at the table and type in the result; "physical" = the player throws a 3D
// die on-screen (drag-and-release), settled by real physics.
export type DiceMode = "ai" | "manual" | "physical";

export interface CommandResponse {
  command: string; // The original command that was executed
  success: boolean | "partial"; // True if succeeded, false if failed, 'partial' if partially successful
  message: string; // Human-readable description of what happened
  timestamp: number; // When the command was executed
  toolCallId?: string; // Optional: links response to specific tool call for conversation coherency
}

// Lore types for categorizing notes
// PINNED types are always loaded in full:
//   - dm_instructions: GM guidance (how to run the adventure) - read every turn
//   - character_sheet: Player character details - read every turn
//   - mechanics: Game rules - read every turn
//   - gm_plan: The campaign plan/spine + per-player character arcs - read every
//     turn so the GM stays on the beat it's currently running (see
//     docs/gm-plan-notes-design.md). Player-visible.
// FOLDER types show only titles (use read_notes tool to view content):
//   - lore: General world-building (default)
//   - secret: Hidden from player (GM-only notes)
//   - table: A random table written as prose + a rollable listing. This
//     replaced the old structured CustomTable[] engine (see the DEPRECATED
//     note on CustomTable below): the GM reads the note like any other,
//     rolls the die the note names with `formula_roll`, and reads the
//     matching entry off it. Nothing about the table is engine-parsed, so a
//     table can carry as much surrounding context as the author wants -
//     when to roll it, what the results mean, which entries chain into
//     others - instead of being flattened into {text, weight} pairs.
// LEGACY types (treated as "lore" for folder display):
//   - gm_notes, npc, item, location, faction, event
export type LoreType =
  | "lore" // 📁 World Lore - titles only, default type
  | "secret" // 🔒 Secrets - titles only, hidden from player view
  | "table" // 🎲 Random tables - titles only, rolled by the GM with formula_roll
  | "dm_instructions" // 📌 GM Stage only - guidance for running the adventure
  | "story_instructions" // 📌 Story Stage only - narrator guidance for prose style
  | "mechanics" // 📌 GM Stage only - Game rules for dice/checks
  | "character_sheet" // 📌 Both stages - Player character details for voice and mechanics
  | "summary_instructions" // 📌 Summariser only - standing instructions for every story-so-far summary (decision 95); never shown to the GM or the narrator
  | "gm_plan" // 📌 GM Stage - campaign spine + per-player arcs, one beat ahead (docs/gm-plan-notes-design.md)
  // Legacy types (backward compat - treated as "lore" for display)
  | "gm_notes" // Alias for dm_instructions (deprecated)
  | "npc" // Non-player characters
  | "item" // Items, artifacts, equipment
  | "location" // Places, regions, buildings
  | "faction" // Organizations, groups, guilds
  | "event"; // Historical events, plot points

// Two-Pass Visibility state machine (see
// docs/research-paper-ttrpg-theory-gap-analysis.md §2.3). Distinct from
// `type: "secret"`, which only controls the human player's note-list UI
// (titles-only folder display). `visibility` controls what the *Narrator*
// stage is allowed to see at all, closing the "Omniscient Narrator"
// spoiler problem at the source (filtering before generation) rather than
// catching it after the fact the way consistencyCheck.ts does for a
// different failure class.
//   - always_reveal: normal, unrestricted content (the default/unset state)
//   - hidden: never surfaced to the Narrator; the GM Stage can still reason
//     about it, but it must explicitly reveal it (flip to always_reveal via
//     edit_note) for it to ever reach prose
//   - to_be_revealed: same filtering as hidden, but names an entity the GM
//     intends to reveal once a specific trigger fires (a perception check
//     succeeding, a door being opened) - the GM flips it explicitly
//   - check_per_turn: filtered like hidden, but resolved automatically each
//     turn by a small deterministic chance roll (resolveCheckPerTurnVisibility
//     in gmExecutor.ts) - the digital equivalent of a passive Perception
//     check a human GM tracks silently (e.g. a patrol that might notice
//     the party)
export type LoreVisibility =
  | "always_reveal"
  | "hidden"
  | "to_be_revealed"
  | "check_per_turn";

export interface StoryLore {
  title: string;
  content: string;
  relatedCharacters: string[];
  relatedLocations: string[];
  secrtet: boolean;
  keys: string[];
  aliases?: string[]; // Alternate names/spellings that should also match this note when highlighted in prose
  type?: LoreType; // Note category - defaults to "lore"
  visibility?: LoreVisibility; // Two-Pass Visibility state - defaults to "always_reveal" when unset
  alwaysOn?: boolean; // If true, lore is always visible regardless of triggers
  enabled?: boolean; // If false, lore is never visible/checked. Defaults to true.
  on_triggers?: string[]; // Word triggers to turn lore on
  off_triggers?: string[]; // Word triggers to turn lore off
  trigger_lores?: string[]; // Titles of other lores that turn this one on
  untrigger_lores?: string[]; // Titles of other lores that turn this one off
  thumbnailUrl?: string;
  // A picture made in play (imageStore.ts id); wins over thumbnailUrl.
  imageId?: string;
  on?: boolean;
  lastTriggeredIndex?: number; // Track when lore was last triggered for auto-expiry
  embedded?: boolean; // True if content has been embedded for semantic search
  pinned?: boolean; // User-pinned notes appear at top of list
  // Author/creator-only organization fields (not visible during gameplay)
  tags?: string[]; // Tags for filtering/categorization in creator UI
  folder?: string; // Folder name for grouping in creator UI
  // Links this entry to a note in the cross-story global Notes Library, so
  // it can be pushed/pulled instead of living as a disconnected one-time copy.
  libraryNoteId?: string;
  // Multiplayer: which CouchPlayer this character_sheet-type entry belongs
  // to. character_sheet lore entries are already a repeatable array (see
  // LoreType above - buildInfoMessage/buildGMStagePrompt inject ALL of
  // them, not just one), so a story can genuinely have multiple distinct
  // character sheets; this is the missing link identifying whose is whose.
  // Unset for the common single-player case, or a couch story where
  // everyone still shares one sheet.
  ownerCouchPlayerId?: string;
}

// Memory entry with embedding tracking
export interface MemoryEntry {
  content: string;
  embedded?: boolean; // True if content has been embedded for semantic search
  timestamp?: number; // Date.now() at creation, for recency ranking
  sceneIndex?: number; // storyData.scene.parts.length at creation, for recency ranking
  entityIds?: string[]; // Names of NPCs/threads mentioned in content, for entity-relevance ranking
  importance?: number; // 0-10, optionally self-rated by the GM at creation time (Generative-Agents-style significance signal)
  isReflection?: boolean; // True if this entry is a synthesized higher-level insight (see reflection.ts) rather than a directly-observed memory
}

// Helper to get memory content from either string or MemoryEntry format
export function getMemoryContent(memory: string | MemoryEntry): string {
  return typeof memory === "string" ? memory : memory.content;
}

// Helper to convert memory array to content strings
export function getMemoryContents(
  memories: (string | MemoryEntry)[]
): string[] {
  return memories.map(getMemoryContent);
}

// Helper to deduplicate memories, keeping the first occurrence
// Also removes extremely similar entries (differing only by minor punctuation/whitespace)
export function deduplicateMemories(
  memories: (string | MemoryEntry)[]
): (string | MemoryEntry)[] {
  if (!memories || memories.length === 0) return memories;

  const seen = new Map<string, number>(); // normalized content -> index
  const result: (string | MemoryEntry)[] = [];

  for (const memory of memories) {
    const content = getMemoryContent(memory);
    // Normalize: lowercase, trim, collapse whitespace, remove trailing punctuation variations
    const normalized = content
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[.!?,;:]+$/, ""); // Remove trailing punctuation

    if (!seen.has(normalized)) {
      seen.set(normalized, result.length);
      result.push(memory);
    }
  }

  return result;
}
export interface Chapter {
  title: string;
  summary: string;
  scene: Scene;
  notes: string[];
}
// Reasoning detail object (from OpenRouter)
// Used by Google Gemini 3 models for thought_signature
export interface ReasoningDetail {
  type: "reasoning.text" | "reasoning.summary" | "reasoning.encrypted";
  text?: string;
  summary?: string;
  data?: string;
  signature?: string;
  id?: string;
  format?: string;
  index?: number;
}

// GM Conversation message - preserves actual tool_calls and tool role structure
export interface GMConversationMessage {
  role: "assistant" | "tool";
  content: string;
  reasoning?: string; // Optional reasoning string
  reasoning_details?: ReasoningDetail[]; // Standardized reasoning tokens
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
    // Google thinking models require thought_signature in tool calls
    extra_content?: {
      google?: {
        thought_signature?: string;
      };
    };
  }>;
  tool_call_id?: string; // For tool role messages
}

// In-play pictures (docs/image-generation-design.md). The bytes live in their
// own IndexedDB database (imageStore.ts), never in StoryData; StoryData holds
// only the ids below. All of these fields are optional, so old saves and
// Designer adventures need no backfill.
export type ImageSubject = "scene" | "npc" | "player" | "location";
export interface SceneImageRef {
  imageId: string; // Also the id of the job that makes it (imageJobs.ts)
  requestedBy: "gm" | "player";
  // What the picture was asked to show, so Regenerate still works on a device
  // that holds no stored picture (the saved prompt lives with the bytes).
  description?: string;
}

export interface ScenePart {
  content: string;
  imageUrl: string;
  // Stable id of this part, set when the turn is generated (never during
  // render) so a picture job can find the turn it belongs to. Old parts have none.
  id?: string;
  // Pictures made for this turn, shown under its prose (StoryImage.tsx).
  images?: SceneImageRef[];
  user: boolean;
  role: "system" | "user" | "assistant";
  // Optional player-visible comment that is NOT sent to AI (kept separate from content)
  playerComment?: string;
  // Couch co-op: which CouchPlayer id(s) spoke this turn (see PlayerBubbles),
  // for the director layer's spotlight tracking (couchPlayerFocus below).
  speakerIds?: string[];
  reasoning?: string; // NEW: AI reasoning/thinking
  reasoning_details?: ReasoningDetail[]; // NEW: Structured reasoning tokens (OpenRouter)
  choices?: Choice[];
  memoryEntries?: string[];
  commands?: string[]; // Legacy: XML commands
  toolCalls?: any[]; // Tool calls made by AI (OpenAI/DeepSeek format)
  toolResponses?: CommandResponse[]; // Execution results of tool calls
  gmToolCalls?: any[]; // GM stage tool execution results (formula_roll results, etc.) - for backwards compat
  gmConversation?: GMConversationMessage[]; // NEW: Full GM conversation with proper tool_calls and tool messages
  gmStoryContext?: string; // GM stage context string passed to story stage
  gmThinking?: string[]; // GM stage "[GM]" reasoning text for UI display
  revealedLore?: string[]; // Lore titles manually revealed by AI in this part
  stateChanges?: string[]; // Human-readable game state changes from tool calls (for story context)
  // Non-blocking Layer-5 consistency check results (see consistencyCheck.ts)
  // - narration streams to the client before this can run, so it's recorded
  // for display/debugging and eval-harness metrics, not a live gate.
  consistencyWarnings?: ConsistencyWarning[];
  // Layer-5 observer flags (see observer.ts) that survived to the final,
  // accepted turn - i.e. minor flags, or major flags left in place because
  // the automatic reset retry budget was exhausted (fail open). A major flag
  // that triggered a reset does NOT appear here, since that turn was
  // discarded entirely - see GenerationCallbacks.onObserverReset instead.
  observerFlags?: ObserverFlag[];
  // Layer-5 observer flags (see observer.ts) that triggered a successful
  // same-turn rewrite (rewriteFlaggedNarration) - the narration was already
  // corrected before it reached the player, so these never appear in
  // observerFlags above. Carried forward the same way as storyProgressNote
  // (see buildObserverCorrectionNote in observer.ts), so the GM is told what
  // its own first draft got wrong even though the accepted turn looks clean -
  // otherwise the corrected history gives no signal that a mistake (e.g.
  // running too long) keeps happening.
  correctedObserverFlags?: ObserverFlag[];
  // The turn as it read BEFORE that rewrite (see ObserverRewriteOriginal),
  // kept so the player can put it back. The observer is a judge, not an
  // oracle: a turn it shortened may have been the long explanation the
  // player actually wanted. Set alongside correctedObserverFlags whenever a
  // rewrite lands, cleared when the player restores the original.
  observerRewriteOriginal?: ObserverRewriteOriginal;
  // What the turn's details tell the player about the judges (judge layer v2,
  // the public half of the findings): that the turn was checked and something
  // stayed flagged, or revised after a check. Never a kind, a quote or a fact.
  publicNotice?: "checked" | "revised";
  // Layer 3 periodic story-progress check-in (see storyProgressObserver.ts):
  // a GM-facing note on how the overall story is pacing (dragging, rushed,
  // or on track), produced every N turns rather than every turn. Never shown
  // to the player - read back by generateStoryTurn the same way
  // observerFlags feeds buildObserverWarningNote, to carry the note forward
  // into the next turn's prompt.
  storyProgressNote?: string;
  // Judge layer v2 rung 1 (judges/rung1.ts): a GM-only note the pacing counters
  // made after this turn (no clock moved in a while, a player not addressed,
  // phrases coming back). Carried into the next turn's check-in block once;
  // never shown to the player (decision 235).
  pacingNote?: string;
  // Repeated-phrase callout from the same Layer 3 check-in (see
  // storyProgressObserver.ts's findRepeatedPhrases): GM-facing feedback on
  // word/phrase tics the deterministic counter caught recurring across
  // turns and the judge confirmed worth flagging. Never shown to the
  // player, carried forward the same way as storyProgressNote.
  repetitionNote?: string;
  // NPC knowledge-consistency callout from the same Layer 3 check-in (see
  // storyProgressObserver.ts's KNOWLEDGE_SYSTEM_ADDENDUM): GM-facing note
  // when an NPC displayed knowledge it had no established way of having,
  // per the visible narration window. Advisory only, never shown to the
  // player, carried forward the same way as storyProgressNote.
  knowledgeNote?: string;
  npcReactions?: NPCReaction[]; // NPC reactions to show as notifications (e.g., "Lisa liked this")
  endChapter?: boolean;
  endStory?: boolean;
  raw?: string; // Raw AI output before parsing, used for alternative context building
  // Reasoning-tier router (see reasoningTiers.ts): the final tier (0-based)
  // that adjudicated this turn, after any mid-turn self-escalation or
  // model-unavailable fallback. modelKey/effort are the resolved values at
  // generation time, captured alongside the tier so a UI tooltip stays
  // accurate even if the user later edits their tier overrides. Undefined
  // on turns generated before this was tracked, and on retried turns that
  // reuse a precomputed GM conversation (no tier router run that turn).
  reasoningTier?: number;
  reasoningTierModelKey?: string;
  reasoningTierEffort?: "none" | "low" | "normal" | "high" | "xhigh";
}
export type ConsistencyWarningType = "status_contradiction";

export interface ConsistencyWarning {
  type: ConsistencyWarningType;
  entity: string;
  detail: string;
}

// Layer-5 hardening, active variant (see observer.ts): an LLM "observer"
// call reviews each completed GM turn for violations of rules already
// stated in the GM's own system prompt. A "major" flag can trigger a full
// StoryData rollback + forced retry (generation.ts); "minor" flags are
// logged/surfaced only, same posture as ConsistencyWarning.
export type ObserverFlagType =
  | "player_agency"
  | "response_length"
  | "missing_oracle_or_table"
  | "missing_scene_increment"
  | "outcome_narration_mismatch"
  | "tier_escalation_missed"
  // The judge layer v2's new judges (docs/judge-layer-v2-plan.md slice 2):
  // flag-only until confirmation and the rewrite with facts land (slice 3).
  | "world_consistency"
  | "secret_leak"
  | "lines_and_veils";
export type ObserverSeverity = "minor" | "major";

export interface ObserverFlag {
  type: ObserverFlagType;
  severity: ObserverSeverity;
  detail: string; // A fixed sentence per judge. Never the judge's own words: they may quote a secret.
  correctivePrompt: string; // Instruction injected into the GM's retry prompt when this flag triggers a reset
  /**
   * The private finding behind a combined-call flag (judges/combined.ts): the
   * quote, the fact ids and the judge's one-sentence fix. Read by the Debug
   * Logs, the confirming judge and the rewrite, and stripped from what online
   * guests are sent (judges/publicView.ts). A secret-leak or lines-and-veils
   * finding keeps no `fix`: it could name the very thing it removes.
   */
  finding?: ObserverFinding;
}

export interface ObserverFinding {
  evidence: string;
  factIds: string[];
  fix: string;
}

// A rewritten turn's discarded first draft (see observer.ts's
// rewriteFlaggedNarration and ScenePart.observerRewriteOriginal). Everything
// the rewrite touched is captured here so restoring is a straight swap back:
// the prose the player saw stream, the choices that were parsed from it, and
// the GM history as it stood before reconcileGmConversationAfterRewrite
// spliced the correction marker in.
export interface ObserverRewriteOriginal {
  content: string;
  /** The flag that triggered the rewrite - shown on the restore button so the player knows what the observer objected to. */
  flag: ObserverFlag;
  gmConversation?: GMConversationMessage[];
  gmThinking?: string[];
  choices?: Choice[];
}

export interface Choice {
  text: string;
  intro_override?: string; // Optional: For starting choices, use this text instead of AI generation
  stt_input?: boolean; // True if text was input via speech-to-text (may contain transcription errors)
}
export interface Scene {
  parts: ScenePart[];
  // Rolling summary of parts that have aged out of the per-stage token
  // budget (see compaction.ts). Without this, pruned history was just
  // silently dropped - the summary keeps a compressed trace of it instead.
  summary?: string;
  // How many parts (from the start of `parts`) are covered by `summary`,
  // so compaction only needs to summarize newly-dropped parts, not redo it
  // from scratch every turn.
  summarizedThroughIndex?: number;
  // Deterministic cross-check results from the most recent compaction pass
  // (validateCompactionSummary in compaction.ts) that survived one revision
  // attempt - e.g. an NPC tracked as dead described as actively present, or
  // a heavily-referenced entity dropped entirely from the summary. Human-
  // readable strings, undefined/omitted when the last summary was clean.
  summaryWarnings?: string[];
  // Index into `parts` (same convention as summarizedThroughIndex) as of
  // the most recent increment_scene tool call - i.e. "everything before
  // this index belongs to the scene that just ended." Used by
  // compaction.ts to prefer summarizing exactly through a scene boundary
  // rather than an arbitrary token-budget cutoff, when one is available
  // within a reasonable window of that cutoff (see §3.2 in
  // docs/research-paper-ttrpg-theory-gap-analysis.md).
  lastSceneBoundaryIndex?: number;
}
export interface Goal {
  id: string; // Unique identifier for the goal
  title: string;
  shortDescription: string; // Brief summary shown in goal list
  description: string; // Full goal description with details
  active: boolean; // Whether the goal is currently active/visible to player
  fulfilled: boolean; // Whether the goal has been completed
  createdAt?: Date; // When the goal was created (for ordering)
}
// NPC Status - alive, dead, missing, unknown, departed
export type NPCStatus = "alive" | "dead" | "missing" | "unknown" | "departed";

// NPC Attitude - how they generally treat the player
export type NPCAttitude =
  | "hostile"
  | "unfriendly"
  | "neutral"
  | "friendly"
  | "allied";

// NPC/Character tracking (enhanced relationship system)
export interface NPC {
  id: string; // Unique identifier
  name: string; // NPC name
  description: string; // Who they are, appearance, personality
  role: string; // Their role in the story (e.g., "Village Elder", "Antagonist", "Love Interest")
  status: NPCStatus; // alive, dead, missing, unknown, departed
  relationship: string; // Custom text description (e.g., "Trusted mentor", "Bitter rival", "Complicated")
  attitude: NPCAttitude; // hostile, unfriendly, neutral, friendly, allied
  lastSeen?: string; // Where/when last encountered
  faction?: string; // What group they belong to
  symbol?: string; // Emoji icon
  custom_symbol_url?: string; // Custom image URL (for reactions)
  // A portrait made in play (imageStore.ts id); wins over custom_symbol_url and the emoji.
  portraitImageId?: string;
  notes?: string; // GM/player notes
  aliases?: string[]; // Alternate names/spellings that should also match this NPC when highlighted in prose
  createdAt: number; // Timestamp
}

// NPC Reaction - shown as toast notification (like "Lisa liked this")
export interface NPCReaction {
  npcId: string; // Which NPC is reacting
  npcName: string; // NPC name (for display)
  npcImage?: string; // NPC image URL
  npcPortraitImageId?: string; // The NPC's portrait made in play (imageStore.ts); wins over npcImage
  reaction: string; // The reaction text (e.g., "liked this", "is disappointed", "gained respect")
  emoji?: string; // Optional emoji (e.g., "❤️", "😠", "🤔")
  context?: string; // What triggered the reaction
}

// Scene Challenge (Best of X) for multi-step challenges
export interface SceneChallenge {
  id: string; // Unique identifier
  name: string; // Display name (e.g., "Battle with the Orcs")
  description?: string; // Optional description of the challenge
  rounds: number; // first_to: "Best of X" display figure only (odd: 3, 5, 7, 9) - NOT the win/loss threshold, see requiredSuccesses/maxFailures. tally: the real number of results the challenge takes.
  currentSuccesses: number; // Current success count
  currentFailures: number; // Current failure count
  // The actual win/loss thresholds as declared at start_challenge time -
  // kept independent so an intentionally asymmetric challenge (e.g. 3
  // successes to win but 5 failures to lose) isn't silently collapsed into
  // one symmetric majority derived from `rounds`. Optional only for
  // backward compat with challenges started before this field existed -
  // falls back to the old rounds-derived majority for those.
  requiredSuccesses?: number;
  maxFailures?: number;
  active: boolean; // Whether challenge is ongoing
  createdAt: number; // Timestamp when challenge started
  resolvedAt?: number; // Timestamp when challenge ended
  result?: "won" | "lost" | "even"; // Outcome if resolved ("even": a tally challenge that ended at 0)
  // "first_to" (default, unset on old saves): currentSuccesses/currentFailures
  // against requiredSuccesses/maxFailures. "tally": exactly `rounds` results,
  // strong hit +1 / weak hit 0 / miss -1, summed into `tally`.
  mode?: "first_to" | "tally";
  tally?: number;
  recorded?: number; // results recorded so far, tally mode
}

// ============================================
// COUNTDOWN TIMER SYSTEM
// ============================================

/**
 * A countdown timer that ticks down over GM turns
 * Used for deadlines, rituals, time-limited events
 * Unlike challenges (which track successes), timers simply count down
 */
export interface CountdownTimer {
  id: string; // Unique identifier
  name: string; // Display name (e.g., "Ritual Completion", "Reinforcements Arrive")
  description?: string; // What happens when timer reaches 0
  totalTicks: number; // Maximum ticks (set at creation)
  currentTicks: number; // Remaining ticks (counts down to 0)
  autoAdvance: boolean; // If true, automatically decrements each GM turn
  status: "active" | "paused" | "triggered" | "cancelled";
  visibility: "visible" | "hidden"; // Whether player sees the countdown
  createdAt: number; // Timestamp when timer was created
  triggeredAt?: number; // Timestamp when timer reached 0
}

// ============================================
// METERS, PROGRESS TRACKS, SESSIONS
// docs/default-systems-design.md section 4
// ============================================

export interface MeterThreshold {
  at: number; // the label applies at and above this value
  label: string; // "Attention"
  note?: string; // what it means, reported to the GM when crossed
}

export interface Meter {
  id: string; // meterId(owner, name), see metersAndTracks.ts
  owner: string; // a character's name as the GM writes it, or "world"
  name: string; // unique per owner, case-insensitive
  min: number;
  max: number;
  cap: number; // current ceiling: floor <= cap <= max
  floor: number; // current floor: min <= floor <= cap
  value: number; // floor <= value <= cap
  thresholds?: MeterThreshold[];
  resetsAtSessionEnd?: number; // end_session sets value to this
  onlyUp?: boolean; // never falls (Beast)
  hidden?: boolean; // GM state only, not the player's panel
  description?: string;
}

export interface MeterDefinition {
  name: string;
  min: number;
  max: number;
  start: number;
  cap?: number; // defaults to max
  floor?: number; // defaults to min
  thresholds?: MeterThreshold[];
  resetsAtSessionEnd?: number;
  onlyUp?: boolean;
  hidden?: boolean;
  description?: string;
}

export interface MeterSet {
  name: string; // "Blood & Bone character"
  description?: string;
  meters: MeterDefinition[];
}

export type TrackRank =
  | "troublesome"
  | "dangerous"
  | "formidable"
  | "extreme"
  | "epic";
export type TrackKind = "vow" | "condition" | "enemy" | "journey" | "other";
export type TrackStatus = "active" | "fulfilled" | "forsaken" | "cleared";

export interface ProgressTrack {
  id: string; // trackId(owner, name)
  owner: string;
  name: string;
  kind: TrackKind;
  rank: TrackRank;
  ticks: number; // 0..40
  status: TrackStatus;
}

export interface MeterDedupKey {
  meterId: string;
  key: string; // the trigger: "sunlight"
  scope: "scene" | "session";
  at: number; // sceneCount or sessionCount when used
}

export interface SystemState {
  // Explicit switch for decision 79, set by hand in the AdventureInspector.
  // Unset means "derive it": a story whose lore holds a built-in system's
  // notes uses that system's tools (systems/resolve.ts).
  usesSystemTools?: boolean;
  sessionCount: number;
  dedupKeys: MeterDedupKey[];
  // Built-in note ids the story has been given (it held them, or they were
  // added when it loaded). A note in this list is never added again, so one
  // the player deleted stays deleted. Absent on a story saved before the list
  // existed: the ids it holds then count as offered (builtinNotes.ts).
  builtinNotesOffered?: string[];
  // The built-in setting the story is played in, set by the starter it came
  // from: "grave-watch", "last-resort". Unset means Europe by Night (every
  // story before E5, and The Hollow Hour). Only a Europe by Night story is
  // given the cross-Europe notes on load (builtinNotes.ts, design E5 §5).
  setting?: string;
  // The built-in system the story runs, recorded when it first resolves to
  // one (recordSystemId). Wins over note matching afterwards, so importing or
  // deleting a note never switches the system mid-campaign.
  systemId?: string;
  // Fantastic Realms hero state (systems/fantastic-realms/engine.ts).
  fantasticRealms?: FantasticRealmsState;
}

/**
 * One feat of a Fantastic Realms hero: a stable id, its wording, whether it is
 * burned. Every field past `burned` is optional (docs/fr-expansion-plan.md E1),
 * so a feat saved before the expansion reads as a plain skill.
 */
export interface HeroFeat {
  id: string;
  wording: string;
  burned: boolean;
  /** Absent means a skill. A spell makes a roll magic; an item can be lost or broken. */
  kind?: "skill" | "spell" | "item";
  /** Items only, at most two (a wonder). Keen and Swift change engine numbers. */
  qualities?: ItemQuality[];
  /** Items only. A broken or lost item cannot be named in a roll. */
  status?: "broken" | "lost";
}

export type ItemQuality =
  | "keen"
  | "sturdy"
  | "warded"
  | "swift"
  | "bright"
  | "cursed"
  | "hardy"
  | "silent"
  | "blessed"
  | "returning"
  | "masterwork"
  | "heirloom";

/** A word on a hero that costs a die where it gets in the way. A scar never clears on its own. */
export interface HeroCondition {
  word: string;
  /** What clears it, when a rest does not ("an antidote"). */
  cure?: string;
  scar?: boolean;
}

export interface FantasticRealmsHero {
  /** The hero's name as the GM spelled it first (the state is keyed by the normalised name). */
  name?: string;
  feats: HeroFeat[];
  /** Award sources already credited to this hero (award_xp refuses repeats). */
  rewards: string[];
  conditions?: HeroCondition[];
  /** Died or left the party: kept for history, out of party rests, default selections and the hero line. */
  retired?: boolean;
  /** Counted uses spent, keyed "<featId>:<scene|rest|adventure>". */
  uses?: Record<string, number>;
}

export interface FantasticRealmsState {
  /** Keyed by the normalised owner name the hero's meters use. */
  heroes: Record<string, FantasticRealmsHero>;
  /** The realm id the story is in (take_rest). */
  realm?: string;
  /** Hearth improvements: any hero may name one (decision 256). */
  partyFeats?: HeroFeat[];
  /** Team burns spent since the last party rest. */
  teamBurnsUsed?: number;
  /** Counted uses of party feats, keyed "<partyFeatId>:<per>". */
  partyUses?: Record<string, number>;
}

// ============================================
// COMBAT SYSTEM
// ============================================

/**
 * A combatant in tactical combat - can be player, ally, enemy, or neutral
 * Stats are completely custom (system-dependent) - no hardcoded HP/AC
 */
/**
 * Combat condition with optional duration
 */
export interface CombatCondition {
  name: string; // Condition name (e.g., "Stunned", "Prone")
  duration?: number; // Turns remaining (undefined = permanent)
}

export interface Combatant {
  id: string; // Unique identifier
  name: string; // Display name (e.g., "Goblin Warrior", "Player")
  type: "player" | "ally" | "enemy" | "neutral";
  stats: Record<string, number>; // Completely custom stats: { HP: 12, Armor: 14, Attack: 5 }
  conditions: CombatCondition[]; // Conditions/status effects with optional duration
  initiative: string; // Initiative formula: "5" (fixed) OR "1d20+4" (rolled at combat start)
  initiativeRoll?: number; // Actual rolled initiative value (calculated at combat start)
  loreRef?: string; // Optional link to lore entry title for full NPC details
  isActive: boolean; // Still in combat? (false = dead/fled/incapacitated)
  notes?: string; // GM notes about this combatant's behavior/tactics
}

/**
 * Active combat state tracking
 * Only one combat can be active at a time
 */
/**
 * Reasoning-tier router state — tracks self-escalation decay and the
 * per-scene top-tier call cap across turns. Scene boundaries aren't a
 * formal concept elsewhere in StoryData, so `lastSceneKey` is an opaque
 * heuristic string (see reasoningTiers.ts) rather than a real scene id.
 */
export interface ReasoningTierState {
  currentTier: number; // Tier used for adjudication last turn (decays toward baseline each turn)
  tier3CallsInScene: number; // Top-tier calls used against MAX_TIER3_CALLS_PER_SCENE
  lastSceneKey?: string; // Opaque scene-boundary key; resets tier3CallsInScene when it changes
  // Scene-boundary key (same computeSceneKey format as lastSceneKey) as of
  // the last formula_roll/opposed_formula that declared stakes: "high" or
  // "deadly". Unlike currentTier (which decays every turn regardless of
  // scene boundary), this persists for the whole scene, so the M2
  // roll-invariant gate in generation.ts can tell "stakes were declared
  // earlier this scene" apart from "tier happens to still be elevated."
  highStakesSceneKey?: string;
}

export interface CombatState {
  active: boolean; // Is combat ongoing?
  name?: string; // Combat name (e.g., "Battle in the Tavern", "Ambush on the Forest Road")
  combatants: Combatant[]; // All participants in combat
  turnOrder: string[]; // Combatant IDs sorted by initiative (highest first)
  currentTurnIndex: number; // Index into turnOrder for whose turn it is
  round: number; // Current round number (starts at 1)
  log?: string[]; // Combat log for reference (recent actions)
}

export interface Choices {
  choices: Choice[];
}
export interface Preset {
  id: string;
  name: string;
  description: string;
  icon: string;
  characterSheet?: string; // Pre-written character sheet markdown for this preset
  intro?: string; // Unique intro text for this preset (optional for backward compatibility)
  authorNotes: string;
}

// Custom random tables
//
// DEPRECATED - backward compat only. Random tables are now `StoryLore`
// entries with `type: "table"`: freeform notes the GM reads and rolls on
// itself with `formula_roll`, rather than a structured shape the engine
// picks from. Existing `customTables` are converted to notes once, on load,
// by migrateCustomTablesToNotes() in tableNotes.ts; nothing writes to these
// fields any more. Don't build new features against them.
export interface CustomTableEntry {
  text: string; // The result text
  weight: number; // Probability weight (higher = more likely)
}

/** @deprecated Use a `StoryLore` note with `type: "table"`. */
export interface CustomTable {
  id: string; // Unique identifier
  name: string; // Display name (e.g., "Weather Conditions")
  description: string; // What this table is for
  entries: CustomTableEntry[]; // Array of possible results
  // Links this entry to a table in the cross-story global Tables Library, so
  // it can be traced back instead of living as a disconnected one-time copy.
  libraryTableId?: string;
}

export type MultiplayerMode = "host" | "any" | "timer";

// A lightweight, PaSSAGE-inspired player-preference signal (Robin Laws'
// player-type taxonomy, narrowed to three deterministically-classifiable
// buckets - see classifyPlayerStyle in mythic.ts): does this player's
// freeform input lean toward action, social/dialogue, or
// investigation/tactics? Classified by keyword heuristic at input time
// (same class of lightweight regex classification this codebase already
// uses in embeddings.ts's calculateMemoryImportance), never by grading the
// GM's own narration - it only ever looks at what the player typed/said.
export type PlayerStyleType = "action" | "social" | "tactical";

// Robin D. Laws' player-type taxonomy (see docs/gm-advice research), picked
// explicitly by the player themselves - distinct from PlayerStyleType above,
// which is a behavioral signal inferred from what they actually type. Purely
// advisory: read by ai_staged.ts's buildInfoMessage to tell the GM how to
// engage this player, never fed into selectDirectorMove's move selection.
export type PlayerArchetype =
  | "power_gamer"
  | "butt_kicker"
  | "tactician"
  | "specialist"
  | "method_actor"
  | "storyteller"
  | "casual_gamer";

// A couch co-op player: a colored, named "bubble" a person at the table taps
// to speak their turn. Distinct from the legacy typed-name hot-seat flow.
export interface CouchPlayer {
  id: string;
  name: string;
  color: string; // hex color, e.g. "#22c55e"
  // Curated tags picked in the GuidedStoryStart wizard (PERSONALITY_TAGS /
  // WISH_TAGS in GuidedStoryStart.tsx) - persisted here (not just baked into
  // the one-off "Players & Preferences" lore note) so selectDirectorMove's
  // spotlight_tag move has durable state to read. Solo play has no
  // CouchPlayer at all; see StoryData.playerPersonalityTags/playerWishTags
  // for that case.
  personalityTags?: string[];
  wishTags?: string[];
  // Self-selected Robin Laws player type - see PlayerArchetype above.
  archetype?: PlayerArchetype;
}

// Which fixed spine preset a campaign is running (campaignPlan.ts). The GM
// judges this from the premise/player intent when it creates the spine note;
// "medium" is the fallback when it doesn't specify.
export type SpineLength = "short" | "medium" | "long";

// Phase 2 campaign-plan tracking (docs/gm-plan-notes-design.md,
// campaignPlan.ts). A lightweight pointer into the fixed dramatic spine, kept
// separate from the readable plan (which lives in the gm_plan note) so the
// deterministic re-planning gate has stable, parse-free state to key off.
export interface PlanState {
  beats: string[]; // Fixed spine beat names, in order (a CAMPAIGN_SPINE_* preset)
  currentBeatIndex: number; // Which beat is being run now
  // True once the GM marks the current beat complete (advance_plan
  // complete_current) but before it details & moves to the next beat
  // (advance_plan write_next). The gate fires while this is true.
  awaitingNextBeat?: boolean;
  spineNoteTitle?: string; // Title of the gm_plan note that is the spine
  spineLength?: SpineLength; // Which preset `beats` came from
}

// Session-zero setup state (docs/session-zero-design.md 3.1). The steps are
// derived from live state by getSetupProgress (campaignPlan.ts); only what
// cannot be derived is stored here. Absent on old saves and outside session
// zero. Never part of a party phone's view.
export interface SetupState {
  mode?: "quick" | "full"; // chosen by the player
  conceptDone?: boolean; // a setup question was answered
  // The player pressed "Start the story" on the setup card. The hashes are of
  // exactly what the card showed (hashNotes), so any later edit to the sheet
  // or the plan cancels the approval.
  approval?: {
    sheetHash: string;
    planHash: string;
    // The campaign record (hashCampaignRecord): present only when the story
    // had a real record at approval. Absent on stories approved with a plan
    // note alone, and on saves from before the record.
    campaignHash?: string;
  };
  referenceTitles?: string[]; // notes read during setup, newest first
  questionsAsked?: number; // setup questions answered this session zero
  // Creation steps asked and answered (setupSteps.ts), recorded by
  // ask_question's `setup_step`. `table` holds table-scope step ids, `players`
  // the player-scope ones by player id ("solo" in solo play). Absent means
  // nothing is covered.
  covered?: { table: string[]; players: Record<string, string[]> };
  // Players (ids as setupParticipants gives them, "solo" in solo play) who
  // already had a populated character sheet when the setup style was chosen.
  // They are not asked the per-character steps; table and world steps still
  // apply. Set once, with `mode` (premadePlayerIds in campaignPlan.ts).
  premadeFor?: string[];
}

export interface StoryData {
  story_name: string;
  premise: string;
  // True only for a brand-new story, until the GM calls start_game to wrap
  // up session zero (premise/character setup). While true, hardRuleFloor
  // (reasoningTiers.ts) forces the reasoning tier to TOP_TIER regardless of
  // the normal classifier, since campaign-shaping decisions belong there.
  // Old saves: undefined behaves as false (no session zero to run).
  sessionZeroActive?: boolean;
  // Session-zero setup state (see SetupState).
  setup?: SetupState;
  player_name: string;
  player_summary: string;
  // Names the engine offered (the last 30: generate_name's candidates and the
  // drawer's), accepted by add_npc and the campaign tool (names/accept.ts).
  // Private like the drawer: stripped from online snapshots
  // (withoutPrivateRandomness). Optional, so old saves need no backfill.
  nameLedger?: string[];
  // The built-in name list's style, recorded the first time generate_name is
  // given one (names/builtinLists.ts). Unset means "fantasy".
  nameStyle?: "fantasy" | "modern" | "historical-european" | "nordic";
  // Custom display settings for chat-like story view (multiplayer-ready)
  displayName?: string; // Custom display name (falls back to player_name, then auth user name)
  displayAvatar?: string; // Custom avatar URL (falls back to auth user avatar)
  // Local multiplayer configuration (hot-seat / same-device scaffolding)
  multiplayer?: {
    enabled: boolean;
    mode?: MultiplayerMode;
    timerMinutes?: number; // Used when mode === "timer"
    hostUserId?: string; // Auth user id of the host (used when mode === "host" | "timer")

    // Legacy fields (no longer used by UI; kept for backward compatibility)
    players?: string[]; // Legacy roster
    host?: string; // Legacy host display name

    // Couch co-op: persistent named/colored player bubbles for same-device
    // pass-and-play speech-to-text turns (see PlayerBubbles component).
    couchPlayers?: CouchPlayer[];
    // Director-layer spotlight tracking: CouchPlayer id -> turns since they
    // last spoke (see ScenePart.speakerIds, and selectDirectorMove's
    // spotlight_couch_player selection in mythic.ts). Only meaningful when
    // couchPlayers.length > 1 - a no-op for single-player stories.
    couchPlayerFocus?: Record<string, number>;
    // Player modeling: CouchPlayer id -> observed counts per PlayerStyleType,
    // accumulated as each player's turns come in (see classifyPlayerStyle,
    // mythic.ts, and its call site in page.tsx's handleCustomInput). Read by
    // selectDirectorMove to break close spotlight-selection ties toward
    // whichever neglected player's style best fits the current scene
    // (tension-driven vs. calm) rather than picking arbitrarily. Only
    // meaningful when couchPlayers.length > 1.
    playerStyleCounts?: Record<string, Record<PlayerStyleType, number>>;
  };
  // Solo-play equivalent of CouchPlayer.personalityTags/wishTags below - the
  // GuidedStoryStart wizard collects these for every story (including
  // single-player), but `multiplayer`/`couchPlayers` is only ever created
  // when there's more than one player. Read by selectDirectorMove's
  // spotlight_tag move; undefined/empty means the player picked no tags
  // (an older save, or they skipped the wizard step) and the move is a no-op.
  playerPersonalityTags?: string[];
  playerWishTags?: string[];
  // Solo equivalent of CouchPlayer.archetype - see PlayerArchetype above.
  playerArchetype?: PlayerArchetype;
  characterSheet?: string; // Filled character sheet markdown (from template)
  intro: string;
  memory: (string | MemoryEntry)[]; // Supports both legacy string[] and new MemoryEntry[] format
  // How far into `memory` the reflection pass (see reflection.ts) has
  // already synthesized higher-level insights from. Same
  // "cutoff index tracked so re-running is a no-op" convention as
  // scene.summarizedThroughIndex for compaction.
  memoryReflectedThroughIndex?: number;
  max_chapters: number;
  currentChapter: number;
  chapters: Chapter[];
  scene: Scene;
  lore: StoryLore[];
  goals: Goal[]; // Goal system (player-facing objectives)
  npcs: NPC[]; // NPC tracking system (enhanced relationships)
  activeChallenge?: SceneChallenge; // Current scene challenge (progress clock)
  // Title of the gm_plan note for the side beat that currently holds focus
  // (a side quest / character detour opened via open_side_beat). While set,
  // the GM stage foregrounds that beat over the main campaign spine; cleared
  // by close_side_beat. See docs/gm-plan-notes-design.md.
  activeSideBeatTitle?: string;
  // Phase 2 campaign-plan tracking (docs/gm-plan-notes-design.md,
  // campaignPlan.ts). Lightweight pointer into the fixed beat spine that
  // powers the deterministic re-planning gate; the readable plan itself lives
  // in the gm_plan note, not here. Auto-initialized when the spine note is
  // created; undefined for stories that never establish a plan.
  planState?: PlanState;
  // Phase 4 grounding gate (docs/gm-plan-notes-design.md): true once
  // read_notes/search_notes has been called during the CURRENT turn. Reset to
  // false at the start of every turn (generation.ts); used only to gate
  // creating the gm_plan "Campaign Plan" spine note when existing
  // lore/mechanics/dm_instructions notes haven't been read yet. Turn-scoped
  // bookkeeping, not meaningful once the turn ends - don't read it elsewhere.
  notesReadThisTurn?: boolean;
  timers?: CountdownTimer[]; // Countdown timers for deadlines/events
  // The campaign record (docs/campaign-format-design.md): factions, fronts, clocks,
  // secrets and clues, beats. Absent on old saves, which run as they always did.
  campaign?: CampaignRecord;
  meters?: Meter[]; // Numeric meters (Stress, Beast, Heat...), see metersAndTracks.ts
  progressTracks?: ProgressTrack[]; // Vows, conditions, enemies, journeys
  systemState?: SystemState; // Session count, once-per dedup keys, the tools switch
  combatState?: CombatState; // Active tactical combat state (turn-based combat tracking)
  threads?: StoryThread[]; // Active story threads/plotlines (independent of AGMT)
  reasoningTierState?: ReasoningTierState; // Reasoning-tier router: decay/cap tracking across turns
  author_notes?: string;
  player_notes?: string;
  selected_preset?: string; // ID of the preset used
  presets?: Preset[]; // Adventure-specific character presets
  nsfw?: boolean; // Whether the story contains NSFW content
  difficulty?: AdventureDifficulty; // Adventure difficulty (affects DC/points scaling)
  // Who rolls the player's dice: "ai" (default) = the GM rolls digitally via
  // formula_roll etc.; "manual" = the players roll physical dice at the table
  // and the GM uses ask_for_roll to collect their results; "physical" = the
  // player throws a 3D die on-screen (DiceThrowModal), settled by real
  // physics, still via formula_roll/opposed_formula.
  diceMode?: DiceMode;
  // Suggested-action chips: after each turn, run an extra AI call to propose
  // a few tappable next actions (shown above the composer, alongside the
  // always-available freeform text box). Off by default - most players just
  // type/speak their action; this is an opt-in for players who like picking
  // from a short list instead.
  autoGenerateChoices?: boolean;
  agmtState?: AGMTState; // Advanced RPG Tools state (chaos factor, threads, characters)
  // Random events the oracle has triggered but the GM hasn't yet confirmed
  // incorporating into the narrative. Unlike a one-off context hint (easy to
  // silently drop), these persist and keep reappearing in the GM's context
  // every turn until explicitly cleared via resolve_random_event - see
  // gmExecutor.ts (fate_question) and toolExecutor.ts (increment_scene).
  pendingRandomEvents?: PendingRandomEvent[];
  // Director-layer GM moves selectDirectorMove has chosen but the GM hasn't
  // yet acknowledged incorporating - same persist-until-resolved lifecycle
  // as pendingRandomEvents above (see acknowledge_director_move).
  pendingDirectorMoves?: PendingDirectorMove[];
  // MIGRATION INPUT ONLY. Old saves carry their random tables here;
  // migrateCustomTablesToNotes() in tableNotes.ts converts them to
  // `type: "table"` lore notes on load, and nothing else reads or writes the
  // field. It survives the legacy removal (decision 126) so those tables turn
  // into notes instead of being dropped with the rest of the arcade data.
  customTables?: CustomTable[];
  starting_choices?: StartingChoice[]; // Optional custom starting choices from adventure
  loreEmbeddingsDirty?: boolean; // Flag indicating lore has changed and needs re-embedding

  // Character Sheet Template (copied from Adventure for custom character creation)
  characterSheetTemplate?: CharacterSheetTemplate;

  // Filled character data from custom character creation
  characterData?: Record<string, string>;

  // Ids of GM-advice tips (see gmAdvice.ts's GM_ADVICE_TIPS) already surfaced
  // to the GM via increment_scene, most-recent-last. Read by
  // selectGMAdviceForScene to avoid repeating the same tip within its
  // rotation window before the pool cycles back around.
  shownGMAdviceIds?: number[];

  // Director-layer spotlight ledger for narrative threads/NPCs (see
  // directorAssistant.ts) - the thread/character equivalent of
  // multiplayer.couchPlayerFocus above, but tracking narrative spotlight
  // instead of couch-player turn order. Populated post-turn by
  // runDirectorAssistant (an LLM side-call, same fail-open posture as
  // memoryAgent.ts/observer.ts), gated to only run on scene increments.
  // Read by selectDirectorMove to prefer the most-neglected active thread/
  // NPC wherever it previously picked one arbitrarily (e.g. activeThreads[0])
  // - never used to pick a move itself, preserving the "engine decides,
  // model narrates" split every other move already follows.
  directorAssistant?: {
    threadSpotlight?: Record<string, number>; // StoryThread.id -> turns since spotlighted
    npcSpotlight?: Record<string, number>; // NPC.name -> turns since spotlighted
  };

  // Layer 3 periodic story-progress check-in (see storyProgressObserver.ts):
  // counts accepted turns since the last check-in, reset to 0 whenever one
  // runs. Compared against getStoryProgressCheckInterval() (layerSettings.ts,
  // default 10) to decide when the next one is due. Deliberately a plain
  // counter rather than piggybacking on agmtState.sceneCount - this fires on
  // a turn cadence, not a scene cadence, since scenes vary wildly in length.
  turnsSinceStoryProgressCheck?: number;

  // In-play pictures (imageStore.ts holds the bytes; see ImageSubject above).
  playerPortraitImageId?: string; // The player character's portrait
  imageStyle?: string; // This story's art-style line; unset uses DEFAULT_IMAGE_STYLE
  // GM-picture cap bookkeeping: counts generate_image calls in the current
  // scene and resets when the scene key changes (the tier3CallsInScene pattern).
  imageState?: { gmImagesInScene: number; lastSceneKey?: string };
}

// Advanced RPG Tools state tracking
export interface AGMTState {
  chaosFactor: number; // 1-9, default 5
  sceneCount: number; // Number of scenes played
  skillCheckHistory: SkillCheckResult[]; // Recent skill check results
  currentStreak: number; // Positive = success streak, negative = failure streak
  lastChaosAdjustment: number; // Scene number of last chaos adjustment
  // Director-layer tension/hope-fear estimate (0-10, default 5). Nudged by
  // increment_scene alongside chaosFactor (see adjustTension in mythic.ts) -
  // combat, near-zero timers, and "Interrupted" scene checks raise it; calm
  // scenes with no pressure lower it. Read by selectDirectorMove to bias
  // beat-type/move selection - never set directly by the model.
  tension?: number;
  // Turn index (scene.parts.length) at the last successful fate_question or
  // roll_table call, stamped by executeGMTools. Drives the "turns since you
  // last consulted the oracle" line in the prompt's Oracle State section - a
  // visible, mounting counter lands harder than the static advice prose that
  // was the only nudge before it. Undefined means the oracle has never been
  // consulted in this story. Never set by the model; it only moves when an
  // oracle tool actually runs.
  lastOracleTurn?: number;
  // The turn a quiet-run tripwire last rolled (tripwires.ts), so the oracle
  // nudge's own counter is never faked. Unset until the first roll.
  lastQuietRunRoll?: number;
  // Prima Materia's tonal register (see primaMateria.ts). Distinct from
  // chaosFactor/tension, which are both *intensity* dials - this tracks
  // what KIND of moment the story is in, and is what stops the GM drifting
  // monotone between tension changes. Moved only by a Lens Shift (doubles
  // on the two d12s of a portent roll), never set by the model. Undefined
  // on older saves and treated as "neutral".
  tint?: "day" | "neutral" | "night";
  // Scene count at the last Lens Shift, so a shift can be reported as new
  // in the turn it happened and as standing register thereafter.
  lastTintShiftScene?: number;
}

// Cap on how many unresolved random events accumulate on StoryData - if the
// GM never resolves them, drop the oldest rather than growing the prompt
// context forever.
export const MAX_PENDING_RANDOM_EVENTS = 5;

// A random event the oracle triggered (Mythic-style Event Focus + Meaning),
// tracked as durable state until the GM explicitly resolves it, rather than
// a single advisory line in the prompt that can be silently missed.
export interface PendingRandomEvent {
  id: string;
  // Which mechanism triggered it. "tripwire" is the engine's own roll when a
  // quiet turn crossed a line (tripwires.ts, randomness plan R4).
  source: "fate_question" | "scene_check" | "tripwire";
  tripwire?: "rest" | "session" | "travel" | "quiet_run"; // Set when source is "tripwire"
  focus?: string; // Event Focus category (e.g. "NPC action", "Move toward a thread")
  action: string; // Meaning table Action roll (e.g. "Betray")
  subject: string; // Meaning table Subject roll (e.g. "A rival")
  // Prima Materia portent describing the *condition* the event embodies,
  // rolled alongside the Mythic action/subject pair. The pair says what
  // happens; the portent says what it means, with the relation between its
  // two terms fixed by the dice instead of left for the model to invent.
  // Optional: older saves and any event created before this shipped won't
  // have one, and the event is still fully usable without it.
  portent?: string;
  context?: string; // The fate question asked, or scene-check context
  createdAt: number;
}

// Cap on how many unresolved director moves accumulate on StoryData - same
// "persist until acknowledged, drop oldest" convention as PendingRandomEvent.
export const MAX_PENDING_DIRECTOR_MOVES = 5;

// A PbtA-style GM move the director's deterministic selectDirectorMove policy
// chose to fire (see mythic.ts), tracked as durable state until the GM calls
// acknowledge_director_move - mirrors PendingRandomEvent's shape/lifecycle so
// the model can't silently drop a move by burying it in one turn's prose.
// The model renders the move as narration; it never selects which move fires.
export interface PendingDirectorMove {
  id: string;
  move:
    | "announce_future_badness"
    | "tick_a_clock"
    | "spotlight_couch_player"
    | "put_someone_in_a_spot"
    | "offer_opportunity"
    | "reveal_unwelcome_truth"
    | "spotlight_tag";
  targetThreadId?: string; // For tick_a_clock / put_someone_in_a_spot / offer_opportunity
  targetTimerId?: string; // For tick_a_clock
  targetClockId?: string; // For tick_a_clock: a campaign clock (checked before targetTimerId)
  targetCouchPlayerId?: string; // For spotlight_couch_player
  targetLoreTitle?: string; // For reveal_unwelcome_truth - a StoryLore.title
  context?: string; // Why this move fired (e.g. which trigger condition)
  createdAt: number;
  // Hardness dimensions (see FormulaRollParams.target/forces_choice in
  // gmTools.ts and §2.2/the Director-layer follow-up in
  // docs/research-paper-ttrpg-theory-gap-analysis.md), extended to the
  // pacing layer so a director-driven consequence can be tuned the same
  // way a dice-driven one is. Deliberately set only at selectDirectorMove's
  // most severe trigger, from already-tracked state - not a general dial.
  hardnessTarget?: "self" | "someone_they_love" | "someone_present";
  hardnessForcesChoice?: boolean;
  // For spotlight_tag: which player/tag was chosen, and a fixed sample of 3
  // (of that tag's 10 curated) TagFocusExample entries from
  // tagFocusExamples.ts - sampled once at selectDirectorMove time and
  // persisted here so they stay stable across the turns this move remains
  // pending/unacknowledged, rather than re-rolling on every render.
  targetPlayerName?: string;
  targetTag?: string;
  // Prima Materia complication seed, rolled once when a pressure move
  // fires (announce_future_badness / put_someone_in_a_spot). The engine
  // already decides WHICH move fires; without this the move's actual
  // content was pure model improvisation, which is where its habitual
  // complications came from. Same split as tagFocusExamples above: rolled
  // once at selectDirectorMove time and persisted so it stays stable while
  // the move is pending, and it seeds the model rather than scripting it.
  complicationSeed?: string;
  tagFocusExamples?: { prompt: string; table: string }[];
}

export interface SkillCheckResult {
  sceneNumber: number;
  success: boolean;
  skill: string;
  difficulty: number;
  margin: number; // How much they beat/missed the DC by
  timestamp: number;
}

// Story thread for tracking plotlines (independent of AGMT)
export interface StoryThread {
  id: string;
  title: string; // Short title (e.g., "The Missing Artifact")
  description: string; // Detailed description of the thread
  status: "active" | "resolved" | "abandoned";
  priority?: "main" | "side" | "background"; // Thread importance
  createdAt: number;
  resolvedAt?: number;
  // Front/clock wrapper (Blades in the Dark-style): ties this thread to a
  // CountdownTimer (see manage_timer) so GM-move-driven escalation has
  // somewhere to tick, rather than only wall-clock/turn-count progress.
  // Informational only - a timer reaching its threshold surfaces context to
  // the GM; it does not automatically mutate thread status. That still goes
  // through update_thread/resolve_thread like any other thread change.
  linkedTimerId?: string;
  threshold?: number;
}

// Starting choice for adventure - allows custom intro choices instead of "Start Story"
export interface StartingChoice {
  text: string; // The choice text displayed to player
  intro_override?: string; // Optional: different intro text for this path (if empty, uses main intro)
}

export interface Adventure {
  id: string;
  title: string;
  description: string;
  shortDescription: string;
  author: string;
  authorId?: string;
  thumbnailUrl?: string;
  bannerUrl?: string;
  tags: string[];
  difficulty: "easy" | "medium" | "hard" | "expert";
  visibility?: "public" | "hidden" | "private"; // Controls who can see the adventure
  estimatedDuration: string; // e.g., "2-3 hours"
  popularity: number; // For sorting/ranking
  rating?: number; // 0-5
  playCount: number;
  createdAt: Date;
  updatedAt: Date;
  isPublished: boolean;
  isFeatured: boolean;
  nsfw: boolean;
  storyTemplate: Partial<StoryData>; // The actual story data
  selectedPreset?: string; // ID of the preset used
  presets?: Preset[]; // Adventure-specific character presets
  startingChoices?: StartingChoice[]; // Optional custom starting choices (if empty, shows "Start Story")
  characterSheetTemplate?: CharacterSheetTemplate; // Template for custom character creation (fillable fields)
}

export interface AdventureFilter {
  searchQuery?: string;
  tags?: string[];
  difficulty?: ("easy" | "medium" | "hard" | "expert")[];
  sortBy?: "popularity" | "newest" | "rating" | "title";
}

export interface Comment {
  id: string;
  adventureId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  rating?: number; // 1-5 stars, optional
  createdAt: Date;
  updatedAt?: Date;
  likes: number;
  likedBy?: string[]; // User IDs who liked this comment
}

export interface Story {
  id: string;
  adventureId?: string; // Optional - can be null if adventure was deleted
  userId: string;
  storyName: string;
  storyData: StoryData | EncryptedStoryData; // Can be plain or encrypted
  isCompleted: boolean;
  isPublic: boolean; // Allow sharing stories
  nsfw?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Encrypted story data format
export interface EncryptedStoryData {
  encrypted: true;
  version: number;
  data: string; // base64 encoded encrypted data
  salt: string; // base64 encoded salt
  iv: string; // base64 encoded IV
}

