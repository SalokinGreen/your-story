"use client";

import React, { useEffect, useRef, useState } from "react";
import type { ManualRollRequest } from "../misc/gmExecutor";
import { PLAYER_TEXT_COLOR } from "../misc/multiplayer/palette";
import type { CouchPlayer } from "../misc/structs";
import { DynamicIcon } from "./DynamicIcon";
import STTButton from "./STTButton";
import { useBackHandler } from "../misc/useBackHandler";

interface ManualRollModalProps {
  // The pending roll request, or null when nothing is being asked
  request: ManualRollRequest | null;
  // Couch players, used to color the "who rolls" chip when names match
  couchPlayers?: CouchPlayer[];
  // The player's answer, exactly as typed or spoken. Nothing is parsed out
  // of it - see ManualRollAnswer in gmExecutor.ts.
  onSubmit: (rawText: string) => void;
  onSkip: () => void;
}

/**
 * Manual dice mode prompt: the GM called ask_for_roll, generation is paused,
 * and whoever is named rolls their physical dice and reports what came up.
 *
 * Whatever they write goes to the GM verbatim. This used to pull a single
 * number out of the text before sending it, which quietly mangled every
 * system that rolls more than one pool - "4, 6" for two challenge dice
 * arrived as 4 - so the GM now reads the answer itself.
 */
export default function ManualRollModal({
  request,
  couchPlayers = [],
  onSubmit,
  onSkip,
}: ManualRollModalProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset the entered number whenever a new roll request comes in
  // (adjust-state-during-render pattern, avoids an effect + extra render)
  const [prevRequest, setPrevRequest] = useState<ManualRollRequest | null>(
    null,
  );
  if (request !== prevRequest) {
    setPrevRequest(request);
    setValue("");
  }

  useEffect(() => {
    if (request) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [request]);

  // Android back is the Skip button (decision 133).
  useBackHandler(!!request, onSkip);

  if (!request) return null;

  const answer = value.trim();
  const canSubmit = answer.length > 0;

  const matchedPlayer = request.playerName
    ? couchPlayers.find(
        (p) =>
          p.name.trim().toLowerCase() ===
          request.playerName!.trim().toLowerCase(),
      )
    : undefined;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(answer);
  };

  // Voice input should feel hands-free: once the player stops talking, send
  // what they said straight through instead of making them also tap Confirm.
  const handleVoiceTranscript = (text: string) => {
    setValue(text);
    const spoken = text.trim();
    if (spoken) onSubmit(spoken);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center ys-modal-backdrop p-4">
      <div className="bg-ys-surface border border-ys-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 bg-ys-text/5 text-center">
          <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-ys-text text-ys-bg flex items-center justify-center shadow-lg">
            <DynamicIcon name="Dices" className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-ys-text">{request.title}</h3>
          {request.playerName && (
            <span
              className={`inline-flex items-center gap-1.5 mt-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                matchedPlayer ? "" : "bg-ys-text text-ys-bg"
              }`}
              style={
                matchedPlayer
                  ? {
                      backgroundColor: matchedPlayer.color,
                      color: PLAYER_TEXT_COLOR,
                    }
                  : undefined
              }
            >
              <DynamicIcon name="User" className="w-3 h-3" />
              {request.playerName} rolls
            </span>
          )}
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-ys-muted text-center">
            {request.description}
          </p>

          {/* What to roll */}
          {request.formula && (
            <div className="flex items-center justify-center gap-2 text-sm">
              <span className="px-3 py-1.5 rounded-lg bg-ys-text/10 border border-ys-border text-ys-text font-mono font-semibold">
                🎲 {request.formula}
              </span>
            </div>
          )}

          {/* Result input */}
          <div>
            <label className="block text-xs font-semibold text-ys-muted uppercase tracking-wider mb-2 text-center">
              What did you roll?
            </label>
            <div className="flex items-stretch gap-2">
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder='17, or "4 and 6", or "natural 20!"'
                className="w-full px-4 py-3 bg-ys-text/5 border border-ys-border rounded-xl text-ys-text text-center text-xl font-bold focus:outline-none focus:ring-2 focus:ring-ys-accent"
              />
              <STTButton onTranscript={handleVoiceTranscript} className="shrink-0" />
            </div>
            <p className="mt-2 text-center text-xs text-ys-muted h-4">
              Every die, in your own words - the GM reads it as you write it
            </p>
          </div>

          <button
            onClick={submit}
            disabled={!canSubmit}
            className="w-full py-3 rounded-xl bg-ys-text text-ys-bg hover:opacity-90 active:scale-[0.99] disabled:opacity-40 font-semibold transition-all flex items-center justify-center gap-2"
          >
            <DynamicIcon name="Check" className="w-4 h-4" />
            Confirm Roll
          </button>
          <button
            onClick={onSkip}
            className="w-full py-2 text-xs text-ys-muted hover:text-ys-text transition-colors"
          >
            Skip - let the GM roll for me
          </button>
        </div>
      </div>
    </div>
  );
}
