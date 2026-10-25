/**
 * Holding a turn's narration until the judges are done (decision 221).
 *
 * generateStoryTurnOnce fires the narration callbacks (onStoryStart,
 * onStoryContent, onStoryComplete) and the choices callbacks (onChoicesStart,
 * onChoicesComplete) as the turn is written, long before any judge has read
 * it. When a judge may rewrite the turn, the player must never see, hear or be
 * sent text a rewrite later replaces, so generateStoryTurn hands the Once
 * function the wrapped callbacks this module makes. The five narration and
 * choices callbacks queue, in order; everything else passes straight through
 * (reasoning, tool results, tier and stage notices keep flowing, as they do in
 * session zero).
 *
 * The caller then decides:
 *  - release(finalNarration?) plays the narration out once, as the rewrite when
 *    one is given, else as written. The text was never shown live, so the page
 *    is told it was not narrated by the GM stage: it must append it itself.
 *  - flushChoices() plays the queued choices; dropChoices() throws them away
 *    (a rewrite replaced the text they were drawn from).
 *  - discard() empties everything and starts over (a reset retries the turn).
 * A Stop calls none of these, so nothing is shown.
 */

import type { GenerationCallbacks, TokenUsage } from "./generation";

type ChoicesCompleteArgs = Parameters<
  NonNullable<GenerationCallbacks["onChoicesComplete"]>
>;

const NO_USAGE: TokenUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
};

export interface HeldTurnOutput {
  /** The callbacks to give the attempt: the five queue, the rest pass through. */
  callbacks: GenerationCallbacks;
  /** Play the narration out once. A rewrite replaces the text. Idempotent. */
  release(finalNarration?: string): void;
  /** Play the queued choices, in order, once. */
  flushChoices(): void;
  /** Throw the queued choices away. */
  dropChoices(): void;
  /** Throw everything away and hold the next attempt afresh. */
  discard(): void;
}

export function createHeldTurnOutput(
  callbacks: GenerationCallbacks,
): HeldTurnOutput {
  let started = false;
  let lastFull: string | null = null;
  let completed: { content: string; usage: TokenUsage } | null = null;
  let released = false;
  let choicesStarted = false;
  let choicesComplete: ChoicesCompleteArgs | null = null;

  const held: GenerationCallbacks = {
    ...callbacks,
    onStoryStart: () => {
      started = true;
    },
    onStoryContent: (_chunk, fullContent) => {
      lastFull = fullContent;
    },
    onStoryComplete: (content, usage) => {
      completed = { content, usage };
    },
    onChoicesStart: () => {
      choicesStarted = true;
    },
    onChoicesComplete: (choices, usage) => {
      choicesComplete = [choices, usage];
    },
  };

  const reset = () => {
    started = false;
    lastFull = null;
    completed = null;
    released = false;
    choicesStarted = false;
    choicesComplete = null;
  };

  return {
    callbacks: held,

    release(finalNarration) {
      if (released) return;
      released = true;
      if (!started && lastFull === null && !completed) return;
      const content =
        finalNarration ?? completed?.content ?? lastFull ?? "";
      // The text was never streamed live, so it is "not narrated by the GM
      // stage" whichever stage wrote it: the page appends it itself.
      callbacks.onStoryStart?.(false);
      callbacks.onStoryContent?.(content, content);
      callbacks.onStoryComplete?.(content, completed?.usage ?? NO_USAGE);
    },

    flushChoices() {
      const args = choicesComplete;
      const hadStart = choicesStarted;
      choicesStarted = false;
      choicesComplete = null;
      if (hadStart) callbacks.onChoicesStart?.();
      if (args) callbacks.onChoicesComplete?.(...args);
    },

    dropChoices() {
      choicesStarted = false;
      choicesComplete = null;
    },

    discard: reset,
  };
}
