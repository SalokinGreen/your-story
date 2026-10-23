"use client";

import { CouchPlayer } from "../misc/structs";
import { DynamicIcon } from "./DynamicIcon";
import type { TurnStatus } from "../misc/multiplayer/session";

// The "collect all inputs, then generate" lobby for networked co-op. The host
// batches every player's submission into one turn; this shows who's in and
// who we're still waiting on, with a host "Start now" override and a per-player
// "Pass" so a quiet player never blocks the table.
//
// Rendered in normal document flow directly above the composer (see
// story.tsx) rather than as a viewport-fixed overlay: it used to be
// `fixed inset-x-0 bottom-0`, which on mobile (where its card's width
// reaches the same full-width composer beneath it) physically covered the
// chat textarea and blocked typing for anyone who hadn't submitted yet.
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
    couchPlayers.find((p) => p.id === id)?.color || "var(--ys-muted)";

  const iResponded = submitted.has(myPlayerId) || passed.has(myPlayerId);
  const waitingCount = status.expectedPlayerIds.filter(
    (id) => !submitted.has(id) && !passed.has(id),
  ).length;

  return (
    <div className="w-full rounded-2xl bg-ys-surface border border-ys-border shadow-2xl p-4 mb-2">
      <div className="flex items-center gap-2 mb-3">
        <DynamicIcon name="Users" className="w-4 h-4 text-ys-muted" />
        <span className="text-sm font-semibold text-ys-text">
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
                  ? "bg-ys-text/5 border-ys-border text-ys-muted"
                  : "bg-ys-text/10 border-ys-border text-ys-text"
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
                <DynamicIcon name="Check" className="w-3 h-3 text-ys-success" />
              )}
              {state === "passed" && (
                <DynamicIcon name="Minus" className="w-3 h-3 text-ys-muted" />
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
            className="flex-1 px-3 py-2 text-sm font-semibold rounded-xl bg-ys-text/5 hover:bg-ys-text/10 border border-ys-border text-ys-text transition-colors"
          >
            Pass this turn
          </button>
        )}
        {isHost && (
          <button
            type="button"
            onClick={onStartNow}
            className="flex-1 px-3 py-2 text-sm font-semibold rounded-xl bg-ys-text text-ys-bg hover:opacity-90 shadow-md transition-all flex items-center justify-center gap-1.5"
          >
            <DynamicIcon name="Play" className="w-4 h-4" />
            Start now
          </button>
        )}
      </div>
    </div>
  );
}
