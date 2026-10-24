/**
 * Blood & Bone's turn-end check (decision 183, docs/dawn-gate-design.md): when
 * the turn's words say the night ended and nothing called `end_session`, the
 * GM is reminded once to run dawn. The 2026-10-24 playtest found Haiku
 * narrating the morning and never ending the session, so the Reckoning, the
 * meter resets and the downtime offer never happened; the rule is in the
 * pinned core ("The night") and sharper wording did not change it.
 *
 * Only data lives here. The Reckoning's wording is in the system's
 * `endOfSessionReminder`, which `end_session` returns; the engine in
 * turnEndChecks.ts and generation.ts knows none of it.
 */
import type { SystemTurnEndCheck } from "../types";

export const NIGHT_ENDED_CHECK: SystemTurnEndCheck = {
  id: "night-ended",
  trigger: {
    phrases: [
      /\bat dawn\b/i,
      /\bdawn\s+(?:breaks|broke|comes|came|arrives|arrived)\b/i,
      /\bfirst light\b/i,
      /\bsunrise\b/i,
      /\bthe sun\s+(?:rises|rose|comes up|came up)\b/i,
      /\bdaybreak\b/i,
      /\bnext morning\b/i,
      /\bthe next day\b/i,
      /\bthe following morning\b/i,
      /\bthe night\s+(?:passes|passed)\b/i,
      // "I go to bed and sleep until ...": the span between the verb and the
      // preposition stays inside one sentence.
      /\b(?:I|we|you)\s+(?:sleep|slept|go to bed|went to bed|turn in|turned in)\b[^.!?\n]*?\b(?:until|till|through)\b/i,
      /\b(?:I|we|you)\s+(?:wake|wakes|woke)(?: up)?\s+(?:the next|in the morning)\b/i,
      /\bwait(?:s|ed)?\s+(?:until|till) dawn\b/i,
    ],
    // A plan in a player's mouth ("we leave in the morning") but ordinary
    // scene-setting in the GM's prose, so these count in the player's line only.
    playerOnly: [/\bin the morning\b/i, /\bcome morning\b/i],
    exceptions: [
      /\bbefore dawn\b/i,
      /\bhours?\s+(?:till|until|before)\s+dawn\b/i,
      /\bnot yet dawn\b/i,
      /\bdawn is (?:still )?(?:hours|far)\b/i,
      /\btomorrow\s+at\s+dawn\b/i,
      /\bat\s+dawn\s+tomorrow\b/i,
      // A question about the morning is not the morning ("...at dawn?"): the
      // clause up to its question mark.
      /[^.!?\n]*\b(?:dawn|sunrise|daybreak|first light|morning|next day)\b[^.!?\n]*\?/i,
      /\bremember(?:ed)?\s+the next morning\b/i,
    ],
  },
  satisfiedBy: { toolName: "end_session", resultType: "end_session" },
  message:
    "The text may say the night ended this turn. If the shared story really has reached dawn, run dawn now as the rules say: call end_session, then follow the reminder it returns (the Reckoning for every character, downtime, clear what was used tonight), and narrate any change it makes to the morning. If it is not dawn yet, carry on without it.",
};

export const BLOOD_AND_BONE_TURN_END_CHECKS: SystemTurnEndCheck[] = [
  NIGHT_ENDED_CHECK,
];
