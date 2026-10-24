"use client";

// One quiet line under the turn that ended a night: "How was tonight? · Give
// feedback · ✕" (design §6, decision 192). Whether it shows is decided by the
// pure sessionFeedbackOffer() (app/misc/feedbackSession.ts); this only draws it.

import { DynamicIcon } from "../components/DynamicIcon";

export default function SessionFeedbackCard({
  onGive,
  onDismiss,
}: {
  onGive: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      data-no-turn-tap=""
      className="flex items-center gap-3 text-xs text-ys-muted border-t border-ys-border pt-2"
    >
      <span>How was tonight?</span>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        onClick={onGive}
        className="underline hover:text-ys-text focus-visible:ring-2 focus-visible:ring-ys-accent rounded"
      >
        Give feedback
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        title="Don't ask about this night"
        className="ml-auto p-1 rounded hover:text-ys-text focus-visible:ring-2 focus-visible:ring-ys-accent"
      >
        <DynamicIcon name="X" className="w-4 h-4" />
      </button>
    </div>
  );
}
