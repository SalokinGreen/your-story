/**
 * Rung 1 of the judge ladder (docs/judge-layer-v2-design.md section 2, plan
 * slice 1): deterministic checks of a turn's prose and calls against the
 * engine's facts. No model, no I/O, every turn.
 *
 * `runRung1(turn)` returns the hits. A hit is `verified` when a tool result or
 * a literal match backs it; only a verified hit carries a `reask`, the message
 * generation.ts sends the GM once, inside the turn (rung 2). Everything else
 * is a flag for the Debug Logs, or a note for the GM's next live block
 * (decision 235). `buildReask` folds a turn's re-askable hits into the one
 * message.
 */
import { checkNarrationConsistency } from "../consistencyCheck";
import { escapeRegExp } from "../compaction";
import { findRepeatedPhrases } from "../storyProgressObserver";
import type { StoryData, StoryLore } from "../structs";
import { createNameChecker } from "../names/accept";
import { isRoleLabel } from "../names/roleWords";
import type { BuiltinSystem } from "../systems/types";
import { collectTurnFacts } from "./facts";
import type {
  ContractTurn,
  Fact,
  JudgeStoryView,
  JudgeToolResult,
  Rung1Hit,
} from "./types";

/** Turns with no clock moving before the GM is reminded the pressure is there. */
export const PACING_CLOCK_IDLE_TURNS = 10;
/** Turns a player can go without being addressed by name before the GM is told. */
export const PACING_SPOTLIGHT_TURNS = 4;
/** How many earlier turns the repeated-phrase check reads, beside this one. */
const REPEAT_WINDOW = 4;
/** How the repeated-phrase note begins, so the next turn can tell it already said it. */
const REPEAT_NOTE_MARK = "These phrases keep coming back:";

/** The slice of an earlier part the pacing checks read. */
export interface PriorPartView {
  user?: boolean;
  content?: string;
  pacingNote?: string;
  gmConversation?: ReadonlyArray<{ role: string; content?: unknown }>;
}

export interface Rung1Turn {
  storyBefore: JudgeStoryView;
  storyAfter: JudgeStoryView;
  /** The turn's tool results, in order. */
  results: readonly JudgeToolResult[];
  /** The visible prose so far (the GM's final round, or the finished narration). */
  prose: string;
  system?: Pick<BuiltinSystem, "eventContracts">;
  /** Computed from the story and results when omitted. */
  facts?: Fact[];
  /** The story's parts before this turn, for the pacing checks. */
  priorParts?: readonly PriorPartView[];
  /** Couch or party players, when there are two or more. */
  players?: readonly { id: string; name: string; aliases?: readonly string[] }[];
  /** The story and the turn's name state, for the unrolled-name flag (R2). Omitted: no flag. */
  nameCheck?: {
    story: StoryData;
    /** The story's lore as it stood when the turn began (notes made this turn prove nothing). */
    turnStartLore?: readonly StoryLore[];
    playerTextThisTurn: readonly string[];
  };
}

function factIdsFor(facts: readonly Fact[], kind: Fact["source"]["kind"], ref: string): string[] {
  return facts.filter((f) => f.source.kind === kind && f.source.ref === ref).map((f) => f.id);
}

/** Roughly 40 characters either side of a match, on one line. */
function spanAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, index + length + 40);
  return `${start > 0 ? "..." : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "..." : ""}`;
}

/** The first whole-word, case-insensitive match (no lookbehind: older WebViews lack it). */
function wholeWord(text: string, word: string): { index: number; 0: string } | null {
  const w = word.trim();
  if (!w) return null;
  const m = new RegExp(
    "(^|[^\\p{L}\\p{N}_])(" + escapeRegExp(w) + ")(?![\\p{L}\\p{N}_])",
    "iu",
  ).exec(text);
  if (!m) return null;
  return { index: m.index + m[1].length, 0: m[2] };
}

function isAssistant(p: PriorPartView): boolean {
  return !p.user;
}

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

