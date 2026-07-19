"use client";

import {
  StoryData,
  Stat,
  Resource,
  InventoryItem,
  Achievement,
  StoryLore,
  Quest,
  Relationship,
  Condition,
  ConditionTier,
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
import { DynamicIcon } from "../../components/DynamicIcon";

export default function QuestEditor({
  quests,
  onUpdate,
}: {
  quests: Quest[];
  onUpdate: (quests: Quest[]) => void;
}) {
  const [localQuests, setLocalQuests] = useState([...quests]);
  const [draggedQuestIndex, setDraggedQuestIndex] = useState<number | null>(
    null,
  );
  const [editingQuestIndex, setEditingQuestIndex] = useState<number | null>(
    null,
  );
  const [editQuest, setEditQuest] = useState<Quest | null>(null);

  const addQuest = () => {
    const newQuest: Quest = {
      id: `quest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: "New Quest",
      shortDescription: "Quest objective",
      description: "Detailed quest description",
      active: true,
      fulfilled: false,
      points: 10,
      createdAt: new Date(),
    };
    const updated = [...localQuests, newQuest];
    setLocalQuests(updated);
    onUpdate(updated);
  };

  const removeQuest = (index: number) => {
    const updated = localQuests.filter((_, i) => i !== index);
    setLocalQuests(updated);
    onUpdate(updated);
  };

  const startEditQuest = (index: number) => {
    setEditingQuestIndex(index);
    setEditQuest({ ...localQuests[index] });
  };

  const saveEditQuest = () => {
    if (editingQuestIndex !== null && editQuest) {
      const updated = [...localQuests];
      updated[editingQuestIndex] = editQuest;
      setLocalQuests(updated);
      onUpdate(updated);
      setEditingQuestIndex(null);
      setEditQuest(null);
    }
  };

  const cancelEditQuest = () => {
    setEditingQuestIndex(null);
    setEditQuest(null);
  };

  const moveQuestUp = (index: number) => {
    if (index > 0) {
      const updated = [...localQuests];
      [updated[index - 1], updated[index]] = [
        updated[index],
        updated[index - 1],
      ];
      setLocalQuests(updated);
      onUpdate(updated);
    }
  };

  const moveQuestDown = (index: number) => {
    if (index < localQuests.length - 1) {
      const updated = [...localQuests];
      [updated[index], updated[index + 1]] = [
        updated[index + 1],
        updated[index],
      ];
      setLocalQuests(updated);
      onUpdate(updated);
    }
  };

  const handleQuestDragStart = (index: number) => {
    setDraggedQuestIndex(index);
  };

  const handleQuestDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedQuestIndex === null || draggedQuestIndex === index) return;

    const updated = [...localQuests];
    const draggedQuest = updated[draggedQuestIndex];
    updated.splice(draggedQuestIndex, 1);
    updated.splice(index, 0, draggedQuest);

    setLocalQuests(updated);
    setDraggedQuestIndex(index);
    onUpdate(updated);
  };

  const handleQuestDragEnd = () => {
    setDraggedQuestIndex(null);
  };

  return (
    <div>
      {/* Quests Editor */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-bold text-white flex items-center gap-2">
            <DynamicIcon name="Scroll" className="w-6 h-6" /> Quests
          </h4>
          <button
            onClick={addQuest}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg"
          >
            + Add Quest
          </button>
        </div>
        <div className="space-y-3">
          {localQuests.map((quest, index) =>
            editingQuestIndex === index ? (
              <div
                key={quest.id}
                className="p-4 bg-blue-100 dark:bg-blue-900/40 border-2 border-blue-400 rounded-lg"
              >
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editQuest?.title || ""}
                    onChange={(e) =>
                      setEditQuest({ ...editQuest!, title: e.target.value })
                    }
                    placeholder="Quest Title"
                    className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                  />
                  <input
                    type="text"
                    value={editQuest?.shortDescription || ""}
                    onChange={(e) =>
                      setEditQuest({
                        ...editQuest!,
                        shortDescription: e.target.value,
                      })
                    }
                    placeholder="Short Description"
                    className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                  />
                  <textarea
                    value={editQuest?.description || ""}
                    onChange={(e) =>
                      setEditQuest({
                        ...editQuest!,
                        description: e.target.value,
                      })
                    }
                    placeholder="Full Description"
                    className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                    rows={4}
                  />
                  <input
                    type="number"
                    value={editQuest?.points ?? 0}
                    onChange={(e) =>
                      setEditQuest({
                        ...editQuest!,
                        points: parseInt(e.target.value) || 0,
                      })
                    }
                    placeholder="Points"
                    className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                  />
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-white">
                      <input
                        type="checkbox"
                        checked={!!editQuest?.active}
                        onChange={(e) =>
                          setEditQuest({
                            ...editQuest!,
                            active: e.target.checked,
                          })
                        }
                        className="rounded"
                      />
                      <span>Active</span>
                    </label>
                    <label className="flex items-center gap-2 text-white">
                      <input
                        type="checkbox"
                        checked={!!editQuest?.fulfilled}
                        onChange={(e) =>
                          setEditQuest({
                            ...editQuest!,
                            fulfilled: e.target.checked,
                          })
                        }
                        className="rounded"
                      />
                      <span>Fulfilled</span>
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEditQuest()}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEditQuest}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                key={index}
                draggable
                onDragStart={() => handleQuestDragStart(index)}
                onDragOver={(e) => handleQuestDragOver(e, index)}
                onDragEnd={handleQuestDragEnd}
                className={`p-4 bg-blue-900/20 rounded-lg cursor-move flex items-center gap-3 ${
                  draggedQuestIndex === index ? "opacity-50" : ""
                }`}
              >
                <span className="text-gray-400 select-none">
                  <DynamicIcon name="GripVertical" className="w-5 h-5" />
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 font-medium text-white">
                    <span className="flex items-center gap-2">
                      <DynamicIcon
                        name="Scroll"
                        className="w-5 h-5 text-amber-600 dark:text-amber-400"
                      />
                      {quest.title} ({quest.points} pts)
                    </span>
                    {quest.active && !quest.fulfilled && (
                      <span className="px-2 py-0.5 bg-blue-200 dark:bg-blue-800/50 text-blue-800 dark:text-blue-200 rounded-full text-xs font-bold">
                        Active
                      </span>
                    )}
                    {quest.fulfilled && (
                      <span className="text-green-500">
                        <DynamicIcon
                          name="Check"
                          className="w-4 h-4 inline mr-1"
                        />
                      </span>
                    )}
                    {!quest.active && !quest.fulfilled && (
                      <span className="px-2 py-0.5 bg-blue-800/30 text-blue-300/60 rounded-full text-xs font-bold">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-blue-200/60">
                    {quest.shortDescription}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex gap-0.5">
                    <button
                      onClick={() => moveQuestUp(index)}
                      disabled={index === 0}
                      className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded flex items-center justify-center"
                      title="Move up"
                    >
                      <DynamicIcon
                        name="ChevronUp"
                        className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                      />
                    </button>
                    <button
                      onClick={() => moveQuestDown(index)}
                      disabled={index === localQuests.length - 1}
                      className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded flex items-center justify-center"
                      title="Move down"
                    >
                      <DynamicIcon
                        name="ChevronDown"
                        className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                      />
                    </button>
                  </div>
                  <div className="flex gap-0.5">
                    <button
                      onClick={() => startEditQuest(index)}
                      className="w-7 h-7 sm:w-8 sm:h-8 bg-yellow-600 hover:bg-yellow-700 text-white rounded flex items-center justify-center"
                      title="Edit"
                    >
                      <DynamicIcon
                        name="Edit"
                        className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                      />
                    </button>
                    <button
                      onClick={() => removeQuest(index)}
                      className="w-7 h-7 sm:w-8 sm:h-8 bg-red-600 hover:bg-red-700 text-white rounded flex items-center justify-center"
                      title="Remove"
                    >
                      <DynamicIcon
                        name="Trash2"
                        className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                      />
                    </button>
                  </div>
                </div>
              </div>
            ),
          )}
          {localQuests.length === 0 && (
            <p className="text-sm text-blue-200/60">No quests yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// Inventory Editor
