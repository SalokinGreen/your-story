"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "./DynamicIcon";
import { useNotification } from "@/app/misc/NotificationContext";
import { MP_BACKEND_OPTIONS, type MPBackend } from "@/app/misc/multiplayer/types";
import { PALETTE } from "@/app/story/menu/CouchPlayersEditor";

interface HostGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  storyId: string;
  defaultName?: string;
}

/**
 * Entry point for hosting an existing story as an online room straight from
 * the Library, without first opening the story and digging into
 * Menu > Story Editor > Online Play. Collects the same host identity fields
 * OnlinePlayEditor does, then routes to /story with hostName/hostColor/
 * hostBackend params - the room is actually created by the auto-host effect
 * in story/page.tsx once that story finishes loading.
 */
export default function HostGameModal({
  isOpen,
  onClose,
  storyId,
  defaultName,
}: HostGameModalProps) {
  const router = useRouter();
  const { addNotification } = useNotification();
  const [name, setName] = useState(defaultName || "Player");
  const [color, setColor] = useState(PALETTE[0]);
  const [backend, setBackend] = useState<MPBackend>("torrent");

  if (!isOpen) return null;

  function handleHost() {
    if (!name.trim()) {
      addNotification("Enter a name first", "warning");
      return;
    }
    const params = new URLSearchParams({
      storyId,
      hostName: name.trim(),
      hostColor: color,
      hostBackend: backend,
    });
    router.push(`/story?${params.toString()}`);
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
            Host This Story Online
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
            Peer-to-peer over the internet - no server, no account. You&apos;ll
            get a room code to share once it&apos;s created.
          </p>

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
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleHost();
                }
              }}
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
              If players can&apos;t connect, you can switch this later from
              Menu &gt; Online Play.
            </p>
          </div>

          <button
            onClick={handleHost}
            className="w-full py-3 rounded-xl bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-[0.99] text-white font-semibold shadow-lg shadow-purple-950/40 transition-all flex items-center justify-center gap-2"
          >
            <DynamicIcon name="Play" className="w-4 h-4" />
            Create Room
          </button>
        </div>
      </div>
    </div>
  );
}
