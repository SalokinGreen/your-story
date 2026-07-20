"use client";

import { useEffect, useState } from "react";
import { DynamicIcon } from "./DynamicIcon";
import type { GuestJoinedInfo, NetSessionInfo } from "../misc/multiplayer/session";

// Long enough that a normal "still handshaking" delay doesn't trip it, short
// enough that a host isn't left staring at "waiting" with no idea whether
// anything is actually wrong. There's no way to directly detect a broken
// relay from the host side (see session.ts's switchBackend comments) - this
// is a soft nudge, not a diagnosis.
const WAITING_NUDGE_MS = 30000;

interface NetStatusBadgeProps {
  netSession: NetSessionInfo | null;
  peers: GuestJoinedInfo[];
}

export default function NetStatusBadge({ netSession, peers }: NetStatusBadgeProps) {
  const [waitingAWhile, setWaitingAWhile] = useState(false);
  const isHost = netSession?.role === "host";
  const noPeersYet = isHost && peers.length === 0;

  useEffect(() => {
    if (!noPeersYet) return;
    const timer = setTimeout(() => setWaitingAWhile(true), WAITING_NUDGE_MS);
    // Cleanup runs both on unmount and whenever noPeersYet flips back to
    // false (a peer connected) - either way, the wait is over.
    return () => {
      clearTimeout(timer);
      setWaitingAWhile(false);
    };
  }, [noPeersYet]);

  if (!netSession) return null;

  const label = isHost
    ? peers.length === 0
      ? waitingAWhile
        ? "Waiting for players — try switching connection in the Multiplayer menu"
        : "Waiting for players…"
      : `${peers.length} player${peers.length === 1 ? "" : "s"} connected`
    : "Connected to host";

  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-950/80 backdrop-blur border border-blue-700/40 shadow-sm text-[11px] font-medium text-blue-100 max-w-[220px]"
      title={`${isHost ? "Hosting" : "Guest"} · room code ${netSession.roomId} · ${netSession.backend}`}
    >
      {noPeersYet ? (
        <DynamicIcon
          name="Loader2"
          className={`w-3 h-3 shrink-0 ${waitingAWhile ? "text-amber-400" : "text-blue-300"} animate-spin`}
        />
      ) : (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
      )}
      <span className="truncate">{label}</span>
    </div>
  );
}
