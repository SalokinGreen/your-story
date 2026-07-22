"use client";

import { useState } from "react";
import { DynamicIcon } from "../../components/DynamicIcon";
import { useNotification } from "../../misc/NotificationContext";
import type { GuestJoinedInfo, NetSessionInfo } from "../../misc/multiplayer/session";
import { MP_BACKEND_OPTIONS, type MPBackend } from "../../misc/multiplayer/types";
import { isValidRoomCode, ROOM_CODE_LENGTH } from "../../misc/multiplayer/transports";
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

  if (netSession) {
    return (
      <div className="p-4 bg-white/[0.03] backdrop-blur-md rounded-xl border border-white/10 space-y-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
          <span className="text-sm font-semibold text-blue-100">
            {netSession.role === "host" ? "Hosting" : "Connected as guest"}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 p-3 bg-white/[0.03] rounded-lg border border-white/10">
          <div>
            <p className="text-xs text-blue-200/60">Room code</p>
            <p className="text-lg font-mono font-bold tracking-widest text-white">
              {netSession.roomId}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(netSession.roomId);
              addNotification("Room code copied", "success");
            }}
            className="p-2 text-blue-200/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="Copy room code"
          >
            <DynamicIcon name="Copy" className="w-4 h-4" />
          </button>
        </div>

        {netSession.role === "host" ? (
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-blue-200">
              Connection (switch if players can&apos;t connect)
            </label>
            <select
              value={netSession.backend}
              disabled={switching}
              onChange={(e) => handleSwitch(e.target.value as MPBackend)}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 disabled:opacity-50 transition-colors"
            >
              {BACKEND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-xs text-blue-200/60">
            Backend: {BACKEND_OPTIONS.find((b) => b.value === netSession.backend)?.label}
          </p>
        )}

        {netSession.role === "host" && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-blue-200">
              {peers.length} player{peers.length === 1 ? "" : "s"} connected
            </p>
            {peers.map((p) => (
              <div
                key={p.localPlayerId}
                className="flex items-center gap-2 px-2.5 py-1.5 bg-white/[0.03] rounded-lg border border-white/10"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: p.color }}
                />
                <span className="text-sm text-blue-100">{p.displayName}</span>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={handleLeave}
          disabled={busy}
          className="w-full px-4 py-2.5 text-sm font-semibold rounded-lg transition-all bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-red-300 border border-red-400/20"
        >
          Leave room
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 bg-white/[0.03] backdrop-blur-md rounded-xl border border-white/10 space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setIntent(intent === "host" ? null : "host")}
          className={`flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all border ${
            intent === "host"
              ? "bg-linear-to-r from-purple-600 to-pink-600 border-transparent text-white shadow-md shadow-purple-950/40"
              : "bg-white/[0.03] border-white/10 text-blue-200 hover:bg-white/[0.06]"
          }`}
        >
          Host a room
        </button>
        <button
          type="button"
          onClick={() => setIntent(intent === "join" ? null : "join")}
          className={`flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all border ${
            intent === "join"
              ? "bg-linear-to-r from-purple-600 to-pink-600 border-transparent text-white shadow-md shadow-purple-950/40"
              : "bg-white/[0.03] border-white/10 text-blue-200 hover:bg-white/[0.06]"
          }`}
        >
          Join a room
        </button>
      </div>

      {intent && (
        <div className="space-y-3 pt-2 border-t border-white/5">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-11 h-11 shrink-0 rounded-lg cursor-pointer bg-transparent border border-white/10"
              title="Your bubble color"
            />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="flex-1 min-w-0 px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-blue-200">
              Connection
            </label>
            <select
              value={backend}
              onChange={(e) => setBackend(e.target.value as MPBackend)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
            >
              {BACKEND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-blue-200/60">
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
              className="w-full px-4 py-3 text-sm font-semibold rounded-lg transition-all bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:from-white/10 disabled:to-white/10 disabled:opacity-60 disabled:cursor-not-allowed text-white shadow-md shadow-purple-950/40 disabled:shadow-none flex items-center justify-center gap-2"
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
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
              />
              <button
                type="button"
                onClick={handleJoin}
                disabled={busy}
                className="w-full px-4 py-3 text-sm font-semibold rounded-lg transition-all bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:from-white/10 disabled:to-white/10 disabled:opacity-60 disabled:cursor-not-allowed text-white shadow-md shadow-purple-950/40 disabled:shadow-none flex items-center justify-center gap-2"
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
