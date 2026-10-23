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
          <h4 className="text-lg font-bold text-ys-text flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-ys-accent/10 ring-1 ring-ys-accent/20">
              <DynamicIcon name="Scroll" className="w-4 h-4 text-ys-accent" />
            </span>
            Goals
          </h4>
          <button
            onClick={addGoal}
            className="px-3 py-1.5 bg-ys-success/15 text-ys-success text-sm font-medium rounded-lg transition-all border border-ys-success/40"
          >
            + Add Goal
          </button>
        </div>
        <div className="space-y-3">
          {localGoals.map((goal, index) =>
            editingGoalIndex === index ? (
              <div
                key={goal.id}
                className="p-4 bg-ys-surface backdrop-blur-xl border border-ys-accent/30 rounded-2xl shadow-[0_0_20px_color-mix(in_srgb,var(--ys-accent)_10%,transparent)]"
              >
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editGoal?.title || ""}
                    onChange={(e) =>
                      setEditGoal({ ...editGoal!, title: e.target.value })
                    }
                    placeholder="Goal Title"
                    className="w-full px-3 py-2 bg-ys-surface border border-ys-border rounded-lg text-ys-text focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 transition-colors"
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
                    className="w-full px-3 py-2 bg-ys-surface border border-ys-border rounded-lg text-ys-text focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 transition-colors"
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
                    className="w-full px-3 py-2 bg-ys-surface border border-ys-border rounded-lg text-ys-text focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 transition-colors"
                    rows={4}
                  />
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-ys-text">
                      <input
                        type="checkbox"
                        checked={!!editGoal?.active}
                        onChange={(e) =>
                          setEditGoal({
                            ...editGoal!,
                            active: e.target.checked,
                          })
                        }
                        className="rounded accent-ys-accent"
                      />
                      <span>Active</span>
                    </label>
                    <label className="flex items-center gap-2 text-ys-text">
                      <input
                        type="checkbox"
                        checked={!!editGoal?.fulfilled}
                        onChange={(e) =>
                          setEditGoal({
                            ...editGoal!,
                            fulfilled: e.target.checked,
                          })
                        }
                        className="rounded accent-ys-accent"
                      />
                      <span>Fulfilled</span>
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEditGoal()}
                      className="px-4 py-2 bg-ys-success/15 text-ys-success rounded-lg transition-all border border-ys-success/40"
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEditGoal}
                      className="px-4 py-2 bg-ys-surface hover:bg-ys-surface-2 border border-ys-border text-ys-text rounded-lg transition-all"
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
                className={`p-4 bg-ys-surface backdrop-blur-md border border-ys-border rounded-xl cursor-move flex items-center gap-3 transition-colors hover:bg-ys-surface-2 ${
                  draggedGoalIndex === index ? "opacity-50" : ""
                }`}
              >
                <span className="text-ys-muted select-none">
                  <DynamicIcon name="GripVertical" className="w-5 h-5" />
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 font-medium text-ys-text">
                    <span className="flex items-center gap-2">
                      <DynamicIcon
                        name="Scroll"
                        className="w-5 h-5 text-ys-warning"
                      />
                      {goal.title}
                    </span>
                    {goal.active && !goal.fulfilled && (
                      <span className="px-2 py-0.5 bg-ys-accent/15 text-ys-accent rounded-full text-xs font-bold border border-ys-accent/20">
                        Active
                      </span>
                    )}
                    {goal.fulfilled && (
                      <span className="text-ys-success">
                        <DynamicIcon
                          name="Check"
                          className="w-4 h-4 inline mr-1"
                        />
                      </span>
                    )}
                    {!goal.active && !goal.fulfilled && (
                      <span className="px-2 py-0.5 bg-ys-surface text-ys-muted rounded-full text-xs font-bold border border-ys-border">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-ys-muted">
                    {goal.shortDescription}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex gap-0.5">
                    <button
                      onClick={() => moveGoalUp(index)}
                      disabled={index === 0}
                      className="w-7 h-7 sm:w-8 sm:h-8 bg-ys-surface hover:bg-ys-surface-2 disabled:opacity-30 disabled:cursor-not-allowed text-ys-text border border-ys-border rounded-lg flex items-center justify-center transition-colors"
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
                      className="w-7 h-7 sm:w-8 sm:h-8 bg-ys-surface hover:bg-ys-surface-2 disabled:opacity-30 disabled:cursor-not-allowed text-ys-text border border-ys-border rounded-lg flex items-center justify-center transition-colors"
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
                      className="w-7 h-7 sm:w-8 sm:h-8 bg-ys-accent/10 hover:bg-ys-accent/20 text-ys-text border border-ys-accent/20 rounded-lg flex items-center justify-center transition-colors"
                      title="Edit"
                    >
                      <DynamicIcon
                        name="Edit"
                        className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                      />
                    </button>
                    <button
                      onClick={() => removeGoal(index)}
                      className="w-7 h-7 sm:w-8 sm:h-8 bg-ys-danger/10 hover:bg-ys-danger/20 text-ys-danger border border-ys-danger/20 rounded-lg flex items-center justify-center transition-colors"
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
            <p className="text-sm text-ys-muted">No goals yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
