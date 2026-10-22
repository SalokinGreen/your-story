/**
 * Limits on the notes the GM is sent in full every turn (decision 96,
 * docs/token-savings-design.md section 4.5).
 *
 * A pinned note is paid for on every round of every turn, so a long one is the
 * most expensive text in the adventure. The GM prompt sends three kinds in
 * full: the DM instructions, the character sheets and the campaign plan.
 * (The mechanics note is listed by title and read on demand, so it is not one.)
 *
 *  - One pinned note over `PINNED_NOTE_WARN_TOKENS` gets a warning where the
 *    author edits it, so the note can be cut down at the source.
 *  - All pinned notes together over `PINNED_TOTAL_CAP_TOKENS` are shortened in
 *    the prompt only: the stored note is never touched, and the GM can always
 *    `read_notes` the whole thing.
 */

import { estimateTokens } from "@/app/misc/tokenCounter";
import type { StoryLore } from "@/app/misc/structs";

export const PINNED_NOTE_WARN_TOKENS = 3000;
export const PINNED_TOTAL_CAP_TOKENS = 10000;

/** Note types the GM prompt sends in full every turn. */
const PINNED_GM_NOTE_TYPES: ReadonlySet<string> = new Set([
  "dm_instructions",
  "gm_notes", // legacy alias of dm_instructions
  "character_sheet",
  "gm_plan",
]);

/** Whether the GM prompt carries a note of this type in full on every turn. */
export function isPinnedGmNoteType(type: string | undefined): boolean {
  return !!type && PINNED_GM_NOTE_TYPES.has(type);
}

/** Tokens of the note as the GM prompt carries it (title line plus content). */
function noteTokens(content: string): number {
  return estimateTokens(content || "");
}

/**
 * A one-line warning when this note is pinned and longer than
 * `PINNED_NOTE_WARN_TOKENS`, otherwise undefined. Shown beside the editor and
 * returned by the Designer's `write_note`.
 */
export function pinnedNoteWarning(
  note: Pick<StoryLore, "type" | "content">,
): string | undefined {
  // The Designer forces character sheets and mechanics notes alwaysOn, but
  // only the types in PINNED_GM_NOTE_TYPES are sent in full.
  if (!isPinnedGmNoteType(note.type)) return undefined;
  const tokens = noteTokens(note.content);
  if (tokens <= PINNED_NOTE_WARN_TOKENS) return undefined;
  return (
    `This note is about ${tokens.toLocaleString("en-US")} tokens and is sent to the GM in full every turn. ` +
    `Past about ${PINNED_NOTE_WARN_TOKENS.toLocaleString("en-US")} it makes every turn slower and dearer; ` +
    `consider moving detail into notes the GM reads on demand. ` +
    `Together, pinned notes are cut to ${PINNED_TOTAL_CAP_TOKENS.toLocaleString("en-US")} tokens in the prompt.`
  );
}

export interface CappedPinnedNote {
  title: string;
  content: string;
  /** Tokens left out of `content` (0 when the note was not shortened). */
  cutTokens: number;
}

/** The longest prefix of `text` within `maxTokens`, cut at a line break when one is near. */
function prefixWithinTokens(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return "";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (estimateTokens(text.slice(0, mid)) <= maxTokens) lo = mid;
    else hi = mid - 1;
  }
  const prefix = text.slice(0, lo);
  const lastBreak = prefix.lastIndexOf("\n");
  // Snap back to the last line break if that costs under a fifth of the text.
  return lastBreak > prefix.length * 0.8 ? prefix.slice(0, lastBreak) : prefix;
}

function pointer(cutTokens: number, title: string): string {
  return `[… ${cutTokens.toLocaleString("en-US")} more tokens: read_notes "${title}" for the rest]`;
}

/** The campaign plan's live beat: the last "## Current beat" section (decision 110). */
const CURRENT_BEAT_MARKER = "\n## Current beat";

function splitCurrentBeat(content: string): { head: string; tail: string } {
  const at = content.lastIndexOf(CURRENT_BEAT_MARKER);
  if (at < 0) return { head: content, tail: "" };
  return { head: content.slice(0, at), tail: content.slice(at) };
}

/**
 * Shares `cap` between the notes. A note under an equal share keeps all of
 * its text; the rest split what those leave, so a long note cannot crowd out
 * a short one. A shortened note keeps its front and ends that front with a
 * pointer to `read_notes`. The campaign plan (`type: "gm_plan"`) also keeps
 * its last "## Current beat" section whole after the pointer, because the plan
 * grows at its end and that is the beat being played (decision 110); the beat
 * is budgeted out of the cap first. Order is kept. Under the cap, every note
 * comes back unchanged.
 */
