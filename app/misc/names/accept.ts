/**
 * Which names the engine accepts for a new person or place (randomness plan R2,
 * design 3.2, decision 260). A name enters the record through `add_npc`,
 * `update_npc` or a campaign location/faction only if the engine rolled it (the
 * ledger) or it is already established: in the record, in the story's own text,
 * in a note that is not a table as it stood when the turn began, in the GM's
 * prose of earlier turns, or in something a player wrote. A role label made only
 * of common descriptive words ("Innkeeper", "Hooded Stranger") needs no roll.
 *
 * Pure: no React, no storage. No regex lookbehind (iOS before 16.4 has none).
 */
import type { StoryData, StoryLore } from "../structs";
import { isRoleLabel } from "./roleWords";

/** How many offered names the ledger keeps. */
export const NAME_LEDGER_SIZE = 30;

/**
 * What one turn adds to the picture across the GM's rounds (carried like the
 * clock ledger): the players' words that are not in the story yet.
 */
export interface NameTurnState {
  playerTextThisTurn: string[];
}

/** What the check also needs from the turn. */
export interface NameCheckContext extends Partial<NameTurnState> {
  /**
   * The story's lore as it stood when the turn began. Notes read from here, so
   * a note made, renamed or edited this turn proves nothing. Unset: the story's
   * own lore.
   */
  turnStartLore?: readonly StoryLore[];
}

export function newNameTurn(playerText: string[] = []): NameTurnState {
  return { playerTextThisTurn: playerText.filter(Boolean) };
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

/** Records the drawer's names, newest last, keeping the last 9. Mutates. Not avoided by rollNames. */
export function pushDrawerNames(story: StoryData, names: readonly string[]): void {
  const kept = (story.recentDrawerNames ?? []).filter(
    (n) => !names.some((m) => m.toLowerCase() === n.toLowerCase()),
  );
  story.recentDrawerNames = [...kept, ...names.map((n) => n.trim()).filter(Boolean)].slice(-9);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Lower case, no diacritics, straight apostrophes, single spaces. */
export function normalizeForNames(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Whole-word, case-insensitive, accent-insensitive match of a name in a text.
 * Both arguments are normalised here; use `textHasNormalizedName` to match many
 * names against one text that was normalised once.
 */
export function textHasName(text: string, name: string): boolean {
  return textHasNormalizedName(normalizeForNames(text), normalizeForNames(name));
}

export function textHasNormalizedName(normalizedText: string, normalizedName: string): boolean {
  const n = normalizedName.trim();
  if (!n) return false;
  const pattern = escapeRegExp(n).replace(/ /g, "\\s+");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, "u").test(normalizedText);
}

/** What a player said in answering a question or the setup card, from a tool result line. */
function answerOfLine(toolName: string, line: string): string | null {
  if (toolName === "confirm_setup") {
    const m = /wants changes before starting: "(.*)"\. Make the changes/.exec(line);
    return m ? m[1] : null;
  }
  const at = line.lastIndexOf(" → ");
  return at >= 0 ? line.slice(at + 3) : null;
}

/** The answers the player gave to earlier ask_question / confirm_setup calls. */
function questionAnswers(story: StoryData): string[] {
  const out: string[] = [];
  for (const part of story.scene?.parts ?? []) {
    const convo = part.gmConversation;
    if (!convo?.length) continue;
    const asked = new Map<string, string>();
    for (const m of convo) {
      for (const c of m.tool_calls ?? []) {
        const name = c.function?.name;
        if (name === "ask_question" || name === "confirm_setup") asked.set(c.id, name);
      }
    }
    if (asked.size === 0) continue;
    for (const m of convo) {
      const tool = m.tool_call_id ? asked.get(m.tool_call_id) : undefined;
      if (m.role !== "tool" || !tool) continue;
      for (const line of String(m.content ?? "").split("\n")) {
        const a = answerOfLine(tool, line);
        if (a) out.push(a);
      }
    }
  }
  return out;
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

/** Everything a player wrote or chose, as one text. */
function playerText(story: StoryData, ctx: NameCheckContext): string {
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

function memoryText(story: StoryData): string {
  return (story.memory ?? [])
    .map((m) => (typeof m === "string" ? m : m?.content ?? ""))
    .join("\n");
}

/**
 * The story's own text and the GM's earlier prose: the premise, intro, summary,
 * memory, goals, threads, the campaign record (every part), the GM's prose in
 * parts before this turn, and the notes that are not tables as they stood when
 * the turn began. A name in any of these is already established; the rung-1 flag
 * is what caught an invention at the time.
 */
function establishedText(story: StoryData, ctx: NameCheckContext): string {
  const bits: string[] = [story.premise ?? "", story.intro ?? "", story.scene?.summary ?? "", memoryText(story)];
  bits.push(JSON.stringify(story.goals ?? []), JSON.stringify(story.threads ?? []));
  if (story.campaign) bits.push(JSON.stringify(story.campaign));
  for (const p of story.scene?.parts ?? []) {
    if (!p.user && p.content) bits.push(p.content);
  }
  for (const l of ctx.turnStartLore ?? story.lore ?? []) {
    if (!l || l.type === "table") continue;
    bits.push(l.title ?? "", l.content ?? "");
  }
  return bits.join("\n");
}

/** A check that reads its texts once; ask it about as many names as needed. */
export function createNameChecker(story: StoryData, ctx: NameCheckContext = {}): (name: string) => boolean {
  const ledger = [...(story.nameLedger ?? []), ...(story.recentDrawerNames ?? [])].map(normalizeForNames);
  const record = recordNames(story).map(normalizeForNames);
  const player = normalizeForNames(playerText(story, ctx));
  const established = normalizeForNames(establishedText(story, ctx));
  return (name: string): boolean => {
    const wanted = normalizeForNames(name).trim();
    if (!wanted) return false;
    // A rolled name, with a title in front ("Captain Anka Dorn") or shortened to
    // part of it ("Anka"); an existing person or place likewise, either way.
    for (const known of [...ledger, ...record]) {
      if (known === wanted) return true;
      if (known && (textHasNormalizedName(wanted, known) || textHasNormalizedName(known, wanted))) return true;
    }
    if (isRoleLabel(name)) return true;
    return textHasNormalizedName(player, wanted) || textHasNormalizedName(established, wanted);
  };
}

/**
 * True when the name is the engine's (the ledger) or already established. See
 * the file comment for what counts.
 */
export function isNameAccepted(name: string, story: StoryData, ctx: NameCheckContext = {}): boolean {
  return createNameChecker(story, ctx)(name);
}
