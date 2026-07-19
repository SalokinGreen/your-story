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
import { IconPicker } from "../../components/IconPicker";

export default function StatsResourcesEditor({
  stats,
  resources,
  achievements,
  onUpdate,
}: {
  stats: Stat[];
  resources: Resource[];
  achievements: Achievement[];
  onUpdate: (updates: Partial<StoryData>) => void;
}) {
  const [localStats, setLocalStats] = useState<Stat[]>([...stats]);
  const [localResources, setLocalResources] = useState<Resource[]>([
    ...resources,
  ]);
  const [localAchievements, setLocalAchievements] = useState<Achievement[]>([
    ...achievements,
  ]);

  // Drag and edit state for stats
  const [draggedStatIndex, setDraggedStatIndex] = useState<number | null>(null);
  const [editingStatIndex, setEditingStatIndex] = useState<number | null>(null);
  const [editStat, setEditStat] = useState<Partial<Stat>>({});

  // Drag and edit state for resources
  const [draggedResourceIndex, setDraggedResourceIndex] = useState<
    number | null
  >(null);
  const [editingResourceIndex, setEditingResourceIndex] = useState<
    number | null
  >(null);
  const [editResource, setEditResource] = useState<Partial<Resource>>({});

  // Drag and edit state for achievements
  const [draggedAchievementIndex, setDraggedAchievementIndex] = useState<
    number | null
  >(null);
  const [editingAchievementIndex, setEditingAchievementIndex] = useState<
    number | null
  >(null);
  const [editAchievement, setEditAchievement] = useState<Partial<Achievement>>(
    {},
  );

  const updateStat = (index: number, field: keyof Stat, value: any) => {
    const updated = [...localStats];
    (updated[index] as any)[field] = value;
    setLocalStats(updated);
    onUpdate({ stats: updated });
  };

  const updateResource = (index: number, field: keyof Resource, value: any) => {
    const updated = [...localResources];
    (updated[index] as any)[field] = value;
    setLocalResources(updated);
    onUpdate({ resources: updated });
  };

  const addStat = () => {
    const newStat: Stat = {
      name: "New Stat",
      value: 50,
      description: "",
      symbol: "Star",
    };
    const updated = [...localStats, newStat];
    setLocalStats(updated);
    onUpdate({ stats: updated });
  };

  const removeStat = (index: number) => {
    const updated = localStats.filter((_, i) => i !== index);
    setLocalStats(updated);
    onUpdate({ stats: updated });
  };

  const addResource = () => {
    const newResource: Resource = {
      name: "New Resource",
      value: 100,
      maxValue: 100,
      description: "",
      symbol: "Gem",
    };
    const updated = [...localResources, newResource];
    setLocalResources(updated);
    onUpdate({ resources: updated });
  };

  const removeResource = (index: number) => {
    const updated = localResources.filter((_, i) => i !== index);
    setLocalResources(updated);
    onUpdate({ resources: updated });
  };

  const updateAchievement = (
    index: number,
    field: keyof Achievement,
    value: any,
  ) => {
    const updated = [...localAchievements];
    (updated[index] as any)[field] = value;
    setLocalAchievements(updated);
    onUpdate({ achievements: updated });
  };

  const toggleAchievement = (index: number, achieved: boolean) => {
    const updated = [...localAchievements];
    updated[index] = {
      ...updated[index],
      dateAchieved: achieved ? new Date() : null,
    };
    setLocalAchievements(updated);
    onUpdate({ achievements: updated });
  };

  const addAchievement = () => {
    const newAchievement: Achievement = {
      title: "New Achievement",
      description: "",
      dateAchieved: null,
      points: 10,
      symbol: "Trophy",
    };
    const updated = [...localAchievements, newAchievement];
    setLocalAchievements(updated);
    onUpdate({ achievements: updated });
  };

  const removeAchievement = (index: number) => {
    const updated = localAchievements.filter((_, i) => i !== index);
    setLocalAchievements(updated);
    onUpdate({ achievements: updated });
  };

  // Stat drag-and-drop and edit handlers
  const handleStatDragStart = (index: number) => setDraggedStatIndex(index);
  const handleStatDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedStatIndex === null || draggedStatIndex === index) return;
    const updated = [...localStats];
    const [moved] = updated.splice(draggedStatIndex, 1);
    updated.splice(index, 0, moved);
    setLocalStats(updated);
    setDraggedStatIndex(index);
    onUpdate({ stats: updated });
  };
  const handleStatDragEnd = () => setDraggedStatIndex(null);
  const moveStatUp = (index: number) => {
    if (index === 0) return;
    const updated = [...localStats];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    setLocalStats(updated);
    onUpdate({ stats: updated });
  };
  const moveStatDown = (index: number) => {
    if (index === localStats.length - 1) return;
    const updated = [...localStats];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    setLocalStats(updated);
    onUpdate({ stats: updated });
  };
  const startEditStat = (index: number) => {
    setEditingStatIndex(index);
    setEditStat({ ...localStats[index] });
  };
  const cancelEditStat = () => {
    setEditingStatIndex(null);
    setEditStat({});
  };
  const saveEditStat = () => {
    if (editingStatIndex !== null && editStat.name && editStat.description) {
      const updated = [...localStats];
      updated[editingStatIndex] = editStat as Stat;
      setLocalStats(updated);
      onUpdate({ stats: updated });
      setEditingStatIndex(null);
      setEditStat({});
    }
  };

  // Resource drag-and-drop and edit handlers
  const handleResourceDragStart = (index: number) =>
    setDraggedResourceIndex(index);
  const handleResourceDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedResourceIndex === null || draggedResourceIndex === index) return;
    const updated = [...localResources];
    const [moved] = updated.splice(draggedResourceIndex, 1);
    updated.splice(index, 0, moved);
    setLocalResources(updated);
    setDraggedResourceIndex(index);
    onUpdate({ resources: updated });
  };
  const handleResourceDragEnd = () => setDraggedResourceIndex(null);
  const moveResourceUp = (index: number) => {
    if (index === 0) return;
    const updated = [...localResources];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    setLocalResources(updated);
    onUpdate({ resources: updated });
  };
  const moveResourceDown = (index: number) => {
    if (index === localResources.length - 1) return;
    const updated = [...localResources];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    setLocalResources(updated);
    onUpdate({ resources: updated });
  };
  const startEditResource = (index: number) => {
    setEditingResourceIndex(index);
    setEditResource({ ...localResources[index] });
  };
  const cancelEditResource = () => {
    setEditingResourceIndex(null);
    setEditResource({});
  };
  const saveEditResource = () => {
    if (
      editingResourceIndex !== null &&
      editResource.name &&
      editResource.description
    ) {
      const updated = [...localResources];
      updated[editingResourceIndex] = editResource as Resource;
      setLocalResources(updated);
      onUpdate({ resources: updated });
      setEditingResourceIndex(null);
      setEditResource({});
    }
  };

  // Achievement drag-and-drop and edit handlers
  const handleAchievementDragStart = (index: number) =>
    setDraggedAchievementIndex(index);
  const handleAchievementDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedAchievementIndex === null || draggedAchievementIndex === index)
      return;
    const updated = [...localAchievements];
    const [moved] = updated.splice(draggedAchievementIndex, 1);
    updated.splice(index, 0, moved);
    setLocalAchievements(updated);
    setDraggedAchievementIndex(index);
    onUpdate({ achievements: updated });
  };
  const handleAchievementDragEnd = () => setDraggedAchievementIndex(null);
  const moveAchievementUp = (index: number) => {
    if (index === 0) return;
    const updated = [...localAchievements];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    setLocalAchievements(updated);
    onUpdate({ achievements: updated });
  };
  const moveAchievementDown = (index: number) => {
    if (index === localAchievements.length - 1) return;
    const updated = [...localAchievements];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    setLocalAchievements(updated);
    onUpdate({ achievements: updated });
  };
  const startEditAchievement = (index: number) => {
    setEditingAchievementIndex(index);
    setEditAchievement({ ...localAchievements[index] });
  };
  const cancelEditAchievement = () => {
    setEditingAchievementIndex(null);
    setEditAchievement({});
  };
  const saveEditAchievement = () => {
    if (
      editingAchievementIndex !== null &&
      editAchievement.title &&
      editAchievement.description
    ) {
      const updated = [...localAchievements];
      updated[editingAchievementIndex] = editAchievement as Achievement;
      setLocalAchievements(updated);
      onUpdate({ achievements: updated });
      setEditingAchievementIndex(null);
      setEditAchievement({});
    }
  };

  return (
    <div className="space-y-4">
      {/* Stats Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-bold text-white flex items-center gap-2">
            <DynamicIcon name="BarChart2" className="w-6 h-6" /> Stats
          </h4>
          <button
            onClick={addStat}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg"
          >
            + Add Stat
          </button>
        </div>
        <div className="space-y-3">
          <p className="text-xs text-blue-200/60">
            <DynamicIcon name="Lightbulb" className="w-3 h-3 inline mr-1" />{" "}
            Drag and drop to reorder (or use arrow buttons on mobile)
          </p>
          {localStats.map((stat, index) =>
            editingStatIndex === index ? (
              // Edit mode
              <div
                key={index}
                className="p-4 bg-blue-100 dark:bg-blue-900/40 rounded-lg border-2 border-blue-400"
              >
                <h5 className="text-sm font-bold mb-3 text-white">
                  <DynamicIcon name="Edit" className="w-4 h-4" /> Editing Stat
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  <input
                    type="text"
                    value={editStat.name || ""}
                    onChange={(e) =>
                      setEditStat({ ...editStat, name: e.target.value })
                    }
                    placeholder="Stat name"
                    className="px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                  />
                  <div className="relative z-30">
                    <IconPicker
                      value={editStat.symbol || "Star"}
                      onChange={(icon) =>
                        setEditStat({ ...editStat, symbol: icon })
                      }
                    />
                  </div>
                  <input
                    type="number"
                    value={editStat.value || 0}
                    onChange={(e) =>
                      setEditStat({
                        ...editStat,
                        value: parseInt(e.target.value) || 0,
                      })
                    }
                    placeholder="Value"
                    className="px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                  />
                </div>
                <textarea
                  value={editStat.description || ""}
                  onChange={(e) =>
                    setEditStat({ ...editStat, description: e.target.value })
                  }
                  placeholder="Description"
                  className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white mb-3"
                  rows={2}
                />
                <div className="flex gap-2">
                  <button
                    onClick={saveEditStat}
                    disabled={!editStat.name || !editStat.description}
                    className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded"
                  >
                    <DynamicIcon name="Check" className="w-4 h-4 inline mr-1" />{" "}
                    Save
                  </button>
                  <button
                    onClick={cancelEditStat}
                    className="flex-1 px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              // View mode with drag-drop
              <div
                key={index}
                draggable
                onDragStart={() => handleStatDragStart(index)}
                onDragOver={(e) => handleStatDragOver(e, index)}
                onDragEnd={handleStatDragEnd}
                className="p-4 bg-blue-900/20 rounded-lg cursor-move"
                style={{ opacity: draggedStatIndex === index ? 0.5 : 1 }}
              >
                <div className="flex items-start gap-3">
                  <div className="text-gray-400 dark:text-gray-500 cursor-grab active:cursor-grabbing mt-2">
                    <DynamicIcon name="GripVertical" className="w-5 h-5" />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <DynamicIcon
                        name={stat.symbol}
                        className="w-8 h-8 text-blue-600 dark:text-blue-400"
                      />
                      <div>
                        <div className="font-bold text-white">{stat.name}</div>
                        <div className="text-sm text-blue-200/60">
                          {stat.description}
                        </div>
                        <div className="text-sm text-blue-600 dark:text-blue-400 font-semibold">
                          Value: {stat.value}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="flex gap-0.5">
                      <button
                        onClick={() => moveStatUp(index)}
                        disabled={index === 0}
                        className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded flex items-center justify-center"
                        title="Move up"
                      >
                        <DynamicIcon
                          name="ChevronUp"
                          className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                        />
                      </button>
                      <button
                        onClick={() => moveStatDown(index)}
                        disabled={index === localStats.length - 1}
                        className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded flex items-center justify-center"
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
                        onClick={() => startEditStat(index)}
                        className="w-7 h-7 sm:w-8 sm:h-8 bg-yellow-600 hover:bg-yellow-700 text-white rounded flex items-center justify-center"
                        title="Edit"
                      >
                        <DynamicIcon
                          name="Edit"
                          className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                        />
                      </button>
                      <button
                        onClick={() => removeStat(index)}
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
              </div>
            ),
          )}
        </div>
      </div>

      {/* Resources Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-bold text-white flex items-center gap-2">
            <DynamicIcon name="Gem" className="w-6 h-6" /> Resources
          </h4>
          <button
            onClick={addResource}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg"
          >
            + Add Resource
          </button>
        </div>
        <div className="space-y-3">
          {localResources.map((resource, index) =>
            editingResourceIndex === index ? (
              <div
                key={index}
                className="p-4 bg-blue-100 dark:bg-blue-900/40 border-2 border-blue-400 rounded-lg"
              >
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editResource.name || ""}
                    onChange={(e) =>
                      setEditResource({ ...editResource, name: e.target.value })
                    }
                    placeholder="Resource name"
                    className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                  />
                  <div className="relative z-30">
                    <IconPicker
                      value={editResource.symbol || "Gem"}
                      onChange={(icon) =>
                        setEditResource({ ...editResource, symbol: icon })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="number"
                      value={editResource.value ?? 0}
                      onChange={(e) =>
                        setEditResource({
                          ...editResource,
                          value: parseInt(e.target.value) || 0,
                        })
                      }
                      placeholder="Current"
                      className="px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                    />
                    <input
                      type="number"
                      value={editResource.maxValue ?? 0}
                      onChange={(e) =>
                        setEditResource({
                          ...editResource,
                          maxValue: parseInt(e.target.value) || 0,
                        })
                      }
                      placeholder="Max"
                      className="px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                    />
                  </div>
                  <textarea
                    value={editResource.description || ""}
                    onChange={(e) =>
                      setEditResource({
                        ...editResource,
                        description: e.target.value,
                      })
                    }
                    placeholder="Description"
                    className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEditResource()}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEditResource}
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
                onDragStart={() => handleResourceDragStart(index)}
                onDragOver={(e) => handleResourceDragOver(e, index)}
                onDragEnd={handleResourceDragEnd}
                className={`p-4 bg-blue-900/20 rounded-lg cursor-move flex items-center gap-3 ${
                  draggedResourceIndex === index ? "opacity-50" : ""
                }`}
              >
                <span className="text-gray-400 select-none">
                  <DynamicIcon name="GripVertical" className="w-5 h-5" />
                </span>
                <div className="flex-1">
                  <div className="font-medium text-white flex items-center gap-2">
                    <DynamicIcon
                      name={resource.symbol}
                      className="w-5 h-5 text-blue-600 dark:text-blue-400"
                    />
                    <span>
                      {resource.name}: {resource.value}/{resource.maxValue}
                    </span>
                  </div>
                  <div className="text-sm text-blue-200/60">
                    {resource.description}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex gap-0.5">
                    <button
                      onClick={() => moveResourceUp(index)}
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
                      onClick={() => moveResourceDown(index)}
                      disabled={index === localResources.length - 1}
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
                      onClick={() => startEditResource(index)}
                      className="w-7 h-7 sm:w-8 sm:h-8 bg-yellow-600 hover:bg-yellow-700 text-white rounded flex items-center justify-center"
                      title="Edit"
                    >
                      <DynamicIcon
                        name="Edit"
                        className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                      />
                    </button>
                    <button
                      onClick={() => removeResource(index)}
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
        </div>
      </div>

      {/* Achievements Editor */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-bold text-white flex items-center gap-2">
            <DynamicIcon name="Trophy" className="w-6 h-6" /> Achievements
          </h4>
          <button
            onClick={addAchievement}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg"
          >
            + Add Achievement
          </button>
        </div>
        <div className="space-y-3">
          {localAchievements.map((achievement, index) =>
            editingAchievementIndex === index ? (
              <div
                key={index}
                className="p-4 bg-blue-100 dark:bg-blue-900/40 border-2 border-blue-400 rounded-lg"
              >
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editAchievement.title || ""}
                    onChange={(e) =>
                      setEditAchievement({
                        ...editAchievement,
                        title: e.target.value,
                      })
                    }
                    placeholder="Title"
                    className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                  />
                  <div className="relative z-30">
                    <IconPicker
                      value={editAchievement.symbol || "Trophy"}
                      onChange={(icon) =>
                        setEditAchievement({ ...editAchievement, symbol: icon })
                      }
                    />
                  </div>
                  <input
                    type="number"
                    value={editAchievement.points ?? 0}
                    onChange={(e) =>
                      setEditAchievement({
                        ...editAchievement,
                        points: parseInt(e.target.value) || 0,
                      })
                    }
                    placeholder="Points"
                    className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                  />
                  <textarea
                    value={editAchievement.description || ""}
                    onChange={(e) =>
                      setEditAchievement({
                        ...editAchievement,
                        description: e.target.value,
                      })
                    }
                    placeholder="Description (shown to players)"
                    className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                    rows={3}
                  />
                  <input
                    type="text"
                    value={editAchievement.ai_hint || ""}
                    onChange={(e) =>
                      setEditAchievement({
                        ...editAchievement,
                        ai_hint: e.target.value,
                      })
                    }
                    placeholder="AI Hint (optional precise trigger conditions)"
                    className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                  />
                  <label className="flex items-center gap-2 text-white">
                    <input
                      type="checkbox"
                      checked={!!editAchievement.hidden}
                      onChange={(e) =>
                        setEditAchievement({
                          ...editAchievement,
                          hidden: e.target.checked,
                        })
                      }
                      className="w-4 h-4 rounded"
                    />
                    <span>
                      <DynamicIcon
                        name="Lock"
                        className="inline-block w-3 h-3 mr-1"
                      />
                      Hidden Achievement
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-white">
                    <input
                      type="checkbox"
                      checked={!!editAchievement.dateAchieved}
                      onChange={(e) =>
                        setEditAchievement({
                          ...editAchievement,
                          dateAchieved: e.target.checked ? new Date() : null,
                        })
                      }
                      className="w-4 h-4 rounded"
                    />
                    <span>Achieved</span>
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEditAchievement()}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEditAchievement}
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
                onDragStart={() => handleAchievementDragStart(index)}
                onDragOver={(e) => handleAchievementDragOver(e, index)}
                onDragEnd={handleAchievementDragEnd}
                className={`p-4 bg-blue-900/20 rounded-lg cursor-move flex items-center gap-3 ${
                  draggedAchievementIndex === index ? "opacity-50" : ""
                }`}
              >
                <span className="text-gray-400 select-none">
                  <DynamicIcon name="GripVertical" className="w-5 h-5" />
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 font-medium text-white">
                    <div className="flex items-center gap-2">
                      <DynamicIcon
                        name={achievement.symbol}
                        className="w-5 h-5 text-yellow-600 dark:text-yellow-400"
                      />
                      <span>
                        {achievement.title} ({achievement.points} pts)
                      </span>
                      {achievement.dateAchieved && (
                        <span className="ml-2 text-green-500">
                          <DynamicIcon
                            name="Check"
                            className="w-4 h-4 inline mr-1"
                          />
                        </span>
                      )}
                    </div>
                    {achievement.hidden && (
                      <span className="px-2 py-0.5 bg-purple-200 dark:bg-purple-800/50 text-purple-800 dark:text-purple-200 rounded-full text-xs font-bold">
                        <DynamicIcon
                          name="Lock"
                          className="inline-block w-3 h-3 mr-1"
                        />
                        Hidden
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-blue-200/60">
                    {achievement.description}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => moveAchievementUp(index)}
                    disabled={index === 0}
                    className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded flex items-center justify-center"
                    title="Move up"
                  >
                    <DynamicIcon name="ChevronUp" className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => moveAchievementDown(index)}
                    disabled={index === localAchievements.length - 1}
                    className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded flex items-center justify-center"
                    title="Move down"
                  >
                    <DynamicIcon name="ChevronDown" className="w-5 h-5" />
                  </button>
                </div>
                <button
                  onClick={() => startEditAchievement(index)}
                  className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded"
                >
                  <DynamicIcon name="Edit" className="w-4 h-4" />
                </button>
                <button
                  onClick={() => removeAchievement(index)}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
                >
                  Remove
                </button>
              </div>
            ),
          )}
          {localAchievements.length === 0 && (
            <p className="text-sm text-blue-200/60">No achievements yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// Quest Editor
