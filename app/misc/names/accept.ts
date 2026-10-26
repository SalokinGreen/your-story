/**
 * Which names the engine accepts for a new person or place (randomness plan R2,
 * design 3.2, decision 260). A name enters the record through `add_npc`,
 * `update_npc` or a campaign location only if the engine rolled it (the ledger)
 * or it is already established: in the record, in a note that is not a table
 * and was not made this turn, or in something a player wrote.
 *
 * Pure: no React, no storage.
 */
import type { StoryData } from "../structs";

/** How many offered names the ledger keeps. */
export const NAME_LEDGER_SIZE = 30;

/**
 * What one turn adds to the picture across the GM's rounds (carried like the
 * clock ledger): the notes the GM made this turn, which prove nothing, and the
 * words the players gave this turn that are not in the story yet.
 */
export interface NameTurnState {
  notesCreatedThisTurn: string[];
  playerTextThisTurn: string[];
}

export function newNameTurn(playerText: string[] = []): NameTurnState {
  return { notesCreatedThisTurn: [], playerTextThisTurn: playerText.filter(Boolean) };
}

/** Records names the engine offered, newest last, keeping the last 30. Mutates. */
export function pushOffered(story: StoryData, names: readonly string[]): void {
  const ledger = story.nameLedger ?? [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const at = ledger.findIndex((n) => n.toLowerCase() === name.toLowerCase());
    if (at >= 0) ledger.splice(at, 1);
    ledger.push(name);
  }
  story.nameLedger = ledger.slice(-NAME_LEDGER_SIZE);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word, case-insensitive, accent-safe match of a name in a text. */
export function textHasName(text: string, name: string): boolean {
  const n = name.trim().replace(/\s+/g, " ");
  if (!n) return false;
  const pattern = escapeRegExp(n).replace(/ /g, "\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, "iu").test(text);
}

/** The answers the player gave to earlier ask_question calls, from the parts' GM conversations. */
function questionAnswers(story: StoryData): string[] {
  const out: string[] = [];
  for (const part of story.scene?.parts ?? []) {
    const convo = part.gmConversation;
    if (!convo?.length) continue;
    const askIds = new Set<string>();
    for (const m of convo) {
      for (const c of m.tool_calls ?? []) {
        if (c.function?.name === "ask_question") askIds.add(c.id);
      }
    }
    if (askIds.size === 0) continue;
    for (const m of convo) {
      if (m.role !== "tool" || !m.tool_call_id || !askIds.has(m.tool_call_id)) continue;
      for (const line of String(m.content ?? "").split("\n")) {
        const at = line.lastIndexOf(" → ");
        if (at >= 0) out.push(line.slice(at + 3));
      }
    }
  }
  return out;
}

/** Everything a player wrote or chose, as one text. */
function playerText(story: StoryData, ctx: Partial<NameTurnState>): string {
  const bits: string[] = [];
  for (const p of story.scene?.parts ?? []) {
    if (p.user && p.content) bits.push(p.content);
  }
  bits.push(...questionAnswers(story));
  bits.push(...(ctx.playerTextThisTurn ?? []));
  if (story.player_name) bits.push(story.player_name);
  if (story.displayName) bits.push(story.displayName);
  for (const c of story.multiplayer?.couchPlayers ?? []) {
    if (c?.name) bits.push(c.name);
  }
  return bits.join("\n");
}

/** The record's own names: people, and the campaign's places and groups. */
export function recordNames(story: StoryData): string[] {
  const names: string[] = [];
  for (const n of story.npcs ?? []) if (n?.name) names.push(n.name);
  const rec = story.campaign;
  if (rec) {
    for (const l of rec.locations ?? []) if (l?.name) names.push(l.name);
    for (const f of rec.factions ?? []) if (f?.name) names.push(f.name);
  }
  return names;
}

/** The text of every note that proves a name: not a table, not made this turn, or an enabled sheet. */
function noteText(story: StoryData, madeThisTurn: Set<string>): string {
  const bits: string[] = [];
  for (const l of story.lore ?? []) {
    if (!l || l.type === "table") continue;
    if (madeThisTurn.has((l.title ?? "").toLowerCase())) continue;
    bits.push(l.title ?? "", l.content ?? "");
  }
  return bits.join("\n");
}

/**
 * True when the name is the engine's (the ledger) or already established: an
 * NPC, a campaign place or group, a note that is not a table and not made this
 * turn, or anything a player wrote (their lines, earlier answers, this turn's
 * answers, the sheets they wrote).
 */
export function isNameAccepted(
  name: string,
  story: StoryData,
  ctx: Partial<NameTurnState> = {},
): boolean {
  const wanted = name.trim().replace(/\s+/g, " ").toLowerCase();
  if (!wanted) return false;
  // A rolled name with a title in front ("Captain Anka Dorn") or shortened to
  // part of it ("Anka") is still the rolled name.
  if (
    (story.nameLedger ?? []).some((n) => {
      const offered = n.trim().replace(/\s+/g, " ").toLowerCase();
      return offered === wanted || textHasName(wanted, offered) || textHasName(offered, wanted);
    })
  ) {
    return true;
  }
  // An existing person or place, or one word of its name ("Hob" for "Old Hob").
  if (recordNames(story).some((n) => textHasName(n, wanted))) return true;
  const madeThisTurn = new Set((ctx.notesCreatedThisTurn ?? []).map((t) => t.toLowerCase()));
  if (textHasName(playerText(story, ctx), name)) return true;
  return textHasName(noteText(story, madeThisTurn), name);
}
