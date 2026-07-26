"use client";

import React, { useEffect, useRef, useState } from "react";
import type { ManualRollRequest } from "../misc/gmExecutor";
import type { CouchPlayer } from "../misc/structs";
import { DynamicIcon } from "./DynamicIcon";
import STTButton from "./STTButton";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-blue-950 border border-purple-500/40 rounded-2xl w-full max-w-sm shadow-2xl shadow-purple-950/50 overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 bg-linear-to-br from-purple-900/40 to-blue-900/20 text-center">
          <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-linear-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-950/50">
            <DynamicIcon name="Dices" className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-lg font-bold text-white">{request.title}</h3>
          {request.playerName && (
            <span
              className="inline-flex items-center gap-1.5 mt-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white"
              style={{
                backgroundColor: matchedPlayer?.color || "#7c3aed",
              }}
            >
              <DynamicIcon name="User" className="w-3 h-3" />
              {request.playerName} rolls
            </span>
          )}
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-blue-200/70 text-center">
            {request.description}
          </p>

          {/* What to roll */}
          {request.formula && (
            <div className="flex items-center justify-center gap-2 text-sm">
              <span className="px-3 py-1.5 rounded-lg bg-purple-900/40 border border-purple-600/40 text-purple-100 font-mono font-semibold">
                🎲 {request.formula}
              </span>
            </div>
          )}

          {/* Result input */}
          <div>
            <label className="block text-xs font-semibold text-blue-200/70 uppercase tracking-wider mb-2 text-center">
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
                className="w-full px-4 py-3 bg-blue-900/30 border border-blue-700/40 rounded-xl text-white text-center text-xl font-bold focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <STTButton onTranscript={handleVoiceTranscript} className="shrink-0" />
            </div>
            <p className="mt-2 text-center text-xs text-blue-300/60 h-4">
              Every die, in your own words - the GM reads it as you write it
            </p>
          </div>

          <button
            onClick={submit}
            disabled={!canSubmit}
            className="w-full py-3 rounded-xl bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-[0.99] disabled:opacity-40 text-white font-semibold transition-all flex items-center justify-center gap-2"
          >
            <DynamicIcon name="Check" className="w-4 h-4" />
            Confirm Roll
          </button>
          <button
            onClick={onSkip}
            className="w-full py-2 text-xs text-blue-300/50 hover:text-blue-200 transition-colors"
          >
            Skip - let the GM roll for me
          </button>
        </div>
      </div>
    </div>
  );
}
