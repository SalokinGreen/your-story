"use client";

import React, { useEffect, useRef, useState } from "react";
import type { ManualRollRequest } from "../misc/gmExecutor";
import type { CouchPlayer } from "../misc/structs";
import { extractRollNumber } from "../misc/diceFormula";
import { DynamicIcon } from "./DynamicIcon";
import STTButton from "./STTButton";

interface ManualRollModalProps {
  // The pending roll request, or null when nothing is being asked
  request: ManualRollRequest | null;
  // Couch players, used to color the "who rolls" chip when names match
  couchPlayers?: CouchPlayer[];
  onSubmit: (value: number, rawText: string) => void;
  onSkip: () => void;
}

/**
 * Manual dice mode prompt: the GM called ask_for_roll, generation is paused,
 * and whoever is named rolls their physical dice and types in the total.
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

  const parsed = extractRollNumber(value);
  const isValid = parsed !== null;

  const matchedPlayer = request.playerName
    ? couchPlayers.find(
        (p) =>
          p.name.trim().toLowerCase() ===
          request.playerName!.trim().toLowerCase(),
      )
    : undefined;

  const submit = () => {
    if (parsed === null) return;
    onSubmit(parsed, value.trim());
  };

  // Voice input should feel hands-free: once the player stops talking and a
  // number comes back, submit immediately instead of making them also tap
  // Confirm. If nothing parseable was said, just fill the box so they can
  // fix it up and confirm manually.
  const handleVoiceTranscript = (text: string) => {
    setValue(text);
    const parsedNumber = extractRollNumber(text);
    if (parsedNumber !== null) {
      onSubmit(parsedNumber, text.trim());
    }
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
          {(request.formula || request.dc !== undefined) && (
            <div className="flex items-center justify-center gap-2 text-sm">
              {request.formula && (
                <span className="px-3 py-1.5 rounded-lg bg-purple-900/40 border border-purple-600/40 text-purple-100 font-mono font-semibold">
                  🎲 {request.formula}
                </span>
              )}
              {request.dc !== undefined && (
                <span className="px-3 py-1.5 rounded-lg bg-blue-900/40 border border-blue-600/40 text-blue-100 font-semibold">
                  {request.reverseDC ? "≤" : "vs"} DC {request.dc}
                </span>
              )}
            </div>
          )}

          {/* Result input */}
          <div>
            <label className="block text-xs font-semibold text-blue-200/70 uppercase tracking-wider mb-2 text-center">
              Your total (with modifiers)
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
                placeholder='17, or "I rolled a natural 20"'
                className="w-full px-4 py-3 bg-blue-900/30 border border-blue-700/40 rounded-xl text-white text-center text-xl font-bold focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <STTButton onTranscript={handleVoiceTranscript} className="shrink-0" />
            </div>
            <p className="mt-2 text-center text-xs text-blue-300/60 h-4">
              {value.trim() &&
                (isValid
                  ? `Detected: ${parsed}`
                  : "Couldn't find a number in that - try again")}
            </p>
          </div>

          <button
            onClick={submit}
            disabled={!isValid}
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
