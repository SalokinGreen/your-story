"use client";

import React, { useState } from "react";
import type {
  SetupConfirmationAnswer,
  SetupConfirmationRequest,
} from "../misc/gmExecutor";
import {
  SETUP_APPROVED,
  SETUP_DISMISSED,
  changesAnswer,
} from "../misc/setupConfirmAnswer";
import type { PublicCampaignView } from "../misc/campaign/publicView";
import { useBackHandler } from "../misc/useBackHandler";
import { DynamicIcon } from "./DynamicIcon";

interface SetupConfirmModalProps {
  // The pending setup card (confirm_setup), or null when none is open
  request: SetupConfirmationRequest | null;
  onAnswer: (answer: SetupConfirmationAnswer) => void;
}

/** One collapsed-by-default block of note text, shown as written. */
function NoteSection({ title, content }: { title: string; content: string }) {
  return (
    <details className="ys-card group">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-ys-text flex items-center gap-2">
        <DynamicIcon
          name="ChevronRight"
          className="w-4 h-4 text-ys-muted transition-transform group-open:rotate-90"
        />
        {title}
      </summary>
      <pre className="px-3 pb-3 pt-1 text-xs text-ys-muted whitespace-pre-wrap break-words font-sans max-h-64 overflow-y-auto">
        {content.trim() || "(empty)"}
      </pre>
    </details>
  );
}

/** A labelled run of short items; renders nothing when there are none. */
function ListRow({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-ys-muted">
        {label}
      </dt>
      <dd className="text-sm text-ys-text">{items.join("; ")}</dd>
    </div>
  );
}

/**
 * The campaign record as the player may see it (publicCampaignView): the
 * style, the pitch, the lines and veils, and the names of what the world holds.
 * Never a secret, a doom or what a person hides; those are not in the view.
 */
function CampaignSection({ view }: { view: PublicCampaignView }) {
  return (
    <details className="ys-card group" open>
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-ys-text flex items-center gap-2">
        <DynamicIcon
          name="ChevronRight"
          className="w-4 h-4 text-ys-muted transition-transform group-open:rotate-90"
        />
        {view.styleLabel ? `Campaign: ${view.styleLabel}` : "Campaign"}
      </summary>
      <dl className="px-3 pb-3 pt-1 space-y-2">
        {view.premise && (
          <p className="text-sm text-ys-text whitespace-pre-wrap">{view.premise}</p>
        )}
        <ListRow label="Tone" items={view.tone} />
        <ListRow
          label="Lines (never appear)"
          items={view.lines.length > 0 ? view.lines : view.safetyAsked ? ["none"] : []}
        />
        <ListRow
          label="Veils (off screen)"
          items={view.veils.length > 0 ? view.veils : view.safetyAsked ? ["none"] : []}
        />
        <ListRow label="Factions" items={view.factions} />
        <ListRow
          label="Threats"
          items={view.fronts.map((f) =>
            f.stakes.length > 0 ? `${f.name} (${f.stakes.join(" / ")})` : f.name,
          )}
        />
        <ListRow
          label="Places"
          items={view.locations.map((l) =>
            l.features.length > 0 ? `${l.name} (${l.features.join(", ")})` : l.name,
          )}
        />
        <ListRow
          label="Clocks"
          items={view.clocks.map((c) => `${c.name} ${c.filled}/${c.segments}`)}
        />
      </dl>
    </details>
  );
}

/**
 * The GM called confirm_setup: generation is paused on a card that shows the
 * character, the campaign hook and (collapsed) the exact note text the OK will
 * bind to. Start the story approves; "Change something..." sends a note back to
 * the GM; closing the card (X, backdrop, Back) is neither - the GM is told to
 * ask what to change. Stop is the page's Stop button, not a button here.
 */
export default function SetupConfirmModal({
  request,
  onAnswer,
}: SetupConfirmModalProps) {
  const [changing, setChanging] = useState(false);
  const [note, setNote] = useState("");

  // Reset when a new card arrives (adjust-state-during-render pattern).
  const [prevRequest, setPrevRequest] =
    useState<SetupConfirmationRequest | null>(null);
  if (request !== prevRequest) {
    setPrevRequest(request);
    setChanging(false);
    setNote("");
  }

  const dismiss = () => onAnswer(SETUP_DISMISSED);
  // Android back closes the card, as a dismiss (decision 133).
  useBackHandler(!!request, dismiss);

  if (!request) return null;

  const send = () => {
    const answer = changesAnswer(note);
    if (answer) onAnswer(answer);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center ys-modal-backdrop p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div
        className="ys-modal w-full max-w-lg max-h-[90dvh] flex flex-col overflow-hidden"
        role="dialog"
        aria-label="Ready to start?"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <DynamicIcon name="ScrollText" className="w-7 h-7 text-ys-accent" />
            <h3 className="text-lg font-bold text-ys-text">Ready to start?</h3>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close"
            className="ys-button ys-button--ghost !p-1.5"
          >
            <DynamicIcon name="X" className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pb-4 space-y-4 overflow-y-auto">
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ys-muted mb-1">
              Your character
            </h4>
            <p className="text-sm text-ys-text whitespace-pre-wrap">
              {request.characterSummary}
            </p>
          </section>
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ys-muted mb-1">
              The campaign
            </h4>
            <p className="text-sm text-ys-text whitespace-pre-wrap">
              {request.campaignHook}
            </p>
          </section>

          <div className="space-y-2">
            {request.sheets.map((sheet, i) => (
              <NoteSection
                key={`${i}-${sheet.title}`}
                title={sheet.title}
                content={sheet.content}
              />
            ))}
            {request.plan.campaign && (
              <CampaignSection view={request.plan.campaign} />
            )}
            {request.plan.note && (
              <NoteSection
                title={request.plan.note.title}
                content={request.plan.note.content}
              />
            )}
          </div>

          {changing && (
            <div className="space-y-2">
              <textarea
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="What would you like changed?"
                className="ys-input text-sm"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="ys-button ys-button--ghost"
                  onClick={() => setChanging(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="ys-button ys-button--primary"
                  disabled={!note.trim()}
                  onClick={send}
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </div>

        {!changing && (
          <div className="flex gap-3 px-5 py-4 border-t border-ys-border">
            <button
              type="button"
              className="ys-button flex-1"
              onClick={() => setChanging(true)}
            >
              Change something…
            </button>
            <button
              type="button"
              className="ys-button ys-button--primary flex-1"
              onClick={() => onAnswer(SETUP_APPROVED)}
            >
              Start the story
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
