/**
 * What the judge layer lets leave the host's device (docs/judge-layer-v2-design.md
 * section 6 and 11.4, plan slice 3).
 *
 * A finding is private: its quote, its fact ids and the draft a rewrite replaced
 * can each hold the thing the judge caught (a secret stated before its time, a
 * line crossed). The host keeps them for its Debug Logs, the Undo and the GM's
 * next live block; what online guests are sent carries only the public notice
 * (`ScenePart.publicNotice`: "checked" or "revised").
 */
import type { ObserverFlag, ScenePart, StoryData } from "../structs";

/**
 * The story as a guest may see it: no observer flags, no corrected flags and
 * no rewrite original (whose draft is the text the judges objected to). A copy;
 * the host's own story is untouched and parts with nothing private are shared.
 */
export function withoutPrivateFindings(story: StoryData): StoryData {
  const parts = story.scene?.parts;
  if (!parts || !parts.some(hasPrivateFindings)) return story;
  return {
    ...story,
    scene: {
      ...story.scene,
      parts: parts.map((p) => (hasPrivateFindings(p) ? stripPart(p) : p)),
    },
  };
}

/**
 * The story as a guest may see it, without the engine's private randomness: the
 * name ledger and the name style (randomness plan R2). A copy; the host's own
 * story is untouched, and a story with neither is returned as it is.
 */
export function withoutPrivateRandomness(story: StoryData): StoryData {
  if (story.nameLedger === undefined && story.nameStyle === undefined) return story;
  const copy = { ...story };
  delete copy.nameLedger;
  delete copy.nameStyle;
  return copy;
}

function hasPrivateFindings(p: ScenePart): boolean {
  return Boolean(p.observerFlags || p.correctedObserverFlags || p.observerRewriteOriginal);
}

function stripPart(p: ScenePart): ScenePart {
  const copy = { ...p };
  delete copy.observerFlags;
  delete copy.correctedObserverFlags;
  delete copy.observerRewriteOriginal;
  // The guest still learns that the judges looked at this turn.
  if (!copy.publicNotice) {
    copy.publicNotice = p.observerRewriteOriginal ? "revised" : "checked";
  }
  return copy;
}

/**
 * A flag as the rewrite original keeps it: its kind and severity only (plan,
 * "Every player-facing exit is generic"). The text of the flag is a fixed
 * sentence, and the finding behind it is private, so neither is stored where
 * an Undo tooltip or a restore button could show it.
 */
export function kindOnlyFlag(flag: ObserverFlag): ObserverFlag {
  return {
    type: flag.type,
    severity: flag.severity,
    detail: "",
    correctivePrompt: "",
  };
}
