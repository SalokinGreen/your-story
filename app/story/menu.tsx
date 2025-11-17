"use client";

import { StoryData, Stat, Resource, InventoryItem, Achievement, StoryLore, PlotBeat } from "../misc/structs";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useNotification } from "../misc/NotificationContext";
import { supabase } from "../misc/supabase";
import { compressImage } from "../misc/imageCompression";

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
}

function BasicSettings({ form, onChange }: { form: BasicSettingsForm; onChange: (form: BasicSettingsForm) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Story Name</label>
        <input
          type="text"
          value={form.story_name}
          onChange={(e) => onChange({ ...form, story_name: e.target.value })}
          className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Player/Character Name</label>
        <input
          type="text"
          value={form.player_name}
          onChange={(e) => onChange({ ...form, player_name: e.target.value })}
          className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Character Description</label>
        <textarea
          value={form.player_summary}
          onChange={(e) => onChange({ ...form, player_summary: e.target.value })}
          className="w-full h-32 px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Story Premise</label>
        <textarea
          value={form.premise}
          onChange={(e) => onChange({ ...form, premise: e.target.value })}
          className="w-full h-24 px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Max Chapters</label>
        <input
          type="number"
          value={form.max_chapters}
          onChange={(e) => onChange({ ...form, max_chapters: parseInt(e.target.value) || 0 })}
          className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Starting Points</label>
          <input
            type="number"
            min={0}
            value={form.points}
            onChange={(e) => onChange({ ...form, points: parseInt(e.target.value) || 0 })}
            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Starting Momentum</label>
          <input
            type="number"
            min={0}
            value={form.momentum}
            onChange={(e) => onChange({ ...form, momentum: parseInt(e.target.value) || 0 })}
            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Max Momentum</label>
          <input
            type="number"
            min={1}
            value={form.maxMomentum}
            onChange={(e) => onChange({ ...form, maxMomentum: parseInt(e.target.value) || 1 })}
            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
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
  onUpdate 
}: { 
  stats: Stat[]; 
  resources: Resource[]; 
  achievements: Achievement[];
  onUpdate: (updates: Partial<StoryData>) => void;
}) {
  const [localStats, setLocalStats] = useState<Stat[]>([...stats]);
  const [localResources, setLocalResources] = useState<Resource[]>([...resources]);
  const [localAchievements, setLocalAchievements] = useState<Achievement[]>([...achievements]);

  // Drag and edit state for stats
  const [draggedStatIndex, setDraggedStatIndex] = useState<number | null>(null);
  const [editingStatIndex, setEditingStatIndex] = useState<number | null>(null);
  const [editStat, setEditStat] = useState<Partial<Stat>>({});

  // Drag and edit state for resources
  const [draggedResourceIndex, setDraggedResourceIndex] = useState<number | null>(null);
  const [editingResourceIndex, setEditingResourceIndex] = useState<number | null>(null);
  const [editResource, setEditResource] = useState<Partial<Resource>>({});

  // Drag and edit state for achievements
  const [draggedAchievementIndex, setDraggedAchievementIndex] = useState<number | null>(null);
  const [editingAchievementIndex, setEditingAchievementIndex] = useState<number | null>(null);
  const [editAchievement, setEditAchievement] = useState<Partial<Achievement>>({});

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
    const newStat: Stat = { name: "New Stat", value: 50, description: "", symbol: "⭐" };
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
    const newResource: Resource = { name: "New Resource", value: 100, maxValue: 100, description: "", symbol: "💎" };
    const updated = [...localResources, newResource];
    setLocalResources(updated);
    onUpdate({ resources: updated });
  };

  const removeResource = (index: number) => {
    const updated = localResources.filter((_, i) => i !== index);
    setLocalResources(updated);
    onUpdate({ resources: updated });
  };

  const updateAchievement = (index: number, field: keyof Achievement, value: any) => {
    const updated = [...localAchievements];
    (updated[index] as any)[field] = value;
    setLocalAchievements(updated);
    onUpdate({ achievements: updated });
  };

  const toggleAchievement = (index: number, achieved: boolean) => {
    const updated = [...localAchievements];
    updated[index] = { ...updated[index], dateAchieved: achieved ? new Date() : null };
    setLocalAchievements(updated);
    onUpdate({ achievements: updated });
  };

  const addAchievement = () => {
    const newAchievement: Achievement = {
      title: "New Achievement",
      description: "",
      dateAchieved: null,
      points: 10,
      symbol: "🏆"
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
  const handleResourceDragStart = (index: number) => setDraggedResourceIndex(index);
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
    if (editingResourceIndex !== null && editResource.name && editResource.description) {
      const updated = [...localResources];
      updated[editingResourceIndex] = editResource as Resource;
      setLocalResources(updated);
      onUpdate({ resources: updated });
      setEditingResourceIndex(null);
      setEditResource({});
    }
  };

  // Achievement drag-and-drop and edit handlers
  const handleAchievementDragStart = (index: number) => setDraggedAchievementIndex(index);
  const handleAchievementDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedAchievementIndex === null || draggedAchievementIndex === index) return;
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
    if (editingAchievementIndex !== null && editAchievement.title && editAchievement.description) {
      const updated = [...localAchievements];
      updated[editingAchievementIndex] = editAchievement as Achievement;
      setLocalAchievements(updated);
      onUpdate({ achievements: updated });
      setEditingAchievementIndex(null);
      setEditAchievement({});
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-bold text-gray-900 dark:text-white">📊 Stats</h4>
          <button
            onClick={addStat}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg"
          >
            + Add Stat
          </button>
        </div>
        <div className="space-y-3">
          <p className="text-xs text-gray-600 dark:text-gray-400">💡 Drag and drop to reorder (or use arrow buttons on mobile)</p>
          {localStats.map((stat, index) => (
            editingStatIndex === index ? (
              // Edit mode
              <div key={index} className="p-4 bg-blue-100 dark:bg-blue-900/40 rounded-lg border-2 border-blue-400">
                <h5 className="text-sm font-bold mb-3 text-gray-900 dark:text-white">✏️ Editing Stat</h5>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  <input
                    type="text"
                    value={editStat.name || ""}
                    onChange={(e) => setEditStat({ ...editStat, name: e.target.value })}
                    placeholder="Stat name"
                    className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                  />
                  <input
                    type="text"
                    value={editStat.symbol || ""}
                    onChange={(e) => setEditStat({ ...editStat, symbol: e.target.value })}
                    placeholder="Symbol"
                    className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                    maxLength={4}
                  />
                  <input
                    type="number"
                    value={editStat.value || 0}
                    onChange={(e) => setEditStat({ ...editStat, value: parseInt(e.target.value) || 0 })}
                    placeholder="Value"
                    className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                  />
                </div>
                <textarea
                  value={editStat.description || ""}
                  onChange={(e) => setEditStat({ ...editStat, description: e.target.value })}
                  placeholder="Description"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white mb-3"
                  rows={2}
                />
                <div className="flex gap-2">
                  <button onClick={saveEditStat} disabled={!editStat.name || !editStat.description} className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded">✓ Save</button>
                  <button onClick={cancelEditStat} className="flex-1 px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded">Cancel</button>
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
                className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-move"
                style={{ opacity: draggedStatIndex === index ? 0.5 : 1 }}
              >
                <div className="flex items-start gap-3">
                  <div className="text-gray-400 dark:text-gray-500 cursor-grab active:cursor-grabbing mt-2">⋮⋮</div>
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{stat.symbol}</span>
                      <div>
                        <div className="font-bold text-gray-900 dark:text-white">{stat.name}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">{stat.description}</div>
                        <div className="text-sm text-blue-600 dark:text-blue-400 font-semibold">Value: {stat.value}</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button onClick={() => moveStatUp(index)} disabled={index === 0} className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded text-xs">▲</button>
                    <button onClick={() => moveStatDown(index)} disabled={index === localStats.length - 1} className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded text-xs">▼</button>
                    <button onClick={() => startEditStat(index)} className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-xs">✏️</button>
                    <button onClick={() => removeStat(index)} className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs">✕</button>
                  </div>
                </div>
              </div>
            )
          ))}
        </div>
      </div>

      {/* Resources Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-bold text-gray-900 dark:text-white">💎 Resources</h4>
          <button
            onClick={addResource}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg"
          >
            + Add Resource
          </button>
        </div>
        <div className="space-y-3">
          {localResources.map((resource, index) => (
            editingResourceIndex === index ? (
              <div key={index} className="p-4 bg-blue-100 dark:bg-blue-900/40 border-2 border-blue-400 rounded-lg">
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editResource.name || ''}
                    onChange={(e) => setEditResource({ ...editResource, name: e.target.value })}
                    placeholder="Resource name"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                  />
                  <input
                    type="text"
                    value={editResource.symbol || ''}
                    onChange={(e) => setEditResource({ ...editResource, symbol: e.target.value })}
                    placeholder="Symbol"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="number"
                      value={editResource.value ?? 0}
                      onChange={(e) => setEditResource({ ...editResource, value: parseInt(e.target.value) || 0 })}
                      placeholder="Current"
                      className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                    />
                    <input
                      type="number"
                      value={editResource.maxValue ?? 0}
                      onChange={(e) => setEditResource({ ...editResource, maxValue: parseInt(e.target.value) || 0 })}
                      placeholder="Max"
                      className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                    />
                  </div>
                  <textarea
                    value={editResource.description || ''}
                    onChange={(e) => setEditResource({ ...editResource, description: e.target.value })}
                    placeholder="Description"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
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
                className={`p-4 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-move flex items-center gap-3 ${
                  draggedResourceIndex === index ? 'opacity-50' : ''
                }`}
              >
                <span className="text-gray-400 select-none">⋮⋮</span>
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-white">
                    {resource.symbol} {resource.name}: {resource.value}/{resource.maxValue}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">{resource.description}</div>
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => moveResourceUp(index)}
                    disabled={index === 0}
                    className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded flex items-center justify-center"
                    title="Move up"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveResourceDown(index)}
                    disabled={index === localResources.length - 1}
                    className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded flex items-center justify-center"
                    title="Move down"
                  >
                    ▼
                  </button>
                </div>
                <button
                  onClick={() => startEditResource(index)}
                  className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded"
                >
                  ✏️
                </button>
                <button
                  onClick={() => removeResource(index)}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
                >
                  Remove
                </button>
              </div>
            )
          ))}
        </div>
      </div>

      {/* Achievements Editor */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-bold text-gray-900 dark:text-white">🏆 Achievements</h4>
          <button
            onClick={addAchievement}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg"
          >
            + Add Achievement
          </button>
        </div>
        <div className="space-y-3">
          {localAchievements.map((achievement, index) => (
            editingAchievementIndex === index ? (
              <div key={index} className="p-4 bg-blue-100 dark:bg-blue-900/40 border-2 border-blue-400 rounded-lg">
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editAchievement.title || ''}
                    onChange={(e) => setEditAchievement({ ...editAchievement, title: e.target.value })}
                    placeholder="Title"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                  />
                  <input
                    type="text"
                    value={editAchievement.symbol || ''}
                    onChange={(e) => setEditAchievement({ ...editAchievement, symbol: e.target.value })}
                    placeholder="Symbol"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                  />
                  <input
                    type="number"
                    value={editAchievement.points ?? 0}
                    onChange={(e) => setEditAchievement({ ...editAchievement, points: parseInt(e.target.value) || 0 })}
                    placeholder="Points"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                  />
                  <textarea
                    value={editAchievement.description || ''}
                    onChange={(e) => setEditAchievement({ ...editAchievement, description: e.target.value })}
                    placeholder="Description (shown to players)"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                    rows={3}
                  />
                  <input
                    type="text"
                    value={editAchievement.ai_hint || ''}
                    onChange={(e) => setEditAchievement({ ...editAchievement, ai_hint: e.target.value })}
                    placeholder="AI Hint (optional precise trigger conditions)"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                  />
                  <label className="flex items-center gap-2 text-gray-900 dark:text-white">
                    <input
                      type="checkbox"
                      checked={!!editAchievement.dateAchieved}
                      onChange={(e) => setEditAchievement({ 
                        ...editAchievement, 
                        dateAchieved: e.target.checked ? new Date() : null
                      })}
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
                className={`p-4 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-move flex items-center gap-3 ${
                  draggedAchievementIndex === index ? 'opacity-50' : ''
                }`}
              >
                <span className="text-gray-400 select-none">⋮⋮</span>
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-white">
                    {achievement.symbol} {achievement.title} ({achievement.points} pts)
                    {achievement.dateAchieved && <span className="ml-2 text-green-500">✓</span>}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">{achievement.description}</div>
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => moveAchievementUp(index)}
                    disabled={index === 0}
                    className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded flex items-center justify-center"
                    title="Move up"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveAchievementDown(index)}
                    disabled={index === localAchievements.length - 1}
                    className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded flex items-center justify-center"
                    title="Move down"
                  >
                    ▼
                  </button>
                </div>
                <button
                  onClick={() => startEditAchievement(index)}
                  className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded"
                >
                  ✏️
                </button>
                <button
                  onClick={() => removeAchievement(index)}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
                >
                  Remove
                </button>
              </div>
            )
          ))}
          {localAchievements.length === 0 && (
            <p className="text-sm text-gray-600 dark:text-gray-400">No achievements yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// Inventory Editor
function InventoryEditor({ 
  inventory, 
  onUpdate 
}: { 
  inventory: InventoryItem[]; 
  onUpdate: (inventory: InventoryItem[]) => void;
}) {
  const [localInventory, setLocalInventory] = useState([...inventory]);
  const [draggedInventoryIndex, setDraggedInventoryIndex] = useState<number | null>(null);
  const [editingInventoryIndex, setEditingInventoryIndex] = useState<number | null>(null);
  const [editInventoryItem, setEditInventoryItem] = useState<Partial<InventoryItem>>({});

  // Drag-and-drop handlers for inventory
  const handleInventoryDragStart = (index: number) => {
    setDraggedInventoryIndex(index);
  };

  const handleInventoryDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedInventoryIndex === null || draggedInventoryIndex === index) return;
    
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

  const updateItem = (index: number, field: keyof InventoryItem, value: any) => {
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
      symbol: "📦" 
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
        <h4 className="text-lg font-bold text-gray-900 dark:text-white">🎒 Inventory ({localInventory.length} items)</h4>
        <button
          onClick={addItem}
          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg"
        >
          + Add Item
        </button>
      </div>
      <div className="space-y-3">
        {localInventory.map((item, index) => (
          editingInventoryIndex === index ? (
            <div key={index} className="p-4 bg-blue-100 dark:bg-blue-900/40 border-2 border-blue-400 rounded-lg">
              <div className="space-y-3">
                <input
                  type="text"
                  value={editInventoryItem.name || ''}
                  onChange={(e) => setEditInventoryItem({ ...editInventoryItem, name: e.target.value })}
                  placeholder="Item name"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                />
                <input
                  type="text"
                  value={editInventoryItem.symbol || ''}
                  onChange={(e) => setEditInventoryItem({ ...editInventoryItem, symbol: e.target.value })}
                  placeholder="Symbol"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    value={editInventoryItem.quantity ?? 1}
                    onChange={(e) => setEditInventoryItem({ ...editInventoryItem, quantity: parseInt(e.target.value) || 1 })}
                    placeholder="Quantity"
                    className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                  />
                  <input
                    type="text"
                    value={editInventoryItem.type || ''}
                    onChange={(e) => setEditInventoryItem({ ...editInventoryItem, type: e.target.value as 'normal' | 'consumable' | 'story' | 'misc' })}
                    placeholder="Type"
                    className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                  />
                </div>
                <textarea
                  value={editInventoryItem.description || ''}
                  onChange={(e) => setEditInventoryItem({ ...editInventoryItem, description: e.target.value })}
                  placeholder="Description"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
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
              className={`p-4 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-move flex items-center gap-3 ${
                draggedInventoryIndex === index ? 'opacity-50' : ''
              }`}
            >
              <span className="text-gray-400 select-none">⋮⋮</span>
              <div className="flex-1">
                <div className="font-medium text-gray-900 dark:text-white">
                  {item.symbol} {item.name} x{item.quantity} {item.type && `(${item.type})`}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">{item.description}</div>
              </div>
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => moveInventoryUp(index)}
                  disabled={index === 0}
                  className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded flex items-center justify-center"
                  title="Move up"
                >
                  ▲
                </button>
                <button
                  onClick={() => moveInventoryDown(index)}
                  disabled={index === localInventory.length - 1}
                  className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded flex items-center justify-center"
                  title="Move down"
                >
                  ▼
                </button>
              </div>
              <button
                onClick={() => startEditInventoryItem(index)}
                className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded"
              >
                ✏️
              </button>
              <button
                onClick={() => removeItem(index)}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
              >
                Remove
              </button>
            </div>
          )
        ))}
      </div>
    </div>
  );
}

