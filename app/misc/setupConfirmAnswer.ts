// The setup card's answers (confirm_setup, session zero), built in one place so
// the card, the page and the tests agree on what each button resolves with.
import type { SetupConfirmationAnswer } from "./gmExecutor";

export const SETUP_APPROVED: SetupConfirmationAnswer = { approved: true };
export const SETUP_DISMISSED: SetupConfirmationAnswer = { dismissed: true };
export const SETUP_STOPPED: SetupConfirmationAnswer = { stopped: true };

/**
 * "Change something..." then Send. Null while the note is empty or only
 * whitespace (Send stays disabled), so the GM is never handed a blank change.
 */
export function changesAnswer(text: string): SetupConfirmationAnswer | null {
  const note = text.trim();
  return note ? { approved: false, note } : null;
}

/**
 * Resolves a pending setup-card promise, once. Returns true when something was
 * waiting. The page keeps the resolver in a ref; Stop, a decision and a
 * dismiss all go through here so a second call is a no-op.
 */
export function settleSetupResolver(
  ref: { current: ((answer: SetupConfirmationAnswer) => void) | null },
  answer: SetupConfirmationAnswer,
): boolean {
  const resolve = ref.current;
  ref.current = null;
  if (!resolve) return false;
  resolve(answer);
  return true;
}
