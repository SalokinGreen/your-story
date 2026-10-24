/**
 * The generic half of a system's turn-end checks (decision 183,
 * docs/dawn-gate-design.md). A built-in system declares what in a turn's words
 * sets a check off and which tool result settles it (`SystemTurnEndCheck`);
 * this file reads that declaration against one turn's text and results and
 * says which check, if any, the GM should be reminded of. Nothing here knows
 * about Blood & Bone, the night or `end_session`: a second system declares its
 * own check and the same code runs it.
 *
 * Pure, so the phrase lists can be tested without a provider.
 */
import type { BuiltinSystem, SystemTurnEndCheck } from "./systems/types";

/** The words a turn produced, split by who wrote them. */
export interface TurnEndText {
  /** The GM's visible prose this turn (`extractVisibleText`): no <thinking>, no tool results, no history. */
  gmProse: string;
  /** One entry per player line; a party turn has several, each tested alone. */
  playerLines: string[];
}

/** What set a check off, for the log. */
export interface TurnEndMatch {
  source: "prose" | "player";
  phrase: string;
  /** Index into `playerLines` when the source is a player line. */
  lineIndex?: number;
}

/** The slice of a tool result a check reads (GMToolResult satisfies it). */
export interface TurnEndToolResult {
  toolName: string;
  success: boolean;
  result?: unknown;
}

export interface PendingTurnEndCheck {
  check: SystemTurnEndCheck;
  match: TurnEndMatch;
}

/** A copy of the pattern that scans the whole text, whatever flags it was written with. */
function globalCopy(re: RegExp): RegExp {
  return new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
}

function spansOf(patterns: RegExp[], text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (const pattern of patterns) {
    for (const m of text.matchAll(globalCopy(pattern))) {
      if (m[0].length === 0) continue;
      spans.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
    }
  }
  return spans;
}

/**
 * The first phrase in `text` that counts: a match no exception span overlaps.
 * The exclusion is local to the match, not to its sentence, so "Before dawn we
 * hide; at sunrise we leave" still fires on "sunrise".
 */
function firstCountingMatch(
  phrases: RegExp[],
  exceptions: RegExp[],
  text: string,
): string | null {
  if (!text.trim() || phrases.length === 0) return null;
  const excluded = spansOf(exceptions, text);
  for (const pattern of phrases) {
    for (const m of text.matchAll(globalCopy(pattern))) {
      if (m[0].length === 0) continue;
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (excluded.some(([es, ee]) => es < end && ee > start)) continue;
      return m[0];
    }
  }
  return null;
}

/**
 * Does this turn's text cross the check's trigger? The GM's prose is tested on
 * `phrases`; every player line on its own is tested on `phrases` plus
 * `playerOnly`, so one player's "not yet" cannot hide another's crossing.
 * Returns what matched (the player line wins when both do: the player's own
 * words are the stronger evidence), or null.
 */
export function textCrosses(
  check: SystemTurnEndCheck,
  text: TurnEndText,
): TurnEndMatch | null {
  const { phrases, playerOnly = [], exceptions } = check.trigger;
  for (let i = 0; i < text.playerLines.length; i++) {
    const phrase = firstCountingMatch(
      [...phrases, ...playerOnly],
      exceptions,
      text.playerLines[i],
    );
    if (phrase) return { source: "player", phrase, lineIndex: i };
  }
  const phrase = firstCountingMatch(phrases, exceptions, text.gmProse);
  return phrase ? { source: "prose", phrase } : null;
}

/**
 * True when this turn already has an executed result of the tool and type the
 * check names. A failed or refused call does not count: it did not do the
 * thing.
 */
export function checkSatisfied(
  check: SystemTurnEndCheck,
  results: readonly TurnEndToolResult[],
): boolean {
  const { toolName, resultType } = check.satisfiedBy;
  return results.some(
    (r) =>
      r.success &&
      r.toolName === toolName &&
      (r.result as { type?: string } | undefined)?.type === resultType,
  );
}

/**
 * The first declared check that crossed, is not satisfied this turn and has
 * not been prompted this turn.
 */
export function pendingCheck(
  system: Pick<BuiltinSystem, "turnEndChecks"> | undefined,
  turn: {
    text: TurnEndText;
    results: readonly TurnEndToolResult[];
    prompted: ReadonlySet<string>;
  },
): PendingTurnEndCheck | null {
  for (const check of system?.turnEndChecks ?? []) {
    if (turn.prompted.has(check.id)) continue;
    if (checkSatisfied(check, turn.results)) continue;
    const match = textCrosses(check, turn.text);
    if (match) return { check, match };
  }
  return null;
}

/**
 * The turn's player lines, one by one. A party or online batch is one line per
 * player, each starting with ">" (`aggregateBatch`, multiplayer/turnBatch.ts);
 * a line that carries newlines of its own stays with the player who wrote it.
 * Anything else is a single line.
 */
export function splitPlayerLines(userChoice: string | undefined): string[] {
  if (!userChoice || !userChoice.trim()) return [];
  const lines: string[] = [];
  for (const raw of userChoice.split("\n")) {
    if (raw.trimStart().startsWith(">") || lines.length === 0) {
      lines.push(raw);
    } else {
      lines[lines.length - 1] += `\n${raw}`;
    }
  }
  return lines.map((l) => l.trim()).filter(Boolean);
}
