/**
 * The narration context (campaign design 14.1, status report 6.16 and 6.22).
 *
 * The separate narration call used to continue the GM's whole conversation:
 * its system prompt, the pinned notes, the GM's reasoning, every tool call
 * with its arguments, and every note it read, hidden ones included. A secret
 * could reach the player by paraphrase, not only as marked text. This builds
 * the narrator's request from an ALLOWLIST instead, and the same context is
 * what a rewrite of the prose (the Observer's, or the one before a pause) is
 * given:
 *
 *  - the player's line;
 *  - the GM's visible prose this turn, with <thinking> and [[HIDDEN_LORE]]
 *    stripped;
 *  - each tool result's public summary (turnTimeline.ts publicSummary), never
 *    its full result;
 *  - the tone, the lines and veils, and the story_instructions notes;
 *  - the player character sheet(s) and a short roster of the NPCs the player
 *    knows (name, role, the description the NPCs page shows; never GM notes);
 *  - a visible timer or clock that fired this turn (a hidden one never);
 *  - the last turns' visible prose.
 *
 * It never holds the GM's reasoning, a tool call's arguments, a note the GM
 * read, a secret, an NPC secret, an unfound clue, or the running summary (the
 * summariser reads tool results, so it can carry any of those). A new field
 * joins this context by being added here on purpose.
 *
 * It returns the messages up to, not including, the final instruction: the
 * story stage appends the continuation prompt and a rewrite appends its
 * flagged-prose block, so both start from byte-identical context.
 */

import type { ChatMessage } from "../chatMessage";
import type { StoryData } from "../structs";
import { stripHiddenLoreContent } from "../ai_staged";
import { estimateTokens } from "../tokenCounter";
import { isHiddenFromPlayerNote } from "../noteVisibility";
import { cleanString } from "../textUtils";
import {
  extractVisibleText,
  publicSummary,
  type PublicSummarySource,
} from "../turnTimeline";

/** What the narration context needs to know about the turn. */
export interface NarrationTurn {
  /** The player's line this turn ("" on an opening scene). */
  playerLine: string;
  /**
   * The GM's own prose this turn, as written (it may carry <thinking> and
   * [[HIDDEN_LORE]] spans; both are stripped). Empty on the separate
   * narration path, where the GM wrote none.
   */
  gmProse?: string;
  /** The turn's executed tool results, in order. Only their public summaries are used. */
  results: readonly PublicSummarySource[];
  /** This turn's own part, left out of the recent prose when the page already pushed it. */
  scenePartId?: string;
}

/** Recent prose is kept to this many tokens, newest first. */
export const NARRATION_RECENT_PROSE_TOKENS = 2500;
/** ...and to this many parts. */
export const NARRATION_RECENT_PARTS = 6;
/** One style note is cut at this many characters. */
const STYLE_NOTE_MAX_CHARS = 12000;
/** One character sheet is cut at this many characters. */
const SHEET_MAX_CHARS = 12000;
/** The roster lists this many NPCs at most, each description cut short. */
const ROSTER_MAX = 15;
const ROSTER_DESC_CHARS = 240;

export const NARRATOR_SYSTEM_PROMPT = `You are the narrator of an interactive story. A separate game master has already decided what happens this turn and run the dice; you write the prose the player reads.

- What you are told is all you know. Do not invent hidden causes, secrets, or things behind the scenes; write what the player's character can see, hear and feel.
- Rolls, checks and changes listed under "This turn" are settled. Narrate them as they came out; never change a result, re-roll, or hint at numbers unless asked to.
- Follow the tone, the lines and veils, and the style notes you are given.
- Stay in the story. No notes to yourself, no meta-commentary.`;

/** The prose of one stored scene part, as the player read it. */
function visibleProse(raw: string): string {
  return stripHiddenLoreContent(extractVisibleText(raw)).trim();
}

/** Keeps the tail of `text` (the end is what the next turn follows). */
function tailOf(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  return text.length > maxChars ? `…${text.slice(text.length - maxChars)}` : text;
}

/**
 * The last turns' visible prose, oldest first, ending before the current
 * turn: this turn's own part (by id) and the player lines after the last
 * narration are left out, because the turn block says them.
 */
export function recentProse(
  story: Pick<StoryData, "scene">,
  excludePartId?: string,
): string {
  const parts = (story.scene?.parts ?? []).filter(
    (p) => !excludePartId || p.id !== excludePartId,
  );
  let end = parts.length;
  while (end > 0 && parts[end - 1].user) end--;
  const lines: string[] = [];
  let used = 0;
  for (let i = end - 1; i >= 0 && lines.length < NARRATION_RECENT_PARTS; i--) {
    const p = parts[i];
    const body = p.user
      ? p.content.replace(/^>\s*/, "").trim()
      : visibleProse(p.content || "");
    if (!body) continue;
    const label = p.user ? "Player" : "Narration";
    const tokens = estimateTokens(body);
    if (lines.length > 0 && used + tokens > NARRATION_RECENT_PROSE_TOKENS) break;
    const text =
      lines.length === 0 ? tailOf(body, NARRATION_RECENT_PROSE_TOKENS) : body;
    lines.unshift(`${label}: ${text}`);
    used += tokens;
  }
  return lines.join("\n\n");
}

