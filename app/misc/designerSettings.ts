/**
 * The Game Designer's stored reasoning effort (decision 53).
 *
 * The Designer's model is chosen on /creator and kept in localStorage
 * ("designerModel"), outside the tier ladder and the side agents; its effort
 * sits beside it so a player who puts Claude Sonnet there can choose how hard
 * it thinks. "none" until they do - the cheapest effort every provider has
 * (see DEFAULT_REASONING_EFFORT in reasoningTiers.ts). Not in
 * syncableSettingsKeys.ts, like "designerModel" itself.
 */

import {
  DEFAULT_REASONING_EFFORT,
  ReasoningEffort,
  isReasoningEffort,
} from "./reasoningTiers";

export const DESIGNER_EFFORT_KEY = "designerReasoningEffort";

/** The saved effort, or "none" when none was saved or the stored value is not an effort. */
export function getDesignerReasoningEffort(): ReasoningEffort {
  if (typeof window === "undefined") return DEFAULT_REASONING_EFFORT;
  try {
    const stored = localStorage.getItem(DESIGNER_EFFORT_KEY);
    return isReasoningEffort(stored) ? stored : DEFAULT_REASONING_EFFORT;
  } catch {
    return DEFAULT_REASONING_EFFORT;
  }
}

export function setDesignerReasoningEffort(effort: ReasoningEffort): void {
  if (typeof window === "undefined" || !isReasoningEffort(effort)) return;
  try {
    localStorage.setItem(DESIGNER_EFFORT_KEY, effort);
  } catch {
    // Storage blocked: the choice holds for this visit only.
  }
}
