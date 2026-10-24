// The story page's "a turn is running" rule (judge-layer design 3.2, Codex
// review finding 2).
//
// The composer used to be locked by `loading || loadingStage`. Both are
// released from inside the turn: streaming clears `loading` the moment the
// first prose arrives ("let the player read while the rest finishes"), and the
// choices call clears `loadingStage` through checkBothComplete. A blocking
// Observer judge decides AFTER both of those, so with Suggested Choices on the
// composer accepted another action while the judge was still deciding, and an
// Observer rollback could then discard it.
//
// So the lock is a third thing, held by generateTrackedTurn from the moment a
// turn starts until generateStoryTurn has returned - which is after the outer
// onComplete, the only point at which the turn is final. A stage callback can
// never release it.

import {
  canObserverTriggerReset,
  type ObserverSettings,
} from "../misc/observer";

export type LoadingStage = "gm" | "story" | "choices" | null;

/** True while any part of a turn is running, whichever stage has reported done. */
export function isTurnLocked(state: {
  loading: boolean;
  loadingStage: LoadingStage;
  turnInFlight: boolean;
}): boolean {
  return state.loading || !!state.loadingStage || state.turnInFlight;
}

/**
 * The stage the screen should show. A turn in flight with no stage reported
 * (the choices call finished, the judge has not) reads as still in the story
 * stage, so the composer and the actions row stay locked and the "this may
 * still change" note stays up.
 */
export function effectiveLoadingStage(
  stage: LoadingStage,
  turnInFlight: boolean,
): LoadingStage {
  return stage ?? (turnInFlight ? "story" : null);
}

/**
 * Whether the narration waits for the outer onComplete before read-aloud may
 * start. When a judge may rewrite the text (a player turned automatic
 * rewriting on), the prose is not final until the judge has decided, and
 * speaking text that is about to change under the voice is worse than the
 * short wait. With the defaults (flag only) nothing can change the text, so
 * read-aloud starts as soon as the prose is complete.
 */
export function shouldHoldNarrationForJudge(
  settings: ObserverSettings | undefined,
): boolean {
  return canObserverTriggerReset(settings);
}