function eventContractHits(turn: Rung1Turn, facts: Fact[]): Rung1Hit[] {
  const hits: Rung1Hit[] = [];
  const seen = new Set<string>();
  for (const contract of turn.system?.eventContracts ?? []) {
    for (const trigger of turn.results) {
      if (trigger.toolName !== contract.when.tool) continue;
      const text = trigger.contextForStory ?? "";
      if (text.startsWith("[ERROR") || text.startsWith("[State Failed")) continue;
      const res = trigger.result as { type?: string } | undefined;
      if (res?.type !== contract.when.resultType) continue;
      if (contract.when.require && !contract.when.require(trigger.result)) continue;
      const ct: ContractTurn = {
        trigger,
        results: turn.results,
        storyAfter: turn.storyAfter,
      };
      const verdict = contract.expects(ct);
      if (verdict.ok) continue;
      const key = `${contract.id}:${verdict.key ?? trigger.toolCallId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({
        check: "event_contract",
        contractId: contract.id,
        verified: !verdict.flagOnly,
        evidence: verdict.evidence,
        factIds: factIdsFor(facts, "tool", trigger.toolCallId),
        ...(verdict.flagOnly ? {} : { reask: contract.reask(ct, verdict) }),
      });
    }
  }
  return hits;
}

function departedHits(turn: Rung1Turn, facts: Fact[]): Rung1Hit[] {
  if (!turn.prose.trim()) return [];
  return checkNarrationConsistency(turn.prose, turn.storyAfter).map((w) => ({
    check: "departed_person" as const,
    // A name-matching heuristic: it flags, it never re-asks.
    verified: false,
    evidence: w.detail,
    factIds: facts.filter((f) => f.source.kind === "npc" && f.text.startsWith(`${w.entity} is`)).map((f) => f.id),
  }));
}

function lineHits(turn: Rung1Turn, facts: Fact[]): Rung1Hit[] {
  const lines = turn.storyBefore.campaign?.safety?.lines ?? [];
  if (!turn.prose.trim() || lines.length === 0) return [];
  const hits: Rung1Hit[] = [];
  for (const line of lines) {
    for (const keyword of line.keywords ?? []) {
      const m = wholeWord(turn.prose, keyword);
      if (!m) continue;
      const span = spanAround(turn.prose, m.index, m[0].length);
      hits.push({
        check: "line",
        verified: true,
        evidence: `"${m[0]}" appears in the prose: ${span}`,
        factIds: factIdsFor(facts, "record", line.id),
        replacesProse: true,
        reask: `This table set a line: "${line.text}". The prose you have written this turn, which the player has not seen, uses the word "${m[0]}" (${span}). The whole passage reads:\n\n"""\n${turn.prose.trim()}\n"""\n\nIf that puts the line on screen, write the whole passage again without it, keeping everything else that happened, and reply with the whole passage. If it does not cross the line, reply with the same text.`,
      });
      break; // one hit per line
    }
  }
  return hits;
}

export function secretHits(turn: Rung1Turn, facts: Fact[]): Rung1Hit[] {
  if (!turn.prose.trim()) return [];
  const afterById = new Map((turn.storyAfter.campaign?.secrets ?? []).map((s) => [s.id, s] as const));
  const hits: Rung1Hit[] = [];
  for (const secret of turn.storyBefore.campaign?.secrets ?? []) {
    // Revealed before the turn, or by it (the GM may have just called it so).
    if (secret.revealed || afterById.get(secret.id)?.revealed) continue;
    for (const phrase of secret.keyPhrases ?? []) {
      const m = wholeWord(turn.prose.replace(/\s+/g, " "), phrase.replace(/\s+/g, " "));
      if (!m) continue;
      hits.push({
        check: "secret_phrase",
        verified: false, // feeds the secret-leak judge; the phrase alone is not a leak
        evidence: `"${m[0]}" (a key phrase of "${secret.title}") appears before the secret is revealed`,
        factIds: factIdsFor(facts, "record", secret.id),
      });
      break;
    }
  }
  return hits;
}

function turnsSinceClockMoved(parts: readonly PriorPartView[]): number {
  let n = 0;
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (!isAssistant(p)) continue;
    const moved = (p.gmConversation ?? []).some(
      (m) => m.role === "tool" && typeof m.content === "string" && /\[Clock\b/.test(m.content),
    );
    if (moved) return n;
    n++;
  }
  return n;
}

function pacingClockHit(turn: Rung1Turn, facts: Fact[]): Rung1Hit[] {
  // Clocks from migrated timers, and clocks only the GM ticks by hand, are not
  // pressure the engine moves on its own: they would nag forever. (Per clock:
  // a migrated record that later gains an auto-ticking clock counts again.)
  const clocks = (turn.storyAfter.campaign?.clocks ?? []).filter(
    (c) =>
      !c.cancelled &&
      !c.paused &&
      c.filled < c.segments &&
      !c.migratedFromTimerId &&
      c.triggers.some((t) => t !== "manual"),
  );
  if (clocks.length === 0 || !turn.priorParts) return [];
  const movedNow = turn.results.some(
    (r) => ((r as { clockReports?: unknown[] }).clockReports ?? []).length > 0,
  );
  if (movedNow) return [];
  // Turns without a move, this one included. The note fires as the count
  // crosses each multiple of the threshold, not on every turn past it.
  const idle = turnsSinceClockMoved(turn.priorParts) + 1;
  if (idle % PACING_CLOCK_IDLE_TURNS !== 0) return [];
  return [
    {
      check: "pacing_clock",
      verified: false,
      evidence: `No clock has moved in ${idle} turns (${clocks.length} running)`,
      factIds: clocks.flatMap((c) => factIdsFor(facts, "record", c.id)),
      note: `No clock has moved in ${idle} turns. Pressure is running in the background (${clocks.map((c) => `"${c.name}" ${c.filled}/${c.segments}`).join(", ")}); let the world press on the party before the next quiet beat.`,
    },
  ];
}

function spotlightHit(turn: Rung1Turn): Rung1Hit[] {
  const players = turn.players ?? [];
  if (players.length < 2 || !turn.priorParts) return [];
  const assistants = turn.priorParts.filter(isAssistant);
  // A player is addressed by their own name or by their character's.
  const named = (text: string, p: { name: string; aliases?: readonly string[] }) =>
    [p.name, ...(p.aliases ?? [])].some((n) => wholeWord(text, n) !== null);
  // Turns in a row without being named, this one included; the note fires as
  // the run crosses each multiple of the threshold, not on every turn past it.
  const neglected = players.filter((p) => {
    if (named(turn.prose, p)) return false;
    let gap = 1;
    for (let i = assistants.length - 1; i >= 0; i--) {
      if (named(assistants[i].content ?? "", p)) break;
      gap++;
    }
    return gap % PACING_SPOTLIGHT_TURNS === 0;
  });
  if (neglected.length === 0) return [];
  const names = neglected.map((p) => p.name).join(", ");
  return [
    {
      check: "pacing_spotlight",
      verified: false,
      evidence: `${names} not addressed by name in the last ${PACING_SPOTLIGHT_TURNS} turns`,
      factIds: [],
      note: `${names} ${neglected.length === 1 ? "has" : "have"} not been addressed by name in the last ${PACING_SPOTLIGHT_TURNS} turns. Give ${neglected.length === 1 ? "them" : "one of them"} the next beat.`,
    },
  ];
}

function repeatedPhraseHit(turn: Rung1Turn): Rung1Hit[] {
  if (!turn.prose.trim() || !turn.priorParts) return [];
  const assistants = turn.priorParts.filter(isAssistant);
  // One reminder per run: the previous turn's note already said it.
  if (assistants[assistants.length - 1]?.pacingNote?.includes(REPEAT_NOTE_MARK)) {
    return [];
  }
  const recent = assistants.slice(-REPEAT_WINDOW).map((p) => p.content ?? "");
  if (recent.length < 2) return [];
  const flat = turn.prose.toLowerCase().replace(/[^a-z'-]+/g, " ");
  // Names recur on purpose: a phrase built on a character's name, and any
  // phrase under three words ("the tavern"), is not a tic.
  const names = new Set<string>();
  for (const n of turn.storyAfter.npcs ?? []) {
    for (const w of (n.name ?? "").toLowerCase().split(/[^a-z'-]+/)) if (w) names.add(w);
  }
  for (const p of turn.players ?? []) {
    for (const full of [p.name, ...(p.aliases ?? [])]) {
      for (const w of full.toLowerCase().split(/[^a-z'-]+/)) if (w) names.add(w);
    }
  }
  const repeated = findRepeatedPhrases([...recent, turn.prose]).filter(
    (c) =>
      c.phrase.split(" ").length >= 3 &&
      !c.phrase.split(" ").some((w) => names.has(w)) &&
      ` ${flat} `.includes(` ${c.phrase} `),
  );
  if (repeated.length === 0) return [];
  const phrases = repeated.slice(0, 3).map((c) => `"${c.phrase}"`);
  return [
    {
      check: "repeated_phrase",
      verified: false,
      evidence: `Repeated across recent turns: ${phrases.join(", ")}`,
      factIds: [],
      note: `${REPEAT_NOTE_MARK} ${phrases.join(", ")}. Find fresh wording.`,
    },
  ];
}

/** Capitalised words that are not names: pronouns, titles, calendar words, interjections. */
const NOT_NAMES = new Set(
  (
    "i i'm i'll i've i'd the a an and but or so if as at in on of to for with from by he she it they we you " +
    "his her its their my your our him them this that these those there here then now what who whom whose where when why how " +
    "yes no oh ah okay ok well hey please thank thanks sorry hello goodbye mr mrs ms miss dr lord lady sir madam captain " +
    "king queen prince princess father mother brother sister saint master mistress god gods goddess mister " +
    "monday tuesday wednesday thursday friday saturday sunday january february march april may june july " +
    "august september october november december christmas north south east west"
  ).split(" "),
);

/** What may precede the first word of a sentence or a quotation. */
const SENTENCE_END = /[.!?…:;\n"“”‘(—–-]/;

// No lookbehind (iOS before 16.4 has none): the character before a run is
// captured as group 1 and the run itself as group 2.
const NAME_RUN =
  /(^|[^\p{L}\p{N}'’-])(\p{Lu}[\p{L}'’-]*(?: \p{Lu}[\p{L}'’-]*){0,2})(?![\p{L}\p{N}])/gu;

/**
 * A capitalised run in the prose that no record, ledger or player text knows
 * (randomness plan R2). Conservative on purpose: a flag for the Debug Logs
 * only, never verified, never re-asked, never a rewrite. A run at the start of
 * a sentence or a quotation is skipped, a run is judged by its words that are
 * not common words, and one known word clears the whole run.
 */
function unrolledNameHits(turn: Rung1Turn): Rung1Hit[] {
  const check = turn.nameCheck;
  if (!check || !turn.prose.trim()) return [];
  const text = turn.prose.replace(/[*_]+/g, "");
  // The texts are read once, however many runs the prose has.
  const accepted = createNameChecker(check.story, {
    turnStartLore: check.turnStartLore,
    playerTextThisTurn: [...check.playerTextThisTurn],
  });
  const flagged: string[] = [];
  for (const m of text.matchAll(NAME_RUN)) {
    const start = (m.index ?? 0) + m[1].length;
    const before = text.slice(0, start).replace(/[ \t]+$/, "");
    const prev = before.slice(-1);
    if (before === "" || SENTENCE_END.test(prev)) continue;
    const words = m[2]
      .split(" ")
      .filter((w) => !NOT_NAMES.has(w.toLowerCase().replace(/’/g, "'")) && !isRoleLabel(w));
    if (words.length === 0) continue;
    const run = words.join(" ");
    if (flagged.some((f) => f.toLowerCase() === run.toLowerCase())) continue;
    if (accepted(run)) continue;
    if (words.some((w) => accepted(w))) continue;
    flagged.push(run);
    if (flagged.length >= 5) break;
  }
  if (flagged.length === 0) return [];
  return [
    {
      check: "unrolled_name",
      verified: false,
      evidence: `Names in the prose that no roll, record or player gave: ${flagged.join(", ")}`,
      factIds: [],
    },
  ];
}

/** Runs every rung-1 check on a turn. Never throws on a missing part of the story. */
export function runRung1(turn: Rung1Turn): Rung1Hit[] {
  const facts = turn.facts ?? collectTurnFacts(turn.storyBefore, turn.storyAfter, turn.results);
  return [
    ...eventContractHits(turn, facts),
    ...departedHits(turn, facts),
    ...lineHits(turn, facts),
    ...secretHits(turn, facts),
    ...pacingClockHit(turn, facts),
    ...spotlightHit(turn),
    ...repeatedPhraseHit(turn),
    ...unrolledNameHits(turn),
  ];
}

/** The one re-ask a turn gets (rung 2): every verified, fixable hit in one message. */
export interface Reask {
  message: string;
  /** Answered with new prose that replaces the draft (a line), not tool calls alone. */
  replacesProse: boolean;
  hits: Rung1Hit[];
}

export function buildReask(hits: readonly Rung1Hit[]): Reask | null {
  const fixable = hits.filter((h) => h.verified && h.reask);
  if (fixable.length === 0) return null;
  return {
    message: fixable.map((h) => h.reask as string).join("\n\n"),
    replacesProse: fixable.some((h) => h.replacesProse),
    hits: fixable,
  };
}

/** The GM-only note the pacing hits make for the next turn (decision 235). */
export function pacingNoteFor(hits: readonly Rung1Hit[]): string | undefined {
  const notes = hits
    .filter((h) => (h.check === "pacing_clock" || h.check === "pacing_spotlight" || h.check === "repeated_phrase") && h.note)
    .map((h) => h.note as string);
  return notes.length > 0 ? notes.join(" ") : undefined;
}
