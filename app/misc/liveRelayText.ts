/**
 * What the host tells online guests is "being written" right now.
 *
 * While a turn is held for the judges (decision 221) the live narration stays
 * empty and `storyText` still holds the previous turn's prose until the held
 * text is released. Falling back to `storyText` would broadcast that old turn
 * as new text for the whole hold. So the fallback counts only once `storyText`
 * has changed since the turn started.
 */
export function liveRelayText(params: {
  liveNarrationText: string;
  storyText: string;
  /** `storyText` as it stood when this turn began streaming. */
  storyTextAtTurnStart: string;
}): string {
  const { liveNarrationText, storyText, storyTextAtTurnStart } = params;
  if (liveNarrationText.length > 0) return liveNarrationText;
  return storyText === storyTextAtTurnStart ? "" : storyText;
}
