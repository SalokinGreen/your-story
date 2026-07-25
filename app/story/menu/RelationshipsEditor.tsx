"use client";

import { Relationship } from "../../misc/structs";
import { useState } from "react";
import { useNotification } from "../../misc/NotificationContext";
import { DynamicIcon } from "../../components/DynamicIcon";

export default function RelationshipsEditor({
  relationships,
  onUpdate,
}: {
  relationships: Relationship[];
  onUpdate: (relationships: Relationship[]) => void;
}) {
  const { addNotification } = useNotification();
  const [localRelationships, setLocalRelationships] = useState<Relationship[]>([
    ...relationships,
  ]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editRelationship, setEditRelationship] = useState<
    Partial<Relationship>
  >({});

  // Helper function to get relationship symbol based on value
  const getRelationshipSymbol = (value: number): string => {
    if (value >= 75) return "??"; // Strong ally
    if (value >= 50) return "??"; // Ally
    if (value >= 25) return "??"; // Friendly
    if (value >= 0) return "??"; // Neutral/Acquaintance
    if (value >= -25) return "??"; // Distant
    if (value >= -50) return "??"; // Unfriendly
    if (value >= -75) return "??"; // Hostile
    return "??"; // Enemy
  };

  const addRelationship = () => {
    const newRel: Relationship = {
      name: "New Relationship",
      value: 0,
      description: "Describe this relationship...",
      symbol: "??",
    };
    const updated = [...localRelationships, newRel];
    setLocalRelationships(updated);
    onUpdate(updated);
  };

  const removeRelationship = (index: number) => {
    const updated = localRelationships.filter((_, i) => i !== index);
    setLocalRelationships(updated);
    onUpdate(updated);
  };

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setEditRelationship({ ...localRelationships[index] });
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditRelationship({});
  };

  const saveEdit = () => {
    if (
      editingIndex !== null &&
      editRelationship.name &&
      editRelationship.description
    ) {
      const value = Math.max(-100, Math.min(100, editRelationship.value ?? 0));
      const updated = [...localRelationships];
      updated[editingIndex] = {
        ...editRelationship,
        value,
        symbol: getRelationshipSymbol(value),
      } as Relationship;
      setLocalRelationships(updated);
      onUpdate(updated);
      setEditingIndex(null);
      setEditRelationship({});
      addNotification("Relationship updated!", "success");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
          <DynamicIcon name="Users" className="w-6 h-6" /> Relationships (
          {localRelationships.length})
        </h4>
        <button
          onClick={addRelationship}
          className="px-3 py-1.5 bg-linear-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white text-sm font-medium rounded-lg shadow-md shadow-emerald-950/40 transition-all"
        >
          + Add Relationship
        </button>
      </div>
      <div className="space-y-3">
        {localRelationships.map((rel, index) =>
          editingIndex === index ? (
            <div
              key={index}
              className="p-4 bg-white/[0.04] backdrop-blur-xl border border-pink-400/30 rounded-2xl shadow-[0_0_20px_rgba(236,72,153,0.1)]"
            >
              <div className="space-y-3">
                <input
                  type="text"
                  value={editRelationship.name || ""}
                  onChange={(e) =>
                    setEditRelationship({
                      ...editRelationship,
                      name: e.target.value,
                    })
                  }
                  placeholder="Character/Faction/Organization Name"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white font-semibold focus:outline-none focus:ring-2 focus:ring-pink-500/40 focus:border-pink-400/40 transition-colors"
                />
                <div>
                  <label className="flex text-sm font-semibold text-blue-200 mb-2 items-center justify-between">
                    <span>
                      Relationship Value: {editRelationship.value ?? 0}
                    </span>
                    <span className="text-2xl">
                      {getRelationshipSymbol(editRelationship.value ?? 0)}
                    </span>
                  </label>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    value={editRelationship.value ?? 0}
                    onChange={(e) =>
                      setEditRelationship({
                        ...editRelationship,
                        value: parseInt(e.target.value),
                      })
                    }
                    className="w-full h-2 rounded-full appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right,
                        #ef4444 0%,
                        #f59e0b 25%,
                        #84cc16 50%,
                        #10b981 75%,
                        #06b6d4 100%)`,
                    }}
                  />
                  <div className="flex justify-between text-xs text-blue-200/60 mt-1">
                    <span>?? -100 (Enemy)</span>
                    <span>?? 0 (Neutral)</span>
                    <span>?? +100 (Ally)</span>
                  </div>
                </div>
                <textarea
                  value={editRelationship.description || ""}
                  onChange={(e) =>
                    setEditRelationship({
                      ...editRelationship,
                      description: e.target.value,
                    })
                  }
                  placeholder="Describe the relationship..."
                  className="w-full h-24 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white resize-none focus:outline-none focus:ring-2 focus:ring-pink-500/40 focus:border-pink-400/40 transition-colors"
                />
                <div className="flex gap-2">
                  <button
                    onClick={saveEdit}
                    disabled={
                      !editRelationship.name || !editRelationship.description
                    }
                    className="px-4 py-2 bg-linear-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:from-white/10 disabled:to-white/10 disabled:text-blue-300/40 text-white rounded-lg shadow-md shadow-emerald-950/40 disabled:shadow-none transition-all"
                  >
                    <DynamicIcon
                      name="Save"
                      className="inline-block w-4 h-4 mr-1"
                    />
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-blue-200 rounded-lg transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              key={index}
              className="flex items-start gap-3 p-4 bg-white/[0.03] backdrop-blur-md rounded-xl border border-white/10 hover:border-pink-400/20 hover:bg-white/[0.05] transition-colors"
            >
              <div className="shrink-0">
                <DynamicIcon name={rel.symbol} className="w-8 h-8" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white flex items-center gap-2 flex-wrap mb-1">
                  <span>{rel.name}</span>
                  <span
                    className={`text-sm px-2 py-0.5 rounded-full border ${
                      rel.value >= 50
                        ? "bg-green-500/10 text-green-300 border-green-400/20"
                        : rel.value >= 0
                          ? "bg-blue-500/10 text-blue-300 border-blue-400/20"
                          : rel.value >= -50
                            ? "bg-orange-500/10 text-orange-300 border-orange-400/20"
                            : "bg-red-500/10 text-red-300 border-red-400/20"
                    }`}
                  >
                    {rel.value > 0 ? "+" : ""}
                    {rel.value}
                  </span>
                </div>
                <p className="text-sm text-blue-200/60">{rel.description}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => startEdit(index)}
                  className="px-3 py-1 bg-purple-500/10 hover:bg-purple-500/20 text-purple-200 border border-purple-400/20 rounded-lg transition-colors"
                >
                  <DynamicIcon name="Edit" className="w-4 h-4" />
                </button>
                <button
                  onClick={() => removeRelationship(index)}
                  className="px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-400/20 rounded-lg transition-colors"
                >
                  <DynamicIcon name="Trash2" className="w-4 h-4" />
                </button>
              </div>
            </div>
          ),
        )}
        {localRelationships.length === 0 && (
          <div className="p-8 text-center rounded-2xl bg-white/[0.02] border-2 border-dashed border-white/10">
            <p className="text-sm text-blue-300/50">
              No relationships yet. Add relationships to track your standing
              with characters, factions, and organizations.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// NPC Editor - Modern character tracking system
