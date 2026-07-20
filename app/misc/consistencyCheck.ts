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
 * and as an eval-harness metric, not as a live generation gate.
 */

import { StoryData, ConsistencyWarning } from "./structs";
import {
  escapeRegExp,
  countNameMentions,
  ACTIVE_PRESENCE_PHRASES,
  CONTRADICTION_WINDOW_CHARS,
} from "./compaction";

export function checkNarrationConsistency(
  narration: string,
  storyData: StoryData
): ConsistencyWarning[] {
  const warnings: ConsistencyWarning[] = [];
  if (!narration.trim()) return warnings;

  const deadOrGoneNpcs = (storyData.npcs || []).filter(
    (npc) => npc.name && (npc.status === "dead" || npc.status === "departed")
  );

  for (const npc of deadOrGoneNpcs) {
    if (countNameMentions(narration, npc.name) === 0) continue;

    const lowerNarration = narration.toLowerCase();
    const namePattern = new RegExp(`\\b${escapeRegExp(npc.name)}\\b`, "gi");
    let match: RegExpExecArray | null;
    while ((match = namePattern.exec(narration)) !== null) {
      const windowStart = match.index;
      const windowEnd = Math.min(
        narration.length,
        match.index + npc.name.length + CONTRADICTION_WINDOW_CHARS
      );
      const window = lowerNarration.slice(windowStart, windowEnd);
      const hitPhrase = ACTIVE_PRESENCE_PHRASES.find((phrase) =>
        window.includes(phrase)
      );
      if (hitPhrase) {
        warnings.push({
          type: "status_contradiction",
          entity: npc.name,
          detail: `"${npc.name}" is tracked as ${npc.status}, but the narration describes them with an active-presence phrase ("${hitPhrase}").`,
        });
        break; // one warning per entity is enough signal
      }
    }
  }

  return warnings;
}
