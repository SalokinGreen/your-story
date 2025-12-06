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
  AGMTState,
  AGMTThread,
  AGMTCharacter,
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
} from "../misc/structs";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useNotification } from "../misc/NotificationContext";
import { supabase } from "../misc/supabase";
import { compressImage } from "../misc/imageCompression";
import ConfirmDialog from "../components/ConfirmDialog";
import { useAuth } from "../misc/AuthContext";
import { encryptStoryData } from "../misc/encryption";
import { DynamicIcon } from "../components/DynamicIcon";
import { IconPicker } from "../components/IconPicker";
import { CustomTablesEditor } from "../components/CustomTablesEditor";
import { DraggableScroll } from "../components/DraggableScroll";
import {
  GRADE_CONFIG,
  getMaxDurability,
  ItemGrade,
  GRADE_ORDER,
} from "../misc/itemSystem";
import {
  ABILITY_GRADE_CONFIG,
  ABILITY_GRADE_ORDER,
  initializeAbility,
  formatAbilityCost,
  getAbilityBonus,
} from "../misc/abilitySystem";
import { getRPGSystem, type RPGSystemType } from "../misc/rpgSystems";
import StoryCreativeAssistant from "../components/StoryCreativeAssistant";

// Basic Settings Component
interface BasicSettingsForm {
  story_name: string;
  player_name: string;
  player_summary: string;
  premise: string;
  max_chapters: number;
  points: number;
  momentum: number;
  maxMomentum: number;
  rpgSystem:
    | "3d6"
    | "1d20"
    | "1d100"
    | "percentile"
    | "pbta"
    | "fate"
    | "yze"
    | "explosive"
    | "narrative";
}

function BasicSettings({
  form,
  onChange,
}: {
  form: BasicSettingsForm;
  onChange: (form: BasicSettingsForm) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-semibold text-blue-200 mb-2">
          Story Name
        </label>
        <input
          type="text"
          value={form.story_name}
          onChange={(e) => onChange({ ...form, story_name: e.target.value })}
          className="w-full px-4 py-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-blue-200 mb-2">
          Player/Character Name
        </label>
        <input
          type="text"
          value={form.player_name}
          onChange={(e) => onChange({ ...form, player_name: e.target.value })}
          className="w-full px-4 py-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-blue-200 mb-2">
          Character Description
        </label>
        <textarea
          value={form.player_summary}
          onChange={(e) =>
            onChange({ ...form, player_summary: e.target.value })
          }
          className="w-full h-32 px-4 py-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-blue-200 mb-2">
          Story Premise
        </label>
        <textarea
          value={form.premise}
          onChange={(e) => onChange({ ...form, premise: e.target.value })}
          className="w-full h-24 px-4 py-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-blue-200 mb-2">
          Max Chapters
        </label>
        <input
          type="number"
          value={form.max_chapters}
          onChange={(e) =>
            onChange({ ...form, max_chapters: parseInt(e.target.value) || 0 })
          }
          className="w-full px-4 py-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-semibold text-blue-200 mb-2">
            Starting Points
          </label>
          <input
            type="number"
            min={0}
            value={form.points}
            onChange={(e) =>
              onChange({ ...form, points: parseInt(e.target.value) || 0 })
            }
            className="w-full px-4 py-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-blue-200 mb-2">
            Starting Momentum
          </label>
          <input
            type="number"
            min={0}
            value={form.momentum}
            onChange={(e) =>
              onChange({ ...form, momentum: parseInt(e.target.value) || 0 })
            }
            className="w-full px-4 py-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-blue-200 mb-2">
            Max Momentum
          </label>
          <input
            type="number"
            min={1}
            value={form.maxMomentum}
            onChange={(e) =>
              onChange({ ...form, maxMomentum: parseInt(e.target.value) || 1 })
            }
            className="w-full px-4 py-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>

      {/* RPG System Selection */}
      <div>
        <label className="block text-sm font-semibold text-blue-200 mb-2">
          RPG Dice System
        </label>
        <p className="text-xs text-blue-200/60 mb-3">
          Change the core dice mechanics. Affects DCs, upgrade values, and
          resource scaling.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              id: "3d6" as const,
              name: "3d6",
              desc: "Roll 3-18, add to stat",
              icon: "Dices",
            },
            {
              id: "1d20" as const,
              name: "1d20",
              desc: "Roll 1-20, add to stat",
              icon: "Dices",
            },
            {
              id: "1d100" as const,
              name: "1d100",
              desc: "Roll 1-100, add to stat",
              icon: "Dices",
            },
            {
              id: "percentile" as const,
              name: "Classic Percentile",
              desc: "Roll 1-100, under stat wins",
              icon: "TrendingDown",
            },
            {
              id: "pbta" as const,
              name: "PbtA",
              desc: "2d6+mod: 10+ success, 7-9 partial",
              icon: "Zap",
              fullWidth: true,
            },
            {
              id: "fate" as const,
              name: "Fate Core",
              desc: "4dF+ladder: fail/tie/succeed/style",
              icon: "Scale",
              fullWidth: true,
            },
            {
              id: "yze" as const,
              name: "Year Zero Engine",
              desc: "d6 pool (count 6s), stress dice + panic",
              icon: "Skull",
              fullWidth: true,
            },
            {
              id: "explosive" as const,
              name: "Exploding Dice",
              desc: "Stat?die size (d4-d20), max rolls explode!",
              icon: "Flame",
              fullWidth: true,
            },
            {
              id: "narrative" as const,
              name: "Narrative (No Dice)",
              desc: "Pure storytelling, outcomes from dramatic logic",
              icon: "BookHeart",
              fullWidth: true,
            },
          ].map((sys) => (
            <button
              key={sys.id}
              onClick={() => onChange({ ...form, rpgSystem: sys.id })}
              className={`px-4 py-3 rounded-lg font-semibold border-2 transition-all text-left ${
                (sys as any).fullWidth ? "col-span-2" : ""
              } ${
                form.rpgSystem === sys.id
                  ? "bg-purple-600 text-white border-purple-600"
                  : "bg-blue-900/30 text-blue-200 border-blue-700/40 hover:border-purple-400"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <DynamicIcon name={sys.icon} className="w-4 h-4" />
                <span className="text-sm font-bold">{sys.name}</span>
              </div>
              <div className="text-xs opacity-75">{sys.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Stats & Resources Editor
function StatsResourcesEditor({
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
    {}
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
    value: any
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
                  <div className="relative z-50">
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
            )
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
                  <div className="relative z-50">
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
            )
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
                  <div className="relative z-50">
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
            )
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
function QuestEditor({
  quests,
  onUpdate,
}: {
  quests: Quest[];
  onUpdate: (quests: Quest[]) => void;
}) {
  const [localQuests, setLocalQuests] = useState([...quests]);
  const [draggedQuestIndex, setDraggedQuestIndex] = useState<number | null>(
    null
  );
  const [editingQuestIndex, setEditingQuestIndex] = useState<number | null>(
    null
  );
  const [editQuest, setEditQuest] = useState<Quest | null>(null);

  useEffect(() => {
    onUpdate(localQuests);
  }, [localQuests, onUpdate]);

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
    setLocalQuests([...localQuests, newQuest]);
  };

  const removeQuest = (index: number) => {
    setLocalQuests(localQuests.filter((_, i) => i !== index));
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
            )
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
function InventoryEditor({
  inventory,
  onUpdate,
}: {
  inventory: InventoryItem[];
  onUpdate: (inventory: InventoryItem[]) => void;
}) {
  const [localInventory, setLocalInventory] = useState([...inventory]);
  const [draggedInventoryIndex, setDraggedInventoryIndex] = useState<
    number | null
  >(null);
  const [editingInventoryIndex, setEditingInventoryIndex] = useState<
    number | null
  >(null);
  const [editInventoryItem, setEditInventoryItem] = useState<
    Partial<InventoryItem>
  >({});

  // Drag-and-drop handlers for inventory
  const handleInventoryDragStart = (index: number) => {
    setDraggedInventoryIndex(index);
  };

  const handleInventoryDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedInventoryIndex === null || draggedInventoryIndex === index)
      return;

    const items = [...localInventory];
    const draggedItem = items[draggedInventoryIndex];
    items.splice(draggedInventoryIndex, 1);
    items.splice(index, 0, draggedItem);

    setLocalInventory(items);
    setDraggedInventoryIndex(index);
    onUpdate(items);
  };

  const handleInventoryDragEnd = () => {
    setDraggedInventoryIndex(null);
  };

  // Arrow button handlers for inventory
  const moveInventoryUp = (index: number) => {
    if (index === 0) return;
    const items = [...localInventory];
    [items[index - 1], items[index]] = [items[index], items[index - 1]];
    setLocalInventory(items);
    onUpdate(items);
  };

  const moveInventoryDown = (index: number) => {
    if (index === localInventory.length - 1) return;
    const items = [...localInventory];
    [items[index], items[index + 1]] = [items[index + 1], items[index]];
    setLocalInventory(items);
    onUpdate(items);
  };

  // Edit mode handlers for inventory
  const startEditInventoryItem = (index: number) => {
    setEditingInventoryIndex(index);
    setEditInventoryItem({ ...localInventory[index] });
  };

  const cancelEditInventoryItem = () => {
    setEditingInventoryIndex(null);
    setEditInventoryItem({});
  };

  const saveEditInventoryItem = (index: number) => {
    const items = [...localInventory];
    items[index] = { ...items[index], ...editInventoryItem };
    setLocalInventory(items);
    onUpdate(items);
    setEditingInventoryIndex(null);
    setEditInventoryItem({});
  };

  const updateItem = (
    index: number,
    field: keyof InventoryItem,
    value: any
  ) => {
    const updated = [...localInventory];
    (updated[index] as any)[field] = value;
    setLocalInventory(updated);
    onUpdate(updated);
  };

  const addItem = () => {
    const newItem: InventoryItem = {
      name: "New Item",
      quantity: 1,
      description: "",
      type: "normal",
      symbol: "Package",
      grade: "common",
      durability: 3,
      maxDurability: 3,
    };
    const updated = [...localInventory, newItem];
    setLocalInventory(updated);
    onUpdate(updated);
  };

  const removeItem = (index: number) => {
    const updated = localInventory.filter((_, i) => i !== index);
    setLocalInventory(updated);
    onUpdate(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-bold text-white flex items-center gap-2">
          <DynamicIcon name="Backpack" className="w-6 h-6" /> Inventory (
          {localInventory.length} items)
        </h4>
        <button
          onClick={addItem}
          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg"
        >
          + Add Item
        </button>
      </div>
      <div className="space-y-3">
        {localInventory.map((item, index) =>
          editingInventoryIndex === index ? (
            <div
              key={index}
              className="p-4 bg-blue-100 dark:bg-blue-900/40 border-2 border-blue-400 rounded-lg"
            >
              <div className="space-y-3">
                <input
                  type="text"
                  value={editInventoryItem.name || ""}
                  onChange={(e) =>
                    setEditInventoryItem({
                      ...editInventoryItem,
                      name: e.target.value,
                    })
                  }
                  placeholder="Item name"
                  className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                />
                <div className="relative z-50">
                  <IconPicker
                    value={editInventoryItem.symbol || "Package"}
                    onChange={(icon) =>
                      setEditInventoryItem({
                        ...editInventoryItem,
                        symbol: icon,
                      })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    value={editInventoryItem.quantity ?? 1}
                    onChange={(e) =>
                      setEditInventoryItem({
                        ...editInventoryItem,
                        quantity: parseInt(e.target.value) || 1,
                      })
                    }
                    placeholder="Quantity"
                    className="px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                  />
                  <select
                    value={editInventoryItem.type || "normal"}
                    onChange={(e) =>
                      setEditInventoryItem({
                        ...editInventoryItem,
                        type: e.target.value as
                          | "normal"
                          | "consumable"
                          | "story"
                          | "misc",
                      })
                    }
                    className="px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                  >
                    <option value="normal">Normal</option>
                    <option value="consumable">Consumable</option>
                    <option value="story">Story</option>
                    <option value="misc">Misc</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-blue-200/60 mb-1">
                      Grade
                    </label>
                    <select
                      value={editInventoryItem.grade || "common"}
                      onChange={(e) => {
                        const newGrade = e.target.value as ItemGrade;
                        const maxDur = getMaxDurability(newGrade);
                        setEditInventoryItem({
                          ...editInventoryItem,
                          grade: newGrade,
                          maxDurability: maxDur,
                          durability: Math.min(
                            editInventoryItem.durability || maxDur,
                            maxDur
                          ),
                        });
                      }}
                      className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                      style={{
                        color:
                          GRADE_CONFIG[
                            (editInventoryItem.grade as ItemGrade) || "common"
                          ].color,
                      }}
                    >
                      {GRADE_ORDER.map((g) => (
                        <option
                          key={g}
                          value={g}
                          style={{ color: GRADE_CONFIG[g].color }}
                        >
                          {GRADE_CONFIG[g].label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-blue-200/60 mb-1">
                      Durability{" "}
                      {editInventoryItem.grade === "agmt"
                        ? "(∞)"
                        : `(max ${getMaxDurability(
                            (editInventoryItem.grade as ItemGrade) || "common"
                          )})`}
                    </label>
                    <input
                      type="number"
                      value={
                        editInventoryItem.grade === "agmt"
                          ? "∞"
                          : editInventoryItem.durability ??
                            getMaxDurability(
                              (editInventoryItem.grade as ItemGrade) || "common"
                            )
                      }
                      onChange={(e) =>
                        setEditInventoryItem({
                          ...editInventoryItem,
                          durability: Math.max(
                            0,
                            Math.min(
                              parseInt(e.target.value) || 0,
                              getMaxDurability(
                                (editInventoryItem.grade as ItemGrade) ||
                                  "common"
                              )
                            )
                          ),
                        })
                      }
                      disabled={editInventoryItem.grade === "agmt"}
                      placeholder="Durability"
                      className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white disabled:opacity-50"
                    />
                  </div>
                </div>
                <textarea
                  value={editInventoryItem.description || ""}
                  onChange={(e) =>
                    setEditInventoryItem({
                      ...editInventoryItem,
                      description: e.target.value,
                    })
                  }
                  placeholder="Description"
                  className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                  rows={3}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEditInventoryItem(index)}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEditInventoryItem}
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
              onDragStart={() => handleInventoryDragStart(index)}
              onDragOver={(e) => handleInventoryDragOver(e, index)}
              onDragEnd={handleInventoryDragEnd}
              className={`p-4 rounded-lg cursor-move flex items-center gap-3 ${
                draggedInventoryIndex === index ? "opacity-50" : ""
              }`}
              style={{
                backgroundColor: `${
                  GRADE_CONFIG[(item.grade as ItemGrade) || "common"].color
                }15`,
                borderWidth: 1,
                borderColor: `${
                  GRADE_CONFIG[(item.grade as ItemGrade) || "common"].color
                }30`,
              }}
            >
              <span className="text-gray-400 select-none">
                <DynamicIcon name="GripVertical" className="w-5 h-5" />
              </span>
              <div className="flex-1">
                <div className="font-medium text-white flex items-center gap-2">
                  <DynamicIcon
                    name={item.symbol}
                    className="w-5 h-5"
                    style={{
                      color:
                        GRADE_CONFIG[(item.grade as ItemGrade) || "common"]
                          .color,
                    }}
                  />
                  <span>
                    {item.name} x{item.quantity}
                  </span>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: `${
                        GRADE_CONFIG[(item.grade as ItemGrade) || "common"]
                          .color
                      }30`,
                      color:
                        GRADE_CONFIG[(item.grade as ItemGrade) || "common"]
                          .color,
                    }}
                  >
                    {GRADE_CONFIG[(item.grade as ItemGrade) || "common"].label}
                  </span>
                  {item.type && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
                      {item.type}
                    </span>
                  )}
                </div>
                <div className="text-sm text-blue-200/60">
                  {item.description}
                </div>
                {item.type !== "consumable" && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-blue-200/40">
                      Durability:
                    </span>
                    {item.grade === "agmt" ? (
                      <span className="text-xs text-yellow-400">∞</span>
                    ) : (
                      <>
                        <div className="w-20 h-1.5 bg-blue-900/50 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${
                                ((item.durability ??
                                  getMaxDurability(
                                    (item.grade as ItemGrade) || "common"
                                  )) /
                                  getMaxDurability(
                                    (item.grade as ItemGrade) || "common"
                                  )) *
                                100
                              }%`,
                              backgroundColor:
                                GRADE_CONFIG[
                                  (item.grade as ItemGrade) || "common"
                                ].color,
                            }}
                          />
                        </div>
                        <span className="text-xs text-blue-200/60">
                          {item.durability ??
                            getMaxDurability(
                              (item.grade as ItemGrade) || "common"
                            )}
                          /
                          {getMaxDurability(
                            (item.grade as ItemGrade) || "common"
                          )}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex gap-0.5">
                  <button
                    onClick={() => moveInventoryUp(index)}
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
                    onClick={() => moveInventoryDown(index)}
                    disabled={index === localInventory.length - 1}
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
                    onClick={() => startEditInventoryItem(index)}
                    className="w-7 h-7 sm:w-8 sm:h-8 bg-yellow-600 hover:bg-yellow-700 text-white rounded flex items-center justify-center"
                    title="Edit"
                  >
                    <DynamicIcon
                      name="Edit"
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                    />
                  </button>
                  <button
                    onClick={() => removeItem(index)}
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
          )
        )}
      </div>
    </div>
  );
}

