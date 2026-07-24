"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "./DynamicIcon";
import { useNotification } from "@/app/misc/NotificationContext";
import { MP_BACKEND_OPTIONS, type MPBackend } from "@/app/misc/multiplayer/types";
import { isValidRoomCode, ROOM_CODE_LENGTH } from "@/app/misc/multiplayer/transports";
import { PALETTE } from "@/app/story/menu/CouchPlayersEditor";

interface JoinGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Prefilled from a shareable invite link (?join=CODE&provider=BACKEND).
  initialCode?: string;
  initialBackend?: MPBackend;
}

/**
 * Entry point for joining someone else's online room from the home page or
 * Library, i.e. before the player has any story of their own open. `/story`
 * needs an existing local storyId to load, so this creates a throwaway
 * placeholder story and routes there with join params - see
 * createJoinPlaceholderStory() and the join-param effect in story/page.tsx.
 */
export default function JoinGameModal({
  isOpen,
  onClose,
  initialCode,
  initialBackend,
}: JoinGameModalProps) {
  const router = useRouter();
  const { addNotification } = useNotification();
  const [roomCode, setRoomCode] = useState(initialCode?.toUpperCase() ?? "");
  const [name, setName] = useState("Player");
  const [color, setColor] = useState(PALETTE[0]);
  const [backend, setBackend] = useState<MPBackend>(initialBackend ?? "torrent");
  const [busy, setBusy] = useState(false);

  // This modal is mounted once and toggled via `isOpen`, while `initialCode`/
  // `initialBackend` often arrive a tick later (parsed from the URL in an
  // effect on mount) - so the useState initializers above miss them. Sync
  // reactively whenever the prefill values change.
  useEffect(() => {
    if (initialCode) setRoomCode(initialCode.toUpperCase());
  }, [initialCode]);

  useEffect(() => {
    if (initialBackend) setBackend(initialBackend);
  }, [initialBackend]);

  if (!isOpen) return null;

  async function handleJoin() {
    const code = roomCode.trim().toUpperCase();
    if (!code || !isValidRoomCode(code)) {
      addNotification("Enter a valid room code first", "warning");
      return;
    }
    if (!name.trim()) {
      addNotification("Enter a name first", "warning");
      return;
    }
    setBusy(true);
    try {
      const { createJoinPlaceholderStory } = await import(
        "@/app/misc/localStoryManager"
      );
      const localId = await createJoinPlaceholderStory(name.trim());
      const params = new URLSearchParams({
        storyId: localId,
        join: code,
        joinName: name.trim(),
        joinColor: color,
        joinBackend: backend,
      });
      router.push(`/story?${params.toString()}`);
    } catch (error) {
      setBusy(false);
      addNotification(
        error instanceof Error ? error.message : "Failed to join room",
        "failure",
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-blue-950 border border-blue-700/50 rounded-2xl w-full max-w-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-blue-800/40">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <DynamicIcon name="Wifi" className="w-4 h-4 text-purple-300" />
            Join a Game
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-blue-300/60 hover:text-white hover:bg-blue-900/50 rounded-lg transition-colors"
            title="Close"
          >
            <DynamicIcon name="X" className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-blue-200/60">
            Enter the room code your host shared with you. Peer-to-peer over
            the internet - no server, no account.
          </p>

          <input
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleJoin();
              }
            }}
            placeholder="Room code"
            maxLength={ROOM_CODE_LENGTH}
            className="w-full px-4 py-3 bg-blue-900/20 border border-blue-700/40 rounded-xl text-white font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-purple-500"
          />

          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-11 h-11 shrink-0 rounded-lg cursor-pointer bg-transparent border border-blue-700/40"
              title="Your bubble color"
            />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={24}
              className="flex-1 min-w-0 px-4 py-3 bg-blue-900/20 border border-blue-700/40 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-blue-200/70 uppercase tracking-wider">
              Connection
            </label>
            <select
              value={backend}
              onChange={(e) => setBackend(e.target.value as MPBackend)}
              className="w-full px-4 py-2.5 bg-blue-900/20 border border-blue-700/40 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {MP_BACKEND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-blue-200/50">
              If it won&apos;t connect, ask your host which option they used.
            </p>
          </div>

          <button
            onClick={handleJoin}
            disabled={busy}
            className="w-full py-3 rounded-xl bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-[0.99] text-white font-semibold shadow-lg shadow-purple-950/40 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {busy && (
              <DynamicIcon name="Loader2" className="w-4 h-4 animate-spin" />
            )}
            {busy ? "Joining..." : "Join Room"}
          </button>
        </div>
      </div>
    </div>
  );
}
