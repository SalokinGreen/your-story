"use client";

import { useState } from "react";
import { CouchPlayer, PlayerArchetype } from "../../misc/structs";
import { DynamicIcon } from "../../components/DynamicIcon";
import { ARCHETYPE_INFO } from "../../misc/gmAdvice";

const ARCHETYPE_OPTIONS = Object.entries(ARCHETYPE_INFO) as [
  PlayerArchetype,
  (typeof ARCHETYPE_INFO)[PlayerArchetype],
][];

export const PALETTE = [
  "#22c55e", // green
  "#ec4899", // pink
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#a855f7", // purple
  "#ef4444", // red
  "#14b8a6", // teal
  "#eab308", // yellow
];

function nextColor(existing: CouchPlayer[]): string {
  const used = new Set(existing.map((p) => p.color));
  const free = PALETTE.find((c) => !used.has(c));
  return free || PALETTE[existing.length % PALETTE.length];
}

export default function CouchPlayersEditor({
  players,
  onUpdate,
}: {
  players: CouchPlayer[];
  onUpdate: (players: CouchPlayer[]) => void;
}) {
  const [newName, setNewName] = useState("");

  const addPlayer = () => {
    const name = newName.trim();
    if (!name) return;
    const player: CouchPlayer = {
      id: `player_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      color: nextColor(players),
    };
    onUpdate([...players, player]);
    setNewName("");
  };

  const removePlayer = (id: string) => {
    onUpdate(players.filter((p) => p.id !== id));
  };

  const updatePlayer = (id: string, updates: Partial<CouchPlayer>) => {
    onUpdate(players.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-blue-200 mb-1">
          Couch Co-op Players
        </label>
        <p className="text-xs text-blue-200/60">
          Add a colored, named bubble for everyone at the table. Tap a
          bubble to speak your turn with voice input.
        </p>
      </div>

      {players.length > 0 && (
        <div className="space-y-2">
          {players.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2 p-2.5 bg-white/[0.03] backdrop-blur-md rounded-xl border border-white/10"
            >
              <input
                type="color"
                value={p.color}
                onChange={(e) =>
                  updatePlayer(p.id, { color: e.target.value })
                }
                className="w-9 h-9 shrink-0 rounded-lg cursor-pointer bg-transparent border border-white/10"
                title="Bubble color"
              />
              <input
                type="text"
                value={p.name}
                onChange={(e) => updatePlayer(p.id, { name: e.target.value })}
                placeholder="Player name"
                className="flex-1 min-w-0 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
              />
              <select
                value={p.archetype || ""}
                onChange={(e) =>
                  updatePlayer(p.id, {
                    archetype: (e.target.value || undefined) as
                      | PlayerArchetype
                      | undefined,
                  })
                }
                title="Player type - tells the GM how to engage them"
                className="w-36 shrink-0 px-2 py-2 bg-blue-900/20 border border-blue-700/40 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">No player type</option>
                {ARCHETYPE_OPTIONS.map(([key, info]) => (
                  <option key={key} value={key}>
                    {info.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removePlayer(p.id)}
                className="p-2 text-red-400/70 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                title="Remove player"
              >
                <DynamicIcon name="Trash2" className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addPlayer();
            }
          }}
          placeholder="New player name"
          className="flex-1 min-w-0 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
        />
        <button
          type="button"
          onClick={addPlayer}
          disabled={!newName.trim()}
          className="px-4 py-3 text-sm font-semibold rounded-xl transition-all bg-purple-500/10 hover:bg-purple-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-purple-200 border border-purple-400/20 flex items-center gap-1.5 shrink-0"
        >
          <DynamicIcon name="Plus" className="w-4 h-4" />
          Add
        </button>
      </div>
    </div>
  );
}
