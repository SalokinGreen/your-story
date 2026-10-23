"use client";

import { useState } from "react";
import { DynamicIcon } from "../../components/DynamicIcon";
import { useNotification } from "../../misc/NotificationContext";
import type { GuestJoinedInfo, NetSessionInfo } from "../../misc/multiplayer/session";
import { MP_BACKEND_OPTIONS, type MPBackend } from "../../misc/multiplayer/types";
import { isValidRoomCode, ROOM_CODE_LENGTH } from "../../misc/multiplayer/transports";
import { buildInviteLink, buildTextInvite } from "../../misc/multiplayer/invite";
import { isStandalone } from "../../misc/standalone";
import { PALETTE } from "./CouchPlayersEditor";

const BACKEND_OPTIONS = MP_BACKEND_OPTIONS;

interface OnlinePlayEditorProps {
  netSession: NetSessionInfo | null;
  peers: GuestJoinedInfo[];
  defaultName: string;
  createRoom: (backend: MPBackend, displayName: string, color: string) => Promise<void>;
  joinRoom: (
    backend: MPBackend,
    roomId: string,
    displayName: string,
    color: string,
  ) => Promise<void>;
  leaveRoom: () => Promise<void>;
  switchBackend: (backend: MPBackend) => Promise<void>;
}

