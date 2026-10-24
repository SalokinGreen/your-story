"use client";

// The one feedback form (docs/feedback-design.md §6, decision 192). Every entry
// point opens this through openFeedback(); FeedbackHost mounts it.
//
// What it promises the player: feedback goes to the developer, who can read
// it; an attached turn is shown as editable text, so what is sent is what is
// on screen; nothing is resent on its own; and the draft (with its id, so a
// retry is stored once) survives a failed send, a closed form and a restart
// until it is sent.

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useBackHandler } from "../misc/useBackHandler";
import { DynamicIcon } from "./DynamicIcon";
import {
  FEEDBACK_LIMITS,
  buildSubmission,
  newFeedbackId,
  validateSubmission,
  bodyBytes,
  type TurnAttachment,
} from "../misc/feedback";
import {
  FEEDBACK_FAILURE_MESSAGES,
  sendFeedback,
  type FeedbackFailure,
} from "../misc/feedbackClient";
import { feedbackDraftKey, type FeedbackRequest } from "../misc/feedbackLauncher";

interface Draft {
  id: string;
  rating: number | null;
  text: string;
  attach: boolean;
  turn: TurnAttachment | null;
}

function emptyTurn(): TurnAttachment {
  return { playerLine: "", prose: "", rolls: [], models: [] };
}

function readDraft(key: string): Draft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<Draft>;
    if (typeof d.id !== "string" || typeof d.text !== "string") return null;
    const t = d.turn;
    return {
      id: d.id,
      rating: typeof d.rating === "number" ? d.rating : null,
      text: d.text,
      attach: d.attach === true,
      turn:
        t && typeof t === "object"
          ? {
              playerLine: typeof t.playerLine === "string" ? t.playerLine : "",
              prose: typeof t.prose === "string" ? t.prose : "",
              rolls: Array.isArray(t.rolls) ? t.rolls.filter((x) => typeof x === "string") : [],
              models: Array.isArray(t.models) ? t.models.filter((x) => typeof x === "string") : [],
            }
          : null,
    };
  } catch {
    return null;
  }
}

