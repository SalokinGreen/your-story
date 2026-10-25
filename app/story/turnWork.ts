// What the GM did in a turn, folded into one quiet line: the player's dice
// spelled out, everything else counted. Pure, so tests can feed it the real
// text the executors write (gmExecutor.ts); the expanded pills underneath
// still show that text in full, so a headline never has to be perfect.

import type { TimelineBlock } from "../misc/turnTimeline";
import { getToolProgressLabel } from "../misc/gmToolLabels";

export interface TurnWorkSummary {
  /** Roll headlines, in order. */
  rolls: string[];
  /** The other tools, grouped by their progress label, plus "thought". */
  counts: Array<{ label: string; n: number }>;
  /** The streaming block's label, e.g. "Thinking…". */
  live?: string;
  isEmpty: boolean;
}

const FALLBACK_MAX = 80;
/** Roll headlines shown on the line before "+N more". */
export const MAX_ROLL_HEADLINES = 2;

function bracketLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("[") && l.endsWith("]"));
}

function unbracket(line: string): string {
  return line.replace(/^\[/, "").replace(/\]$/, "").trim();
}

function cut(text: string, max = FALLBACK_MAX): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

// "[Action roll - Ana: Face Danger +Iron: d6 4 + Iron 2 = 6 vs 3 and 8 → WEAK HIT]"
const ACTION_ROLL =
  /^\[Action roll - (?:(.+?): )?(.*?\+[^:]+?): .*? = (-?\d+)(?: \(capped at 10\))? vs (\d+) and (\d+) → (STRONG HIT|WEAK HIT|MISS)\]/;

function actionRollHeadline(text: string): string | null {
  const first = text.split("\n")[0].trim();
  const m = ACTION_ROLL.exec(first);
  if (!m) return null;
  const [, , moveAndStat, score, c1, c2, word] = m;
  return `${moveAndStat.trim()} ${score} vs ${c1}, ${c2} — ${word.toLowerCase()}`;
}

// A pool line is "{label }{formula}: [1, 2] = **3**" (describePool).
const POOL_LINE = /^(.*?): \[([^\]]*)\] = \*\*(-?\d+)\*\*$/;

function poolHeadline(line: string, several: boolean): string {
  const m = POOL_LINE.exec(line);
  if (!m) return line;
  const [, name, faces, total] = m;
  const rolls = faces
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Several dice in one pool of a multi-pool roll are shown as faces, not
  // summed: a Starforged 2d10 is two challenge dice, not a total of 11.
  if (several && rolls.length > 1) return `${name}: ${rolls.join(", ")}`;
  return `${name} = ${total}`;
}

function formulaRollHeadline(text: string): string | null {
  const lines = bracketLines(text);
  if (lines.length === 0 || lines[0].startsWith("[ERROR")) return null;
  const first = unbracket(lines[0]);
  if (/ separate pools, NOT added together:$/.test(first)) {
    // The pool lines follow as "[  …]"; the later lines are not indented.
    const pools = text
      .split("\n")
      .filter((l) => /^\[ {2}.+\]$/.test(l.trim()) && l.startsWith("[  "))
      .map((l) => poolHeadline(unbracket(l).trim(), true));
    return pools.length > 0 ? pools.join(" · ") : cut(first);
  }
  // One pool: "Name: 1d20+3: [14] = **17**" -> "1d20+3 = 17", with the
  // roll's own name in front unless it is the default.
  const nameEnd = first.indexOf(": ");
  if (nameEnd === -1) return cut(first);
  const displayName = first.slice(0, nameEnd);
  const pool = poolHeadline(first.slice(nameEnd + 2), false);
  return displayName === "Roll" ? pool : `${displayName}: ${pool}`;
}

function opposedHeadline(text: string): string | null {
  const lines = bracketLines(text);
  if (lines.length < 3 || lines[0].startsWith("[ERROR")) return null;
  const player = /^\[Player: .*= (-?\d+)\]$/.exec(lines[1]);
  const opponent = /^\[(.+?): .*= (-?\d+)\]$/.exec(lines[2]);
  if (!player || !opponent) return null;
  return `You ${player[1]} vs ${opponent[1]} ${opponent[2]}`;
}

function fateHeadline(text: string): string | null {
  const m = /^\[Roll: .*?→ (.+)\]$/m.exec(text);
  if (!m) return null;
  // "Normal Yes" reads as "Yes"; the stronger and qualified answers stay.
  return `Oracle: ${m[1].trim().replace(/^Normal /, "")}`;
}

const ROLL_TOOLS = new Set([
  "action_roll",
  "feat_roll",
  "initiative_roll",
  "formula_roll",
  "opposed_formula",
  "npc_roll",
  "fate_question",
]);

/** A roll's short form from its contextForStory, or null when the tool is not a roll. */
export function rollHeadline(
  toolName: string,
  contextForStory: string,
): string | null {
  if (!ROLL_TOOLS.has(toolName)) return null;
  const text = contextForStory || "";
  let headline: string | null = null;
  switch (toolName) {
    case "action_roll":
      headline = actionRollHeadline(text);
      break;
    case "formula_roll":
      headline = formulaRollHeadline(text);
      break;
    case "opposed_formula":
      headline = opposedHeadline(text);
      break;
    case "fate_question":
      headline = fateHeadline(text);
      break;
    case "npc_roll": {
      const first = bracketLines(text)[0];
      headline = first && !first.startsWith("[ERROR") ? cut(unbracket(first)) : null;
      break;
    }
  }
  if (headline) return headline;
  // A roll in a shape this file does not know: the first bracketed line. An
  // error is not a roll and reads as an ordinary tool in the counts.
  const first = bracketLines(text)[0];
  if (!first || first.startsWith("[ERROR")) return null;
  return cut(unbracket(first));
}

/** One quiet line per turn: rolls spelled out, everything else counted. Hidden blocks are skipped entirely. */
export function summarizeTurnWork(blocks: TimelineBlock[]): TurnWorkSummary {
  const rolls: string[] = [];
  const counts: Array<{ label: string; n: number }> = [];
  let live: string | undefined;

  const count = (label: string) => {
    const hit = counts.find((c) => c.label === label);
    if (hit) hit.n += 1;
    else counts.push({ label, n: 1 });
  };

  for (const block of blocks) {
    if (block.hidden) continue;
    if (block.kind === "text") continue;
    if (block.kind === "thinking") {
      if (block.streaming) live = "Thinking…";
      else count("thought");
      continue;
    }
    const name = block.toolName || "";
    const headline = rollHeadline(name, block.contextForStory || "");
    if (headline) rolls.push(headline);
    else count(getToolProgressLabel(name));
  }

  return {
    rolls,
    counts,
    live,
    isEmpty: rolls.length === 0 && counts.length === 0 && !live,
  };
}

/** The line's text: at most two roll headlines, "+N more", then the counts. */
export function formatTurnWork(summary: TurnWorkSummary): string {
  const parts: string[] = summary.rolls.slice(0, MAX_ROLL_HEADLINES);
  if (summary.rolls.length > MAX_ROLL_HEADLINES) {
    parts.push(`+${summary.rolls.length - MAX_ROLL_HEADLINES} more`);
  }
  for (const c of summary.counts) {
    parts.push(c.n > 1 ? `${c.label} ×${c.n}` : c.label);
  }
  return parts.join(" · ");
}
