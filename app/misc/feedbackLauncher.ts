/**
 * How an entry point opens the feedback form. There is one form, mounted once
 * in the root layout (FeedbackHost); a button anywhere in the app calls
 * openFeedback() with what it knows, so a surface that closes right after
 * (the story menu sheet, a Settings view) cannot take the form with it.
 */
import type { FeedbackKind, TurnAttachment } from "./feedback";

export interface FeedbackRequest {
  kind: FeedbackKind;
  /**
   * Names the entry point for the draft key `ys:feedbackDraft:<kind>:<target>`
   * (a story and turn, a system id, a starter id, a story and night, "app").
   */
  target: string;
  /** The line under the title, e.g. "Feedback on Blood & Bone". */
  heading?: string;
  systemId?: string;
  starterId?: string;
  /** The night, for kind "session". */
  session?: number;
  /** What "Attach this turn" offers; absent means the checkbox is not shown. */
  turn?: TurnAttachment;
  /** Called once, after the Worker stored it. */
  onSent?: () => void;
}

export const FEEDBACK_OPEN_EVENT = "ys:openFeedback";

export function openFeedback(request: FeedbackRequest): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<FeedbackRequest>(FEEDBACK_OPEN_EVENT, { detail: request }));
}

export function feedbackDraftKey(request: Pick<FeedbackRequest, "kind" | "target">): string {
  return `ys:feedbackDraft:${request.kind}:${request.target}`;
}