function writeDraft(key: string, draft: Draft | null): void {
  try {
    if (draft) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
  } catch {
    // A full or blocked store: the draft lives in memory only.
  }
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const KIND_TITLES: Record<FeedbackRequest["kind"], string> = {
  turn: "Feedback on this turn",
  system: "Feedback on this system",
  starter: "Feedback on this starter",
  session: "How was tonight?",
  app: "Feedback on the app",
};

type Status =
  | { state: "idle" }
  | { state: "sending" }
  | { state: "failed"; reason: FeedbackFailure | "empty" }
  | { state: "sent"; ref: string };

export default function FeedbackModal({
  request,
  onClose,
}: {
  request: FeedbackRequest;
  onClose: () => void;
}) {
  const draftKey = feedbackDraftKey(request);
  const offersTurn = !!request.turn && (request.kind === "turn" || request.kind === "session");

  // The draft is read once, when the form opens. The id is made here, in a
  // lazy initialiser that runs on open (never while a page renders), and is
  // kept for every retry.
  const [draft, setDraft] = useState<Draft>(() => {
    const saved = readDraft(draftKey);
    if (saved) return saved;
    return {
      id: newFeedbackId(),
      rating: null,
      text: "",
      attach: false,
      turn: request.turn ? { ...request.turn } : null,
    };
  });
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const dialogRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sent = status.state === "sent";

  // Keep the draft on disk until it is sent. Nothing is written once sent.
  useEffect(() => {
    if (sent) return;
    const worthKeeping = draft.text.trim() !== "" || draft.rating !== null || draft.attach;
    writeDraft(draftKey, worthKeeping ? draft : null);
  }, [draft, draftKey, sent]);

  // Closing the form cancels a send in flight; the id is kept, so a retry is safe.
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    textRef.current?.focus();
  }, []);

  useBackHandler(true, onClose);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !dialogRef.current) return;
    const items = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    if (status.state === "failed") setStatus({ state: "idle" });
  };
  const updateTurn = (patch: Partial<TurnAttachment>) =>
    setDraft((d) => ({ ...d, turn: { ...(d.turn ?? emptyTurn()), ...patch } }));

  const submission = useMemo(
    () =>
      buildSubmission({
        id: draft.id,
        kind: request.kind,
        systemId: request.systemId,
        starterId: request.starterId,
        rating: draft.rating,
        text: draft.text,
        session: request.session,
        turn: draft.attach ? draft.turn : null,
      }),
    [draft, request.kind, request.systemId, request.starterId, request.session],
  );
  const sendable = validateSubmission(submission).ok;
  const trimmedProse =
    draft.attach && draft.turn
      ? submission.turn?.prose.length !== draft.turn.prose.length
      : false;

  const send = async () => {
    if (status.state === "sending") return;
    if (!validateSubmission(submission).ok) {
      setStatus({ state: "failed", reason: "empty" });
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus({ state: "sending" });
    try {
      const result = await sendFeedback(submission, controller.signal);
      if (controller.signal.aborted) return;
      if (result.ok) {
        writeDraft(draftKey, null);
        setStatus({ state: "sent", ref: result.ref });
        request.onSent?.();
      } else {
        setStatus({ state: "failed", reason: result.reason });
      }
    } catch {
      // Aborted by closing the form: nothing to show.
    }
  };

  const discard = () => {
    writeDraft(draftKey, null);
    onClose();
  };

  const title = KIND_TITLES[request.kind];
  const sending = status.state === "sending";

  return (
    <div
      className="fixed inset-0 z-200 flex items-end sm:items-center justify-center ys-modal-backdrop p-3 sm:p-4"
      style={{
        paddingTop: "max(0.75rem, env(safe-area-inset-top))",
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
        paddingRight: "max(0.75rem, env(safe-area-inset-right))",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        className="ys-modal w-full max-w-lg max-h-full overflow-y-auto p-4 sm:p-5"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h2 id="feedback-title" className="text-lg font-bold text-ys-text">
              {title}
            </h2>
            {request.heading && (
              <p className="text-xs text-ys-muted truncate">{request.heading}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close (your draft is kept)"
            className="shrink-0 p-1.5 rounded-lg text-ys-muted hover:text-ys-text hover:bg-ys-surface-2"
          >
            <DynamicIcon name="X" className="w-5 h-5" />
          </button>
        </div>

        {sent ? (
          <div className="space-y-4">
            <p className="text-sm text-ys-text" role="status">
              Thanks — reference{" "}
              <span className="font-mono font-semibold">
                {status.state === "sent" ? status.ref : ""}
              </span>
            </p>
            <p className="text-xs text-ys-muted">
              Keep that reference. If you ever want this feedback deleted, quote it when you ask
              (see the{" "}
              <Link href="/privacy" onClick={onClose} className="underline hover:text-ys-text">
                privacy page
              </Link>
              ).
            </p>
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="ys-button ys-button--primary px-4 py-2">
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <fieldset>
              <legend className="text-sm text-ys-text mb-1">
                Rating <span className="text-ys-muted">(optional)</span>
              </legend>
              <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((n) => {
                  const on = draft.rating !== null && n <= draft.rating;
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={draft.rating === n}
                      aria-label={`${n} out of 5`}
                      onClick={() => update({ rating: draft.rating === n ? null : n })}
                      className={`w-10 h-10 flex items-center justify-center rounded-lg text-2xl leading-none touch-manipulation hover:bg-ys-surface-2 focus-visible:ring-2 focus-visible:ring-ys-accent ${
                        on ? "text-ys-accent" : "text-ys-muted"
                      }`}
                    >
                      {on ? "★" : "☆"}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <label htmlFor="feedback-text" className="block text-sm text-ys-text mb-1">
                What would you like the developer to know?
              </label>
              <textarea
                id="feedback-text"
                ref={textRef}
                value={draft.text}
                maxLength={FEEDBACK_LIMITS.text}
                onChange={(e) => update({ text: e.target.value })}
                rows={5}
                className="w-full ys-input px-3 py-2 text-sm resize-y min-h-28"
              />
              <p className="text-xs text-ys-muted mt-1 text-right">
                {draft.text.length} / {FEEDBACK_LIMITS.text}
              </p>
            </div>

            {offersTurn && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-ys-text cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.attach}
                    onChange={(e) => update({ attach: e.target.checked })}
                    className="w-4 h-4 accent-ys-accent"
                  />
                  Attach this turn
                </label>
                {draft.attach && draft.turn && (
                  <div className="ys-card p-3 space-y-3">
                    <p className="text-xs text-ys-muted">
                      This is exactly what will be sent. Edit it to take out a name or anything
                      private.
                    </p>
                    <div>
                      <label htmlFor="feedback-player-line" className="block text-xs text-ys-muted mb-1">
                        Your line
                      </label>
                      <textarea
                        id="feedback-player-line"
                        value={draft.turn.playerLine}
                        maxLength={FEEDBACK_LIMITS.playerLine}
                        onChange={(e) => updateTurn({ playerLine: e.target.value })}
                        rows={2}
                        className="w-full ys-input px-3 py-2 text-sm resize-y"
                      />
                    </div>
                    <div>
                      <label htmlFor="feedback-prose" className="block text-xs text-ys-muted mb-1">
                        The turn
                      </label>
                      <textarea
                        id="feedback-prose"
                        value={draft.turn.prose}
                        onChange={(e) => updateTurn({ prose: e.target.value })}
                        rows={6}
                        className="w-full ys-input px-3 py-2 text-sm resize-y"
                      />
                      {trimmedProse && (
                        <p className="text-xs text-ys-muted mt-1">
                          Hidden passages, and anything past the size limit, are left out of
                          what is sent.
                        </p>
                      )}
                    </div>
                    {draft.turn.rolls.length > 0 && (
                      <div>
                        <p className="text-xs text-ys-muted mb-1">Rolls (tap to remove)</p>
                        <ul className="flex flex-wrap gap-1.5">
                          {draft.turn.rolls.map((r, i) => (
                            <li key={`${i}-${r}`}>
                              <button
                                type="button"
                                onClick={() =>
                                  updateTurn({
                                    rolls: draft.turn!.rolls.filter((_, j) => j !== i),
                                  })
                                }
                                title="Remove from the feedback"
                                className="ys-chip text-xs inline-flex items-center gap-1"
                              >
                                {r}
                                <DynamicIcon name="X" className="w-3 h-3" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {draft.turn.models.length > 0 && (
                      <div>
                        <p className="text-xs text-ys-muted mb-1">Model (tap to remove)</p>
                        <ul className="flex flex-wrap gap-1.5">
                          {draft.turn.models.map((m, i) => (
                            <li key={`${i}-${m}`}>
                              <button
                                type="button"
                                onClick={() =>
                                  updateTurn({
                                    models: draft.turn!.models.filter((_, j) => j !== i),
                                  })
                                }
                                title="Remove from the feedback"
                                className="ys-chip text-xs inline-flex items-center gap-1"
                              >
                                {m}
                                <DynamicIcon name="X" className="w-3 h-3" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {status.state === "failed" && (
              <p className="text-sm text-ys-danger" role="alert">
                {status.reason === "empty"
                  ? "Add a rating or a few words first."
                  : FEEDBACK_FAILURE_MESSAGES[status.reason]}
              </p>
            )}
            {sendable && bodyBytes(submission) > FEEDBACK_LIMITS.bodyBytes && (
              <p className="text-sm text-ys-danger" role="alert">
                {FEEDBACK_FAILURE_MESSAGES.too_large}
              </p>
            )}

            <p className="text-xs text-ys-muted">
              Feedback goes to the developer, who can read it.{" "}
              <Link href="/privacy" onClick={onClose} className="underline hover:text-ys-text">
                What is stored and for how long
              </Link>
              .
            </p>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={discard}
                className="text-xs text-ys-muted underline hover:text-ys-text"
              >
                Discard draft
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="ys-button ys-button--ghost px-4 py-2">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={sending || !sendable}
                  className="ys-button ys-button--primary px-4 py-2"
                >
                  {sending ? "Sending…" : status.state === "failed" ? "Try again" : "Send"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
