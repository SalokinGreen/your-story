/**
 * Layer 5 hardening: a deterministic pass that checks GM-stage narration
 * against canonical StoryData for the one contradiction class this codebase
 * can check with high precision and no false positives - a dead/departed
 * NPC narrated as actively present. Mirrors validateCompactionSummary's
 * (compaction.ts) "status_contradiction" check exactly, just applied to
 * fresh narration instead of a compaction summary; reuses its exported
 * name-matching helpers rather than a second, possibly-drifting copy.
 *
 * Deliberately narrow, matching this codebase's established posture
 * (compaction.ts's own doc comment, and the H1/M2 precedent elsewhere):
 * this is NOT general-purpose consistency grading of arbitrary prose (that's
 * unreliable and false-positive-prone). It does not check inventory (the
 * structured inventory system has been removed) or location (not
 * structurally tracked as a single canonical field).
 *
 * Non-blocking by design: story-stage narration streams token-by-token to
 * the client, so by the time a full-text check could run, the player has
 * already seen the prose. Run this after streaming completes and attach the
 * result to the turn for display/debugging (ScenePart.consistencyWarnings)
 * and as an eval-harness metric, not as a live generation gate. Its findings
 * go to the Debug Logs and the turn's details; the page shows no toast for
 * them (judge-layer design 3.10): a name-matching heuristic is not worth
 * interrupting the reader for.
 *
 * The match is deliberately narrow (Codex review, finding on
 * consistencyCheck.ts:49). It used to take any active-presence phrase within
 * 60 characters after the name, whoever the subject was, however the sentence
 * ended and whether or not it was negated, so "Marcus is dead. Ada arrives
 * with the news." and "Marcus never arrives." both warned. Now the phrase has
 * to sit in the name's own clause, with no other subject between them and no
 * negation or past/hypothetical marker in front of it.
 */

import { StoryData, ConsistencyWarning } from "./structs";
import {
  escapeRegExp,
  countNameMentions,
  ACTIVE_PRESENCE_PHRASES,
  CONTRADICTION_WINDOW_CHARS,
} from "./compaction";

/** Where a clause ends: a sentence stop, a dash, or ", and/but/while ...". */
const CLAUSE_END =
  /[.!?;:\n—–]|,\s+(?:and|but|while|as|so|then|yet|though|although)\b/;

/** Words that make "Marcus ... arrives" a denial, a memory or a maybe, not a presence. */
const NOT_PRESENT_MARKERS =
  /\b(?:never|not|no longer|nor|neither|without|cannot|if|unless|until|once|used to|formerly|would|could|might|may|hardly|barely|remember(?:s|ed)?|recall(?:s|ed)?|imagine[sd]?|hoped?|wish(?:es|ed)?|dreams?|dreamt|had|died|was killed|years ago|long ago)\b|n['’]t\b/i;

/** Another proper noun between the name and the phrase is the phrase's real subject. */
const OTHER_SUBJECT = /\b[A-Z][a-z]+/;

export function checkNarrationConsistency(
  narration: string,
  storyData: Pick<StoryData, "npcs">
): ConsistencyWarning[] {
  const warnings: ConsistencyWarning[] = [];
  if (!narration.trim()) return warnings;

  const deadOrGoneNpcs = (storyData.npcs || []).filter(
    (npc) => npc.name && (npc.status === "dead" || npc.status === "departed")
  );

  for (const npc of deadOrGoneNpcs) {
    if (countNameMentions(narration, npc.name) === 0) continue;

    const namePattern = new RegExp(`\\b${escapeRegExp(npc.name)}\\b`, "gi");
    let match: RegExpExecArray | null;
    while ((match = namePattern.exec(narration)) !== null) {
      const afterName = match.index + npc.name.length;
      const windowEnd = Math.min(
        narration.length,
        afterName + CONTRADICTION_WINDOW_CHARS
      );

      // The name's own clause: cut the window at the first clause end.
      let window = narration.slice(afterName, windowEnd);
      const end = window.search(CLAUSE_END);
      if (end >= 0) window = window.slice(0, end);
      const lowerWindow = window.toLowerCase();

      // What came before the name in the same clause ("Never does Marcus ...").
      const before = narration.slice(0, match.index);
      const clauseStart = Math.max(
        before.lastIndexOf("."),
        before.lastIndexOf("!"),
        before.lastIndexOf("?"),
        before.lastIndexOf(";"),
        before.lastIndexOf("\n")
      );
      const lead = before.slice(clauseStart + 1);

      const hitPhrase = ACTIVE_PRESENCE_PHRASES.find((phrase) =>
        lowerWindow.includes(phrase)
      );
      if (!hitPhrase) continue;

      const between = window.slice(0, lowerWindow.indexOf(hitPhrase));
      if (NOT_PRESENT_MARKERS.test(lead) || NOT_PRESENT_MARKERS.test(between)) {
        continue;
      }
      if (OTHER_SUBJECT.test(between)) continue;

      warnings.push({
        type: "status_contradiction",
        entity: npc.name,
        detail: `"${npc.name}" is tracked as ${npc.status}, but the narration describes them with an active-presence phrase ("${hitPhrase}").`,
      });
      break; // one warning per entity is enough signal
    }
  }

  return warnings;
}