// Abilities Editor
function AbilitiesEditor({
  abilities,
  resources,
  variables,
  rpgSystem,
  onUpdate,
}: {
  abilities: Ability[];
  resources: Resource[];
  variables: Variable[];
  rpgSystem: string;
  onUpdate: (abilities: Ability[]) => void;
}) {
  const [localAbilities, setLocalAbilities] = useState([...abilities]);
  const [draggedAbilityIndex, setDraggedAbilityIndex] = useState<number | null>(
    null
  );
  const [editingAbilityIndex, setEditingAbilityIndex] = useState<number | null>(
    null
  );
  const [editAbility, setEditAbility] = useState<Partial<Ability>>({});
  const [editCosts, setEditCosts] = useState<AbilityCost[]>([]);

  const system = getRPGSystem((rpgSystem || "3d6") as RPGSystemType);

  // Drag-and-drop handlers
  const handleDragStart = (index: number) => {
    setDraggedAbilityIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedAbilityIndex === null || draggedAbilityIndex === index) return;

    const items = [...localAbilities];
    const draggedItem = items[draggedAbilityIndex];
    items.splice(draggedAbilityIndex, 1);
    items.splice(index, 0, draggedItem);

    setLocalAbilities(items);
    setDraggedAbilityIndex(index);
    onUpdate(items);
  };

  const handleDragEnd = () => {
    setDraggedAbilityIndex(null);
  };

  // Arrow button handlers
  const moveUp = (index: number) => {
    if (index === 0) return;
    const items = [...localAbilities];
    [items[index - 1], items[index]] = [items[index], items[index - 1]];
    setLocalAbilities(items);
    onUpdate(items);
  };

  const moveDown = (index: number) => {
    if (index === localAbilities.length - 1) return;
    const items = [...localAbilities];
    [items[index], items[index + 1]] = [items[index + 1], items[index]];
    setLocalAbilities(items);
    onUpdate(items);
  };

  // Edit mode handlers
  const startEdit = (index: number) => {
    setEditingAbilityIndex(index);
    setEditAbility({ ...localAbilities[index] });
    setEditCosts([...(localAbilities[index].cost || [])]);
  };

  const cancelEdit = () => {
    setEditingAbilityIndex(null);
    setEditAbility({});
    setEditCosts([]);
  };

  const saveEdit = (index: number) => {
    const items = [...localAbilities];
    items[index] = { ...items[index], ...editAbility, cost: editCosts };
    setLocalAbilities(items);
    onUpdate(items);
    setEditingAbilityIndex(null);
    setEditAbility({});
    setEditCosts([]);
  };

  const addAbility = () => {
    const newAbility = initializeAbility({
      name: "New Ability",
      description: "",
      grade: "novice",
      cost: [],
      cooldown: 0,
      currentCooldown: 0,
    });
    const updated = [...localAbilities, newAbility];
    setLocalAbilities(updated);
    onUpdate(updated);
  };

  const removeAbility = (index: number) => {
    const updated = localAbilities.filter((_, i) => i !== index);
    setLocalAbilities(updated);
    onUpdate(updated);
  };

  // Cost management
  const addCost = () => {
    setEditCosts([...editCosts, { type: "resource", name: "", amount: 1 }]);
  };

  const updateCost = (
    costIndex: number,
    field: keyof AbilityCost,
    value: any
  ) => {
    const updated = [...editCosts];
    (updated[costIndex] as any)[field] = value;
    setEditCosts(updated);
  };

  const removeCost = (costIndex: number) => {
    setEditCosts(editCosts.filter((_, i) => i !== costIndex));
  };

  // Get available resource/variable names for cost dropdown
  const resourceNames = resources.map((r) => r.name);
  const numberVariableNames = variables
    .filter((v) => v.type === "number")
    .map((v) => v.name);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-bold text-white flex items-center gap-2">
          <DynamicIcon name="Sparkles" className="w-6 h-6" /> Abilities (
          {localAbilities.length})
        </h4>
        <button
          onClick={addAbility}
          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg"
        >
          + Add Ability
        </button>
      </div>
      <div className="space-y-3">
        {localAbilities.map((ability, index) =>
          editingAbilityIndex === index ? (
            <div
              key={index}
              className="p-4 bg-purple-100 dark:bg-purple-900/40 border-2 border-purple-400 rounded-lg"
            >
              <div className="space-y-3">
                <input
                  type="text"
                  value={editAbility.name || ""}
                  onChange={(e) =>
                    setEditAbility({ ...editAbility, name: e.target.value })
                  }
                  placeholder="Ability name"
                  className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                />
                <div className="relative z-50">
                  <IconPicker
                    value={editAbility.symbol || "Sparkles"}
                    onChange={(icon) =>
                      setEditAbility({ ...editAbility, symbol: icon })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-blue-200/60 mb-1">
                      Grade
                    </label>
                    <select
                      value={editAbility.grade || "novice"}
                      onChange={(e) =>
                        setEditAbility({
                          ...editAbility,
                          grade: e.target.value as AbilityGrade,
                        })
                      }
                      className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                      style={{
                        color:
                          ABILITY_GRADE_CONFIG[
                            (editAbility.grade as AbilityGrade) || "novice"
                          ].color,
                      }}
                    >
                      {ABILITY_GRADE_ORDER.map((g) => (
                        <option
                          key={g}
                          value={g}
                          style={{ color: ABILITY_GRADE_CONFIG[g].color }}
                        >
                          {ABILITY_GRADE_CONFIG[g].label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-blue-200/60 mb-1">
                      Cooldown (turns)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editAbility.cooldown ?? 0}
                      onChange={(e) =>
                        setEditAbility({
                          ...editAbility,
                          cooldown: parseInt(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-blue-200/60 mb-1">
                    Associated Stat (optional)
                  </label>
                  <input
                    type="text"
                    value={editAbility.stat || ""}
                    onChange={(e) =>
                      setEditAbility({
                        ...editAbility,
                        stat: e.target.value || undefined,
                      })
                    }
                    placeholder="e.g., Strength, Magic, etc."
                    className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                  />
                </div>
                <textarea
                  value={editAbility.description || ""}
                  onChange={(e) =>
                    setEditAbility({
                      ...editAbility,
                      description: e.target.value,
                    })
                  }
                  placeholder="Description"
                  className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                  rows={2}
                />

                {/* Costs Section */}
                <div className="border-t border-blue-700/30 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-blue-200/80">
                      Costs
                    </label>
                    <button
                      onClick={addCost}
                      className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded"
                    >
                      + Add Cost
                    </button>
                  </div>
                  {editCosts.length === 0 ? (
                    <p className="text-xs text-blue-200/40 italic">
                      No costs (free ability)
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {editCosts.map((cost, costIndex) => (
                        <div
                          key={costIndex}
                          className="flex items-center gap-2 p-2 bg-blue-950/30 rounded"
                        >
                          <select
                            value={cost.type}
                            onChange={(e) =>
                              updateCost(costIndex, "type", e.target.value)
                            }
                            className="px-2 py-1 bg-blue-950/50 border border-blue-700/40 rounded text-white text-sm"
                          >
                            <option value="resource">Resource</option>
                            <option value="variable">Variable</option>
                          </select>
                          <select
                            value={cost.name}
                            onChange={(e) =>
                              updateCost(costIndex, "name", e.target.value)
                            }
                            className="flex-1 px-2 py-1 bg-blue-950/50 border border-blue-700/40 rounded text-white text-sm"
                          >
                            <option value="">Select...</option>
                            {cost.type === "resource"
                              ? resourceNames.map((name) => (
                                  <option key={name} value={name}>
                                    {name}
                                  </option>
                                ))
                              : numberVariableNames.map((name) => (
                                  <option key={name} value={name}>
                                    {name}
                                  </option>
                                ))}
                          </select>
                          <input
                            type="number"
                            min="1"
                            value={cost.amount}
                            onChange={(e) =>
                              updateCost(
                                costIndex,
                                "amount",
                                parseInt(e.target.value) || 1
                              )
                            }
                            className="w-16 px-2 py-1 bg-blue-950/50 border border-blue-700/40 rounded text-white text-sm"
                          />
                          <button
                            onClick={() => removeCost(costIndex)}
                            className="p-1 text-red-400 hover:text-red-300"
                          >
                            <DynamicIcon name="X" className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(index)}
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
            </div>
          ) : (
            <div
              key={index}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={`p-4 rounded-lg cursor-move flex items-center gap-3 ${
                draggedAbilityIndex === index ? "opacity-50" : ""
              } ${(ability.currentCooldown ?? 0) > 0 ? "opacity-60" : ""}`}
              style={{
                backgroundColor: `${
                  ABILITY_GRADE_CONFIG[ability.grade || "novice"].color
                }15`,
                borderWidth: 1,
                borderColor: `${
                  ABILITY_GRADE_CONFIG[ability.grade || "novice"].color
                }30`,
              }}
            >
              <span className="text-gray-400 select-none">
                <DynamicIcon name="GripVertical" className="w-5 h-5" />
              </span>
              <div className="flex-1">
                <div className="font-medium text-white flex items-center gap-2">
                  <DynamicIcon
                    name={ability.symbol || "Sparkles"}
                    className="w-5 h-5"
                    style={{
                      color:
                        ABILITY_GRADE_CONFIG[ability.grade || "novice"].color,
                    }}
                  />
                  <span>{ability.name}</span>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: `${
                        ABILITY_GRADE_CONFIG[ability.grade || "novice"].color
                      }30`,
                      color:
                        ABILITY_GRADE_CONFIG[ability.grade || "novice"].color,
                    }}
                  >
                    {ABILITY_GRADE_CONFIG[ability.grade || "novice"].label}
                  </span>
                  {ability.stat && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">
                      {ability.stat}
                    </span>
                  )}
                  {getAbilityBonus(ability, system.id) > 0 && (
                    <span
                      className="text-xs font-bold"
                      style={{
                        color:
                          ABILITY_GRADE_CONFIG[ability.grade || "novice"].color,
                      }}
                    >
                      +{getAbilityBonus(ability, system.id)}
                    </span>
                  )}
                </div>
                <div className="text-sm text-blue-200/60">
                  {ability.description}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {ability.cost && ability.cost.length > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">
                      Cost: {formatAbilityCost(ability.cost)}
                    </span>
                  )}
                  {ability.cooldown && ability.cooldown > 0 && (
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        (ability.currentCooldown ?? 0) > 0
                          ? "bg-orange-500/20 text-orange-300"
                          : "bg-green-500/20 text-green-300"
                      }`}
                    >
                      {(ability.currentCooldown ?? 0) > 0
                        ? `⏳ ${ability.currentCooldown} turns`
                        : `CD: ${ability.cooldown} turns`}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex gap-0.5">
                  <button
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded flex items-center justify-center ${
                      index === 0
                        ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    }`}
                    title="Move Up"
                  >
                    <DynamicIcon
                      name="ChevronUp"
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                    />
                  </button>
                  <button
                    onClick={() => moveDown(index)}
                    disabled={index === localAbilities.length - 1}
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded flex items-center justify-center ${
                      index === localAbilities.length - 1
                        ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    }`}
                    title="Move Down"
                  >
                    <DynamicIcon
                      name="ChevronDown"
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                    />
                  </button>
                </div>
                <button
                  onClick={() => startEdit(index)}
                  className="w-7 h-7 sm:w-8 sm:h-8 bg-yellow-600 hover:bg-yellow-700 text-white rounded flex items-center justify-center"
                  title="Edit"
                >
                  <DynamicIcon
                    name="Edit"
                    className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                  />
                </button>
                <button
                  onClick={() => removeAbility(index)}
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
          )
        )}
      </div>
    </div>
  );
}

// Passives Editor - Edit passive effects directly
function PassivesEditor({
  passives,
  onUpdate,
}: {
  passives: { name: string; description: string; nodeId: string }[];
  onUpdate: (
    passives: { name: string; description: string; nodeId: string }[]
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
function LoreEditor({
  lore,
  variables,
  onUpdate,
}: {
  lore: StoryLore[];
  variables: Variable[];
  onUpdate: (lore: StoryLore[]) => void;
}) {
  const [localLore, setLocalLore] = useState([...lore]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [draggedLoreIndex, setDraggedLoreIndex] = useState<number | null>(null);
  const [editingLoreIndex, setEditingLoreIndex] = useState<number | null>(null);
  const [editLore, setEditLore] = useState<Partial<StoryLore>>({});
  const [editLoreAdvancedExpanded, setEditLoreAdvancedExpanded] =
    useState(false);
  const [editLoreTag, setEditLoreTag] = useState("");
  const { addNotification } = useNotification();

  // Drag-and-drop handlers for lore
  const handleLoreDragStart = (index: number) => {
    setDraggedLoreIndex(index);
  };

  const handleLoreDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedLoreIndex === null || draggedLoreIndex === index) return;

    const items = [...localLore];
    const draggedItem = items[draggedLoreIndex];
    items.splice(draggedLoreIndex, 1);
    items.splice(index, 0, draggedItem);

    setLocalLore(items);
    setDraggedLoreIndex(index);
    onUpdate(items);
  };

  const handleLoreDragEnd = () => {
    setDraggedLoreIndex(null);
  };

  // Arrow button handlers for lore
  const moveLoreUp = (index: number) => {
    if (index === 0) return;
    const items = [...localLore];
    [items[index - 1], items[index]] = [items[index], items[index - 1]];
    setLocalLore(items);
    onUpdate(items);
  };

  const moveLoreDown = (index: number) => {
    if (index === localLore.length - 1) return;
    const items = [...localLore];
    [items[index], items[index + 1]] = [items[index + 1], items[index]];
    setLocalLore(items);
    onUpdate(items);
  };

  // Edit mode handlers for lore
  const startEditLore = (index: number) => {
    setEditingLoreIndex(index);
    setEditLore({ ...localLore[index] });
  };

  const cancelEditLore = () => {
    setEditingLoreIndex(null);
    setEditLore({});
  };

  const saveEditLore = (index: number) => {
    const items = [...localLore];
    const original = items[index];
    // Check if content or title changed - mark as needing re-embedding
    const contentChanged =
      (editLore.content !== undefined &&
        editLore.content !== original.content) ||
      (editLore.title !== undefined && editLore.title !== original.title);
    items[index] = {
      ...items[index],
      ...editLore,
      ...(contentChanged ? { embedded: false } : {}),
    };
    setLocalLore(items);
    onUpdate(items);
    setEditingLoreIndex(null);
    setEditLore({});
  };

  const updateLore = (index: number, field: keyof StoryLore, value: any) => {
    const updated = [...localLore];
    (updated[index] as any)[field] = value;
    // Mark as needing re-embedding if content or title changed
    if (field === "content" || field === "title") {
      updated[index].embedded = false;
    }
    setLocalLore(updated);
    onUpdate(updated);
  };

  const addLore = () => {
    const newLore: StoryLore = {
      title: "New Lore Entry",
      content: "",
      relatedCharacters: [],
      relatedLocations: [],
      secrtet: false,
      keys: [],
      thumbnailUrl: "",
      on: true,
      alwaysOn: false,
      on_triggers: [],
      off_triggers: [],
      trigger_lores: [],
      untrigger_lores: [],
      embedded: false, // Mark new entries for embedding
      tags: [],
      folder: "",
    };
    const updated = [...localLore, newLore];
    setLocalLore(updated);
    onUpdate(updated);
  };

  const removeLore = (index: number) => {
    const updated = localLore.filter((_, i) => i !== index);
    setLocalLore(updated);
    onUpdate(updated);
  };

  const handleLoreThumbnailUpload = async (index: number, file: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      addNotification("Please select an image file", "warning");
      return;
    }
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        addNotification("Not authenticated", "failure");
        return;
      }

      const compressed = await compressImage(file, 320, 180, 0.8);

      const ext = file.name.split(".").pop();
      const fileName = `${Date.now()}-lore-thumb.${ext}`;
      const filePath = `${session.user.id}/lore-thumbnails/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("adventure-images")
        .upload(filePath, compressed, { cacheControl: "3600", upsert: false });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("adventure-images")
        .getPublicUrl(filePath);

      const updated = [...localLore];
      updated[index] = { ...updated[index], thumbnailUrl: data.publicUrl };
      setLocalLore(updated);
      onUpdate(updated);
      addNotification("Thumbnail uploaded!", "success");
    } catch (err: any) {
      console.error("Lore thumbnail upload failed:", err);
      addNotification(err.message || "Upload failed", "failure");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
          <DynamicIcon name="Book" className="w-6 h-6" /> Lore Entries (
          {localLore.length})
        </h4>
        <button
          onClick={addLore}
          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg"
        >
          + Add Lore
        </button>
      </div>
      <div className="space-y-3">
        {localLore.map((loreItem, index) =>
          editingLoreIndex === index ? (
            <div
              key={index}
              className="p-4 bg-blue-100 dark:bg-blue-900/40 border-2 border-blue-400 rounded-lg"
            >
              <div className="space-y-3">
                <input
                  type="text"
                  value={editLore.title || ""}
                  onChange={(e) =>
                    setEditLore({ ...editLore, title: e.target.value })
                  }
                  placeholder="Lore title"
                  className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white font-semibold"
                />
                <textarea
                  value={editLore.content || ""}
                  onChange={(e) =>
                    setEditLore({ ...editLore, content: e.target.value })
                  }
                  placeholder="Lore content (supports Markdown)"
                  className="w-full h-32 px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white resize-none"
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold text-blue-200 mb-2">
                      Thumbnail URL (optional)
                    </label>
                    <input
                      type="url"
                      value={editLore.thumbnailUrl || ""}
                      onChange={(e) =>
                        setEditLore({
                          ...editLore,
                          thumbnailUrl: e.target.value,
                        })
                      }
                      placeholder="https://..."
                      className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                    />
                    <p className="mt-1 text-xs text-blue-300/50">
                      Shown in lore list and detail if provided (ideal
                      ~320x180px, max 5MB).
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        id={`upload-lore-thumb-edit-${index}`}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleLoreThumbnailUpload(index, f);
                        }}
                      />
                      <label
                        htmlFor={`upload-lore-thumb-edit-${index}`}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded cursor-pointer text-sm"
                      >
                        <DynamicIcon
                          name="Upload"
                          className="inline-block w-4 h-4 mr-1"
                        />
                        Upload Thumbnail
                      </label>
                      {editLore.thumbnailUrl && (
                        <button
                          onClick={() =>
                            setEditLore({ ...editLore, thumbnailUrl: "" })
                          }
                          className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-center">
                    {editLore.thumbnailUrl ? (
                      <img
                        src={editLore.thumbnailUrl}
                        alt={editLore.title || ""}
                        className="w-24 h-24 object-cover rounded border border-blue-700/40"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded border-2 border-dashed border-blue-700/40 flex items-center justify-center text-xs text-blue-300/50">
                        No Preview
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-blue-200">
                    <input
                      type="checkbox"
                      checked={editLore.secrtet ?? false}
                      onChange={(e) =>
                        setEditLore({ ...editLore, secrtet: e.target.checked })
                      }
                      className="rounded"
                    />
                    <span>
                      <DynamicIcon
                        name="Lock"
                        className="inline-block w-3 h-3 mr-1"
                      />
                      Secret Lore (hidden until discovered)
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-blue-200">
                    <input
                      type="checkbox"
                      checked={editLore.on !== false}
                      onChange={(e) =>
                        setEditLore({ ...editLore, on: e.target.checked })
                      }
                      className="rounded"
                    />
                    <span>
                      <DynamicIcon
                        name="CheckCircle"
                        className="inline-block w-4 h-4 mr-1 text-green-600"
                      />
                      Enabled
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-blue-200">
                    <input
                      type="checkbox"
                      checked={!!editLore.alwaysOn}
                      onChange={(e) =>
                        setEditLore({ ...editLore, alwaysOn: e.target.checked })
                      }
                      className="rounded"
                    />
                    <span>
                      <DynamicIcon
                        name="Circle"
                        className="inline-block w-4 h-4 mr-1 text-blue-500"
                      />
                      Always On
                    </span>
                  </label>
                </div>

                {/* Folder and Tags for organization */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-blue-200 mb-2">
                      <DynamicIcon
                        name="Folder"
                        className="inline-block w-4 h-4 mr-1 text-yellow-500"
                      />
                      Folder
                    </label>
                    <input
                      type="text"
                      value={editLore.folder || ""}
                      onChange={(e) =>
                        setEditLore({ ...editLore, folder: e.target.value })
                      }
                      placeholder="e.g., Characters, Locations..."
                      list="lore-folders-list"
                      className="w-full px-3 py-2 text-sm bg-blue-950/50 border border-blue-700/40 rounded text-white"
                    />
                    <datalist id="lore-folders-list">
                      {[
                        ...new Set(
                          localLore.map((l) => l.folder).filter(Boolean)
                        ),
                      ].map((folder) => (
                        <option key={folder} value={folder} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-blue-200 mb-2">
                      <DynamicIcon
                        name="Tag"
                        className="inline-block w-4 h-4 mr-1 text-purple-400"
                      />
                      Tags
                    </label>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editLoreTag}
                          onChange={(e) => setEditLoreTag(e.target.value)}
                          placeholder="Add tag..."
                          list="lore-tags-list"
                          className="flex-1 px-3 py-2 text-sm bg-blue-950/50 border border-blue-700/40 rounded text-white"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const tag = editLoreTag.trim();
                              if (tag && !(editLore.tags || []).includes(tag)) {
                                setEditLore({
                                  ...editLore,
                                  tags: [...(editLore.tags || []), tag],
                                });
                                setEditLoreTag("");
                              }
                            }
                          }}
                        />
                        <datalist id="lore-tags-list">
                          {[
                            ...new Set(localLore.flatMap((l) => l.tags || [])),
                          ].map((tag) => (
                            <option key={tag} value={tag} />
                          ))}
                        </datalist>
                        <button
                          onClick={() => {
                            const tag = editLoreTag.trim();
                            if (tag && !(editLore.tags || []).includes(tag)) {
                              setEditLore({
                                ...editLore,
                                tags: [...(editLore.tags || []), tag],
                              });
                              setEditLoreTag("");
                            }
                          }}
                          className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded"
                        >
                          Add
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(editLore.tags || []).map((tag, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-1 bg-purple-900/30 text-purple-300 rounded-full text-xs flex items-center gap-1"
                          >
                            <DynamicIcon name="Tag" className="w-3 h-3" />
                            {tag}
                            <button
                              onClick={() =>
                                setEditLore({
                                  ...editLore,
                                  tags: (editLore.tags || []).filter(
                                    (_, i) => i !== idx
                                  ),
                                })
                              }
                              className="hover:text-purple-100"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ON/OFF Trigger Words */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-blue-200 mb-2">
                      <DynamicIcon
                        name="CheckCircle"
                        className="inline-block w-4 h-4 mr-1 text-green-600"
                      />
                      ON Trigger Words
                    </label>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="e.g., Found the Ancient Map"
                          className="flex-1 px-3 py-2 text-sm bg-blue-950/50 border border-blue-700/40 rounded text-white"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const input = e.currentTarget;
                              const value = input.value.trim();
                              if (
                                value &&
                                !(editLore.on_triggers || []).includes(value)
                              ) {
                                setEditLore({
                                  ...editLore,
                                  on_triggers: [
                                    ...(editLore.on_triggers || []),
                                    value,
                                  ],
                                });
                                input.value = "";
                              }
                            }
                          }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(editLore.on_triggers || []).map((trigger, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs flex items-center gap-1"
                          >
                            <DynamicIcon
                              name="CheckCircle"
                              className="w-3 h-3"
                            />
                            {trigger}
                            <button
                              onClick={() =>
                                setEditLore({
                                  ...editLore,
                                  on_triggers: (
                                    editLore.on_triggers || []
                                  ).filter((_, i) => i !== idx),
                                })
                              }
                              className="hover:text-green-900 dark:hover:text-green-100"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-blue-200 mb-2">
                      <DynamicIcon
                        name="XCircle"
                        className="inline-block w-4 h-4 mr-1 text-red-600"
                      />
                      OFF Trigger Words
                    </label>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="e.g., Destroyed the Map"
                          className="flex-1 px-3 py-2 text-sm bg-blue-950/50 border border-blue-700/40 rounded text-white"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const input = e.currentTarget;
                              const value = input.value.trim();
                              if (
                                value &&
                                !(editLore.off_triggers || []).includes(value)
                              ) {
                                setEditLore({
                                  ...editLore,
                                  off_triggers: [
                                    ...(editLore.off_triggers || []),
                                    value,
                                  ],
                                });
                                input.value = "";
                              }
                            }
                          }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(editLore.off_triggers || []).map((trigger, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full text-xs flex items-center gap-1"
                          >
                            <DynamicIcon name="XCircle" className="w-3 h-3" />
                            {trigger}
                            <button
                              onClick={() =>
                                setEditLore({
                                  ...editLore,
                                  off_triggers: (
                                    editLore.off_triggers || []
                                  ).filter((_, i) => i !== idx),
                                })
                              }
                              className="hover:text-red-900 dark:hover:text-red-100"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Advanced Triggers Section (Expandable) */}
                <div className="border border-blue-700/40 rounded-lg">
                  <button
                    onClick={() =>
                      setEditLoreAdvancedExpanded(!editLoreAdvancedExpanded)
                    }
                    className="w-full px-4 py-3 flex items-center justify-between bg-blue-900/20 hover:bg-gray-800 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <span className="text-sm font-semibold text-blue-200">
                      <DynamicIcon
                        name="Settings"
                        className="inline-block w-4 h-4 mr-1"
                      />
                      Advanced Section
                    </span>
                    <span className="text-blue-300/50">
                      {editLoreAdvancedExpanded ? (
                        <DynamicIcon name="ChevronDown" className="w-4 h-4" />
                      ) : (
                        <DynamicIcon name="ChevronRight" className="w-4 h-4" />
                      )}
                    </span>
                  </button>

                  {editLoreAdvancedExpanded && (
                    <div className="p-4 space-y-4">
                      {/* Lore-based Triggers */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-blue-200 mb-2">
                            <DynamicIcon
                              name="CheckCircle"
                              className="inline-block w-4 h-4 mr-1 text-green-600"
                            />
                            Lores that turn this ON
                          </label>
                          <div className="max-h-40 overflow-y-auto border border-blue-700/40 rounded-lg p-2 bg-blue-900/30">
                            {localLore.filter((_, i) => i !== index).length ===
                            0 ? (
                              <p className="text-xs text-blue-300/50 italic">
                                No other lore entries.
                              </p>
                            ) : (
                              localLore
                                .filter((_, i) => i !== index)
                                .map((loreEntry, loreIdx) => (
                                  <label
                                    key={loreIdx}
                                    className="flex items-center gap-2 px-2 py-1 hover:bg-blue-800/50 rounded cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={(
                                        editLore.trigger_lores || []
                                      ).includes(loreEntry.title)}
                                      onChange={(e) => {
                                        const current =
                                          editLore.trigger_lores || [];
                                        setEditLore({
                                          ...editLore,
                                          trigger_lores: e.target.checked
                                            ? [...current, loreEntry.title]
                                            : current.filter(
                                                (t) => t !== loreEntry.title
                                              ),
                                        });
                                      }}
                                      className="w-4 h-4 text-green-600 rounded"
                                    />
                                    <span className="text-xs text-white">
                                      {loreEntry.title}
                                    </span>
                                  </label>
                                ))
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-blue-200 mb-2">
                            <DynamicIcon
                              name="XCircle"
                              className="inline-block w-4 h-4 mr-1 text-red-600"
                            />
                            Lores that turn this OFF
                          </label>
                          <div className="max-h-40 overflow-y-auto border border-blue-700/40 rounded-lg p-2 bg-blue-900/30">
                            {localLore.filter((_, i) => i !== index).length ===
                            0 ? (
                              <p className="text-xs text-blue-300/50 italic">
                                No other lore entries.
                              </p>
                            ) : (
                              localLore
                                .filter((_, i) => i !== index)
                                .map((loreEntry, loreIdx) => (
                                  <label
                                    key={loreIdx}
                                    className="flex items-center gap-2 px-2 py-1 hover:bg-blue-800/50 rounded cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={(
                                        editLore.untrigger_lores || []
                                      ).includes(loreEntry.title)}
                                      onChange={(e) => {
                                        const current =
                                          editLore.untrigger_lores || [];
                                        setEditLore({
                                          ...editLore,
                                          untrigger_lores: e.target.checked
                                            ? [...current, loreEntry.title]
                                            : current.filter(
                                                (t) => t !== loreEntry.title
                                              ),
                                        });
                                      }}
                                      className="w-4 h-4 text-red-600 rounded"
                                    />
                                    <span className="text-xs text-white">
                                      {loreEntry.title}
                                    </span>
                                  </label>
                                ))
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Variable Triggers (Boolean) */}
                      {variables.filter((v) => v.type === "boolean").length >
                        0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                          <div>
                            <label className="block text-sm font-semibold text-blue-200 mb-2">
                              <DynamicIcon
                                name="ToggleRight"
                                className="inline-block w-4 h-4 mr-1 text-cyan-500"
                              />
                              Variables that turn this ON (when true)
                            </label>
                            <div className="max-h-40 overflow-y-auto border border-blue-700/40 rounded-lg p-2 bg-blue-900/30">
                              {variables
                                .filter((v) => v.type === "boolean")
                                .map((variable) => (
                                  <label
                                    key={variable.id}
                                    className="flex items-center gap-2 px-2 py-1 hover:bg-blue-800/50 rounded cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={(
                                        editLore.var_on_triggers || []
                                      ).includes(variable.name)}
                                      onChange={(e) => {
                                        const current =
                                          editLore.var_on_triggers || [];
                                        setEditLore({
                                          ...editLore,
                                          var_on_triggers: e.target.checked
                                            ? [...current, variable.name]
                                            : current.filter(
                                                (n) => n !== variable.name
                                              ),
                                        });
                                      }}
                                      className="w-4 h-4 text-cyan-600 rounded"
                                    />
                                    <span className="text-xs text-white">
                                      {variable.name}
                                    </span>
                                  </label>
                                ))}
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-blue-200 mb-2">
                              <DynamicIcon
                                name="ToggleLeft"
                                className="inline-block w-4 h-4 mr-1 text-orange-500"
                              />
                              Variables that turn this OFF (when true)
                            </label>
                            <div className="max-h-40 overflow-y-auto border border-blue-700/40 rounded-lg p-2 bg-blue-900/30">
                              {variables
                                .filter((v) => v.type === "boolean")
                                .map((variable) => (
                                  <label
                                    key={variable.id}
                                    className="flex items-center gap-2 px-2 py-1 hover:bg-blue-800/50 rounded cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={(
                                        editLore.var_off_triggers || []
                                      ).includes(variable.name)}
                                      onChange={(e) => {
                                        const current =
                                          editLore.var_off_triggers || [];
                                        setEditLore({
                                          ...editLore,
                                          var_off_triggers: e.target.checked
                                            ? [...current, variable.name]
                                            : current.filter(
                                                (n) => n !== variable.name
                                              ),
                                        });
                                      }}
                                      className="w-4 h-4 text-orange-600 rounded"
                                    />
                                    <span className="text-xs text-white">
                                      {variable.name}
                                    </span>
                                  </label>
                                ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => saveEditLore(index)}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEditLore}
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
              onDragStart={() => handleLoreDragStart(index)}
              onDragOver={(e) => handleLoreDragOver(e, index)}
              onDragEnd={handleLoreDragEnd}
              className={`p-3 sm:p-4 bg-blue-900/20 rounded-lg cursor-move ${
                draggedLoreIndex === index ? "opacity-50" : ""
              }`}
            >
              <div className="flex items-start gap-2 sm:gap-3">
                <span className="text-gray-400 select-none mt-1">
                  <DynamicIcon
                    name="GripVertical"
                    className="w-4 h-4 sm:w-5 sm:h-5"
                  />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white flex items-center gap-2">
                    {loreItem.secrtet && (
                      <DynamicIcon
                        name="Lock"
                        className="w-4 h-4 text-gray-500"
                      />
                    )}
                    {loreItem.title}
                    {/* On/Off Toggle */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const updated = [...localLore];
                        updated[index] = { ...loreItem, on: !loreItem.on };
                        setLocalLore(updated);
                        onUpdate(updated);
                      }}
                      className={`px-2 py-1 rounded-full text-xs font-semibold transition-colors ${
                        loreItem.on
                          ? "bg-green-600 text-white hover:bg-green-700"
                          : "bg-gray-400 text-white hover:bg-gray-500"
                      }`}
                      title={
                        loreItem.on ? "Lore is enabled" : "Lore is disabled"
                      }
                    >
                      {loreItem.on ? "ON" : "OFF"}
                    </button>
                  </div>
                  {loreItem.thumbnailUrl && (
                    <img
                      src={loreItem.thumbnailUrl}
                      alt={loreItem.title}
                      className="mt-2 w-20 h-20 object-cover rounded border border-blue-700/40"
                    />
                  )}
                  <div className="text-sm text-blue-200/60 mt-1 line-clamp-2">
                    {loreItem.content}
                  </div>
                  {loreItem.on_triggers && loreItem.on_triggers.length > 0 && (
                    <div className="text-xs text-green-700 dark:text-green-400 mt-1 flex items-center gap-1">
                      <strong className="flex items-center gap-1">
                        <DynamicIcon name="CheckCircle" className="w-3 h-3" />{" "}
                        ON Triggers:
                      </strong>{" "}
                      {loreItem.on_triggers.join(", ")}
                    </div>
                  )}
                  {loreItem.off_triggers &&
                    loreItem.off_triggers.length > 0 && (
                      <div className="text-xs text-red-700 dark:text-red-400 mt-1 flex items-center gap-1">
                        <strong className="flex items-center gap-1">
                          <DynamicIcon name="XCircle" className="w-3 h-3" /> OFF
                          Triggers:
                        </strong>{" "}
                        {loreItem.off_triggers.join(", ")}
                      </div>
                    )}
                  {loreItem.var_on_triggers &&
                    loreItem.var_on_triggers.length > 0 && (
                      <div className="text-xs text-cyan-700 dark:text-cyan-400 mt-1 flex items-center gap-1">
                        <strong className="flex items-center gap-1">
                          <DynamicIcon name="ToggleRight" className="w-3 h-3" />{" "}
                          Vars turning ON:
                        </strong>{" "}
                        {loreItem.var_on_triggers.join(", ")}
                      </div>
                    )}
                  {loreItem.var_off_triggers &&
                    loreItem.var_off_triggers.length > 0 && (
                      <div className="text-xs text-orange-700 dark:text-orange-400 mt-1 flex items-center gap-1">
                        <strong className="flex items-center gap-1">
                          <DynamicIcon name="ToggleLeft" className="w-3 h-3" />{" "}
                          Vars turning OFF:
                        </strong>{" "}
                        {loreItem.var_off_triggers.join(", ")}
                      </div>
                    )}
                </div>
                {/* Controls - inline on desktop, wrap on mobile */}
                <div className="flex items-center gap-1.5 sm:gap-2 mt-2 sm:mt-0 flex-wrap sm:flex-nowrap">
                  <div className="flex gap-0.5">
                    <button
                      onClick={() => moveLoreUp(index)}
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
                      onClick={() => moveLoreDown(index)}
                      disabled={index === localLore.length - 1}
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
                      onClick={() => startEditLore(index)}
                      className="w-7 h-7 sm:w-8 sm:h-8 bg-yellow-600 hover:bg-yellow-700 text-white rounded flex items-center justify-center"
                      title="Edit"
                    >
                      <DynamicIcon
                        name="Edit"
                        className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                      />
                    </button>
                    <button
                      onClick={() => removeLore(index)}
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
          )
        )}
      </div>
    </div>
  );
}

// Relationships Editor
function RelationshipsEditor({
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
          )
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

// Variables Editor
function VariablesEditor({
  variables,
  onUpdate,
}: {
  variables: Variable[];
  onUpdate: (variables: Variable[]) => void;
}) {
  const { addNotification } = useNotification();
  const [localVariables, setLocalVariables] = useState<Variable[]>([
    ...variables,
  ]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editVariable, setEditVariable] = useState<Partial<Variable>>({});
  const [newItemInput, setNewItemInput] = useState<string>("");

  const addVariable = (type: "number" | "boolean" | "string" | "list") => {
    const id = crypto.randomUUID();
    let newVar: Variable;

    switch (type) {
      case "number":
        newVar = {
          id,
          name: "New Number",
          description: "",
          type: "number",
          value: 0,
        };
        break;
      case "boolean":
        newVar = {
          id,
          name: "New Flag",
          description: "",
          type: "boolean",
          value: false,
        };
        break;
      case "string":
        newVar = {
          id,
          name: "New Text",
          description: "",
          type: "string",
          value: "",
        };
        break;
      case "list":
        newVar = {
          id,
          name: "New List",
          description: "",
          type: "list",
          items: [],
        };
        break;
    }

    const updated = [...localVariables, newVar];
    setLocalVariables(updated);
    onUpdate(updated);
  };

  const removeVariable = (index: number) => {
    const updated = localVariables.filter((_, i) => i !== index);
    setLocalVariables(updated);
    onUpdate(updated);
  };

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setEditVariable({ ...localVariables[index] });
    setNewItemInput("");
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditVariable({});
    setNewItemInput("");
  };

  const saveEdit = () => {
    if (editingIndex !== null && editVariable.name) {
      const updated = [...localVariables];
      updated[editingIndex] = editVariable as Variable;
      setLocalVariables(updated);
      onUpdate(updated);
      setEditingIndex(null);
      setEditVariable({});
      setNewItemInput("");
      addNotification("Variable updated!", "success");
    }
  };

  const addListItem = () => {
    if (editVariable.type === "list" && newItemInput.trim()) {
      const listVar = editVariable as Partial<ListVariable>;
      const currentItems = listVar.items || [];
      if (listVar.maxSize && currentItems.length >= listVar.maxSize) {
        addNotification(`Maximum ${listVar.maxSize} items allowed`, "warning");
        return;
      }
      setEditVariable({
        ...editVariable,
        items: [...currentItems, newItemInput.trim()],
      });
      setNewItemInput("");
    }
  };

  const removeListItem = (itemIndex: number) => {
    if (editVariable.type === "list") {
      const listVar = editVariable as Partial<ListVariable>;
      setEditVariable({
        ...editVariable,
        items: (listVar.items || []).filter((_, i) => i !== itemIndex),
      });
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "number":
        return "Hash";
      case "boolean":
        return "ToggleLeft";
      case "string":
        return "Type";
      case "list":
        return "List";
      default:
        return "Variable";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "number":
        return "cyan";
      case "boolean":
        return "emerald";
      case "string":
        return "amber";
      case "list":
        return "violet";
      default:
        return "blue";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-lg font-bold text-white flex items-center gap-2">
          <DynamicIcon name="Variable" className="w-6 h-6" /> Variables (
          {localVariables.length})
        </h4>
        <div className="flex gap-2">
          <button
            onClick={() => addVariable("number")}
            className="px-3 py-1 bg-cyan-600 hover:bg-cyan-700 text-white text-sm rounded-lg flex items-center gap-1"
          >
            <DynamicIcon name="Hash" className="w-4 h-4" />
            Number
          </button>
          <button
            onClick={() => addVariable("boolean")}
            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg flex items-center gap-1"
          >
            <DynamicIcon name="ToggleLeft" className="w-4 h-4" />
            Boolean
          </button>
          <button
            onClick={() => addVariable("string")}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded-lg flex items-center gap-1"
          >
            <DynamicIcon name="Type" className="w-4 h-4" />
            String
          </button>
          <button
            onClick={() => addVariable("list")}
            className="px-3 py-1 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded-lg flex items-center gap-1"
          >
            <DynamicIcon name="List" className="w-4 h-4" />
            List
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {localVariables.map((variable, index) => {
          const color = getTypeColor(variable.type);
          const isEditing = editingIndex === index;

          if (isEditing) {
            return (
              <div
                key={variable.id}
                className={`p-4 bg-${color}-100 dark:bg-${color}-900/40 border-2 border-${color}-400 rounded-lg`}
                style={{
                  backgroundColor: `rgb(var(--${color}-900) / 0.4)`,
                  borderColor: `rgb(var(--${color}-400))`,
                }}
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <DynamicIcon
                      name={getTypeIcon(variable.type)}
                      className="w-5 h-5 text-blue-200"
                    />
                    <span className="text-xs uppercase tracking-wider text-blue-200/70 font-semibold">
                      {variable.type} Variable
                    </span>
                  </div>

                  <input
                    type="text"
                    value={editVariable.name || ""}
                    onChange={(e) =>
                      setEditVariable({
                        ...editVariable,
                        name: e.target.value,
                      })
                    }
                    placeholder="Variable name"
                    className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white font-semibold"
                  />

                  <textarea
                    value={editVariable.description || ""}
                    onChange={(e) =>
                      setEditVariable({
                        ...editVariable,
                        description: e.target.value,
                      })
                    }
                    placeholder="Description (optional)"
                    className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white resize-none"
                    rows={2}
                  />

                  {/* Type-specific fields */}
                  {editVariable.type === "number" && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-semibold text-blue-200 mb-1">
                          Current Value
                        </label>
                        <input
                          type="number"
                          value={
                            (editVariable as Partial<NumberVariable>).value ?? 0
                          }
                          onChange={(e) =>
                            setEditVariable({
                              ...editVariable,
                              value: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-semibold text-blue-200 mb-1">
                            Min Value (optional)
                          </label>
                          <input
                            type="number"
                            value={
                              (editVariable as Partial<NumberVariable>)
                                .minValue ?? ""
                            }
                            onChange={(e) =>
                              setEditVariable({
                                ...editVariable,
                                minValue:
                                  e.target.value === ""
                                    ? undefined
                                    : parseFloat(e.target.value),
                              })
                            }
                            placeholder="No minimum"
                            className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-blue-200 mb-1">
                            Max Value (optional)
                          </label>
                          <input
                            type="number"
                            value={
                              (editVariable as Partial<NumberVariable>)
                                .maxValue ?? ""
                            }
                            onChange={(e) =>
                              setEditVariable({
                                ...editVariable,
                                maxValue:
                                  e.target.value === ""
                                    ? undefined
                                    : parseFloat(e.target.value),
                              })
                            }
                            placeholder="No maximum"
                            className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {editVariable.type === "boolean" && (
                    <div>
                      <label className="block text-sm font-semibold text-blue-200 mb-2">
                        Current Value
                      </label>
                      <button
                        onClick={() =>
                          setEditVariable({
                            ...editVariable,
                            value: !(editVariable as Partial<BooleanVariable>)
                              .value,
                          })
                        }
                        className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                          (editVariable as Partial<BooleanVariable>).value
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                            : "bg-red-600 hover:bg-red-700 text-white"
                        }`}
                      >
                        {(editVariable as Partial<BooleanVariable>).value
                          ? "TRUE"
                          : "FALSE"}
                      </button>
                    </div>
                  )}

                  {editVariable.type === "string" && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-semibold text-blue-200 mb-1">
                          Current Value
                        </label>
                        <input
                          type="text"
                          value={
                            (editVariable as Partial<StringVariable>).value ??
                            ""
                          }
                          onChange={(e) =>
                            setEditVariable({
                              ...editVariable,
                              value: e.target.value,
                            })
                          }
                          placeholder="Enter text value..."
                          className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-blue-200 mb-1">
                          Predefined Options (optional)
                        </label>
                        <p className="text-xs text-blue-300/50 mb-2">
                          If set, the AI will prefer these values. One per line.
                        </p>
                        <textarea
                          value={
                            (
                              editVariable as Partial<StringVariable>
                            ).options?.join("\n") ?? ""
                          }
                          onChange={(e) =>
                            setEditVariable({
                              ...editVariable,
                              options: e.target.value
                                ? e.target.value
                                    .split("\n")
                                    .filter((o) => o.trim())
                                : undefined,
                            })
                          }
                          placeholder="Monday&#10;Tuesday&#10;Wednesday&#10;..."
                          className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white resize-none"
                          rows={4}
                        />
                      </div>
                    </div>
                  )}

                  {editVariable.type === "list" && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-semibold text-blue-200 mb-1">
                          Max Size (optional)
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={
                            (editVariable as Partial<ListVariable>).maxSize ??
                            ""
                          }
                          onChange={(e) =>
                            setEditVariable({
                              ...editVariable,
                              maxSize:
                                e.target.value === ""
                                  ? undefined
                                  : parseInt(e.target.value),
                            })
                          }
                          placeholder="No limit"
                          className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-blue-200 mb-1">
                          Items (
                          {(editVariable as Partial<ListVariable>).items
                            ?.length || 0}
                          {(editVariable as Partial<ListVariable>).maxSize
                            ? ` / ${
                                (editVariable as Partial<ListVariable>).maxSize
                              }`
                            : ""}
                          )
                        </label>
                        <div className="flex gap-2 mb-2">
                          <input
                            type="text"
                            value={newItemInput}
                            onChange={(e) => setNewItemInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addListItem();
                              }
                            }}
                            placeholder="Add item..."
                            className="flex-1 px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                          />
                          <button
                            onClick={addListItem}
                            disabled={!newItemInput.trim()}
                            className="px-3 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-600 text-white rounded"
                          >
                            <DynamicIcon name="Plus" className="w-4 h-4" />
                          </button>
                        </div>
                        {((editVariable as Partial<ListVariable>).items || [])
                          .length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {(
                              (editVariable as Partial<ListVariable>).items ||
                              []
                            ).map((item, itemIndex) => (
                              <span
                                key={itemIndex}
                                className="px-2 py-1 bg-violet-500/30 text-violet-200 rounded flex items-center gap-1"
                              >
                                {item}
                                <button
                                  onClick={() => removeListItem(itemIndex)}
                                  className="hover:text-red-400"
                                >
                                  <DynamicIcon name="X" className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={saveEdit}
                      disabled={!editVariable.name}
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
            );
          }

          // Display mode
          return (
            <div
              key={variable.id}
              className={`flex items-start gap-3 p-4 rounded-lg border ${
                variable.type === "number"
                  ? "bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800"
                  : variable.type === "boolean"
                  ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
                  : variable.type === "string"
                  ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
                  : "bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800"
              }`}
            >
              <div className="shrink-0">
                <DynamicIcon
                  name={getTypeIcon(variable.type)}
                  className={`w-8 h-8 ${
                    variable.type === "number"
                      ? "text-cyan-500"
                      : variable.type === "boolean"
                      ? "text-emerald-500"
                      : variable.type === "string"
                      ? "text-amber-500"
                      : "text-violet-500"
                  }`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white flex items-center gap-2 flex-wrap mb-1">
                  <span>{variable.name}</span>
                  {variable.type === "number" && (
                    <span className="text-sm px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-200">
                      {(variable as NumberVariable).value}
                    </span>
                  )}
                  {variable.type === "boolean" && (
                    <span
                      className={`text-sm px-2 py-0.5 rounded-full ${
                        (variable as BooleanVariable).value
                          ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200"
                          : "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200"
                      }`}
                    >
                      {(variable as BooleanVariable).value ? "TRUE" : "FALSE"}
                    </span>
                  )}
                  {variable.type === "string" && (
                    <span className="text-sm px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">
                      &quot;{(variable as StringVariable).value || "(empty)"}
                      &quot;
                    </span>
                  )}
                  {variable.type === "list" && (
                    <span className="text-sm px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-800 dark:text-violet-200">
                      {(variable as ListVariable).items.length} items
                      {(variable as ListVariable).maxSize &&
                        ` / ${(variable as ListVariable).maxSize} max`}
                    </span>
                  )}
                </div>
                {variable.description && (
                  <p className="text-sm text-blue-200/60 mb-2">
                    {variable.description}
                  </p>
                )}
                {/* Show number range if defined */}
                {variable.type === "number" &&
                  ((variable as NumberVariable).minValue !== undefined ||
                    (variable as NumberVariable).maxValue !== undefined) && (
                    <p className="text-xs text-blue-200/40">
                      Range: {(variable as NumberVariable).minValue ?? "-∞"} to{" "}
                      {(variable as NumberVariable).maxValue ?? "∞"}
                    </p>
                  )}
                {/* Show string options if defined */}
                {variable.type === "string" &&
                  (variable as StringVariable).options &&
                  (variable as StringVariable).options!.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(variable as StringVariable).options!.map((opt, i) => (
                        <span
                          key={i}
                          className={`px-2 py-0.5 text-xs rounded ${
                            opt === (variable as StringVariable).value
                              ? "bg-amber-500/40 text-amber-200 font-semibold"
                              : "bg-amber-500/20 text-amber-300"
                          }`}
                        >
                          {opt}
                        </span>
                      ))}
                    </div>
                  )}
                {/* Show list items preview */}
                {variable.type === "list" &&
                  (variable as ListVariable).items.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(variable as ListVariable).items
                        .slice(0, 5)
                        .map((item, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 text-xs rounded bg-violet-500/20 text-violet-300"
                          >
                            {item}
                          </span>
                        ))}
                      {(variable as ListVariable).items.length > 5 && (
                        <span className="px-2 py-0.5 text-xs rounded bg-violet-500/10 text-violet-400">
                          +{(variable as ListVariable).items.length - 5} more
                        </span>
                      )}
                    </div>
                  )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => startEdit(index)}
                  className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded"
                >
                  <DynamicIcon name="Edit" className="w-4 h-4" />
                </button>
                <button
                  onClick={() => removeVariable(index)}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
                >
                  <DynamicIcon name="Trash2" className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}

        {localVariables.length === 0 && (
          <div className="p-8 text-center rounded-lg bg-blue-900/30 border-2 border-dashed border-blue-700/40">
            <p className="text-sm text-blue-300/50">
              No variables yet. Add variables to track custom values in your
              story - numbers, flags, or lists of items.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Story Meta Editor
function StoryMetaEditor({
  memory,
  premise,
  authorNotes,
  onUpdate,
}: {
  memory: (string | MemoryEntry)[];
  premise: string;
  authorNotes?: string;
  onUpdate: (updates: Partial<StoryData>) => void;
}) {
  const [localAuthorNotes, setLocalAuthorNotes] = useState<string>(
    authorNotes || ""
  );
  // Store the full memory array with MemoryEntry objects
  const [localMemory, setLocalMemory] = useState<(string | MemoryEntry)[]>([
    ...memory,
  ]);
  const [newMemoryEntry, setNewMemoryEntry] = useState<string>("");

  return (
    <div className="space-y-6">
      {/* Author Notes */}
      <div>
        <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <DynamicIcon name="Edit3" className="w-6 h-6" /> Author Notes
        </h4>
        <textarea
          value={localAuthorNotes}
          onChange={(e) => {
            setLocalAuthorNotes(e.target.value);
            onUpdate({ author_notes: e.target.value });
          }}
          placeholder="Add notes for the adventure creator or AI storyteller (these notes guide the narrative direction)..."
          className="w-full h-32 px-4 py-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
        />
        <p className="mt-2 text-xs text-blue-300/50">
          <DynamicIcon name="Lightbulb" className="w-3 h-3 inline mr-1" /> These
          notes help guide the AI in maintaining story consistency and tone
        </p>
      </div>

      {/* Memory Entries (Editable) */}
      <div>
        <h4 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
          <DynamicIcon name="Brain" className="w-6 h-6" /> Memory Entries (
          {localMemory.length})
        </h4>
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Add new memory entry..."
              value={newMemoryEntry}
              onChange={(e) => setNewMemoryEntry(e.target.value)}
              className="flex-1 px-3 py-2 bg-blue-900/20 border border-blue-700/40 rounded text-white"
            />
            <button
              onClick={() => {
                const trimmed = newMemoryEntry.trim();
                if (!trimmed) return;
                // Create a MemoryEntry with embedded: false to mark for embedding
                const newEntry: MemoryEntry = {
                  content: trimmed,
                  embedded: false,
                };
                const updated = [...localMemory, newEntry];
                setLocalMemory(updated);
                onUpdate({ memory: updated });
                setNewMemoryEntry("");
              }}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded"
            >
              Add
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto space-y-2">
            {localMemory.map((entry, index) => (
              <div
                key={index}
                className="p-3 bg-blue-900/20 rounded text-sm text-blue-200 flex justify-between items-center"
              >
                <span className="pr-2 flex-1">{getMemoryContent(entry)}</span>
                <button
                  onClick={() => {
                    const updated = localMemory.filter((_, i) => i !== index);
                    setLocalMemory(updated);
                    onUpdate({ memory: updated });
                  }}
                  className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded"
                >
                  Remove
                </button>
              </div>
            ))}
            {localMemory.length === 0 && (
              <p className="text-xs text-blue-300/50 italic">
                No memory entries yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface MenuProps extends StoryData {
  storyDbId: string | null;
  sourceAdventureId?: string | null;
  onSaveProgress: () => Promise<void>;
  onUpdateStoryData: (updates: Partial<StoryData>) => void;
  onViewLogs?: () => void;
  onViewContext?: () => void;
}

export default function MenuPage({
  storyDbId,
  sourceAdventureId,
  onSaveProgress,
  onUpdateStoryData,
  onViewLogs,
  onViewContext,
  ...storyData
}: MenuProps) {
  const router = useRouter();
  const { addNotification } = useNotification();
  const { user, getEncryptionPassword } = useAuth();
  const [saving, setSaving] = useState(false);
  const [savingAs, setSavingAs] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [playerNotes, setPlayerNotes] = useState(storyData.player_notes || "");

  // Settings form state
  const [settingsForm, setSettingsForm] = useState<BasicSettingsForm>({
    story_name: storyData.story_name,
    player_name: storyData.player_name,
    player_summary: storyData.player_summary,
    premise: storyData.premise,
    max_chapters: storyData.max_chapters,
    points: storyData.points,
    momentum: storyData.momentum,
    maxMomentum: storyData.maxMomentum,
    rpgSystem: storyData.rpgSystem || "3d6",
  });

  // Advanced editing states
  const [editingStats, setEditingStats] = useState(false);
  const [editingResources, setEditingResources] = useState(false);
  const [editingInventory, setEditingInventory] = useState(false);
  const [editingAchievements, setEditingAchievements] = useState(false);
  const [editingLore, setEditingLore] = useState(false);
  const [activeTab, setActiveTab] = useState<
    | "basic"
    | "stats"
    | "inventory"
    | "abilities"
    | "passives"
    | "quests"
    | "lore"
    | "relationships"
    | "variables"
    | "tables"
    | "threads"
    | "characters"
    | "agmt"
    | "story"
    | "tts"
    | "ai"
  >("basic");
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    icon?: string;
    confirmText?: string;
    confirmButtonClass?: string;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const handleSaveProgress = async () => {
    setSaving(true);
    try {
      await onSaveProgress();
      addNotification("Progress saved successfully!", "success");
    } catch (error) {
      addNotification("Failed to save progress", "failure");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotes = async () => {
    try {
      onUpdateStoryData({ player_notes: playerNotes });
      await onSaveProgress();
      setEditingNotes(false);
      addNotification("Notes saved!", "success");
    } catch (error) {
      addNotification("Failed to save notes", "failure");
    }
  };

  const handleSaveAs = async () => {
    if (!user) {
      addNotification("Please sign in to save", "warning");
      return;
    }

    setSavingAs(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        addNotification("Please sign in to save", "warning");
        return;
      }

      // Create a copy with a new name
      const timestamp = new Date().toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const copyName = `${storyData.story_name} (Save ${timestamp})`;
      const copyData = {
        ...storyData,
        story_name: copyName,
      };

      // Encrypt if needed
      const password = getEncryptionPassword();
      const email = user?.email;
      let dataToSave = copyData;
      if (password && email) {
        dataToSave = (await encryptStoryData(copyData, email, password)) as any;
      }

      // Create new story via API
      const response = await fetch("/api/stories", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          adventureId: sourceAdventureId,
          userId: user.id,
          storyName: copyName,
          storyData: dataToSave,
          isPublic: false,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create save");
      }

      const { story } = await response.json();
      addNotification(`Saved as "${copyName}"`, "success");

      // Navigate to the new story
      router.push(`/story?storyId=${story.id}`);
    } catch (error) {
      console.error("Error saving as:", error);
      addNotification("Failed to create save", "failure");
    } finally {
      setSavingAs(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      onUpdateStoryData({
        story_name: settingsForm.story_name,
        player_name: settingsForm.player_name,
        player_summary: settingsForm.player_summary,
        premise: settingsForm.premise,
        max_chapters: settingsForm.max_chapters,
        points: settingsForm.points,
        momentum: settingsForm.momentum,
        maxMomentum: settingsForm.maxMomentum,
        rpgSystem: settingsForm.rpgSystem,
      });
      await onSaveProgress();
      setShowSettings(false);
      addNotification("Settings updated!", "success");
    } catch (error) {
      addNotification("Failed to update settings", "failure");
    }
  };

  const handleExportStory = () => {
    setExporting(true);
    try {
      const exportData = {
        story_name: storyData.story_name,
        player_name: storyData.player_name,
        exported_at: new Date().toISOString(),
        data: storyData,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${storyData.story_name.replace(
        /[^a-z0-9]/gi,
        "_"
      )}_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addNotification("Story exported successfully!", "success");
    } catch (error) {
      addNotification("Failed to export story", "failure");
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteStory = async () => {
    if (!storyDbId) return;

    setDeleting(true);
    try {
      // Check if this is a local story
      if (storyDbId.startsWith("local_")) {
        const { deleteLocalStory } = await import("../misc/localStoryManager");
        await deleteLocalStory(storyDbId);
        addNotification("Story deleted", "info");
        router.push("/library");
        return;
      }

      // Online story - use API
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      const response = await fetch(`/api/stories/${storyDbId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete story");
      }

      addNotification("Story deleted", "info");
      router.push("/explorer");
    } catch (error: any) {
      addNotification(error.message || "Failed to delete story", "failure");
      setDeleting(false);
    }
  };

  const handleReturnToExplorer = () => {
    setConfirmDialog({
      isOpen: true,
      title: "Leave Story",
      message:
        "Are you sure you want to leave? Make sure your progress is saved!",
      icon: "AlertTriangle",
      confirmText: "Leave",
      confirmButtonClass: "bg-gray-600 hover:bg-gray-700",
      onConfirm: () => {
        setConfirmDialog({ ...confirmDialog, isOpen: false });
        router.push("/explorer");
      },
    });
  };

  const calculateStoryProgress = () => {
    const totalParts = storyData.scene.parts.length;
    const achievementCount = storyData.achievements.length;
    const achievedCount = storyData.achievements.filter(
      (a) => a.dateAchieved
    ).length;

    return {
      totalParts,
      achievementCount,
      achievedCount,
      progress:
        achievementCount > 0
          ? Math.round((achievedCount / achievementCount) * 100)
          : 0,
    };
  };

  const stats = calculateStoryProgress();
  const totalEarnedPoints = (storyData.earnedPointsFromChapters || []).reduce(
    (a: number, b: number) => a + b,
    0
  );
  const availablePoints = storyData.points;

  return (
    <div className="w-full space-y-4">
      {/* Compact Header with Quick Stats */}
      <div className="bg-[#0f1a2e] rounded-xl p-4 border border-blue-800/30">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <DynamicIcon name="Settings" className="w-5 h-5 text-purple-400" />{" "}
            Story Menu
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-blue-300/60">
              {stats.progress}% complete
            </span>
            <div className="w-20 h-1.5 bg-blue-900/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-linear-to-r from-purple-500 to-pink-500"
                style={{ width: `${stats.progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Quick Stats Row */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="bg-blue-900/30 rounded-lg py-2 px-1">
            <p className="text-lg font-bold text-blue-400">
              {stats.totalParts}
            </p>
            <p className="text-[10px] text-blue-300/50">Parts</p>
          </div>
          <div className="bg-purple-900/30 rounded-lg py-2 px-1">
            <p className="text-lg font-bold text-purple-400">
              {stats.achievedCount}/{stats.achievementCount}
            </p>
            <p className="text-[10px] text-purple-300/50">Achieved</p>
          </div>
          <div className="bg-yellow-900/30 rounded-lg py-2 px-1">
            <p className="text-lg font-bold text-yellow-400">
              {availablePoints}
            </p>
            <p className="text-[10px] text-yellow-300/50">Points</p>
          </div>
          <div className="bg-cyan-900/30 rounded-lg py-2 px-1">
            <p className="text-lg font-bold text-cyan-400">
              {storyData.momentum}/{storyData.maxMomentum}
            </p>
            <p className="text-[10px] text-cyan-300/50">Momentum</p>
          </div>
        </div>
      </div>

      {/* Primary Actions - 2x2 Grid */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setShowSettings(true)}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors text-sm"
        >
          <DynamicIcon name="Settings" className="w-4 h-4" />
          <span>Story Editor</span>
        </button>

        <button
          onClick={handleSaveProgress}
          disabled={saving || !storyDbId}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-500 disabled:bg-blue-800/30 disabled:text-blue-300/40 text-white font-medium rounded-lg transition-colors text-sm"
        >
          {saving ? (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
          ) : (
            <DynamicIcon name="Save" className="w-4 h-4" />
          )}
          <span>{saving ? "Saving..." : "Save"}</span>
        </button>

        <button
          onClick={handleSaveAs}
          disabled={savingAs || !user}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-700 hover:bg-emerald-600 disabled:bg-blue-800/30 disabled:text-blue-300/40 text-white font-medium rounded-lg transition-colors text-sm"
          title="Create a copy of this story as a save point"
        >
          {savingAs ? (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
          ) : (
            <DynamicIcon name="Copy" className="w-4 h-4" />
          )}
          <span>{savingAs ? "Saving..." : "Save Copy"}</span>
        </button>

        {onViewContext && (
          <button
            onClick={onViewContext}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-700/50 hover:bg-blue-600/50 text-white font-medium rounded-lg transition-colors text-sm"
          >
            <DynamicIcon name="Eye" className="w-4 h-4" />
            <span>AI Context</span>
          </button>
        )}

        {onViewLogs && (
          <button
            onClick={onViewLogs}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-700/50 hover:bg-blue-600/50 text-white font-medium rounded-lg transition-colors text-sm"
          >
            <DynamicIcon name="Terminal" className="w-4 h-4" />
            <span>Debug Logs</span>
          </button>
        )}
      </div>

      {/* Secondary Actions Row */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={handleExportStory}
          disabled={exporting}
          className="flex items-center justify-center gap-2 px-3 py-2.5 bg-blue-800/40 hover:bg-blue-700/50 text-blue-200 font-medium rounded-lg transition-colors text-sm border border-blue-700/30"
        >
          {exporting ? (
            <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-blue-300 border-t-transparent" />
          ) : (
            <DynamicIcon name="Download" className="w-3.5 h-3.5" />
          )}
          <span>{exporting ? "Exporting..." : "Export"}</span>
        </button>

        <button
          onClick={handleReturnToExplorer}
          className="flex items-center justify-center gap-2 px-3 py-2.5 bg-blue-800/40 hover:bg-blue-700/50 text-blue-200 font-medium rounded-lg transition-colors text-sm border border-blue-700/30"
        >
          <DynamicIcon name="ArrowLeft" className="w-3.5 h-3.5" />
          <span>Explorer</span>
        </button>
      </div>

      {/* AI Editor Button */}
      <button
        onClick={() => setShowAIAssistant(true)}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-linear-to-r from-purple-600/80 to-pink-600/80 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-xl transition-all border border-purple-500/30"
      >
        <DynamicIcon name="Wand2" className="w-5 h-5" />
        <span>AI Editor</span>
      </button>

      {/* Player Notes - Collapsible */}
      <div className="bg-[#0f1a2e] rounded-xl border border-blue-800/30 overflow-hidden">
        <button
          onClick={() => setEditingNotes(!editingNotes)}
          className="w-full flex items-center justify-between p-3 hover:bg-blue-900/20 transition-colors"
        >
          <span className="text-sm font-medium text-white flex items-center gap-2">
            <DynamicIcon
              name="StickyNote"
              className="w-4 h-4 text-yellow-400"
            />
            Player Notes
          </span>
          <DynamicIcon
            name={editingNotes ? "ChevronUp" : "ChevronDown"}
            className="w-4 h-4 text-blue-300/60"
          />
        </button>

        {editingNotes && (
          <div className="p-3 pt-0 space-y-2">
            <textarea
              value={playerNotes}
              onChange={(e) => setPlayerNotes(e.target.value)}
              placeholder="Write your notes, strategies, or thoughts..."
              className="w-full h-24 px-3 py-2 bg-blue-900/30 border border-blue-700/40 rounded-lg text-white text-sm placeholder-blue-300/40 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setPlayerNotes(storyData.player_notes || "");
                  setEditingNotes(false);
                }}
                className="px-3 py-1.5 text-xs bg-blue-800/50 text-blue-200 rounded-lg hover:bg-blue-700/50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNotes}
                className="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded-lg"
              >
                Save
              </button>
            </div>
          </div>
        )}

        {!editingNotes && playerNotes && (
          <div className="px-3 pb-3">
            <p className="text-xs text-blue-200/70 whitespace-pre-wrap line-clamp-2">
              {playerNotes}
            </p>
          </div>
        )}
      </div>

      {/* Danger Zone - Compact */}
      <div className="bg-[#0f1a2e] rounded-xl border border-red-900/30 overflow-hidden">
        <div className="p-3 border-b border-red-900/20">
          <span className="text-sm font-medium text-red-400 flex items-center gap-2">
            <DynamicIcon name="AlertTriangle" className="w-4 h-4" />
            Danger Zone
          </span>
        </div>
        <div className="p-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              setConfirmDialog({
                isOpen: true,
                title: "Restart Story",
                message: "All progress will be lost. Are you sure?",
                icon: "RefreshCw",
                confirmText: "Restart",
                confirmButtonClass: "bg-orange-600 hover:bg-orange-700",
                onConfirm: async () => {
                  setConfirmDialog({ ...confirmDialog, isOpen: false });
                  if (!storyDbId) return;
                  try {
                    // Try to fetch fresh adventure data if we have a source adventure
                    let freshTemplate: Partial<StoryData> | null = null;
                    if (sourceAdventureId) {
                      try {
                        const adventureRes = await fetch(
                          `/api/adventures/${sourceAdventureId}`
                        );
                        if (adventureRes.ok) {
                          const { adventure } = await adventureRes.json();
                          freshTemplate = adventure.storyTemplate;
                        }
                      } catch (e) {
                        console.warn(
                          "Could not fetch fresh adventure data, using current story values"
                        );
                      }
                    }

                    // Use fresh adventure data if available, otherwise fall back to current story values
                    const resetStoryData = {
                      ...storyData,
                      // Reset dynamic fields from fresh adventure template or current story
                      stats: freshTemplate?.stats || storyData.stats,
                      resources:
                        freshTemplate?.resources || storyData.resources,
                      inventory:
                        freshTemplate?.inventory || storyData.inventory,
                      abilities:
                        freshTemplate?.abilities || storyData.abilities,
                      conditions: freshTemplate?.conditions || [],
                      relationships:
                        freshTemplate?.relationships || storyData.relationships,
                      variables:
                        freshTemplate?.variables || storyData.variables,
                      skillTrees:
                        freshTemplate?.skillTrees || storyData.skillTrees,
                      agmtState:
                        freshTemplate?.agmtState || storyData.agmtState,
                      customTables:
                        freshTemplate?.customTables || storyData.customTables,
                      maxMomentum:
                        freshTemplate?.maxMomentum ?? storyData.maxMomentum,
                      restState: freshTemplate?.restState || {
                        quickRestsUsed: 0,
                        shortRestsUsed: 0,
                      },
                      nodeEffects:
                        freshTemplate?.nodeEffects || storyData.nodeEffects,
                      unlockedNodes:
                        freshTemplate?.unlockedNodes || storyData.unlockedNodes,
                      // Always reset these
                      scene: { parts: [] },
                      memory: [],
                      currentChapter: 0,
                      chapters: [],
                      momentum: freshTemplate?.momentum ?? storyData.momentum,
                      points: 0,
                      earnedPointsFromChapters: [],
                      earnedPointsFromQuests: [],
                      achievements: (
                        freshTemplate?.achievements || storyData.achievements
                      ).map((a) => ({
                        ...a,
                        dateAchieved: null,
                      })),
                      quests:
                        (freshTemplate?.quests || storyData.quests)?.map(
                          (q) => ({
                            ...q,
                            fulfilled: false,
                            active: false,
                          })
                        ) || [],
                      lore: (freshTemplate?.lore || storyData.lore).map(
                        (l) => ({
                          ...l,
                          on:
                            l.on_triggers && l.on_triggers.length > 0
                              ? false
                              : true,
                        })
                      ),
                      newGamePlusMode: false,
                    };
                    if (storyDbId.startsWith("local_")) {
                      const { saveLocalStory } = await import(
                        "@/app/misc/localStoryManager"
                      );
                      await saveLocalStory(storyDbId, resetStoryData);
                    } else {
                      const {
                        data: { session },
                      } = await supabase.auth.getSession();
                      if (!session) {
                        addNotification("Please sign in", "warning");
                        return;
                      }
                      const password = getEncryptionPassword();
                      const email = user?.email;
                      if (!password || !email) {
                        addNotification("Please sign in again", "warning");
                        return;
                      }
                      const encryptedData = await encryptStoryData(
                        resetStoryData,
                        email,
                        password
                      );
                      await fetch(`/api/stories/${storyDbId}`, {
                        method: "PATCH",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${session.access_token}`,
                        },
                        body: JSON.stringify({ storyData: encryptedData }),
                      });
                    }
                    addNotification("Story restarted!", "success");
                    window.location.reload();
                  } catch (error) {
                    addNotification("Failed to restart", "failure");
                  }
                },
              });
            }}
            className="flex items-center justify-center gap-2 px-3 py-2.5 bg-orange-900/30 hover:bg-orange-800/40 text-orange-300 font-medium rounded-lg transition-colors text-sm border border-orange-800/30"
          >
            <DynamicIcon name="RefreshCw" className="w-3.5 h-3.5" />
            <span>Restart</span>
          </button>

          <button
            onClick={() => {
              setConfirmDialog({
                isOpen: true,
                title: "Delete Story?",
                message: "This action cannot be undone.",
                icon: "AlertTriangle",
                confirmText: "Delete",
                confirmButtonClass: "bg-red-600 hover:bg-red-700",
                onConfirm: async () => {
                  setConfirmDialog({ ...confirmDialog, isOpen: false });
                  if (!storyDbId) return;
                  setDeleting(true);
                  try {
                    if (storyDbId.startsWith("local_")) {
                      const { deleteLocalStory } = await import(
                        "../misc/localStoryManager"
                      );
                      await deleteLocalStory(storyDbId);
                      addNotification("Story deleted", "success");
                      router.push("/library");
                      return;
                    }
                    const {
                      data: { session },
                    } = await supabase.auth.getSession();
                    if (!session) throw new Error("Not authenticated");
                    const response = await fetch(`/api/stories/${storyDbId}`, {
                      method: "DELETE",
                      headers: {
                        Authorization: `Bearer ${session.access_token}`,
                      },
                    });
                    if (!response.ok) throw new Error("Failed to delete");
                    addNotification("Story deleted", "success");
                    router.push("/explorer");
                  } catch (error: any) {
                    addNotification(
                      error.message || "Failed to delete",
                      "failure"
                    );
                    setDeleting(false);
                  }
                },
              });
            }}
            disabled={deleting || !storyDbId}
            className="flex items-center justify-center gap-2 px-3 py-2.5 bg-red-900/30 hover:bg-red-800/40 disabled:bg-blue-900/20 disabled:text-blue-300/30 text-red-300 font-medium rounded-lg transition-colors text-sm border border-red-800/30"
          >
            {deleting ? (
              <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-red-300 border-t-transparent" />
            ) : (
              <DynamicIcon name="Trash2" className="w-3.5 h-3.5" />
            )}
            <span>{deleting ? "Deleting..." : "Delete"}</span>
          </button>
        </div>
      </div>

      {/* Story Info Card */}
      <div className="bg-blue-950/50 rounded-2xl shadow-xl p-6 border border-blue-800/30">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <DynamicIcon name="Info" className="w-6 h-6" /> Story Information
        </h3>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between py-2 border-b border-blue-800/30">
            <span className="text-blue-200/60">Story Name:</span>
            <span className="font-semibold text-white">
              {storyData.story_name}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-blue-800/30">
            <span className="text-blue-200/60">Player Name:</span>
            <span className="font-semibold text-white">
              {storyData.player_name}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-blue-800/30">
            <span className="text-blue-200/60">Total Memory Entries:</span>
            <span className="font-semibold text-white">
              {storyData.memory.length}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-blue-800/30">
            <span className="text-blue-200/60">Inventory Items:</span>
            <span className="font-semibold text-white">
              {storyData.inventory.length}
            </span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-blue-200/60">Lore Entries:</span>
            <span className="font-semibold text-white">
              {storyData.lore.length}
            </span>
          </div>
        </div>
      </div>

      {/* Comprehensive Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 sm:p-4">
          {/* Full screen on mobile, constrained on desktop */}
          <div className="bg-[#0a1628] sm:rounded-2xl shadow-2xl max-w-6xl w-full border-0 sm:border border-blue-800/30 h-full sm:h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-3 sm:p-6 border-b border-blue-800/30">
              <h3 className="text-base sm:text-xl font-bold text-white flex items-center gap-2">
                <DynamicIcon
                  name="Settings"
                  className="w-5 h-5 sm:w-6 sm:h-6"
                />{" "}
                Story Editor
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="p-2 text-blue-300/60 hover:text-white hover:bg-blue-900/50 rounded-lg transition-colors"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Tabs - Made sticky with background to prevent content overlap */}
            <DraggableScroll
              className="sticky top-0 z-10 bg-[#0a1628] px-2 sm:px-6 py-2 sm:py-4 border-b border-blue-800/30 scrollbar-thin"
              innerClassName="gap-1.5 sm:gap-3"
            >
              {[
                { id: "basic", label: "Basic", icon: "FileText" },
                { id: "stats", label: "Stats & Resources", icon: "BarChart2" },
                { id: "inventory", label: "Inventory", icon: "Backpack" },
                { id: "abilities", label: "Abilities", icon: "Wand2" },
                { id: "passives", label: "Passives", icon: "Sparkles" },
                { id: "quests", label: "Quests", icon: "Scroll" },
                { id: "lore", label: "Lore", icon: "Book" },
                { id: "variables", label: "Variables", icon: "Variable" },
                { id: "tables", label: "Tables", icon: "Dices" },
                { id: "relationships", label: "Relationships", icon: "Users" },
                { id: "agmt", label: "AGMT", icon: "Sparkles" },
                ...(storyData.agmtState
                  ? [
                      { id: "threads", label: "Threads", icon: "ListTodo" },
                      { id: "characters", label: "NPCs", icon: "Users" },
                    ]
                  : []),
                { id: "story", label: "Story", icon: "BookOpen" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`shrink-0 h-10 sm:h-14 px-3 sm:px-6 text-xs sm:text-base font-semibold rounded-lg sm:rounded-xl transition-colors whitespace-nowrap flex items-center gap-1.5 sm:gap-3 overflow-visible ${
                    activeTab === tab.id
                      ? "bg-purple-600 text-white shadow-md"
                      : "bg-blue-900/30 text-blue-200 hover:bg-blue-800/40"
                  }`}
                >
                  <DynamicIcon
                    name={tab.icon}
                    className="w-4 h-4 sm:w-5 sm:h-5 shrink-0"
                  />
                  <span className="leading-none hidden sm:inline">
                    {tab.label}
                  </span>
                </button>
              ))}
            </DraggableScroll>

            {/* Content Area */}
            {/* Ensure consistent inner spacing and prevent layout shift */}
            <div className="flex-1 overflow-y-auto px-3 sm:px-6 pb-3 sm:pb-6 pt-4 sm:pt-8 min-h-0">
              {/* Uniform top spacer (pt-8) keeps all tab bodies from touching tabs; Inventory previously appeared correct */}
              {activeTab === "basic" && (
                <div className="mt-4">
                  <BasicSettings
                    form={settingsForm}
                    onChange={setSettingsForm}
                  />
                </div>
              )}

              {activeTab === "stats" && (
                <div className="mt-4">
                  <StatsResourcesEditor
                    stats={storyData.stats}
                    resources={storyData.resources}
                    achievements={storyData.achievements}
                    onUpdate={(updates) => onUpdateStoryData(updates)}
                  />
                </div>
              )}

              {activeTab === "inventory" && (
                <div className="mt-4">
                  <InventoryEditor
                    inventory={storyData.inventory}
                    onUpdate={(inventory) => onUpdateStoryData({ inventory })}
                  />
                </div>
              )}

              {activeTab === "abilities" && (
                <div className="mt-4">
                  <AbilitiesEditor
                    abilities={storyData.abilities || []}
                    resources={storyData.resources}
                    variables={storyData.variables || []}
                    rpgSystem={storyData.rpgSystem || "3d6"}
                    onUpdate={(abilities) => onUpdateStoryData({ abilities })}
                  />
                </div>
              )}

              {activeTab === "passives" && (
                <div className="mt-4">
                  <PassivesEditor
                    passives={storyData.nodeEffects?.passives || []}
                    onUpdate={(passives) =>
                      onUpdateStoryData({
                        nodeEffects: {
                          statBonuses: storyData.nodeEffects?.statBonuses || [],
                          resourceBonuses:
                            storyData.nodeEffects?.resourceBonuses || [],
                          passives,
                        },
                      })
                    }
                  />
                </div>
              )}

              {activeTab === "quests" && (
                <div className="mt-4">
                  <QuestEditor
                    quests={storyData.quests || []}
                    onUpdate={(quests) => onUpdateStoryData({ quests })}
                  />
                </div>
              )}

              {activeTab === "lore" && (
                <div className="mt-4">
                  <LoreEditor
                    lore={storyData.lore}
                    variables={storyData.variables || []}
                    onUpdate={(lore) => onUpdateStoryData({ lore })}
                  />
                </div>
              )}

              {activeTab === "tables" && (
                <div className="mt-4">
                  <CustomTablesEditor
                    tables={storyData.customTables || []}
                    setTables={(tables) =>
                      onUpdateStoryData({ customTables: tables })
                    }
                  />
                </div>
              )}

              {activeTab === "variables" && (
                <div className="mt-4">
                  <VariablesEditor
                    variables={storyData.variables || []}
                    onUpdate={(variables) => onUpdateStoryData({ variables })}
                  />
                </div>
              )}

              {activeTab === "relationships" && (
                <div className="mt-4">
                  <RelationshipsEditor
                    relationships={storyData.relationships}
                    onUpdate={(relationships) =>
                      onUpdateStoryData({ relationships })
                    }
                  />
                </div>
              )}

              {activeTab === "threads" && storyData.agmtState && (
                <div className="mt-4 space-y-6">
                  <div className="flex items-center justify-between">
                    <h4 className="text-lg font-bold text-white flex items-center gap-2">
                      <DynamicIcon name="ListTodo" className="w-6 h-6" />
                      Story Threads
                    </h4>
                    <button
                      onClick={() => {
                        const newThread: AGMTThread = {
                          id: crypto.randomUUID(),
                          description: "",
                          status: "active",
                          createdAt: Date.now(),
                        };
                        onUpdateStoryData({
                          agmtState: {
                            ...storyData.agmtState!,
                            threads: [
                              ...storyData.agmtState!.threads,
                              newThread,
                            ],
                          },
                        });
                      }}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg flex items-center gap-2"
                    >
                      <DynamicIcon name="Plus" className="w-4 h-4" />
                      New Thread
                    </button>
                  </div>

                  <div className="space-y-3">
                    <h5 className="text-sm font-semibold text-blue-200">
                      Active Threads (
                      {
                        storyData.agmtState.threads.filter(
                          (t) => t.status === "active"
                        ).length
                      }
                      )
                    </h5>
                    {storyData.agmtState.threads
                      .filter((t) => t.status === "active")
                      .map((thread) => (
                        <div
                          key={thread.id}
                          className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800 space-y-3"
                        >
                          <textarea
                            value={thread.description}
                            onChange={(e) => {
                              onUpdateStoryData({
                                agmtState: {
                                  ...storyData.agmtState!,
                                  threads: storyData.agmtState!.threads.map(
                                    (t) =>
                                      t.id === thread.id
                                        ? { ...t, description: e.target.value }
                                        : t
                                  ),
                                },
                              });
                            }}
                            placeholder="Thread description..."
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white resize-none"
                            rows={2}
                          />
                          <div className="flex items-center justify-between text-xs text-blue-300/50">
                            <span>
                              Created{" "}
                              {new Date(thread.createdAt).toLocaleDateString()}
                            </span>
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  onUpdateStoryData({
                                    agmtState: {
                                      ...storyData.agmtState!,
                                      threads: storyData.agmtState!.threads.map(
                                        (t) =>
                                          t.id === thread.id
                                            ? { ...t, status: "closed" }
                                            : t
                                      ),
                                    },
                                  });
                                  addNotification("Thread resolved", "success");
                                }}
                                className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded"
                              >
                                Mark Resolved
                              </button>
                              <button
                                onClick={() => {
                                  setConfirmDialog({
                                    isOpen: true,
                                    title: "Delete Thread",
                                    message:
                                      "Are you sure you want to delete this thread?",
                                    icon: "Trash2",
                                    onConfirm: () => {
                                      onUpdateStoryData({
                                        agmtState: {
                                          ...storyData.agmtState!,
                                          threads:
                                            storyData.agmtState!.threads.filter(
                                              (t) => t.id !== thread.id
                                            ),
                                        },
                                      });
                                      addNotification(
                                        "Thread deleted",
                                        "success"
                                      );
                                      setConfirmDialog({
                                        ...confirmDialog,
                                        isOpen: false,
                                      });
                                    },
                                  });
                                }}
                                className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    {storyData.agmtState.threads.filter(
                      (t) => t.status === "active"
                    ).length === 0 && (
                      <p className="text-sm text-blue-200/60 italic">
                        No active threads. Click "New Thread" to add one.
                      </p>
                    )}
                  </div>

                  <details className="border border-blue-700/40 rounded-lg">
                    <summary className="px-4 py-3 cursor-pointer font-semibold text-white hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg">
                      Closed Threads (
                      {
                        storyData.agmtState.threads.filter(
                          (t) => t.status === "closed"
                        ).length
                      }
                      )
                    </summary>
                    <div className="px-4 pb-4 space-y-3">
                      {storyData.agmtState.threads
                        .filter((t) => t.status === "closed")
                        .map((thread) => (
                          <div
                            key={thread.id}
                            className="p-3 bg-blue-900/20 rounded-lg border border-blue-800/30"
                          >
                            <p className="text-sm text-blue-200 line-through">
                              {thread.description}
                            </p>
                            <div className="flex justify-end gap-2 mt-2">
                              <button
                                onClick={() => {
                                  onUpdateStoryData({
                                    agmtState: {
                                      ...storyData.agmtState!,
                                      threads: storyData.agmtState!.threads.map(
                                        (t) =>
                                          t.id === thread.id
                                            ? { ...t, status: "active" }
                                            : t
                                      ),
                                    },
                                  });
                                  addNotification("Thread reopened", "success");
                                }}
                                className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded"
                              >
                                Reopen
                              </button>
                              <button
                                onClick={() => {
                                  onUpdateStoryData({
                                    agmtState: {
                                      ...storyData.agmtState!,
                                      threads:
                                        storyData.agmtState!.threads.filter(
                                          (t) => t.id !== thread.id
                                        ),
                                    },
                                  });
                                  addNotification("Thread deleted", "success");
                                }}
                                className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      {storyData.agmtState.threads.filter(
                        (t) => t.status === "closed"
                      ).length === 0 && (
                        <p className="text-sm text-blue-200/60 italic py-2">
                          No closed threads yet.
                        </p>
                      )}
                    </div>
                  </details>
                </div>
              )}

              {activeTab === "characters" && storyData.agmtState && (
                <div className="mt-4 space-y-6">
                  <div className="flex items-center justify-between">
                    <h4 className="text-lg font-bold text-white flex items-center gap-2">
                      <DynamicIcon name="Users" className="w-6 h-6" />
                      NPCs
                    </h4>
                    <button
                      onClick={() => {
                        const newChar: AGMTCharacter = {
                          id: crypto.randomUUID(),
                          name: "",
                          role: "",
                          status: "active",
                          createdAt: Date.now(),
                        };
                        onUpdateStoryData({
                          agmtState: {
                            ...storyData.agmtState!,
                            characters: [
                              ...storyData.agmtState!.characters,
                              newChar,
                            ],
                          },
                        });
                      }}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg flex items-center gap-2"
                    >
                      <DynamicIcon name="Plus" className="w-4 h-4" />
                      New NPC
                    </button>
                  </div>

                  <div className="grid gap-3">
                    {storyData.agmtState.characters.map((char) => (
                      <div
                        key={char.id}
                        className={`p-4 rounded-lg border space-y-3 ${
                          char.status === "active"
                            ? "bg-purple-900/30 border-purple-700/40"
                            : char.status === "deceased"
                            ? "bg-red-900/30 border-red-700/40 opacity-75"
                            : "bg-blue-900/20 border-blue-800/30 opacity-75"
                        }`}
                      >
                        <div className="flex gap-3">
                          <input
                            type="text"
                            value={char.name}
                            onChange={(e) => {
                              onUpdateStoryData({
                                agmtState: {
                                  ...storyData.agmtState!,
                                  characters:
                                    storyData.agmtState!.characters.map((c) =>
                                      c.id === char.id
                                        ? { ...c, name: e.target.value }
                                        : c
                                    ),
                                },
                              });
                            }}
                            placeholder="Character name..."
                            className="flex-1 px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white font-semibold"
                          />
                          <select
                            value={char.status}
                            onChange={(e) => {
                              onUpdateStoryData({
                                agmtState: {
                                  ...storyData.agmtState!,
                                  characters:
                                    storyData.agmtState!.characters.map((c) =>
                                      c.id === char.id
                                        ? {
                                            ...c,
                                            status: e.target.value as any,
                                          }
                                        : c
                                    ),
                                },
                              });
                            }}
                            className="px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                          >
                            <option value="active">Active</option>
                            <option value="deceased">Deceased</option>
                            <option value="departed">Departed</option>
                          </select>
                        </div>
                        <textarea
                          value={char.role}
                          onChange={(e) => {
                            onUpdateStoryData({
                              agmtState: {
                                ...storyData.agmtState!,
                                characters: storyData.agmtState!.characters.map(
                                  (c) =>
                                    c.id === char.id
                                      ? { ...c, role: e.target.value }
                                      : c
                                ),
                              },
                            });
                          }}
                          placeholder="Role/description..."
                          className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white resize-none"
                          rows={2}
                        />
                        <div className="flex items-center justify-between text-xs text-blue-300/50">
                          <span>
                            Introduced{" "}
                            {new Date(char.createdAt).toLocaleDateString()}
                          </span>
                          <button
                            onClick={() => {
                              setConfirmDialog({
                                isOpen: true,
                                title: "Delete Character",
                                message: `Delete ${
                                  char.name || "this character"
                                }?`,
                                icon: "Trash2",
                                onConfirm: () => {
                                  onUpdateStoryData({
                                    agmtState: {
                                      ...storyData.agmtState!,
                                      characters:
                                        storyData.agmtState!.characters.filter(
                                          (c) => c.id !== char.id
                                        ),
                                    },
                                  });
                                  addNotification(
                                    "Character deleted",
                                    "success"
                                  );
                                  setConfirmDialog({
                                    ...confirmDialog,
                                    isOpen: false,
                                  });
                                },
                              });
                            }}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                    {storyData.agmtState.characters.length === 0 && (
                      <p className="text-sm text-blue-200/60 italic">
                        No NPCs added yet. Click "New NPC" to add one.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "agmt" && (
                <div className="mt-4 space-y-6">
                  <h4 className="text-lg font-bold text-white flex items-center gap-2">
                    <DynamicIcon name="Sparkles" className="w-6 h-6" />
                    Advanced RPG Tools Settings
                  </h4>

                  {/* Enable/Disable Advanced RPG Tools */}
                  <div className="p-6 bg-blue-950/50 rounded-lg border-2 border-blue-700/40">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="block text-sm font-semibold text-blue-200 mb-1">
                          Enable Advanced RPG Tools
                        </label>
                        <p className="text-xs text-blue-200/60">
                          Use AGMT Game Master Emulator for dynamic story
                          generation
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!storyData.agmtState}
                          onChange={(e) => {
                            if (e.target.checked) {
                              // Enable AGMT with default state
                              onUpdateStoryData({
                                agmtState: {
                                  chaosFactor: 5,
                                  threads: [],
                                  characters: [],
                                  sceneCount: 0,
                                  skillCheckHistory: [],
                                  currentStreak: 0,
                                  lastChaosAdjustment: -999,
                                },
                              });
                            } else {
                              // Disable AGMT
                              onUpdateStoryData({
                                agmtState: undefined,
                              });
                            }
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-14 h-7 bg-blue-800/50 peer-focus:ring-4 peer-focus:ring-purple-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-1 after:bg-white after:border-blue-700/40 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-purple-600"></div>
                      </label>
                    </div>
                  </div>

                  {storyData.agmtState && (
                    <>
                      {/* Chaos Factor */}
                      <div className="p-6 bg-blue-950/50 rounded-lg border-2 border-blue-700/40">
                        <label className="block text-sm font-semibold text-blue-200 mb-3">
                          Chaos Factor: {storyData.agmtState.chaosFactor}
                        </label>
                        <input
                          type="range"
                          min="1"
                          max="9"
                          value={storyData.agmtState.chaosFactor}
                          onChange={(e) => {
                            onUpdateStoryData({
                              agmtState: {
                                ...storyData.agmtState!,
                                chaosFactor: parseInt(e.target.value),
                              },
                            });
                          }}
                          className="w-full h-3 bg-blue-900/30 rounded-lg appearance-none cursor-pointer"
                        />
                        <p className="text-sm text-blue-200/60 mt-2">
                          {storyData.agmtState.chaosFactor <= 3 &&
                            "Very Ordered - Things go as expected"}
                          {storyData.agmtState.chaosFactor > 3 &&
                            storyData.agmtState.chaosFactor <= 5 &&
                            "Normal - Standard chaos level"}
                          {storyData.agmtState.chaosFactor > 5 &&
                            storyData.agmtState.chaosFactor <= 7 &&
                            "Chaotic - Unexpected twists likely"}
                          {storyData.agmtState.chaosFactor > 7 &&
                            "Extreme Chaos - Anything can happen!"}
                        </p>
                      </div>

                      {/* Scene Count */}
                      <div className="p-6 bg-blue-950/50 rounded-lg border-2 border-blue-700/40">
                        <label className="block text-sm font-semibold text-blue-200 mb-3">
                          Scene Count: {storyData.agmtState.sceneCount}
                        </label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              onUpdateStoryData({
                                agmtState: {
                                  ...storyData.agmtState!,
                                  sceneCount: Math.max(
                                    0,
                                    storyData.agmtState!.sceneCount - 1
                                  ),
                                },
                              });
                            }}
                            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
                          >
                            -1
                          </button>
                          <button
                            onClick={() => {
                              onUpdateStoryData({
                                agmtState: {
                                  ...storyData.agmtState!,
                                  sceneCount:
                                    storyData.agmtState!.sceneCount + 1,
                                },
                              });
                            }}
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
                          >
                            +1 Scene
                          </button>
                          <button
                            onClick={() => {
                              onUpdateStoryData({
                                agmtState: {
                                  ...storyData.agmtState!,
                                  sceneCount: 0,
                                },
                              });
                            }}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
                          >
                            Reset
                          </button>
                        </div>
                      </div>

                      {/* Performance Tracking */}
                      {storyData.agmtState && (
                        <div className="p-6 bg-gradient to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 rounded-lg border-2 border-gray-300 dark:border-gray-700">
                          <h4 className="text-sm font-semibold text-blue-200 mb-4 flex items-center gap-2">
                            <DynamicIcon
                              name="TrendingUp"
                              className="w-4 h-4"
                            />
                            Performance Tracking
                          </h4>

                          {/* Current Streak */}
                          <div className="mb-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-blue-200/60">
                                Current Streak
                              </span>
                              <span
                                className={`text-sm font-bold ${
                                  storyData.agmtState.currentStreak > 0
                                    ? "text-green-400"
                                    : storyData.agmtState.currentStreak < 0
                                    ? "text-red-400"
                                    : "text-gray-400"
                                }`}
                              >
                                {storyData.agmtState.currentStreak > 0 && "+"}
                                {storyData.agmtState.currentStreak || 0}
                                {Math.abs(storyData.agmtState.currentStreak) >=
                                  3 && " ??"}
                              </span>
                            </div>
                            <div className="h-2 bg-blue-900/30 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all ${
                                  storyData.agmtState.currentStreak > 0
                                    ? "bg-green-500"
                                    : "bg-red-500"
                                }`}
                                style={{
                                  width: `${Math.min(
                                    Math.abs(
                                      storyData.agmtState.currentStreak
                                    ) * 20,
                                    100
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>

                          {/* Recent Performance */}
                          {storyData.agmtState.skillCheckHistory.length > 0 && (
                            <div>
                              <span className="text-xs text-blue-200/60 block mb-2">
                                Last{" "}
                                {storyData.agmtState.skillCheckHistory.length}{" "}
                                Checks
                              </span>
                              <div className="flex gap-1 flex-wrap">
                                {storyData.agmtState.skillCheckHistory
                                  .slice(-10)
                                  .map((check, i) => (
                                    <div
                                      key={i}
                                      className={`w-4 h-4 rounded-sm ${
                                        check.success
                                          ? "bg-green-500"
                                          : "bg-red-500"
                                      }`}
                                      title={`${check.skill}: ${
                                        check.success ? "Success" : "Failure"
                                      } (${check.margin > 0 ? "+" : ""}${
                                        check.margin
                                      })`}
                                    />
                                  ))}
                              </div>
                              <div className="flex justify-between mt-2 text-xs">
                                <span className="text-green-400">
                                  {
                                    storyData.agmtState.skillCheckHistory.filter(
                                      (c) => c.success
                                    ).length
                                  }{" "}
                                  wins
                                </span>
                                <span className="text-red-400">
                                  {
                                    storyData.agmtState.skillCheckHistory.filter(
                                      (c) => !c.success
                                    ).length
                                  }{" "}
                                  losses
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Next Adjustment Info */}
                          <div className="mt-4 pt-4 border-t border-blue-700/40 text-xs text-blue-300/50">
                            {storyData.agmtState.sceneCount -
                              storyData.agmtState.lastChaosAdjustment <
                            2 ? (
                              <span className="flex items-center gap-1">
                                <DynamicIcon name="Clock" className="w-3 h-3" />
                                Chaos stabilizing (adjusted recently)
                              </span>
                            ) : storyData.agmtState.skillCheckHistory.length <
                              5 ? (
                              <span className="flex items-center gap-1">
                                <DynamicIcon
                                  name="Activity"
                                  className="w-3 h-3"
                                />
                                Building performance history (
                                {storyData.agmtState.skillCheckHistory.length}
                                /5 checks)
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <DynamicIcon name="Zap" className="w-3 h-3" />
                                Chaos may adjust at next scene transition
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Quick Stats */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                          <div className="text-2xl font-bold text-purple-600">
                            {
                              storyData.agmtState.threads.filter(
                                (t) => t.status === "active"
                              ).length
                            }
                          </div>
                          <div className="text-sm text-blue-200/60">
                            Active Threads
                          </div>
                        </div>
                        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                          <div className="text-2xl font-bold text-purple-600">
                            {
                              storyData.agmtState.characters.filter(
                                (c) => c.status === "active"
                              ).length
                            }
                          </div>
                          <div className="text-sm text-blue-200/60">
                            Active NPCs
                          </div>
                        </div>
                        <div className="p-4 bg-blue-900/20 rounded-lg border border-blue-800/30">
                          <div className="text-2xl font-bold text-blue-200/60">
                            {
                              storyData.agmtState.threads.filter(
                                (t) => t.status === "closed"
                              ).length
                            }
                          </div>
                          <div className="text-sm text-blue-200/60">
                            Closed Threads
                          </div>
                        </div>
                        <div className="p-4 bg-blue-900/20 rounded-lg border border-blue-800/30">
                          <div className="text-2xl font-bold text-blue-200/60">
                            {storyData.agmtState.characters.length}
                          </div>
                          <div className="text-sm text-blue-200/60">
                            Total NPCs
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === "story" && (
                <div className="mt-4">
                  <StoryMetaEditor
                    memory={storyData.memory}
                    premise={storyData.premise}
                    authorNotes={storyData.author_notes}
                    onUpdate={(updates) => onUpdateStoryData(updates)}
                  />
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 sm:gap-3 p-3 sm:p-6 border-t border-blue-800/30">
              <button
                onClick={() => {
                  setSettingsForm({
                    story_name: storyData.story_name,
                    player_name: storyData.player_name,
                    player_summary: storyData.player_summary,
                    premise: storyData.premise,
                    max_chapters: storyData.max_chapters,
                    points: storyData.points,
                    momentum: storyData.momentum,
                    maxMomentum: storyData.maxMomentum,
                    rpgSystem: storyData.rpgSystem || "3d6",
                  });
                  setShowSettings(false);
                }}
                className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-blue-800/50 hover:bg-blue-700/50 text-blue-200 text-sm sm:text-base font-semibold rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await handleSaveSettings();
                  await onSaveProgress();
                }}
                className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-purple-600 hover:bg-purple-700 text-white text-sm sm:text-base font-semibold rounded-lg transition-colors flex items-center justify-center gap-1"
              >
                <DynamicIcon name="Save" className="w-4 h-4" />
                <span className="hidden sm:inline">Save All Changes</span>
                <span className="sm:hidden">Save</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        icon={confirmDialog.icon}
        confirmText={confirmDialog.confirmText}
        confirmButtonClass={confirmDialog.confirmButtonClass}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />

      {/* AI Story Editor Modal */}
      <StoryCreativeAssistant
        isOpen={showAIAssistant}
        onClose={() => setShowAIAssistant(false)}
        storyData={storyData}
        storyId={storyDbId || undefined}
        onApplyChanges={(updates) => {
          onUpdateStoryData(updates);
          addNotification("Changes applied! Don't forget to save.", "success");
        }}
      />
    </div>
  );
}
