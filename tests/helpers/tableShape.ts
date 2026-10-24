/**
 * The shape check for Blood & Bone's table notes (expansion design 4.4).
 * Returns a list of problems; an empty list means the note is well formed.
 *
 * Three shapes are known:
 *  - the older oracle: starts "Roll 1dN:" and lists `1.` to `N.`;
 *  - the family note: `## <name> (<die>)` sub-tables. d6/d10/d20/d100 list
 *    `1.` to `N.`; d66 lists the 36 keys 11-16 ... 61-66 in order; a
 *    `(d6, on the Kind's list)` sub-table holds a `### <Kind>` block of
 *    `1.`-`6.` for each of the seven Kinds. The note ends on a "Use when "
 *    paragraph;
 *  - the miss tables and creation prompts (a "Roll 1d6" lead, their own
 *    layout), which are left to their own tests.
 */
export const KINDS = [
  "Vampire",
  "Gargoyle",
  "Wendigo",
  "Werewolf",
  "Witch/Warlock",
  "Hunter",
  "Ghost",
];

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
    const m = /^## (.+) \((d\d+)(, on the Kind's list)?\)\s*$/.exec(h.l);
    if (!m) {
      problems.push(`"${h.l}" does not name its die as (dN)`);
      return;
    }
    const [, name, die, perKind] = m;
    const label = `${name} (${die})`;
    if (perKind) {
      if (die !== "d6") problems.push(`${label}: a per-Kind list must be d6`);
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
      return;
    }
    const sides = Number(die.slice(1));
    if (![6, 10, 20, 100].includes(sides)) {
      problems.push(`${label}: unsupported die`);
      return;
    }
    const err = sequence(numbered(body), sides);
    if (err) problems.push(`${label}: ${err}`);
  });

  // The closing paragraph (the text after the last blank line) opens "Use when ".
  const paragraphs = content.trim().split(/\n\s*\n/);
  const last = paragraphs[paragraphs.length - 1] ?? "";
  if (!last.startsWith("Use when ")) problems.push('does not end on a "Use when " paragraph');
  return problems;
}