export function capPinnedNotes(
  notes: ReadonlyArray<Pick<StoryLore, "title" | "content"> & { type?: string }>,
  cap: number = PINNED_TOTAL_CAP_TOKENS,
): CappedPinnedNote[] {
  const total = notes.reduce((sum, n) => sum + noteTokens(n.content), 0);
  if (total <= cap) {
    return notes.map((n) => ({ title: n.title, content: n.content || "", cutTokens: 0 }));
  }

  // Split off each plan's current beat, bounded to half the cap so one huge
  // beat cannot starve every other note.
  const heads: string[] = [];
  const tails: string[] = [];
  for (const n of notes) {
    const content = n.content || "";
    if (n.type === "gm_plan") {
      const { head, tail } = splitCurrentBeat(content);
      heads.push(head);
      tails.push(tail ? prefixWithinTokens(tail, Math.floor(cap / 2)) : "");
    } else {
      heads.push(content);
      tails.push("");
    }
  }
  const sizes = heads.map((h) => noteTokens(h));
  const tailTokens = tails.map((t) => noteTokens(t));

  // Water-filling: notes at or under the current equal share keep everything;
  // what they leave unused is shared among the rest.
  const allowance: number[] = new Array(notes.length).fill(0);
  let remaining = Math.max(cap - tailTokens.reduce((a, b) => a + b, 0), 0);
  let open = notes.map((_, i) => i);
  for (;;) {
    const share = Math.floor(remaining / Math.max(open.length, 1));
    const small = open.filter((i) => sizes[i] <= share);
    if (small.length === 0) {
      for (const i of open) allowance[i] = share;
      break;
    }
    for (const i of small) {
      allowance[i] = sizes[i];
      remaining -= sizes[i];
    }
    open = open.filter((i) => !small.includes(i));
    if (open.length === 0) break;
  }

  return notes.map((n, i) => {
    if (sizes[i] <= allowance[i]) {
      // Whole, unless the beat itself was over half the cap.
      return { title: n.title, content: heads[i] + tails[i], cutTokens: 0 };
    }
    // Leave room for the pointer line itself inside the note's allowance.
    const pointerCost = estimateTokens(pointer(sizes[i], n.title)) + 2;
    const kept = prefixWithinTokens(heads[i], Math.max(allowance[i] - pointerCost, 0));
    const cutTokens = Math.max(sizes[i] - estimateTokens(kept), 0);
    return {
      title: n.title,
      content: `${kept}\n${pointer(cutTokens, n.title)}${tails[i] ? `\n${tails[i]}` : ""}`,
      cutTokens,
    };
  });
}

/**
 * Share of the cap the DM instructions may use. They sit in the stable block,
 * so their cut must depend on stable inputs only: never on the sheet or the
 * plan, which change length mid-game and would move the cut and re-price all
 * the history behind it (decision 91).
 */
export const DM_INSTRUCTIONS_CAP_TOKENS = 4000;

const DM_TYPES: ReadonlySet<string> = new Set(["dm_instructions", "gm_notes"]);

/**
 * How the GM prompt shortens its pinned notes. The DM instructions are capped
 * on their own at `DM_INSTRUCTIONS_CAP_TOKENS`; the character sheets and the
 * plan share whatever the total cap leaves. Returns the capped form of each
 * pinned note, keyed by the note object.
 */
export function capPinnedForGM(lore: ReadonlyArray<StoryLore>): Map<StoryLore, CappedPinnedNote> {
  const live = lore.filter((l) => l.enabled !== false);
  const dm = live.filter((l) => l.type && DM_TYPES.has(l.type));
  const rest = live.filter((l) => l.type === "character_sheet" || l.type === "gm_plan");
  const cappedDm = capPinnedNotes(dm, DM_INSTRUCTIONS_CAP_TOKENS);
  const dmTokens = cappedDm.reduce((sum, n) => sum + noteTokens(n.content), 0);
  const cappedRest = capPinnedNotes(rest, Math.max(PINNED_TOTAL_CAP_TOKENS - dmTokens, 0));
  const out = new Map<StoryLore, CappedPinnedNote>();
  dm.forEach((l, i) => out.set(l, cappedDm[i]));
  rest.forEach((l, i) => out.set(l, cappedRest[i]));
  return out;
}
