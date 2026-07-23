"use client";

import { CouchPlayer } from "../misc/structs";
import { DynamicIcon } from "./DynamicIcon";
import type { TurnStatus } from "../misc/multiplayer/session";

// The "collect all inputs, then generate" lobby for networked co-op. The host
// batches every player's submission into one turn; this shows who's in and
// who we're still waiting on, with a host "Start now" override and a per-player
// "Pass" so a quiet player never blocks the table.
export default function TurnLobbyOverlay({
  status,
  couchPlayers,
  myPlayerId,
  isHost,
  onStartNow,
  onPass,
}: {
  status: TurnStatus;
  couchPlayers: CouchPlayer[];
  myPlayerId: string;
  isHost: boolean;
  onStartNow: () => void;
  onPass: () => void;
}) {
  const submitted = new Set(status.submittedPlayerIds);
  const passed = new Set(status.passedPlayerIds);
  const nameFor = (id: string) =>
    couchPlayers.find((p) => p.id === id)?.name || "Player";
  const colorFor = (id: string) =>
    couchPlayers.find((p) => p.id === id)?.color || "#6366f1";

  const iResponded = submitted.has(myPlayerId) || passed.has(myPlayerId);
  const waitingCount = status.expectedPlayerIds.filter(
    (id) => !submitted.has(id) && !passed.has(id),
  ).length;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none">
      <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-[#0d1829]/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <DynamicIcon name="Users" className="w-4 h-4 text-purple-300" />
          <span className="text-sm font-semibold text-white">
            {waitingCount > 0
              ? `Waiting on ${waitingCount} ${waitingCount === 1 ? "player" : "players"}…`
              : "Everyone's in"}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {status.expectedPlayerIds.map((id) => {
            const state = submitted.has(id)
              ? "submitted"
              : passed.has(id)
                ? "passed"
                : "waiting";
            return (
              <span
                key={id}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                  state === "waiting"
                    ? "bg-white/5 border-white/10 text-blue-200/60"
                    : "bg-white/10 border-white/15 text-white"
                }`}
                title={
                  state === "submitted"
                    ? "Ready"
                    : state === "passed"
                      ? "Passed"
                      : "Waiting"
                }
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    backgroundColor:
                      state === "waiting" ? "transparent" : colorFor(id),
                    border:
                      state === "waiting" ? `1px solid ${colorFor(id)}` : "none",
                  }}
                />
                {nameFor(id)}
                {id === myPlayerId && " (you)"}
                {state === "submitted" && (
                  <DynamicIcon name="Check" className="w-3 h-3 text-green-400" />
                )}
                {state === "passed" && (
                  <DynamicIcon name="Minus" className="w-3 h-3 text-blue-300/60" />
                )}
              </span>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {!iResponded && (
            <button
              type="button"
              onClick={onPass}
              className="flex-1 px-3 py-2 text-sm font-semibold rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-blue-200 transition-colors"
            >
              Pass this turn
            </button>
          )}
          {isHost && (
            <button
              type="button"
              onClick={onStartNow}
              className="flex-1 px-3 py-2 text-sm font-semibold rounded-xl bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-md shadow-purple-950/40 transition-all flex items-center justify-center gap-1.5"
            >
              <DynamicIcon name="Play" className="w-4 h-4" />
              Start now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
