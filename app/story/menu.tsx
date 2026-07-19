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
} from "../misc/structs";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useNotification } from "../misc/NotificationContext";
import ConfirmDialog from "../components/ConfirmDialog";
import { getLocalPlayerId } from "../misc/localPlayerId";
import { DynamicIcon } from "../components/DynamicIcon";
import { CustomTablesEditor } from "../components/CustomTablesEditor";
import { DraggableScroll } from "../components/DraggableScroll";
import ChatDisplaySettings from "./menu/ChatDisplaySettings";
import BasicSettings, { BasicSettingsForm } from "./menu/BasicSettings";
import StatsResourcesEditor from "./menu/StatsResourcesEditor";
import QuestEditor from "./menu/QuestEditor";
import InventoryEditor from "./menu/InventoryEditor";
import AbilitiesEditor from "./menu/AbilitiesEditor";
import PassivesEditor from "./menu/PassivesEditor";
import LoreEditor from "./menu/LoreEditor";
import RelationshipsEditor from "./menu/RelationshipsEditor";
import NPCEditor from "./menu/NPCEditor";
import ConditionsEditor from "./menu/ConditionsEditor";
import VariablesEditor from "./menu/VariablesEditor";
import StoryMetaEditor from "./menu/StoryMetaEditor";

interface MenuProps extends StoryData {
  storyDbId: string | null;
  sourceAdventureId?: string | null;
  onSaveProgress: (updatedStoryData?: StoryData) => Promise<void>;
  onUpdateStoryData: (updates: Partial<StoryData>) => void;
  onViewLogs?: () => void;
  onViewContext?: () => void;
  onOpenAIAssistant?: () => void;
}

