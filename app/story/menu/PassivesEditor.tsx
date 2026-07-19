"use client";

import { useState, useEffect } from "react";
import { DynamicIcon } from "../../components/DynamicIcon";

export default function PassivesEditor({
  passives,
  onUpdate,
}: {
  passives: { name: string; description: string; nodeId: string }[];
  onUpdate: (
    passives: { name: string; description: string; nodeId: string }[],
  ) => void;
}) {
  const [localPassives, setLocalPassives] = useState([...passives]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editPassive, setEditPassive] = useState<{
    name: string;
    description: string;
  }>({ name: "", description: "" });

  // Filter to show manual passives (editable) vs skill tree passives (read-only)
  const manualPassives = localPassives.filter((p) => p.nodeId === "manual");
  const skillTreePassives = localPassives.filter((p) => p.nodeId !== "manual");

  const startEdit = (index: number) => {
    const passive = localPassives[index];
    setEditingIndex(index);
    setEditPassive({ name: passive.name, description: passive.description });
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditPassive({ name: "", description: "" });
  };

  const saveEdit = () => {
    if (editingIndex === null) return;
    const updated = [...localPassives];
    updated[editingIndex] = {
      ...updated[editingIndex],
      name: editPassive.name,
      description: editPassive.description,
    };
    setLocalPassives(updated);
    onUpdate(updated);
    cancelEdit();
  };

  const addPassive = () => {
    const newPassive = {
      name: "New Passive",
      description: "Passive effect description",
      nodeId: "manual",
    };
    const updated = [...localPassives, newPassive];
    setLocalPassives(updated);
    onUpdate(updated);
  };

  const removePassive = (index: number) => {
    const passive = localPassives[index];
    if (passive.nodeId !== "manual") return; // Can't remove skill tree passives
    const updated = localPassives.filter((_, i) => i !== index);
    setLocalPassives(updated);
    onUpdate(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <DynamicIcon name="Sparkles" className="w-5 h-5 text-purple-400" />
          Passive Traits ({localPassives.length})
        </h3>
        <button
          onClick={addPassive}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg flex items-center gap-2"
        >
          <DynamicIcon name="Plus" className="w-4 h-4" />
          Add Passive
        </button>
      </div>

      {skillTreePassives.length > 0 && (
        <div className="p-3 bg-blue-900/30 rounded-lg border border-blue-700/40">
          <p className="text-xs text-blue-300/60 mb-2">
            <DynamicIcon name="GitBranch" className="w-3 h-3 inline mr-1" />
            From Skill Trees (read-only):
          </p>
          <div className="space-y-1">
            {skillTreePassives.map((passive, i) => (
              <div
                key={`tree-${i}`}
                className="text-sm text-blue-200/80 flex items-center gap-2"
              >
                <span className="font-medium text-purple-300">
                  {passive.name}:
                </span>
                <span className="text-blue-200/60">{passive.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {localPassives.map((passive, index) => {
          // Skip skill tree passives in main list (shown above)
          if (passive.nodeId !== "manual") return null;

          const isEditing = editingIndex === index;

          return (
            <div
              key={index}
              className="p-3 bg-blue-900/30 rounded-lg border border-blue-700/40"
            >
              {isEditing ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editPassive.name}
                    onChange={(e) =>
                      setEditPassive({ ...editPassive, name: e.target.value })
                    }
                    placeholder="Passive name"
                    className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded-lg text-white"
                  />
                  <textarea
                    value={editPassive.description}
                    onChange={(e) =>
                      setEditPassive({
                        ...editPassive,
                        description: e.target.value,
                      })
                    }
                    placeholder="Description of the passive effect"
                    rows={2}
                    className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded-lg text-white resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={saveEdit}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="font-medium text-purple-300 flex items-center gap-2">
                      <DynamicIcon
                        name="Sparkles"
                        className="w-4 h-4 text-purple-400"
                      />
                      {passive.name}
                    </div>
                    <p className="text-sm text-blue-200/60 mt-1">
                      {passive.description}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => startEdit(index)}
                      className="w-8 h-8 bg-yellow-600 hover:bg-yellow-700 text-white rounded flex items-center justify-center"
                      title="Edit"
                    >
                      <DynamicIcon name="Edit" className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => removePassive(index)}
                      className="w-8 h-8 bg-red-600 hover:bg-red-700 text-white rounded flex items-center justify-center"
                      title="Remove"
                    >
                      <DynamicIcon name="Trash2" className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {manualPassives.length === 0 && (
          <div className="text-center py-6 text-blue-300/50">
            <DynamicIcon
              name="Sparkles"
              className="w-8 h-8 mx-auto mb-2 opacity-50"
            />
            <p>No manual passives yet</p>
            <p className="text-sm">
              Add custom passive effects or unlock them from skill trees
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Lore Editor