export default function OnlinePlayEditor({
  netSession,
  peers,
  defaultName,
  createRoom,
  joinRoom,
  leaveRoom,
  switchBackend,
}: OnlinePlayEditorProps) {
  const { addNotification } = useNotification();
  const [switching, setSwitching] = useState(false);

  const [intent, setIntent] = useState<"host" | "join" | null>(null);
  const [backend, setBackend] = useState<MPBackend>("torrent");
  const [name, setName] = useState(defaultName || "Player");
  const [color, setColor] = useState(PALETTE[0]);
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    if (!name.trim()) {
      addNotification("Enter a name first", "warning");
      return;
    }
    setBusy(true);
    try {
      await createRoom(backend, name.trim(), color);
      addNotification("Room created - share the code with your players", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create room";
      addNotification(message, "failure");
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    const code = roomCodeInput.trim().toUpperCase();
    if (!code) {
      addNotification("Enter a room code first", "warning");
      return;
    }
    if (!isValidRoomCode(code)) {
      addNotification("That doesn't look like a valid room code - double-check it", "warning");
      return;
    }
    if (!name.trim()) {
      addNotification("Enter a name first", "warning");
      return;
    }
    setBusy(true);
    try {
      await joinRoom(backend, code, name.trim(), color);
      addNotification("Connected", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to join room";
      addNotification(message, "failure");
    } finally {
      setBusy(false);
    }
  }

  async function handleLeave() {
    setBusy(true);
    try {
      await leaveRoom();
    } finally {
      setBusy(false);
    }
  }

  async function handleSwitch(to: MPBackend) {
    if (!netSession || to === netSession.backend) return;
    setSwitching(true);
    try {
      await switchBackend(to);
      addNotification("Switched connection - reconnecting players now", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to switch";
      addNotification(message, "failure");
    } finally {
      setSwitching(false);
    }
  }

  // Re-establish the same room (same code + backend) after a drop/timeout,
  // rather than minting a new code. Reuses switchBackend's leave-and-rejoin,
  // which preserves roomId/identity (and re-claims the guest's profile).
  async function handleReestablish() {
    if (!netSession) return;
    setSwitching(true);
    try {
      await switchBackend(netSession.backend);
      addNotification(
        netSession.role === "host" ? "Room re-established" : "Reconnected",
        "success",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Couldn't re-establish the room";
      addNotification(message, "failure");
    } finally {
      setSwitching(false);
    }
  }

  // The native builds have no public URL to link to (see buildTextInvite),
  // so they share the code and connection as text instead.
  const textInvite = isStandalone();

  async function copyInvite() {
    if (!netSession || typeof window === "undefined") return;
    const invite = textInvite
      ? buildTextInvite(netSession.roomId, netSession.backend)
      : buildInviteLink(window.location.origin, netSession.roomId, netSession.backend);
    try {
      await navigator.clipboard.writeText(invite);
      addNotification(
        textInvite
          ? "Invite copied - paste it to your players"
          : "Invite link copied - anyone can join from it",
        "success",
      );
    } catch {
      addNotification(
        textInvite ? "Couldn't copy the invite" : "Couldn't copy the link",
        "failure",
      );
    }
  }

  if (netSession) {
    return (
      <div className="p-4 bg-ys-surface backdrop-blur-md rounded-xl border border-ys-border space-y-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ys-success opacity-60" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-ys-success" />
          </span>
          <span className="text-sm font-semibold text-ys-text">
            {netSession.role === "host" ? "Hosting" : "Connected as guest"}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 p-3 bg-ys-surface rounded-lg border border-ys-border">
          <div>
            <p className="text-xs text-ys-muted">Room code</p>
            <p className="text-lg font-mono font-bold tracking-widest text-ys-text">
              {netSession.roomId}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(netSession.roomId);
              addNotification("Room code copied", "success");
            }}
            className="p-2 text-ys-muted hover:text-ys-text hover:bg-ys-surface-2 rounded-lg transition-colors"
            title="Copy room code"
          >
            <DynamicIcon name="Copy" className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={copyInvite}
          className="w-full px-4 py-2.5 text-sm font-semibold rounded-lg transition-all bg-ys-surface hover:bg-ys-surface-2 text-ys-text border border-ys-border flex items-center justify-center gap-2"
          title={
            textInvite
              ? "Copy an invite with the room code and connection, to paste to your players"
              : "Copy a link that opens straight to the join screen (code + connection built in)"
          }
        >
          <DynamicIcon name={textInvite ? "Copy" : "Link"} className="w-4 h-4" />
          {textInvite ? "Copy invite" : "Copy invite link"}
        </button>

        {netSession.role === "host" ? (
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-ys-text">
              Connection (switch if players can&apos;t connect)
            </label>
            <select
              value={netSession.backend}
              disabled={switching}
              onChange={(e) => handleSwitch(e.target.value as MPBackend)}
              className="w-full px-3 py-2 bg-ys-surface border border-ys-border rounded-lg text-ys-text text-sm focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 disabled:opacity-50 transition-colors"
            >
              {BACKEND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-xs text-ys-muted">
            Backend: {BACKEND_OPTIONS.find((b) => b.value === netSession.backend)?.label}
          </p>
        )}

        {netSession.role === "host" && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-ys-text">
              {peers.length} player{peers.length === 1 ? "" : "s"} connected
            </p>
            {peers.map((p) => (
              <div
                key={p.localPlayerId}
                className="flex items-center gap-2 px-2.5 py-1.5 bg-ys-surface rounded-lg border border-ys-border"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: p.color }}
                />
                <span className="text-sm text-ys-text">{p.displayName}</span>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={handleReestablish}
          disabled={switching || busy}
          className="w-full px-4 py-2.5 text-sm font-semibold rounded-lg transition-all bg-ys-surface hover:bg-ys-surface-2 disabled:opacity-40 disabled:cursor-not-allowed text-ys-text border border-ys-border flex items-center justify-center gap-2"
          title="Reconnect using the same room code (use this if the connection dropped or timed out)"
        >
          {switching && <DynamicIcon name="Loader2" className="w-4 h-4 animate-spin" />}
          {netSession.role === "host" ? "Re-establish room" : "Reconnect"}
        </button>

        <button
          type="button"
          onClick={handleLeave}
          disabled={busy}
          className="w-full px-4 py-2.5 text-sm font-semibold rounded-lg transition-all bg-ys-danger/10 hover:bg-ys-danger/20 disabled:opacity-40 disabled:cursor-not-allowed text-ys-danger border border-ys-danger/20"
        >
          Leave room
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 bg-ys-surface backdrop-blur-md rounded-xl border border-ys-border space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setIntent(intent === "host" ? null : "host")}
          className={`flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all border ${
            intent === "host"
              ? "bg-ys-accent border-transparent text-ys-on-accent shadow-md shadow-ys-accent/40"
              : "bg-ys-surface border-ys-border text-ys-text hover:bg-ys-surface-2"
          }`}
        >
          Host a room
        </button>
        <button
          type="button"
          onClick={() => setIntent(intent === "join" ? null : "join")}
          className={`flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all border ${
            intent === "join"
              ? "bg-ys-accent border-transparent text-ys-on-accent shadow-md shadow-ys-accent/40"
              : "bg-ys-surface border-ys-border text-ys-text hover:bg-ys-surface-2"
          }`}
        >
          Join a room
        </button>
      </div>

      {intent && (
        <div className="space-y-3 pt-2 border-t border-ys-border">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-11 h-11 shrink-0 rounded-lg cursor-pointer bg-transparent border border-ys-border"
              title="Your bubble color"
            />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="flex-1 min-w-0 px-4 py-3 bg-ys-surface border border-ys-border rounded-lg text-ys-text focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 transition-colors"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-ys-text">
              Connection
            </label>
            <select
              value={backend}
              onChange={(e) => setBackend(e.target.value as MPBackend)}
              className="w-full px-4 py-3 bg-ys-surface border border-ys-border rounded-lg text-ys-text focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 transition-colors"
            >
              {BACKEND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-ys-muted">
              If a room won&apos;t connect, everyone should switch to the same
              option here and try again - some networks block one but not
              another.
            </p>
          </div>

          {intent === "host" ? (
            <button
              type="button"
              onClick={handleCreate}
              disabled={busy}
              className="w-full px-4 py-3 text-sm font-semibold rounded-lg transition-all bg-ys-accent disabled:opacity-60 disabled:cursor-not-allowed text-ys-on-accent shadow-md shadow-ys-accent/40 disabled:shadow-none flex items-center justify-center gap-2"
            >
              {busy && (
                <DynamicIcon name="Loader2" className="w-4 h-4 animate-spin" />
              )}
              Create room
            </button>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                value={roomCodeInput}
                onChange={(e) => setRoomCodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleJoin();
                  }
                }}
                placeholder="Room code"
                maxLength={ROOM_CODE_LENGTH}
                className="w-full px-4 py-3 bg-ys-surface border border-ys-border rounded-lg text-ys-text font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 transition-colors"
              />
              <button
                type="button"
                onClick={handleJoin}
                disabled={busy}
                className="w-full px-4 py-3 text-sm font-semibold rounded-lg transition-all bg-ys-accent disabled:opacity-60 disabled:cursor-not-allowed text-ys-on-accent shadow-md shadow-ys-accent/40 disabled:shadow-none flex items-center justify-center gap-2"
              >
                {busy && (
                  <DynamicIcon name="Loader2" className="w-4 h-4 animate-spin" />
                )}
                Join room
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
