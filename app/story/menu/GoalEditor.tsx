"use client";

import { Goal } from "../../misc/structs";
import { useState } from "react";
import { DynamicIcon } from "../../components/DynamicIcon";

export default function GoalEditor({
  goals,
  onUpdate,
}: {
  goals: Goal[];
  onUpdate: (goals: Goal[]) => void;
}) {
  const [localGoals, setLocalGoals] = useState([...goals]);
  const [draggedGoalIndex, setDraggedGoalIndex] = useState<number | null>(
    null,
  );
  const [editingGoalIndex, setEditingGoalIndex] = useState<number | null>(
    null,
  );
  const [editGoal, setEditGoal] = useState<Goal | null>(null);

  const addGoal = () => {
    const newGoal: Goal = {
      id: `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: "New Goal",
      shortDescription: "Goal objective",
      description: "Detailed goal description",
      active: true,
      fulfilled: false,
      createdAt: new Date(),
    };
    const updated = [...localGoals, newGoal];
    setLocalGoals(updated);
    onUpdate(updated);
  };

  const removeGoal = (index: number) => {
    const updated = localGoals.filter((_, i) => i !== index);
    setLocalGoals(updated);
    onUpdate(updated);
  };

  const startEditGoal = (index: number) => {
    setEditingGoalIndex(index);
    setEditGoal({ ...localGoals[index] });
  };

  const saveEditGoal = () => {
    if (editingGoalIndex !== null && editGoal) {
      const updated = [...localGoals];
      updated[editingGoalIndex] = editGoal;
      setLocalGoals(updated);
      onUpdate(updated);
      setEditingGoalIndex(null);
      setEditGoal(null);
    }
  };

  const cancelEditGoal = () => {
    setEditingGoalIndex(null);
    setEditGoal(null);
  };

  const moveGoalUp = (index: number) => {
    if (index > 0) {
      const updated = [...localGoals];
      [updated[index - 1], updated[index]] = [
        updated[index],
        updated[index - 1],
      ];
      setLocalGoals(updated);
      onUpdate(updated);
    }
  };

  const moveGoalDown = (index: number) => {
    if (index < localGoals.length - 1) {
      const updated = [...localGoals];
      [updated[index], updated[index + 1]] = [
        updated[index + 1],
        updated[index],
      ];
      setLocalGoals(updated);
      onUpdate(updated);
    }
  };

  const handleGoalDragStart = (index: number) => {
    setDraggedGoalIndex(index);
  };

  const handleGoalDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedGoalIndex === null || draggedGoalIndex === index) return;

    const updated = [...localGoals];
    const draggedGoal = updated[draggedGoalIndex];
    updated.splice(draggedGoalIndex, 1);
    updated.splice(index, 0, draggedGoal);

    setLocalGoals(updated);
    setDraggedGoalIndex(index);
    onUpdate(updated);
  };

  const handleGoalDragEnd = () => {
    setDraggedGoalIndex(null);
  };

  return (
    <div>
      {/* Goals Editor */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-bold text-white flex items-center gap-2">
            <DynamicIcon name="Scroll" className="w-6 h-6" /> Goals
          </h4>
          <button
            onClick={addGoal}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg"
          >
            + Add Goal
          </button>
        </div>
        <div className="space-y-3">
          {localGoals.map((goal, index) =>
            editingGoalIndex === index ? (
              <div
                key={goal.id}
                className="p-4 bg-blue-100 dark:bg-blue-900/40 border-2 border-blue-400 rounded-lg"
              >
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editGoal?.title || ""}
                    onChange={(e) =>
                      setEditGoal({ ...editGoal!, title: e.target.value })
                    }
                    placeholder="Goal Title"
                    className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                  />
                  <input
                    type="text"
                    value={editGoal?.shortDescription || ""}
                    onChange={(e) =>
                      setEditGoal({
                        ...editGoal!,
                        shortDescription: e.target.value,
                      })
                    }
                    placeholder="Short Description"
                    className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                  />
                  <textarea
                    value={editGoal?.description || ""}
                    onChange={(e) =>
                      setEditGoal({
                        ...editGoal!,
                        description: e.target.value,
                      })
                    }
                    placeholder="Full Description"
                    className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                    rows={4}
                  />
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-white">
                      <input
                        type="checkbox"
                        checked={!!editGoal?.active}
                        onChange={(e) =>
                          setEditGoal({
                            ...editGoal!,
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
                        checked={!!editGoal?.fulfilled}
                        onChange={(e) =>
                          setEditGoal({
                            ...editGoal!,
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
                      onClick={() => saveEditGoal()}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEditGoal}
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
                onDragStart={() => handleGoalDragStart(index)}
                onDragOver={(e) => handleGoalDragOver(e, index)}
                onDragEnd={handleGoalDragEnd}
                className={`p-4 bg-blue-900/20 rounded-lg cursor-move flex items-center gap-3 ${
                  draggedGoalIndex === index ? "opacity-50" : ""
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
                      {goal.title}
                    </span>
                    {goal.active && !goal.fulfilled && (
                      <span className="px-2 py-0.5 bg-blue-200 dark:bg-blue-800/50 text-blue-800 dark:text-blue-200 rounded-full text-xs font-bold">
                        Active
                      </span>
                    )}
                    {goal.fulfilled && (
                      <span className="text-green-500">
                        <DynamicIcon
                          name="Check"
                          className="w-4 h-4 inline mr-1"
                        />
                      </span>
                    )}
                    {!goal.active && !goal.fulfilled && (
                      <span className="px-2 py-0.5 bg-blue-800/30 text-blue-300/60 rounded-full text-xs font-bold">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-blue-200/60">
                    {goal.shortDescription}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex gap-0.5">
                    <button
                      onClick={() => moveGoalUp(index)}
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
                      onClick={() => moveGoalDown(index)}
                      disabled={index === localGoals.length - 1}
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
                      onClick={() => startEditGoal(index)}
                      className="w-7 h-7 sm:w-8 sm:h-8 bg-yellow-600 hover:bg-yellow-700 text-white rounded flex items-center justify-center"
                      title="Edit"
                    >
                      <DynamicIcon
                        name="Edit"
                        className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                      />
                    </button>
                    <button
                      onClick={() => removeGoal(index)}
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
          {localGoals.length === 0 && (
            <p className="text-sm text-blue-200/60">No goals yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
