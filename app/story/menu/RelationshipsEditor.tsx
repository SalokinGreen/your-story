"use client";

import {
  StoryData,
  Stat,
  Resource,
  InventoryItem,
  StoryLore,
  Relationship,
  AGMTState,
  CustomTable,
  Variable,
  NumberVariable,
  BooleanVariable,
  StringVariable,
  ListVariable,
  Ability,
  AbilityCost,
  AbilityGrade,
  MemoryEntry,
  getMemoryContent,
  NPC,
  NPCStatus,
  NPCAttitude,
  Adventure,
} from "../../misc/structs";
import { useState, useEffect } from "react";
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
          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg"
        >
          + Add Relationship
        </button>
      </div>
      <div className="space-y-3">
        {localRelationships.map((rel, index) =>
          editingIndex === index ? (
            <div
              key={index}
              className="p-4 bg-pink-100 dark:bg-pink-900/40 border-2 border-pink-400 rounded-lg"
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
                  className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white font-semibold"
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
                    className="w-full h-2 bg-blue-900/30 rounded-lg appearance-none cursor-pointer"
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
                  className="w-full h-24 px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={saveEdit}
                    disabled={
                      !editRelationship.name || !editRelationship.description
                    }
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded"
                  >
                    <DynamicIcon
                      name="Save"
                      className="inline-block w-4 h-4 mr-1"
                    />
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              key={index}
              className="flex items-start gap-3 p-4 bg-pink-50 dark:bg-pink-900/20 rounded-lg border border-pink-200 dark:border-pink-800"
            >
              <div className="shrink-0">
                <DynamicIcon name={rel.symbol} className="w-8 h-8" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white flex items-center gap-2 flex-wrap mb-1">
                  <span>{rel.name}</span>
                  <span
                    className={`text-sm px-2 py-0.5 rounded-full ${
                      rel.value >= 50
                        ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200"
                        : rel.value >= 0
                          ? "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200"
                          : rel.value >= -50
                            ? "bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200"
                            : "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200"
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
                  className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded"
                >
                  <DynamicIcon name="Edit" className="w-4 h-4" />
                </button>
                <button
                  onClick={() => removeRelationship(index)}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
                >
                  <DynamicIcon name="Trash2" className="w-4 h-4" />
                </button>
              </div>
            </div>
          ),
        )}
        {localRelationships.length === 0 && (
          <div className="p-8 text-center rounded-lg bg-blue-900/30 border-2 border-dashed border-blue-700/40">
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
