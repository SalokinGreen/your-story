/**
 * The shape check for Blood & Bone's table notes (expansion design 4.4).
 * Returns a list of problems; an empty list means the note is well formed.
 *
 * Three shapes are known:
 *  - the older oracle: starts "Roll 1dN:" and lists `1.` to `N.`;
 *  - the family note: `## <name> (<die>)` sub-tables, the die written as the GM
 *    passes it: `1d6`/`1d10`/`1d20`/`1d100` list
 *    `1.` to `N.`; `d66: roll ["1d6","1d6"], first die is the tens` lists the 36 keys 11-16 ... 61-66 in order; a
 *    `(d6, on the Kind's list)` sub-table holds a `### <Kind>` block of
 *    `1.`-`6.` for each of the seven Kinds. The note ends on a "Use when "
 *    paragraph;
 *  - the miss tables and creation prompts (a "Roll 1d6" lead, their own
 *    layout), which are left to their own tests.
 */
import { BLOOD_AND_BONE_KINDS } from "@/app/misc/systems/blood-and-bone/kindList";

export const KINDS: readonly string[] = BLOOD_AND_BONE_KINDS;

import { rollFormula } from "../../app/misc/diceFormula";

const D66_HEAD = 'd66: roll ["1d6","1d6"], first die is the tens';

/** A small seeded generator, so the sampled rolls are the same every run. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rolls what the GM would pass, over a seeded sample; returns the distinct totals. */
function sampleTotals(formulas: string[], samples: number): Set<number> {
  const real = Math.random;
  Math.random = seeded(1234);
  try {
    const seen = new Set<number>();
    for (let i = 0; i < samples; i++) {
      const rolls = formulas.map((f) => rollFormula(f).total);
      seen.add(formulas.length === 2 ? rolls[0] * 10 + rolls[1] : rolls[0]);
    }
    return seen;
  } finally {
    Math.random = real;
  }
}

/** The die really rolls to 1..sides, and is not constant. */
function rollProblem(label: string, formulas: string[], expected: number[]): string | null {
  let seen: Set<number>;
  try {
    seen = sampleTotals(formulas, 6000);
  } catch (e) {
    return `${label}: the GM cannot roll ${JSON.stringify(formulas)} (${e instanceof Error ? e.message : e})`;
  }
  if (seen.size < 2) return `${label}: ${JSON.stringify(formulas)} always gives ${[...seen][0]}`;
  const missing = expected.filter((v) => !seen.has(v));
  const extra = [...seen].filter((v) => !expected.includes(v));
  if (missing.length || extra.length) {
    return `${label}: ${JSON.stringify(formulas)} misses [${missing.join(",")}] / gives [${extra.join(",")}] outside the table`;
  }
  return null;
}

const D66_KEYS = Array.from({ length: 36 }, (_, i) => `${Math.floor(i / 6) + 1}${(i % 6) + 1}`);

function numbered(lines: string[]): number[] {
  const out: number[] = [];
  for (const l of lines) {
    const m = /^(\d+)\. /.exec(l);
    if (m) out.push(Number(m[1]));
  }
  return out;
}

function sequence(found: number[], n: number): string | null {
  if (found.length !== n) return `${found.length} entries, expected ${n}`;
  for (let i = 0; i < n; i++) {
    if (found[i] !== i + 1) return `entry ${i + 1} is numbered ${found[i]}`;
  }
  return null;
}

export function checkTableShape(title: string, content: string): string[] {
  const problems: string[] = [];
  if (title.startsWith("B&B — Miss tables") || title.startsWith("B&B — Creation prompts: ")) {
    if (!/^Roll 1d6/.test(content)) problems.push("does not open with Roll 1d6");
    return problems;
  }

  const old = /^Roll 1d(\d+):/.exec(content);
  if (old) {
    const err = sequence(numbered(content.split("\n")), Number(old[1]));
    if (err) problems.push(`d${old[1]}: ${err}`);
    return problems;
  }

  const lines = content.split("\n");
  const headers = lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => /^## /.test(l));
  if (headers.length === 0) return ["unrecognised table shape (no Roll 1dN: lead, no ## sub-tables)"];

  headers.forEach((h, k) => {
    const end = k + 1 < headers.length ? headers[k + 1].i : lines.length;
    const body = lines.slice(h.i + 1, end);
    const m = /^## (.+) \((1d\d+|d66: roll \["1d6","1d6"\], first die is the tens)(, on the Kind's list)?\)\s*$/.exec(h.l);
    if (!m) {
      problems.push(`"${h.l}" does not name its die as (1dN) or the d66 pair`);
      return;
    }
    const [, name, dieHead, perKind] = m;
    const die = dieHead === D66_HEAD ? "d66" : dieHead.slice(1);
    const label = `${name} (${die})`;
    if (perKind) {
      if (die !== "d6") problems.push(`${label}: a per-Kind list must be 1d6`);
      else {
        const rp = rollProblem(label, ["1d6"], [1, 2, 3, 4, 5, 6]);
        if (rp) problems.push(rp);
      }
      const subs = body
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => /^### /.test(l));
      const kinds = subs.map(({ l }) => l.slice(4).trim());
      if (kinds.length !== KINDS.length || new Set(kinds).size !== kinds.length || !KINDS.every((x) => kinds.includes(x))) {
        problems.push(`${label}: Kinds are [${kinds.join(", ")}], expected the seven`);
      }
      subs.forEach((sub, j) => {
        const subEnd = j + 1 < subs.length ? subs[j + 1].i : body.length;
        const err = sequence(numbered(body.slice(sub.i + 1, subEnd)), 6);
        if (err) problems.push(`${label} / ${kinds[j]}: ${err}`);
      });
      return;
    }
    if (die === "d66") {
      const keys: string[] = [];
      for (const l of body) {
        const km = /^([1-6][1-6]) /.exec(l);
        if (km) keys.push(km[1]);
      }
      if (keys.length !== 36 || keys.some((k, i) => k !== D66_KEYS[i])) {
        problems.push(`${label}: keys are not the 36 of 11-66 in order (${keys.length} found)`);
      }
      if (numbered(body).length > 0) problems.push(`${label}: a d66 table has stray numbered "N." lines`);
      const rp = rollProblem(label, ["1d6", "1d6"], D66_KEYS.map(Number));
      if (rp) problems.push(rp);
      return;
    }
    const sides = Number(die.slice(1));
    if (![6, 10, 20, 100].includes(sides)) {
      problems.push(`${label}: unsupported die`);
      return;
    }
    const err = sequence(numbered(body), sides);
    if (err) problems.push(`${label}: ${err}`);
    else {
      const rp = rollProblem(label, [`1d${sides}`], Array.from({ length: sides }, (_, i) => i + 1));
      if (rp) problems.push(rp);
    }
  });

  // The closing paragraph (the text after the last blank line) opens "Use when ".
  const paragraphs = content.trim().split(/\n\s*\n/);
  const last = paragraphs[paragraphs.length - 1] ?? "";
  if (!last.startsWith("Use when ")) problems.push('does not end on a "Use when " paragraph');
  return problems;
}
