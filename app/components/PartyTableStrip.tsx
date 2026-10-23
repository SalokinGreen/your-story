"use client";

import { useEffect, useState } from "react";
import { DynamicIcon } from "./DynamicIcon";
import type { PartyTable } from "../misc/party/partyRuntime";

// How long a lockout ring should keep counting, ticking only while one runs.
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

// The table screen's strip in party mode, in place of couch co-op's bubbles:
// who is seated, who holds the spotlight, who is cooling down, what is queued
// and the Go button. It shows state; the host (partyHost.ts) decides it.
export default function PartyTableStrip({
  table,
  onGo,
  onJoin,
  onRemove,
  onAnswerHere,
}: {
  table: PartyTable;
  onGo: () => void;
  onJoin: () => void;
  onRemove: (playerId: string) => void;
  onAnswerHere: (requestId: string) => void;
}) {
  const hasLockout = Object.keys(table.lockedUntil).length > 0;
  const now = useNow(hasLockout);
  const [removing, setRemoving] = useState<string | null>(null);
  const generating = table.turn === "generating";
  const connected = table.players.filter((p) => p.connected).length;

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-2" aria-label="Party table">
      <div className="rounded-xl border border-ys-border bg-ys-surface p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {table.players.length === 0 && (
            <p className="text-xs text-ys-muted">
              Nobody has joined yet. Tap Join to show the QR code.
            </p>
          )}
          {table.players.map((p) => {
            const holder = table.holderId === p.id;
            const lockedMs = (table.lockedUntil[p.id] ?? 0) - now;
            const locked = lockedMs > 0;
            return (
              <div
                key={p.id}
                className={`flex items-center gap-2 pl-2 pr-1 py-1 rounded-full border text-sm ${
                  holder ? "bg-ys-text/15 border-ys-muted" : "bg-ys-text/5 border-ys-border"
                } ${p.connected ? "" : "opacity-50"}`}
                style={holder ? { boxShadow: `0 0 0 2px ${p.color}` } : undefined}
              >
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: p.color }}
                  aria-hidden="true"
                />
                <span className="text-ys-text">{p.name}</span>
                {holder && (
                  <span className="flex items-center gap-1 text-xs text-ys-text">
                    <DynamicIcon name="Mic" className="w-3 h-3" /> spotlight
                  </span>
                )}
                {locked && (
                  <span className="text-xs text-ys-muted" title="Can't take the spotlight back yet">
                    {Math.ceil(lockedMs / 1000)} s
                  </span>
                )}
                {!p.connected && <span className="text-xs text-ys-muted">offline</span>}
                {removing === p.id ? (
                  <button
                    type="button"
                    onClick={() => {
                      setRemoving(null);
                      onRemove(p.id);
                    }}
                    onBlur={() => setRemoving(null)}
                    autoFocus
                    className="px-2 py-0.5 text-xs rounded-full bg-ys-danger/20 text-ys-danger hover:bg-ys-danger/30"
                  >
                    Remove?
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setRemoving(p.id)}
                    disabled={generating}
                    className="p-1 text-ys-muted hover:text-ys-text rounded-full disabled:opacity-30 disabled:cursor-not-allowed"
                    title={
                      generating
                        ? "Wait for the GM to finish this turn"
                        : `Remove ${p.name} from the table`
                    }
                    aria-label={`Remove ${p.name} from the table`}
                  >
                    <DynamicIcon name="X" className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={onJoin}
            className="flex items-center gap-1 px-3 py-1 text-sm rounded-full border border-ys-border bg-ys-text/5 text-ys-text hover:bg-ys-text/10"
          >
            <DynamicIcon name="QrCode" className="w-3.5 h-3.5" /> Join
          </button>
          <span className="ml-auto text-xs text-ys-muted">
            {connected} of {table.players.length} on phones
          </span>
        </div>

        {table.queue.length > 0 && (
          <ul className="space-y-1 text-sm max-h-32 overflow-y-auto">
            {table.queue.map((line) => (
              <li key={line.id} className="flex gap-2">
                <span className="font-semibold shrink-0" style={{ color: line.color }}>
                  {line.name}
                </span>
                <span className="text-ys-text break-words min-w-0">{line.text}</span>
              </li>
            ))}
          </ul>
        )}

        {table.pending.map((req) => (
          <div
            key={req.requestId}
            className="flex items-center justify-between gap-2 text-xs text-ys-text bg-ys-warning/10 border border-ys-warning/20 rounded-lg px-3 py-1.5"
          >
            <span>
              Waiting for {req.playerName}&apos;s {req.kind === "roll" ? "roll" : "answer"} on their phone
            </span>
            <button
              type="button"
              onClick={() => onAnswerHere(req.requestId)}
              className="px-2 py-0.5 rounded-md bg-ys-text/10 hover:bg-ys-text/20 text-ys-text"
            >
              Answer here
            </button>
          </div>
        ))}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-ys-muted">
            {generating
              ? "The GM is working…"
              : table.queue.length === 0
                ? "Take the spotlight on your phone, then add a line."
                : "Anyone can tap Go."}
          </p>
          <button
            type="button"
            onClick={onGo}
            disabled={generating || table.queue.length === 0}
            className="px-5 py-1.5 text-sm font-semibold rounded-lg bg-ys-text text-ys-bg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Go
          </button>
        </div>
      </div>
    </div>
  );
}