/** The story-level, rarely changing block: premise, tone, safety, style notes. */
function stableBlock(story: StoryData): string {
  const sections: string[] = ["# The story"];
  if (story.story_name?.trim()) sections.push(`Title: ${story.story_name.trim()}`);
  if (story.premise?.trim()) {
    sections.push(`Premise: ${stripHiddenLoreContent(cleanString(story.premise))}`);
  }
  if (story.player_name?.trim()) {
    sections.push(`The player's character: ${story.player_name.trim()}`);
  }

  // The player character sheet(s), so the narrator keeps names, looks and
  // voice. Every enabled sheet: in couch and party play, every player's. A
  // sheet the story marks hidden is left out. Byte-stable while unchanged.
  const sheets = (story.lore ?? []).filter(
    (n) =>
      n.type === "character_sheet" &&
      n.enabled !== false &&
      n.content?.trim() &&
      !isHiddenFromPlayerNote(n),
  );
  if (sheets.length > 0) {
    sections.push(
      `## Character sheet${sheets.length > 1 ? "s" : ""}\n${sheets
        .map(
          (n) =>
            `### ${n.title}\n${stripHiddenLoreContent(cleanString(n.content)).slice(
              0,
              SHEET_MAX_CHARS,
            )}`,
        )
        .join("\n\n")}`,
    );
  }

  const campaign = story.campaign;
  const tone = campaign?.pitch?.tone?.filter((t) => t.trim()) ?? [];
  if (tone.length > 0) sections.push(`## Tone\n${tone.join(", ")}`);

  const lines = campaign?.safety?.lines ?? [];
  const veils = campaign?.safety?.veils ?? [];
  if (lines.length > 0) {
    sections.push(
      `## Lines (never appear in the story)\n${lines.map((l) => `- ${l.text}`).join("\n")}`,
    );
  }
  if (veils.length > 0) {
    sections.push(
      `## Veils (may happen, but off screen: do not describe them)\n${veils
        .map((v) => `- ${v.text}`)
        .join("\n")}`,
    );
  }

  const styleNotes = (story.lore ?? []).filter(
    (n) => n.type === "story_instructions" && n.enabled !== false && n.content?.trim(),
  );
  if (styleNotes.length > 0) {
    sections.push(
      `## Style notes (how to write)\n${styleNotes
        .map((n) => {
          const body = stripHiddenLoreContent(cleanString(n.content)).slice(
            0,
            STYLE_NOTE_MAX_CHARS,
          );
          return `### ${n.title}\n${body}`;
        })
        .join("\n\n")}`,
    );
  }
  return sections.join("\n\n");
}

/** The per-turn block: recent prose, then this turn's line, prose and results. */
function liveBlock(turn: NarrationTurn, story: StoryData): string {
  const sections: string[] = [];
  const recent = recentProse(story, turn.scenePartId);
  if (recent) sections.push(`# Earlier in the story\n${recent}`);

  // The people the player has met: name, role and the description the NPCs
  // page shows them. Never `notes` (GM notes), and nothing from the campaign
  // record's people (their wants and secrets).
  const roster = (story.npcs ?? [])
    .filter((n) => n.name?.trim() && n.status !== "dead")
    .slice(-ROSTER_MAX)
    .map((n) => {
      const desc = stripHiddenLoreContent(cleanString(n.description || "")).slice(
        0,
        ROSTER_DESC_CHARS,
      );
      const role = n.role?.trim() ? ` (${n.role.trim()})` : "";
      return `- ${n.name.trim()}${role}${desc ? `: ${desc}` : ""}`;
    });
  if (roster.length > 0) sections.push(`# People the player knows\n${roster.join("\n")}`);

  const timerVisible = (name: string): boolean => {
    const lower = name.toLowerCase();
    const clock = story.campaign?.clocks.find((c) => c.name.toLowerCase() === lower);
    if (clock) return clock.visible;
    const timer = (story.timers ?? []).find((t) => t.name.toLowerCase() === lower);
    return timer?.visibility === "visible";
  };

  const thisTurn: string[] = [
    `Player's action: ${turn.playerLine.trim() || "(none: this is the opening scene)"}`,
  ];
  const prose = turn.gmProse ? visibleProse(turn.gmProse) : "";
  if (prose) thisTurn.push(`The game master's text so far this turn:\n${prose}`);
  const summaries = turn.results
    .map((r) => publicSummary(r, { timerVisible }))
    .filter((s): s is string => Boolean(s));
  if (summaries.length > 0) {
    thisTurn.push(
      `What the game master's tools settled, in order:\n${summaries
        .map((s) => `- ${s.replace(/\n/g, "\n  ")}`)
        .join("\n")}`,
    );
  }
  sections.push(`# This turn\n${thisTurn.join("\n\n")}`);
  return sections.join("\n\n");
}

/**
 * The message list for the narration call and for rewrites: a fixed system
 * message; a stable user message (marked as the cache prefix, so it is the
 * start of the Claude CLI's system file and is byte-identical from turn to
 * turn while the premise, tone and style notes are unchanged); and a live user
 * message with everything that changes each turn.
 */
export function buildNarrationContext(
  turn: NarrationTurn,
  story: StoryData,
): ChatMessage[] {
  return [
    { role: "system", content: NARRATOR_SYSTEM_PROMPT },
    { role: "user", content: stableBlock(story), cacheBreakpoint: "prefix" },
    { role: "user", content: liveBlock(turn, story), cacheBreakpoint: "turn" },
  ];
}