// Lore Editor
function LoreEditor({ 
  lore, 
  plotBeats,
  onUpdate 
}: { 
  lore: StoryLore[];
  plotBeats: PlotBeat[];
  onUpdate: (lore: StoryLore[]) => void;
}) {
  const [localLore, setLocalLore] = useState([...lore]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [draggedLoreIndex, setDraggedLoreIndex] = useState<number | null>(null);
  const [editingLoreIndex, setEditingLoreIndex] = useState<number | null>(null);
  const [editLore, setEditLore] = useState<Partial<StoryLore>>({});
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
    items[index] = { ...items[index], ...editLore };
    setLocalLore(items);
    onUpdate(items);
    setEditingLoreIndex(null);
    setEditLore({});
  };

  const updateLore = (index: number, field: keyof StoryLore, value: any) => {
    const updated = [...localLore];
    (updated[index] as any)[field] = value;
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
      on_triggers: [],
      off_triggers: [],
      beats_trigger: [],
      beats_untrigger: [],
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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        addNotification("Not authenticated", "failure");
        return;
      }

      const compressed = await compressImage(file, 320, 180, 0.8);

      const ext = file.name.split('.').pop();
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
        <h4 className="text-lg font-bold text-gray-900 dark:text-white">📜 Lore Entries ({localLore.length})</h4>
        <button
          onClick={addLore}
          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg"
        >
          + Add Lore
        </button>
      </div>
      <div className="space-y-3">
        {localLore.map((loreItem, index) => (
          editingLoreIndex === index ? (
            <div key={index} className="p-4 bg-blue-100 dark:bg-blue-900/40 border-2 border-blue-400 rounded-lg">
              <div className="space-y-3">
                <input
                  type="text"
                  value={editLore.title || ''}
                  onChange={(e) => setEditLore({ ...editLore, title: e.target.value })}
                  placeholder="Lore title"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white font-semibold"
                />
                <textarea
                  value={editLore.content || ''}
                  onChange={(e) => setEditLore({ ...editLore, content: e.target.value })}
                  placeholder="Lore content (supports Markdown)"
                  className="w-full h-32 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white resize-none"
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Thumbnail URL (optional)</label>
                    <input
                      type="url"
                      value={editLore.thumbnailUrl || ''}
                      onChange={(e) => setEditLore({ ...editLore, thumbnailUrl: e.target.value })}
                      placeholder="https://..."
                      className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Shown in lore list and detail if provided (ideal ~320×180px, max 5MB).</p>
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
                        📸 Upload Thumbnail
                      </label>
                      {editLore.thumbnailUrl && (
                        <button
                          onClick={() => setEditLore({ ...editLore, thumbnailUrl: '' })}
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
                        alt={editLore.title || ''}
                        className="w-24 h-24 object-cover rounded border border-gray-300 dark:border-gray-600"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-xs text-gray-500 dark:text-gray-400">
                        No Preview
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={editLore.secrtet ?? false}
                      onChange={(e) => setEditLore({ ...editLore, secrtet: e.target.checked })}
                      className="rounded"
                    />
                    <span>🔒 Secret Lore (hidden until discovered)</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={editLore.on !== false}
                      onChange={(e) => setEditLore({ ...editLore, on: e.target.checked })}
                      className="rounded"
                    />
                    <span>✅ Enabled</span>
                  </label>
                </div>

                {/* ON/OFF Trigger Words */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      ✅ ON Trigger Words
                    </label>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="e.g., 'Found the Ancient Map'"
                          className="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const input = e.currentTarget;
                              const value = input.value.trim();
                              if (value && !(editLore.on_triggers || []).includes(value)) {
                                setEditLore({
                                  ...editLore,
                                  on_triggers: [...(editLore.on_triggers || []), value]
                                });
                                input.value = '';
                              }
                            }
                          }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(editLore.on_triggers || []).map((trigger, idx) => (
                          <span key={idx} className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs flex items-center gap-1">
                            ✅ {trigger}
                            <button
                              onClick={() => setEditLore({
                                ...editLore,
                                on_triggers: (editLore.on_triggers || []).filter((_, i) => i !== idx)
                              })}
                              className="hover:text-green-900 dark:hover:text-green-100"
                            >×</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      ❌ OFF Trigger Words
                    </label>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="e.g., 'Destroyed the Map'"
                          className="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const input = e.currentTarget;
                              const value = input.value.trim();
                              if (value && !(editLore.off_triggers || []).includes(value)) {
                                setEditLore({
                                  ...editLore,
                                  off_triggers: [...(editLore.off_triggers || []), value]
                                });
                                input.value = '';
                              }
                            }
                          }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(editLore.off_triggers || []).map((trigger, idx) => (
                          <span key={idx} className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full text-xs flex items-center gap-1">
                            ❌ {trigger}
                            <button
                              onClick={() => setEditLore({
                                ...editLore,
                                off_triggers: (editLore.off_triggers || []).filter((_, i) => i !== idx)
                              })}
                              className="hover:text-red-900 dark:hover:text-red-100"
                            >×</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Plot Beat Triggers */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      ✅ Beats that turn this lore ON
                    </label>
                    <div className="max-h-40 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-700">
                      {plotBeats.length === 0 ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400 italic">No plot beats yet.</p>
                      ) : (
                        plotBeats.map((beat, beatIndex) => (
                          <label key={beatIndex} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded cursor-pointer">
                            <input
                              type="checkbox"
                              checked={(editLore.beats_trigger || []).includes(beatIndex)}
                              onChange={(e) => {
                                const current = editLore.beats_trigger || [];
                                setEditLore({
                                  ...editLore,
                                  beats_trigger: e.target.checked
                                    ? [...current, beatIndex]
                                    : current.filter(i => i !== beatIndex),
                                });
                              }}
                              className="w-4 h-4 text-green-600 rounded"
                            />
                            <span className="text-xs text-gray-900 dark:text-white">{beat.title || `Beat ${beatIndex + 1}`}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      ❌ Beats that turn this lore OFF
                    </label>
                    <div className="max-h-40 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-700">
                      {plotBeats.length === 0 ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400 italic">No plot beats yet.</p>
                      ) : (
                        plotBeats.map((beat, beatIndex) => (
                          <label key={beatIndex} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded cursor-pointer">
                            <input
                              type="checkbox"
                              checked={(editLore.beats_untrigger || []).includes(beatIndex)}
                              onChange={(e) => {
                                const current = editLore.beats_untrigger || [];
                                setEditLore({
                                  ...editLore,
                                  beats_untrigger: e.target.checked
                                    ? [...current, beatIndex]
                                    : current.filter(i => i !== beatIndex),
                                });
                              }}
                              className="w-4 h-4 text-red-600 rounded"
                            />
                            <span className="text-xs text-gray-900 dark:text-white">{beat.title || `Beat ${beatIndex + 1}`}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
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
              className={`p-4 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-move flex items-center gap-3 ${
                draggedLoreIndex === index ? 'opacity-50' : ''
              }`}
            >
              <span className="text-gray-400 select-none">⋮⋮</span>
              <div className="flex-1">
                <div className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                  {loreItem.secrtet && '🔒 '}{loreItem.title}
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
                    title={loreItem.on ? "Lore is enabled" : "Lore is disabled"}
                  >
                    {loreItem.on ? "ON" : "OFF"}
                  </button>
                </div>
                {loreItem.thumbnailUrl && (
                  <img
                    src={loreItem.thumbnailUrl}
                    alt={loreItem.title}
                    className="mt-2 w-20 h-20 object-cover rounded border border-gray-300 dark:border-gray-600"
                  />
                )}
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{loreItem.content}</div>
                {(loreItem.on_triggers && loreItem.on_triggers.length > 0) && (
                  <div className="text-xs text-green-700 dark:text-green-400 mt-1">
                    <strong>✅ ON Triggers:</strong> {loreItem.on_triggers.join(', ')}
                  </div>
                )}
                {(loreItem.off_triggers && loreItem.off_triggers.length > 0) && (
                  <div className="text-xs text-red-700 dark:text-red-400 mt-1">
                    <strong>❌ OFF Triggers:</strong> {loreItem.off_triggers.join(', ')}
                  </div>
                )}
                {(loreItem.beats_trigger && loreItem.beats_trigger.length > 0) && (
                  <div className="text-xs text-green-700 dark:text-green-400 mt-1">
                    <strong>✅ Beats turning ON:</strong> {loreItem.beats_trigger.map(i => plotBeats[i]?.title || `Beat ${i + 1}`).join(', ')}
                  </div>
                )}
                {(loreItem.beats_untrigger && loreItem.beats_untrigger.length > 0) && (
                  <div className="text-xs text-red-700 dark:text-red-400 mt-1">
                    <strong>❌ Beats turning OFF:</strong> {loreItem.beats_untrigger.map(i => plotBeats[i]?.title || `Beat ${i + 1}`).join(', ')}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => moveLoreUp(index)}
                  disabled={index === 0}
                  className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded flex items-center justify-center"
                  title="Move up"
                >
                  ▲
                </button>
                <button
                  onClick={() => moveLoreDown(index)}
                  disabled={index === localLore.length - 1}
                  className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded flex items-center justify-center"
                  title="Move down"
                >
                  ▼
                </button>
              </div>
              <button
                onClick={() => startEditLore(index)}
                className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded"
              >
                ✏️
              </button>
              <button
                onClick={() => removeLore(index)}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
              >
                Remove
              </button>
            </div>
          )
        ))}
      </div>
    </div>
  );
}

// Story Meta Editor
function StoryMetaEditor({ 
  plotBeats, 
  memory,
  premise,
  authorNotes,
  onUpdate 
}: { 
  plotBeats: PlotBeat[]; 
  memory: string[];
  premise: string;
  authorNotes?: string;
  onUpdate: (updates: Partial<StoryData>) => void;
}) {
  const [localPlotBeats, setLocalPlotBeats] = useState<PlotBeat[]>([...plotBeats]);
  const [localAuthorNotes, setLocalAuthorNotes] = useState<string>(authorNotes || "");
  const [localMemory, setLocalMemory] = useState<string[]>([...memory]);
  const [newMemoryEntry, setNewMemoryEntry] = useState<string>("");
  const [draggedPlotBeatIndex, setDraggedPlotBeatIndex] = useState<number | null>(null);
  const [editingPlotBeatIndex, setEditingPlotBeatIndex] = useState<number | null>(null);
  const [editPlotBeat, setEditPlotBeat] = useState<Partial<PlotBeat>>({});

  const updateBeat = (index: number, field: keyof PlotBeat, value: any) => {
    const updated = [...localPlotBeats];
    (updated[index] as any)[field] = value;
    setLocalPlotBeats(updated);
    onUpdate({ plot_beats: updated });
  };

  const addBeat = () => {
    const newBeat: PlotBeat = { title: "New plot beat", content: "Description...", fulfilled: false };
    const updated = [...localPlotBeats, newBeat];
    setLocalPlotBeats(updated);
    onUpdate({ plot_beats: updated });
  };

  const removeBeat = (index: number) => {
    const updated = localPlotBeats.filter((_, i) => i !== index);
    setLocalPlotBeats(updated);
    onUpdate({ plot_beats: updated });
  };

  const handlePlotBeatDragStart = (index: number) => {
    setDraggedPlotBeatIndex(index);
  };

  const handlePlotBeatDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedPlotBeatIndex === null || draggedPlotBeatIndex === index) return;

    const newPlotBeats = [...localPlotBeats];
    const draggedItem = newPlotBeats[draggedPlotBeatIndex];
    newPlotBeats.splice(draggedPlotBeatIndex, 1);
    newPlotBeats.splice(index, 0, draggedItem);
    
    setLocalPlotBeats(newPlotBeats);
    setDraggedPlotBeatIndex(index);
    onUpdate({ plot_beats: newPlotBeats });
  };

  const handlePlotBeatDragEnd = () => {
    setDraggedPlotBeatIndex(null);
  };

  const movePlotBeatUp = (index: number) => {
    if (index === 0) return;
    const newPlotBeats = [...localPlotBeats];
    [newPlotBeats[index - 1], newPlotBeats[index]] = [newPlotBeats[index], newPlotBeats[index - 1]];
    setLocalPlotBeats(newPlotBeats);
    onUpdate({ plot_beats: newPlotBeats });
  };

  const movePlotBeatDown = (index: number) => {
    if (index === localPlotBeats.length - 1) return;
    const newPlotBeats = [...localPlotBeats];
    [newPlotBeats[index], newPlotBeats[index + 1]] = [newPlotBeats[index + 1], newPlotBeats[index]];
    setLocalPlotBeats(newPlotBeats);
    onUpdate({ plot_beats: newPlotBeats });
  };

  const startEditPlotBeat = (index: number) => {
    setEditingPlotBeatIndex(index);
    setEditPlotBeat({ ...localPlotBeats[index] });
  };

  const cancelEditPlotBeat = () => {
    setEditingPlotBeatIndex(null);
    setEditPlotBeat({});
  };

  const saveEditPlotBeat = () => {
    if (editingPlotBeatIndex !== null && editPlotBeat.title && editPlotBeat.content) {
      const updated = [...localPlotBeats];
      updated[editingPlotBeatIndex] = editPlotBeat as PlotBeat;
      setLocalPlotBeats(updated);
      onUpdate({ plot_beats: updated });
      setEditingPlotBeatIndex(null);
      setEditPlotBeat({});
    }
  };

  return (
    <div className="space-y-6">
      {/* Plot Beats */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-bold text-gray-900 dark:text-white">📖 Plot Beats</h4>
          <button
            onClick={addBeat}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg"
          >
            + Add Beat
          </button>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">💡 Drag and drop to reorder (or use arrow buttons on mobile)</p>
        <div className="space-y-3">
          {localPlotBeats.map((beat, index) => (
            <div
              key={index}
              draggable={editingPlotBeatIndex !== index}
              onDragStart={() => handlePlotBeatDragStart(index)}
              onDragOver={(e) => handlePlotBeatDragOver(e, index)}
              onDragEnd={handlePlotBeatDragEnd}
              className={`p-4 bg-gray-50 dark:bg-gray-700 rounded-lg transition-opacity ${
                editingPlotBeatIndex === index ? '' : 'cursor-move'
              } ${draggedPlotBeatIndex === index ? 'opacity-50' : 'opacity-100'}`}
            >
              {editingPlotBeatIndex === index ? (
                // Edit mode
                <div className="space-y-3">
                  <h5 className="text-sm font-bold text-gray-900 dark:text-white">✏️ Editing Plot Beat</h5>
                  <input
                    type="text"
                    value={editPlotBeat.title || ""}
                    onChange={(e) => setEditPlotBeat({ ...editPlotBeat, title: e.target.value })}
                    placeholder="Title"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                  />
                  <textarea
                    value={editPlotBeat.content || ""}
                    onChange={(e) => setEditPlotBeat({ ...editPlotBeat, content: e.target.value })}
                    placeholder="Content"
                    rows={3}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={saveEditPlotBeat}
                      disabled={!editPlotBeat.title || !editPlotBeat.content}
                      className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded"
                    >
                      ✓ Save
                    </button>
                    <button
                      onClick={cancelEditPlotBeat}
                      className="flex-1 px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                // View mode
                <div className="flex items-start gap-3">
                  <div className="text-xl cursor-grab active:cursor-grabbing select-none pt-1">⋮⋮</div>
                  <div className="flex-1">
                    <div className="font-bold text-gray-900 dark:text-white mb-1">{beat.title}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-300 mb-2">{beat.content}</div>
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={beat.fulfilled || false}
                        onChange={(e) => updateBeat(index, 'fulfilled', e.target.checked)}
                        className="rounded"
                      />
                      <span>✓ Fulfilled</span>
                    </label>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-1">
                      <button
                        onClick={() => movePlotBeatUp(index)}
                        disabled={index === 0}
                        className="px-2 py-1 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded text-xs"
                        title="Move up"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => movePlotBeatDown(index)}
                        disabled={index === localPlotBeats.length - 1}
                        className="px-2 py-1 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded text-xs"
                        title="Move down"
                      >
                        ▼
                      </button>
                    </div>
                    <button
                      onClick={() => startEditPlotBeat(index)}
                      className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => removeBeat(index)}
                      className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Author Notes */}
      <div>
        <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
          ✍️ Author Notes
        </h4>
        <textarea
          value={localAuthorNotes}
          onChange={(e) => {
            setLocalAuthorNotes(e.target.value);
            onUpdate({ author_notes: e.target.value });
          }}
          placeholder="Add notes for the adventure creator or AI storyteller (these notes guide the narrative direction)..."
          className="w-full h-32 px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
        />
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          💡 These notes help guide the AI in maintaining story consistency and tone
        </p>
      </div>

      {/* Memory Entries (Editable) */}
      <div>
        <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-3">🧠 Memory Entries ({localMemory.length})</h4>
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Add new memory entry..."
              value={newMemoryEntry}
              onChange={(e) => setNewMemoryEntry(e.target.value)}
              className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
            />
            <button
              onClick={() => {
                const trimmed = newMemoryEntry.trim();
                if (!trimmed) return;
                const updated = [...localMemory, trimmed];
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
              <div key={index} className="p-3 bg-gray-50 dark:bg-gray-700 rounded text-sm text-gray-700 dark:text-gray-300 flex justify-between items-center">
                <span className="pr-2 flex-1">{entry}</span>
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
              <p className="text-xs text-gray-500 dark:text-gray-400 italic">No memory entries yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface MenuProps extends StoryData {
  storyDbId: string | null;
  onSaveProgress: () => Promise<void>;
  onUpdateStoryData: (updates: Partial<StoryData>) => void;
}

export default function MenuPage({ 
  storyDbId, 
  onSaveProgress,
  onUpdateStoryData,
  ...storyData 
}: MenuProps) {
  const router = useRouter();
  const { addNotification } = useNotification();
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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
  });
  
  // Advanced editing states
  const [editingStats, setEditingStats] = useState(false);
  const [editingResources, setEditingResources] = useState(false);
  const [editingInventory, setEditingInventory] = useState(false);
  const [editingAchievements, setEditingAchievements] = useState(false);
  const [editingLore, setEditingLore] = useState(false);
  const [editingPlotBeats, setEditingPlotBeats] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'stats' | 'inventory' | 'lore' | 'story'>('basic');

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
      a.download = `${storyData.story_name.replace(/[^a-z0-9]/gi, "_")}_${Date.now()}.json`;
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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      const response = await fetch(`/api/stories/${storyDbId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
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
    if (confirm("Are you sure you want to leave? Make sure your progress is saved!")) {
      router.push("/explorer");
    }
  };

  const calculateStoryProgress = () => {
    const totalParts = storyData.scene.parts.length;
    const totalBeats = storyData.plot_beats.length;
    const fulfilledBeats = storyData.plot_beats.filter((b) => b.fulfilled).length;
    const achievementCount = storyData.achievements.length;

    return {
      totalParts,
      totalBeats,
      fulfilledBeats,
      achievementCount,
      progress: totalBeats > 0 ? Math.round((fulfilledBeats / totalBeats) * 100) : 0,
    };
  };

  const stats = calculateStoryProgress();
  const totalEarnedPoints = (storyData.earnedPointsFromBeats || []).reduce((a, b) => a + b, 0) +
    (storyData.earnedPointsFromChapters || []).reduce((a, b) => a + b, 0);
  const availablePoints = storyData.points;

  return (
    <div className="w-full space-y-6">
      {/* Story Info Card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
          ⚙️ Story Menu
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Manage your adventure progress and settings
        </p>
      </div>

      {/* Story Progress Card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
          📊 Story Progress
        </h3>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {stats.totalParts}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Story Parts</p>
          </div>
          <div className="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
              {stats.fulfilledBeats}/{stats.totalBeats}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Plot Beats</p>
          </div>
          <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">
              {stats.achievementCount}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Achievements</p>
          </div>
          <div className="text-center p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
            <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">
              {stats.progress}%
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Completion</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
          <div
            className="bg-linear-to-r from-purple-500 to-pink-500 h-3 transition-all duration-500"
            style={{ width: `${stats.progress}%` }}
          />
        </div>

        {/* Points & Momentum Summary */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-center">
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Available Points</p>
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{availablePoints}</p>
          </div>
          <div className="p-4 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-center">
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Total Earned</p>
            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{totalEarnedPoints}</p>
          </div>
          <div className="p-4 rounded-lg bg-pink-50 dark:bg-pink-900/20 text-center">
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Spent / Used</p>
            <p className="text-2xl font-bold text-pink-600 dark:text-pink-400">{Math.max(totalEarnedPoints - availablePoints, 0)}</p>
          </div>
          <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-center">
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Momentum</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{storyData.momentum}/{storyData.maxMomentum}</p>
          </div>
        </div>
      </div>

      {/* Player Notes Card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            📝 Player Notes
          </h3>
          <button
            onClick={() => setEditingNotes(!editingNotes)}
            className="px-3 py-1 text-sm bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/50 rounded-lg transition-colors"
          >
            {editingNotes ? "Cancel" : "Edit"}
          </button>
        </div>

        {editingNotes ? (
          <div className="space-y-3">
            <textarea
              value={playerNotes}
              onChange={(e) => setPlayerNotes(e.target.value)}
              placeholder="Write your notes, strategies, or thoughts about the story..."
              className="w-full h-40 px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setPlayerNotes(storyData.player_notes || "");
                  setEditingNotes(false);
                }}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNotes}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                Save Notes
              </button>
            </div>
          </div>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {playerNotes ? (
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {playerNotes}
              </p>
            ) : (
              <p className="text-gray-400 dark:text-gray-500 italic">
                No notes yet. Click Edit to add your thoughts!
              </p>
            )}
          </div>
        )}
      </div>

      {/* Actions Card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
          🎮 Actions
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Settings */}
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center justify-center gap-3 px-6 py-4 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors shadow-md"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Story Settings</span>
          </button>

          {/* Save Progress */}
          <button
            onClick={handleSaveProgress}
            disabled={saving || !storyDbId}
            className="flex items-center justify-center gap-3 px-6 py-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors shadow-md"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                <span>Save Progress</span>
              </>
            )}
          </button>

          {/* Export Story */}
          <button
            onClick={handleExportStory}
            disabled={exporting}
            className="flex items-center justify-center gap-3 px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors shadow-md"
          >
            {exporting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Export Story</span>
              </>
            )}
          </button>

          {/* Return to Explorer */}
          <button
            onClick={handleReturnToExplorer}
            className="flex items-center justify-center gap-3 px-6 py-4 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors shadow-md"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Return to Explorer</span>
          </button>

          {/* Delete Story */}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={deleting || !storyDbId}
            className="flex items-center justify-center gap-3 px-6 py-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors shadow-md"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Delete Story</span>
          </button>
        </div>
      </div>

      {/* Story Info Card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
          ℹ️ Story Information
        </h3>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
            <span className="text-gray-600 dark:text-gray-400">Story Name:</span>
            <span className="font-semibold text-gray-900 dark:text-white">
              {storyData.story_name}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
            <span className="text-gray-600 dark:text-gray-400">Player Name:</span>
            <span className="font-semibold text-gray-900 dark:text-white">
              {storyData.player_name}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
            <span className="text-gray-600 dark:text-gray-400">Total Memory Entries:</span>
            <span className="font-semibold text-gray-900 dark:text-white">
              {storyData.memory.length}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
            <span className="text-gray-600 dark:text-gray-400">Inventory Items:</span>
            <span className="font-semibold text-gray-900 dark:text-white">
              {storyData.inventory.length}
            </span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-gray-600 dark:text-gray-400">Lore Entries:</span>
            <span className="font-semibold text-gray-900 dark:text-white">
              {storyData.lore.length}
            </span>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-md w-full border border-gray-200 dark:border-gray-700">
            <h3 className="text-xl font-bold text-red-600 dark:text-red-400 mb-4">
              ⚠️ Delete Story?
            </h3>
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              Are you sure you want to permanently delete this story? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 px-4 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteStory}
                disabled={deleting}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Deleting...</span>
                  </>
                ) : (
                  "Delete Forever"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comprehensive Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-6xl w-full border border-gray-200 dark:border-gray-700 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                ⚙️ Story Editor
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 px-6 pt-4 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
              {[
                { id: 'basic', label: '📝 Basic', icon: '📝' },
                { id: 'stats', label: '📊 Stats & Resources', icon: '📊' },
                { id: 'inventory', label: '🎒 Inventory', icon: '🎒' },
                { id: 'lore', label: '📜 Lore', icon: '📜' },
                { id: 'story', label: '📖 Story', icon: '📖' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-4 py-2 font-semibold rounded-t-lg transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'basic' && (
                <BasicSettings 
                  form={settingsForm} 
                  onChange={setSettingsForm} 
                />
              )}
              
              {activeTab === 'stats' && (
                <StatsResourcesEditor 
                  stats={storyData.stats}
                  resources={storyData.resources}
                  achievements={storyData.achievements}
                  onUpdate={(updates) => onUpdateStoryData(updates)}
                />
              )}
              
              {activeTab === 'inventory' && (
                <InventoryEditor 
                  inventory={storyData.inventory}
                  onUpdate={(inventory) => onUpdateStoryData({ inventory })}
                />
              )}
              
              {activeTab === 'lore' && (
                <LoreEditor 
                  lore={storyData.lore}
                  plotBeats={storyData.plot_beats}
                  onUpdate={(lore) => onUpdateStoryData({ lore })}
                />
              )}
              
              {activeTab === 'story' && (
                <StoryMetaEditor 
                  plotBeats={storyData.plot_beats}
                  memory={storyData.memory}
                  premise={storyData.premise}
                  onUpdate={(updates) => onUpdateStoryData(updates)}
                />
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
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
                  });
                  setShowSettings(false);
                }}
                className="flex-1 px-4 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await handleSaveSettings();
                  await onSaveProgress();
                }}
                className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
              >
                💾 Save All Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
