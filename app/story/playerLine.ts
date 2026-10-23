// Reads a player part back into the lines it holds. A part is stored as
// ">text" (solo, handleCustomInput prepends the ">") or as one "> Name: text"
// per speaker, joined with newlines (couch co-op's composer, buildTurnText for
// a queued couch turn or a party Go). Pure, so it can be tested without a DOM.

import type { CouchPlayer } from "../misc/structs";

export interface PlayerLineSegment {
  /** The couch player this line belongs to, when the name matches one. */
  speaker?: CouchPlayer;
  /** The name written in the prefix, kept even when no couch player has it. */
  name?: string;
  body: string;
  /** Wholly wrapped in ( … ): said to the GM, out of character. */
  ooc: boolean;
}

// The speaker prefix has a space after the ">" ("> Ana: …"); a solo line is
// ">I say: hello" with none, so its colon is never read as a name.
const SPEAKER_PREFIX = /^>+[ \t]+([^:\n>]{1,40}?):[ \t]*(.*)$/;

/** True when the whole text is one ( … ) group, not "(a) and (b)". */
export function isWrappedInParens(text: string): boolean {
  const t = text.trim();
  if (t.length < 2 || !t.startsWith("(") || !t.endsWith(")")) return false;
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "(") depth += 1;
    else if (t[i] === ")") {
      depth -= 1;
      // The first group closed before the end: more text follows it.
      if (depth === 0 && i < t.length - 1) return false;
    }
  }
  return depth === 0;
}

/** The composer's OOC wrap: "(text)", left alone when already bracketed. */
export function wrapOutOfCharacter(text: string): string {
  const t = text.trim();
  return isWrappedInParens(t) ? t : `(${t})`;
}

/** Splits a player part into its speakers' lines, each marked in or out of character. */
export function parsePlayerLine(
  text: string,
  couchPlayers: CouchPlayer[],
): PlayerLineSegment[] {
  const raw: Array<{ name?: string; lines: string[] }> = [];
  for (const line of text.split("\n")) {
    const m = SPEAKER_PREFIX.exec(line);
    if (m) {
      raw.push({ name: m[1].trim(), lines: [m[2]] });
    } else if (raw.length === 0) {
      // Solo: the first line carries the bare ">" the page prepends.
      raw.push({ lines: [line.replace(/^>+\s*/, "")] });
    } else {
      raw[raw.length - 1].lines.push(line);
    }
  }

  return raw
    .map((seg) => {
      let body = seg.lines.join("\n").trim();
      const ooc = isWrappedInParens(body);
      if (ooc) body = body.slice(1, -1).trim();
      const speaker = seg.name
        ? couchPlayers.find(
            (p) => p.name.trim().toLowerCase() === seg.name!.toLowerCase(),
          )
        : undefined;
      return { speaker, name: seg.name, body, ooc };
    })
    .filter((s) => s.body !== "" || s.name !== undefined);
}
