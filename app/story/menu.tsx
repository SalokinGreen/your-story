"use client";

import { StoryData, Stat, Resource, InventoryItem, Achievement, StoryLore, PlotBeat } from "../misc/structs";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useNotification } from "../misc/NotificationContext";
import { supabase } from "../misc/supabase";

// Basic Settings Component
function BasicSettings({ form, onChange }: { form: any; onChange: (form: any) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Story Name
        </label>
        <input
          type="text"
          value={form.story_name}
          onChange={(e) => onChange({ ...form, story_name: e.target.value })}
          className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Player/Character Name
        </label>
        <input
          type="text"
          value={form.player_name}
          onChange={(e) => onChange({ ...form, player_name: e.target.value })}
          className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Character Description
        </label>
        <textarea
          value={form.player_summary}
          onChange={(e) => onChange({ ...form, player_summary: e.target.value })}
          className="w-full h-32 px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Story Premise
        </label>
        <textarea
          value={form.premise}
          onChange={(e) => onChange({ ...form, premise: e.target.value })}
          className="w-full h-24 px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Max Chapters
        </label>
        <input
          type="number"
          value={form.max_chapters}
          onChange={(e) => onChange({ ...form, max_chapters: parseInt(e.target.value) || 0 })}
          className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
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
  const [localStats, setLocalStats] = useState([...stats]);
  const [localResources, setLocalResources] = useState([...resources]);
  const [localAchievements, setLocalAchievements] = useState([...achievements]);

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
          {localStats.map((stat, index) => (
            <div key={index} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <input
                  type="text"
                  value={stat.name}
                  onChange={(e) => updateStat(index, 'name', e.target.value)}
                  placeholder="Stat name"
                  className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                />
                <input
                  type="text"
                  value={stat.symbol}
                  onChange={(e) => updateStat(index, 'symbol', e.target.value)}
                  placeholder="Symbol"
                  className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                />
                <input
                  type="number"
                  value={stat.value}
                  onChange={(e) => updateStat(index, 'value', parseInt(e.target.value) || 0)}
                  placeholder="Value"
                  className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                />
                <button
                  onClick={() => removeStat(index)}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
                >
                  Remove
                </button>
              </div>
              <textarea
                value={stat.description}
                onChange={(e) => updateStat(index, 'description', e.target.value)}
                placeholder="Description"
                className="mt-2 w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                rows={2}
              />
            </div>
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
            <div key={index} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                <input
                  type="text"
                  value={resource.name}
                  onChange={(e) => updateResource(index, 'name', e.target.value)}
                  placeholder="Resource name"
                  className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                />
                <input
                  type="text"
                  value={resource.symbol}
                  onChange={(e) => updateResource(index, 'symbol', e.target.value)}
                  placeholder="Symbol"
                  className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                />
                <input
                  type="number"
                  value={resource.value}
                  onChange={(e) => updateResource(index, 'value', parseInt(e.target.value) || 0)}
                  placeholder="Current"
                  className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                />
                <input
                  type="number"
                  value={resource.maxValue}
                  onChange={(e) => updateResource(index, 'maxValue', parseInt(e.target.value) || 0)}
                  placeholder="Max"
                  className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                />
                <button
                  onClick={() => removeResource(index)}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Achievements List (Read-only) */}
      <div>
        <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-4">🏆 Achievements ({localAchievements.length})</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {localAchievements.map((achievement, index) => (
            <div key={index} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{achievement.symbol}</span>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900 dark:text-white">{achievement.title}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{achievement.points} points</p>
                </div>
              </div>
            </div>
          ))}
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
      type: "misc",
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
          <div key={index} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              <input
                type="text"
                value={item.name}
                onChange={(e) => updateItem(index, 'name', e.target.value)}
                placeholder="Item name"
                className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
              />
              <input
                type="text"
                value={item.symbol}
                onChange={(e) => updateItem(index, 'symbol', e.target.value)}
                placeholder="Symbol"
                className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
              />
              <input
                type="number"
                value={item.quantity}
                onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                placeholder="Qty"
                className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
              />
              <input
                type="text"
                value={item.type || ""}
                onChange={(e) => updateItem(index, 'type', e.target.value)}
                placeholder="Type"
                className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
              />
              <button
                onClick={() => removeItem(index)}
                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
              >
                Remove
              </button>
            </div>
            <textarea
              value={item.description}
              onChange={(e) => updateItem(index, 'description', e.target.value)}
              placeholder="Description"
              className="mt-2 w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
              rows={2}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// Lore Editor
function LoreEditor({ 
  lore, 
  onUpdate 
}: { 
  lore: StoryLore[]; 
  onUpdate: (lore: StoryLore[]) => void;
}) {
  const [localLore, setLocalLore] = useState([...lore]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

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
      keys: []
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
          <div key={index} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <input
                type="text"
                value={loreItem.title}
                onChange={(e) => updateLore(index, 'title', e.target.value)}
                className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white font-semibold"
              />
              <button
                onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
                className="ml-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
              >
                {expandedIndex === index ? 'Collapse' : 'Expand'}
              </button>
              <button
                onClick={() => removeLore(index)}
                className="ml-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
              >
                Remove
              </button>
            </div>
            {expandedIndex === index && (
              <div className="space-y-3 mt-3">
                <textarea
                  value={loreItem.content}
                  onChange={(e) => updateLore(index, 'content', e.target.value)}
                  placeholder="Lore content (supports Markdown)"
                  className="w-full h-32 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white resize-none"
                />
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={loreItem.secrtet}
                    onChange={(e) => updateLore(index, 'secrtet', e.target.checked)}
                    className="rounded"
                  />
                  <span>🔒 Secret Lore (hidden until discovered)</span>
                </label>
              </div>
            )}
          </div>
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
  const [localPlotBeats, setLocalPlotBeats] = useState([...plotBeats]);
  const [localAuthorNotes, setLocalAuthorNotes] = useState(authorNotes || "");

  const updateBeat = (index: number, field: keyof PlotBeat, value: any) => {
    const updated = [...localPlotBeats];
    (updated[index] as any)[field] = value;
    setLocalPlotBeats(updated);
    onUpdate({ plot_beats: updated });
  };

  const addBeat = () => {
    const newBeat: PlotBeat = { content: "New plot beat", targetChapter: 1, fulfilled: false };
    const updated = [...localPlotBeats, newBeat];
    setLocalPlotBeats(updated);
    onUpdate({ plot_beats: updated });
  };

  const removeBeat = (index: number) => {
    const updated = localPlotBeats.filter((_, i) => i !== index);
    setLocalPlotBeats(updated);
    onUpdate({ plot_beats: updated });
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
        <div className="space-y-3">
          {localPlotBeats.map((beat, index) => (
            <div key={index} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <input
                  type="text"
                  value={beat.content}
                  onChange={(e) => updateBeat(index, 'content', e.target.value)}
                  placeholder="Plot beat description"
                  className="sm:col-span-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                />
                <input
                  type="number"
                  value={beat.targetChapter}
                  onChange={(e) => updateBeat(index, 'targetChapter', parseInt(e.target.value) || 1)}
                  placeholder="Chapter"
                  className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                />
                <button
                  onClick={() => removeBeat(index)}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
                >
                  Remove
                </button>
              </div>
              <label className="flex items-center gap-2 mt-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={beat.fulfilled || false}
                  onChange={(e) => updateBeat(index, 'fulfilled', e.target.checked)}
                  className="rounded"
                />
                <span>✓ Fulfilled</span>
              </label>
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

      {/* Memory Entries */}
      <div>
        <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
          🧠 Memory Entries ({memory.length})
        </h4>
        <div className="max-h-60 overflow-y-auto space-y-2">
          {memory.map((entry, index) => (
            <div key={index} className="p-3 bg-gray-50 dark:bg-gray-700 rounded text-sm text-gray-700 dark:text-gray-300">
              {entry}
            </div>
          ))}
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
  const [settingsForm, setSettingsForm] = useState({
    story_name: storyData.story_name,
    player_name: storyData.player_name,
    player_summary: storyData.player_summary,
    premise: storyData.premise,
    max_chapters: storyData.max_chapters,
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
