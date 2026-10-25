// The words of the GM loop's gates. A prompt string here has no newline in the
// middle of a sentence, describes the thing rather than its history, and says
// the exact repair (docs/gm-prompt-design.md 2.4).

import { ROLL_OR_ORACLE_TOOL_NAMES } from "./reasoningTiers";

/**
 * The M2 gate's user message, sent when a contested scene is about to end on
 * prose with no roll or oracle call this turn. It names the roll and oracle
 * tools this story actually offers (so Blood & Bone reads `action_roll` and
 * Fantastic Realms `feat_roll`), points at the action the player declared this
 * turn, and lets the GM decline when nothing in it is uncertain.
 *
 * `offeredTools` is the names on the GM's tool list for this turn.
 */
export function rollGateMessage(offeredTools: readonly string[]): string {
  const offered = new Set(offeredTools);
  const names = [...ROLL_OR_ORACLE_TOOL_NAMES].filter((n) => offered.has(n));
  const list =
    names.length > 0
      ? names.map((n) => `\`${n}\``).join(", ")
      : "a roll or oracle tool";
  return `This scene is contested: combat or a challenge is active, or high or deadly stakes were declared earlier in it, and no roll or oracle call has been made this turn. If the action the player declared this turn has an uncertain outcome, resolve it now with ${list}, then continue. If nothing in that action is uncertain, say what happens and continue without a roll.`;
}