export default function MenuPage({
  storyDbId,
  sourceAdventureId,
  onSaveProgress,
  onUpdateStoryData,
  onViewLogs,
  onViewContext,
  onOpenAIAssistant,
  ...storyData
}: MenuProps) {
  const router = useRouter();
  const { addNotification } = useNotification();
  const localPlayerId = getLocalPlayerId();
  const [saving, setSaving] = useState(false);
  const [savingAs, setSavingAs] = useState(false);
  const [showSaveCopyModal, setShowSaveCopyModal] = useState(false);
  const [saveCopyName, setSaveCopyName] = useState("");
  const [jumpToNewSave, setJumpToNewSave] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [playerNotes, setPlayerNotes] = useState(storyData.player_notes || "");
  const [editingChatDisplay, setEditingChatDisplay] = useState(false);
  const [chatDisplayName, setChatDisplayName] = useState(
    storyData.displayName || "",
  );
  const [chatDisplayAvatar, setChatDisplayAvatar] = useState(
    storyData.displayAvatar || "",
  );

  useEffect(() => {
    if (!editingChatDisplay) {
      setChatDisplayName(storyData.displayName || "");
      setChatDisplayAvatar(storyData.displayAvatar || "");
    }
    // Only resync when persisted values change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyData.displayName, storyData.displayAvatar]);

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
    displayName: storyData.displayName || "",
    displayAvatar: storyData.displayAvatar || "",
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
    | "multiplayer"
    | "stats"
    | "inventory"
    | "abilities"
    | "passives"
    | "quests"
    | "lore"
    | "npcs"
    | "relationships"
    | "conditions"
    | "variables"
    | "tables"
    | "threads"
    | "mythic"
    | "story"
    | "tts"
    | "ai"
  >("basic");

  const [multiplayerEnabled, setMultiplayerEnabled] = useState<boolean>(
    !!storyData.multiplayer?.enabled,
  );
  const [multiplayerMode, setMultiplayerMode] = useState<
    "host" | "any" | "timer"
  >(storyData.multiplayer?.mode || "host");
  const [multiplayerTimerMinutes, setMultiplayerTimerMinutes] =
    useState<number>(storyData.multiplayer?.timerMinutes ?? 2);
  const [multiplayerHostUserId, setMultiplayerHostUserId] = useState<string>(
    storyData.multiplayer?.hostUserId || "",
  );
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
      const updates: Partial<StoryData> = { player_notes: playerNotes };
      onUpdateStoryData(updates);
      await onSaveProgress({ ...storyData, ...updates } as StoryData);
      setEditingNotes(false);
      addNotification("Notes saved!", "success");
    } catch (error) {
      addNotification("Failed to save notes", "failure");
    }
  };

  const handleSaveChatDisplay = async () => {
    try {
      const updates: Partial<StoryData> = {
        displayName: chatDisplayName.trim() || undefined,
        displayAvatar: chatDisplayAvatar.trim() || undefined,
      };
      onUpdateStoryData(updates);
      await onSaveProgress({ ...storyData, ...updates } as StoryData);
      setEditingChatDisplay(false);
      addNotification("Chat display settings saved!", "success");
    } catch (error) {
      addNotification("Failed to save chat display settings", "failure");
    }
  };

  const handleSaveAs = () => {
    // Generate default name with timestamp
    const timestamp = new Date().toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    setSaveCopyName(`${storyData.story_name} (Save ${timestamp})`);
    setShowSaveCopyModal(true);
  };

  const handleSaveCopyConfirm = async () => {
    const copyName = saveCopyName.trim() || storyData.story_name;
    setShowSaveCopyModal(false);
    setSavingAs(true);

    try {
      // Create a copy with the custom name
      const copyData: StoryData = {
        ...storyData,
        story_name: copyName,
      };

      const { saveLocalStory } = await import("../misc/localStoryManager");
      const newLocalId = `local_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      await saveLocalStory(newLocalId, copyData);

      addNotification(`Saved as "${copyName}"`, "success");

      // Navigate to the new story if toggle is enabled
      if (jumpToNewSave) {
        router.push(`/story?storyId=${newLocalId}`);
      }
    } catch (error) {
      console.error("Error saving as:", error);
      addNotification("Failed to create save", "failure");
    } finally {
      setSavingAs(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      const resolvedHostUserId =
        multiplayerEnabled &&
        (multiplayerMode === "host" || multiplayerMode === "timer")
          ? (multiplayerHostUserId || localPlayerId || "").trim() || undefined
          : undefined;
      const resolvedTimerMinutes =
        multiplayerMode === "timer"
          ? Math.max(1, Math.floor(multiplayerTimerMinutes || 2))
          : undefined;

      const updates: Partial<StoryData> = {
        story_name: settingsForm.story_name,
        player_name: settingsForm.player_name,
        player_summary: settingsForm.player_summary,
        premise: settingsForm.premise,
        max_chapters: settingsForm.max_chapters,
        points: settingsForm.points,
        momentum: settingsForm.momentum,
        maxMomentum: settingsForm.maxMomentum,
        displayName: settingsForm.displayName || undefined,
        displayAvatar: settingsForm.displayAvatar || undefined,
        rpgSystem: settingsForm.rpgSystem,
        multiplayer: {
          enabled: multiplayerEnabled,
          mode: multiplayerMode,
          timerMinutes: resolvedTimerMinutes,
          hostUserId: resolvedHostUserId,
        },
      };
      onUpdateStoryData(updates);
      await onSaveProgress({ ...storyData, ...updates } as StoryData);
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
        "_",
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
      const { deleteLocalStory } = await import("../misc/localStoryManager");
      await deleteLocalStory(storyDbId);
      addNotification("Story deleted", "info");
      router.push("/library");
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
        router.push("/library");
      },
    });
  };

  const calculateStoryProgress = () => {
    const totalParts = storyData.scene.parts.length;
    const achievementCount = storyData.achievements.length;
    const achievedCount = storyData.achievements.filter(
      (a) => a.dateAchieved,
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
    0,
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
          disabled={savingAs}
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
      {onOpenAIAssistant && (
        <button
          onClick={onOpenAIAssistant}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-linear-to-r from-purple-600/80 to-pink-600/80 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-xl transition-all border border-purple-500/30"
        >
          <DynamicIcon name="Wand2" className="w-5 h-5" />
          <span>AI Editor</span>
        </button>
      )}

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

      {/* Chat Display Settings - Collapsible */}
      <div className="bg-[#0f1a2e] rounded-xl border border-blue-800/30 overflow-hidden">
        <button
          onClick={() => setEditingChatDisplay(!editingChatDisplay)}
          className="w-full flex items-center justify-between p-3 hover:bg-blue-900/20 transition-colors"
        >
          <span className="text-sm font-medium text-white flex items-center gap-2">
            <DynamicIcon
              name="MessageCircle"
              className="w-4 h-4 text-purple-300"
            />
            Chat Display Settings
          </span>
          <DynamicIcon
            name={editingChatDisplay ? "ChevronUp" : "ChevronDown"}
            className="w-4 h-4 text-blue-300/60"
          />
        </button>

        {editingChatDisplay && (
          <div className="p-3 pt-0 space-y-3">
            <p className="text-xs text-blue-200/60">
              Leave empty to use your account defaults.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-blue-200/70 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={chatDisplayName}
                  onChange={(e) => setChatDisplayName(e.target.value)}
                  placeholder={storyData.player_name || "Your name"}
                  className="w-full px-3 py-2 bg-blue-900/30 border border-blue-700/40 rounded-lg text-white text-sm placeholder-blue-300/40 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-blue-200/70 mb-1">
                  Avatar URL
                </label>
                <input
                  type="url"
                  value={chatDisplayAvatar}
                  onChange={(e) => setChatDisplayAvatar(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 bg-blue-900/30 border border-blue-700/40 rounded-lg text-white text-sm placeholder-blue-300/40 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </div>

            {chatDisplayAvatar.trim() && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-blue-200/60">Preview:</span>
                <img
                  src={chatDisplayAvatar}
                  alt="Avatar preview"
                  className="w-8 h-8 rounded-full object-cover border border-purple-500/40"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setChatDisplayName(storyData.displayName || "");
                  setChatDisplayAvatar(storyData.displayAvatar || "");
                  setEditingChatDisplay(false);
                }}
                className="px-3 py-1.5 text-xs bg-blue-800/50 text-blue-200 rounded-lg hover:bg-blue-700/50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveChatDisplay}
                className="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded-lg"
              >
                Save
              </button>
            </div>
          </div>
        )}

        {!editingChatDisplay && (chatDisplayName || chatDisplayAvatar) && (
          <div className="px-3 pb-3">
            <p className="text-xs text-blue-200/70 whitespace-pre-wrap line-clamp-2">
              {chatDisplayName ? `Name: ${chatDisplayName}` : ""}
              {chatDisplayName && chatDisplayAvatar ? "\n" : ""}
              {chatDisplayAvatar ? "Avatar: set" : ""}
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
                        const { getLocalAdventure } =
                          await import("@/app/misc/localAdventureManager");
                        const localAdv =
                          await getLocalAdventure(sourceAdventureId);
                        freshTemplate =
                          (localAdv?.adventureData as Partial<Adventure>)
                            ?.storyTemplate || null;
                      } catch (e) {
                        console.warn(
                          "Could not fetch fresh adventure data, using current story values",
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
                          }),
                        ) || [],
                      lore: (freshTemplate?.lore || storyData.lore).map(
                        (l) => ({
                          ...l,
                          on:
                            l.on_triggers && l.on_triggers.length > 0
                              ? false
                              : true,
                        }),
                      ),
                      newGamePlusMode: false,
                    };
                    const { saveLocalStory } =
                      await import("@/app/misc/localStoryManager");
                    await saveLocalStory(storyDbId, resetStoryData);
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
                    const { deleteLocalStory } =
                      await import("../misc/localStoryManager");
                    await deleteLocalStory(storyDbId);
                    addNotification("Story deleted", "success");
                    router.push("/library");
                  } catch (error: any) {
                    addNotification(
                      error.message || "Failed to delete",
                      "failure",
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
            <span className="text-blue-200/60">Notes:</span>
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
                { id: "multiplayer", label: "Multiplayer", icon: "Users" },
                { id: "stats", label: "Stats & Resources", icon: "BarChart2" },
                { id: "inventory", label: "Inventory", icon: "Backpack" },
                { id: "abilities", label: "Abilities", icon: "Wand2" },
                { id: "passives", label: "Passives", icon: "Sparkles" },
                { id: "quests", label: "Quests", icon: "Scroll" },
                { id: "lore", label: "Notes", icon: "Book" },
                { id: "npcs", label: "NPCs", icon: "Users" },
                { id: "variables", label: "Variables", icon: "Variable" },
                { id: "tables", label: "Tables", icon: "Dices" },
                { id: "conditions", label: "Conditions", icon: "HeartPulse" },
                { id: "mythic", label: "mythic", icon: "Sparkles" },
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

              {activeTab === "multiplayer" && (
                <div className="mt-4 space-y-5">
                  <div className="p-4 bg-blue-950/50 rounded-lg border-2 border-blue-700/40">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="block text-sm font-semibold text-blue-200 mb-1">
                          Enable Multiplayer (Hot-seat)
                        </label>
                        <p className="text-xs text-blue-200/60">
                          Collect multiple player actions (as "&gt; Name:
                          action") before generating.
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={multiplayerEnabled}
                          onChange={(e) =>
                            setMultiplayerEnabled(() => {
                              const checked = e.target.checked;
                              if (checked && !multiplayerHostUserId.trim()) {
                                setMultiplayerHostUserId(localPlayerId);
                              }
                              return checked;
                            })
                          }
                          className="sr-only peer"
                        />
                        <div className="w-14 h-7 bg-blue-800/50 peer-focus:ring-4 peer-focus:ring-purple-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-1 after:bg-white after:border-blue-700/40 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-purple-600"></div>
                      </label>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-blue-200 mb-2">
                      Play Mode
                    </label>
                    <select
                      value={multiplayerMode}
                      onChange={(e) =>
                        setMultiplayerMode(
                          e.target.value as "host" | "any" | "timer",
                        )
                      }
                      className="w-full px-4 py-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="host">Generate on host command</option>
                      <option value="any">Generate on any command</option>
                      <option value="timer">Generate after timer</option>
                    </select>
                    <p className="text-xs text-blue-200/60">
                      Timer starts after the first queued input.
                    </p>
                  </div>

                  {(multiplayerMode === "host" ||
                    multiplayerMode === "timer") && (
                    <div className="p-4 bg-blue-950/30 rounded-lg border border-blue-700/30 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <label className="block text-sm font-semibold text-blue-200">
                            Host
                          </label>
                          <p className="text-xs text-blue-200/60 break-all">
                            {multiplayerHostUserId.trim()
                              ? multiplayerHostUserId.trim()
                              : "Not set"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setMultiplayerHostUserId(localPlayerId);
                          }}
                          className="px-3 py-2 text-xs font-semibold rounded-lg transition-colors border bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border-purple-500/30"
                          title="Set the host to this device"
                        >
                          Set me as host
                        </button>
                      </div>
                      <p className="text-xs text-blue-200/60">
                        Only the host can generate/clear in host and timer
                        modes.
                      </p>
                    </div>
                  )}

                  {multiplayerMode === "timer" && (
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-blue-200 mb-2">
                        Timer (minutes)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={multiplayerTimerMinutes}
                        onChange={(e) =>
                          setMultiplayerTimerMinutes(
                            parseInt(e.target.value) || 1,
                          )
                        }
                        className="w-full px-4 py-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  )}
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

              {activeTab === "npcs" && (
                <div className="mt-4">
                  <NPCEditor
                    npcs={storyData.npcs || []}
                    onUpdate={(npcs) => onUpdateStoryData({ npcs })}
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

              {activeTab === "conditions" && (
                <div className="mt-4">
                  <ConditionsEditor
                    conditions={storyData.conditions || []}
                    stats={storyData.stats || []}
                    onUpdate={(conditions) => onUpdateStoryData({ conditions })}
                  />
                </div>
              )}

              {activeTab === "mythic" && (
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
                                    storyData.agmtState!.sceneCount - 1,
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
                                      storyData.agmtState.currentStreak,
                                    ) * 20,
                                    100,
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
                                      (c) => c.success,
                                    ).length
                                  }{" "}
                                  wins
                                </span>
                                <span className="text-red-400">
                                  {
                                    storyData.agmtState.skillCheckHistory.filter(
                                      (c) => !c.success,
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
                    displayName: storyData.displayName || "",
                    displayAvatar: storyData.displayAvatar || "",
                    rpgSystem: storyData.rpgSystem || "3d6",
                  });
                  setMultiplayerEnabled(!!storyData.multiplayer?.enabled);
                  setMultiplayerMode(storyData.multiplayer?.mode || "host");
                  setMultiplayerTimerMinutes(
                    storyData.multiplayer?.timerMinutes ?? 2,
                  );
                  setMultiplayerHostUserId(
                    storyData.multiplayer?.hostUserId || "",
                  );
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

      {/* Save Copy Modal */}
      {showSaveCopyModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-60 p-4">
          <div className="bg-[#0d1829] rounded-xl border border-blue-700/40 w-full max-w-md shadow-2xl">
            <div className="p-4 border-b border-blue-800/30">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <DynamicIcon name="Copy" className="w-5 h-5 text-emerald-400" />
                Save Copy
              </h3>
              <p className="text-sm text-blue-300/60 mt-1">
                Create a save point you can return to later
              </p>
            </div>
            <div className="p-4">
              <label className="block text-sm font-medium text-blue-200 mb-2">
                Save Name
              </label>
              <input
                type="text"
                value={saveCopyName}
                onChange={(e) => setSaveCopyName(e.target.value)}
                placeholder="Enter a name for this save..."
                className="w-full px-3 py-2 bg-[#1a2744] border border-blue-700/40 rounded-lg text-white placeholder-blue-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && saveCopyName.trim()) {
                    handleSaveCopyConfirm();
                  } else if (e.key === "Escape") {
                    setShowSaveCopyModal(false);
                  }
                }}
              />

              {/* Jump to new save toggle */}
              <label className="flex items-center gap-3 mt-4 cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={jumpToNewSave}
                    onChange={(e) => setJumpToNewSave(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 bg-[#1a2744] border border-blue-700/40 rounded-full peer-checked:bg-emerald-600/80 transition-colors"></div>
                  <div className="absolute left-1 top-1 w-4 h-4 bg-blue-300/60 rounded-full peer-checked:translate-x-4 peer-checked:bg-white transition-all"></div>
                </div>
                <span className="text-sm text-blue-200 group-hover:text-white transition-colors">
                  Jump to new save after creating
                </span>
              </label>
            </div>
            <div className="p-4 border-t border-blue-800/30 flex justify-end gap-3">
              <button
                onClick={() => setShowSaveCopyModal(false)}
                className="px-4 py-2 text-blue-300 hover:text-white hover:bg-blue-800/30 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCopyConfirm}
                disabled={!saveCopyName.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800/30 disabled:text-emerald-300/40 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <DynamicIcon name="Save" className="w-4 h-4" />
                Save Copy
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
    </div>
  );
}
