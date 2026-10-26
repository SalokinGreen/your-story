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
    // The judge reads the turn; the table below is its fallback and what runs
    // while the judge is off, which is the default (slice 5 ships dark until
    // the dawn cases show no rise in missed or false dawns).
    kind: "judge",
    question:
      "Did the night end in this turn's text, so that it is now day (dawn has come, or the character sleeps or waits through to morning)? A plan, a question, a memory or a time still to come does not count.",
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
      /\b(?:I|we|you)\s+(?:sleep|slept|go to bed|went to bed|turn in|turned in)\b[^.!?\n]{0,120}?\b(?:until|till|through)\b/i,
      /\b(?:I|we|you)\s+(?:wake|wakes|woke)(?: up)?\s+(?:the next|in the morning)\b/i,
      /\bwait(?:s|ed)?\s+(?:until|till) dawn\b/i,
    ],
    // A plan in a player's mouth ("we leave in the morning") but ordinary
    // scene-setting in the GM's prose, so these count in the player's line only.
    playerOnly: [/\bin the morning\b/i, /\bcome morning\b/i],
    exceptions: [
      // The day is still to come: before, until, hours till, not until,
      // still far away, for any of the words for it (engine review).
      // ("I sleep until sunrise" is a crossing, so a bare "until" is not.)
      /\bbefore\s+(?:dawn|sunrise|daybreak|first light|the sun (?:rises|comes up))\b/i,
      /\b(?:have|has|got)\s+(?:until|till)\s+(?:dawn|sunrise|daybreak|first light)\b/i,
      /\bhours?\s+(?:till|until|before|to)\s+(?:dawn|sunrise|daybreak|first light)\b/i,
      /\bnot (?:yet|until)\s+(?:dawn|sunrise|daybreak|first light)\b/i,
      /\b(?:dawn|sunrise|daybreak|first light) is (?:still )?(?:hours|far|a while)\b/i,
      // A dawn in the future or a habit: "tomorrow at dawn", "the ship sails
      // at dawn", "the Concord meets at first light".
      /\btomorrow\s+at\s+(?:dawn|sunrise|first light)\b/i,
      /\bat\s+(?:dawn|sunrise|first light)\s+tomorrow\b/i,
      /\b(?:sails|leaves|meets|opens|starts|begins|arrives|departs)\s+at\s+(?:dawn|sunrise|first light|daybreak)\b/i,
      // A question about the morning ("Will we leave at dawn?", "...at
      // sunrise?"): a future question, or the phrase right before its "?".
      // Bounded, so a long unpunctuated run stays fast; the GM's hand-off
      // ("Dawn breaks over Whitechapel, what do you do?") still fires.
      /\b(?:will|shall|should|could|would)\b[^.!?\n]{0,80}\?/i,
      /\b(?:dawn|sunrise|daybreak|first light|morning|next day)\s*\?/i,
      /\bremember(?:ed)?\s+the next morning\b/i,
      /\b(?:died|was buried|was found)\s+the next day\b/i,
    ],
  },
  satisfiedBy: { toolName: "end_session", resultType: "end_session" },
  message:
    "The text may say the night ended this turn. If the shared story really has reached dawn, run dawn now as the rules say: call end_session, then follow the reminder it returns (the Reckoning for every character, downtime, clear what was used tonight), and narrate any change it makes to the morning. If it is not dawn yet, answer with nothing at all (an empty reply): the story already says what happened.",
};

export const BLOOD_AND_BONE_TURN_END_CHECKS: SystemTurnEndCheck[] = [
  NIGHT_ENDED_CHECK,
];
