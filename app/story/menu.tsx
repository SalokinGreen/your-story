"use client";

import { StoryData, Adventure } from "../misc/structs";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useNotification } from "../misc/NotificationContext";
import ConfirmDialog from "../components/ConfirmDialog";
import { getLocalPlayerId } from "../misc/localPlayerId";
import { DynamicIcon } from "../components/DynamicIcon";
import { CustomTablesEditor } from "../components/CustomTablesEditor";
import BasicSettings, { BasicSettingsForm } from "./menu/BasicSettings";
import GoalEditor from "./menu/GoalEditor";
import AbilitiesEditor from "./menu/AbilitiesEditor";
import LoreEditor from "./menu/LoreEditor";
import RelationshipsEditor from "./menu/RelationshipsEditor";
import NPCEditor from "./menu/NPCEditor";
import ThreadsEditor from "./menu/ThreadsEditor";
import VariablesEditor from "./menu/VariablesEditor";
import StoryMetaEditor from "./menu/StoryMetaEditor";
import CouchPlayersEditor from "./menu/CouchPlayersEditor";
import OnlinePlayEditor from "./menu/OnlinePlayEditor";
import APIKeysModal from "../components/APIKeysModal";
import CompactStoryModal from "./menu/CompactStoryModal";
import FullScreenView from "../components/FullScreenView";
import { useAPIKeys } from "../misc/APIKeysContext";
import type { GuestJoinedInfo, NetSessionInfo } from "../misc/multiplayer/session";
import type { MPBackend } from "../misc/multiplayer/types";

interface MenuProps extends StoryData {
  storyDbId: string | null;
  sourceAdventureId?: string | null;
  onSaveProgress: (updatedStoryData?: StoryData) => Promise<void>;
  onUpdateStoryData: (updates: Partial<StoryData>) => void;
  onViewLogs?: () => void;
  onViewContext?: () => void;
  onOpenOOCChat?: () => void;
  netSession: NetSessionInfo | null;
  netPeers: GuestJoinedInfo[];
  onCreateNetRoom: (backend: MPBackend, displayName: string, color: string) => Promise<void>;
  onJoinNetRoom: (
    backend: MPBackend,
    roomId: string,
    displayName: string,
    color: string,
  ) => Promise<void>;
  onLeaveNetRoom: () => Promise<void>;
  onSwitchNetBackend: (backend: MPBackend) => Promise<void>;
  // Opens the Story Editor straight to this section on mount - used when
  // arriving here via an auto-host deep link from the Library/home page.
  autoOpenSection?: MenuTab;
}

type MenuTab =
  | "basic"
  | "hotseat"
  | "online"
  | "abilities"
  | "goals"
  | "lore"
  | "npcs"
  | "relationships"
  | "variables"
  | "tables"
  | "threads"
  | "mythic"
  | "story";

export default function MenuPage({
  storyDbId,
  sourceAdventureId,
  onSaveProgress,
  onUpdateStoryData,
  onViewLogs,
  onViewContext,
  onOpenOOCChat,
  netSession,
  netPeers,
  onCreateNetRoom,
  onJoinNetRoom,
  onLeaveNetRoom,
  onSwitchNetBackend,
  autoOpenSection,
  ...storyData
}: MenuProps) {
  const router = useRouter();
  const { addNotification } = useNotification();
  const localPlayerId = getLocalPlayerId();
  const { keys: apiKeys } = useAPIKeys();
  const [saving, setSaving] = useState(false);
  const [savingAs, setSavingAs] = useState(false);
  const [showSaveCopyModal, setShowSaveCopyModal] = useState(false);
  const [showCompactModal, setShowCompactModal] = useState(false);
  const [saveCopyName, setSaveCopyName] = useState("");
  const [jumpToNewSave, setJumpToNewSave] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAPIKeysModal, setShowAPIKeysModal] = useState(false);
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

  // Auto-open the Story Editor once on mount when arriving via a deep link
  // (e.g. "Host" from the Library, which wants to land straight on Online
  // Play instead of making the user find it).
  const autoOpenAppliedRef = useRef(false);
  useEffect(() => {
    if (autoOpenSection && !autoOpenAppliedRef.current) {
      autoOpenAppliedRef.current = true;
      setShowSettings(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track scroll position in the Story Editor content pane to highlight the
  // matching sidebar item as the user scrolls through the categories
  useEffect(() => {
    if (!showSettings) return;
    const container = contentScrollRef.current;
    if (!container) return;

    container.scrollTop = 0;

    if (autoOpenSection) {
      requestAnimationFrame(() => scrollToSection(autoOpenSection));
    } else {
      setActiveTab("basic");
    }

    const handleScroll = () => {
      const containerTop = container.getBoundingClientRect().top;
      // The active section is the last one whose top has scrolled up to
      // (or past) the top of the content pane, walking top to bottom.
      let currentId: MenuTab | null = null;
      for (const tab of sections) {
        const el = sectionRefs.current[tab.id];
        if (!el) continue;
        if (el.getBoundingClientRect().top - containerTop <= 24) {
          currentId = tab.id;
        } else {
          break;
        }
      }
      setActiveTab(currentId ?? getSection("basic").id);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSettings]);

  // Settings form state
  const [settingsForm, setSettingsForm] = useState<BasicSettingsForm>({
    story_name: storyData.story_name,
    player_name: storyData.player_name,
    player_summary: storyData.player_summary,
    premise: storyData.premise,
    max_chapters: storyData.max_chapters,
    displayName: storyData.displayName || "",
    displayAvatar: storyData.displayAvatar || "",
    diceMode: storyData.diceMode || "ai",
    playerArchetype: storyData.playerArchetype,
    autoGenerateChoices: storyData.autoGenerateChoices || false,
  });

  // Advanced editing states
  const [editingStats, setEditingStats] = useState(false);
  const [editingResources, setEditingResources] = useState(false);
  const [editingInventory, setEditingInventory] = useState(false);
  const [editingLore, setEditingLore] = useState(false);

  const [activeTab, setActiveTab] = useState<MenuTab>("basic");

  // Story Editor sections, in the order they're stacked in the scrolling content pane
  const sections: { id: MenuTab; label: string; icon: string }[] = [
    { id: "basic", label: "Basic", icon: "FileText" },
    { id: "hotseat", label: "Hot-seat", icon: "Users" },
    { id: "online", label: "Online Play", icon: "Wifi" },
    { id: "abilities", label: "Abilities", icon: "Wand2" },
    { id: "goals", label: "Goals", icon: "Scroll" },
    { id: "lore", label: "Notes", icon: "Book" },
    { id: "npcs", label: "NPCs", icon: "Users" },
    { id: "tables", label: "Tables", icon: "Dices" },
    { id: "variables", label: "Variables", icon: "Variable" },
    { id: "relationships", label: "Relationships", icon: "Heart" },
    { id: "threads", label: "Threads", icon: "GitBranch" },
    { id: "mythic", label: "Chaos/Oracle", icon: "Sparkles" },
    { id: "story", label: "Story", icon: "BookOpen" },
  ];

  const getSection = (id: MenuTab) =>
    sections.find((s) => s.id === id) ?? sections[0];

  const contentScrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const scrollToSection = (id: MenuTab) => {
    setActiveTab(id);
    sectionRefs.current[id]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const SectionHeading = ({
    tab,
  }: {
    tab: { id: MenuTab; label: string; icon: string };
  }) => (
    <div className="flex items-center gap-2.5 mb-4 sm:mb-5">
      <span className="p-1.5 rounded-lg bg-purple-500/10 ring-1 ring-purple-400/20">
        <DynamicIcon name={tab.icon} className="w-4 h-4 text-purple-300" />
      </span>
      <h4 className="text-base sm:text-lg font-bold text-white">
        {tab.label}
      </h4>
    </div>
  );

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

  const compactionApiOptions = {
    model:
      typeof window !== "undefined"
        ? localStorage.getItem("aiModel") || "DeepSeek V4 Flash"
        : "DeepSeek V4 Flash",
    token: null,
    openRouterKey: apiKeys.openRouterKey,
    deepseekKey: apiKeys.deepseekKey,
    googleKey: apiKeys.googleKey,
  };

  const handleStoryCompacted = async (updated: StoryData) => {
    onUpdateStoryData(updated);
    await onSaveProgress(updated);
  };

  const handleStorySpinOff = async (seed: StoryData) => {
    const { saveLocalStory } = await import("../misc/localStoryManager");
    const newLocalId = `local_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    await saveLocalStory(newLocalId, seed);
    router.push(`/story?storyId=${newLocalId}`);
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
        displayName: settingsForm.displayName || undefined,
        displayAvatar: settingsForm.displayAvatar || undefined,
        diceMode: settingsForm.diceMode,
        playerArchetype: settingsForm.playerArchetype,
        autoGenerateChoices: settingsForm.autoGenerateChoices,
        multiplayer: {
          enabled: multiplayerEnabled,
          mode: multiplayerMode,
          timerMinutes: resolvedTimerMinutes,
          hostUserId: resolvedHostUserId,
          players: storyData.multiplayer?.players,
          host: storyData.multiplayer?.host,
          couchPlayers: storyData.multiplayer?.couchPlayers,
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
    const goalCount = storyData.goals.length;
    const fulfilledCount = storyData.goals.filter((g) => g.fulfilled).length;

    return {
      totalParts,
      goalCount,
      fulfilledCount,
      progress:
        goalCount > 0 ? Math.round((fulfilledCount / goalCount) * 100) : 0,
    };
  };

  const stats = calculateStoryProgress();

  return (
    <div className="w-full space-y-4">
      {/* Compact Header with Quick Stats */}
      <div className="relative overflow-hidden bg-white/[0.04] backdrop-blur-xl rounded-2xl p-4 border border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
        <div className="pointer-events-none absolute -top-16 -right-16 w-40 h-40 rounded-full bg-purple-500/20 blur-3xl" />
        <div className="relative flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-purple-500/10 ring-1 ring-purple-400/20">
              <DynamicIcon name="Settings" className="w-4 h-4 text-purple-300" />
            </span>
            Story Menu
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-blue-200/50">
              {stats.progress}% complete
            </span>
            <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-linear-to-r from-purple-500 to-pink-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]"
                style={{ width: `${stats.progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Quick Stats Row */}
        <div className="relative grid grid-cols-2 gap-2 text-center">
          <div className="bg-white/[0.03] rounded-xl py-2 px-1 border border-white/5">
            <p className="text-lg font-bold text-blue-300">
              {stats.totalParts}
            </p>
            <p className="text-[10px] text-blue-300/50">Parts</p>
          </div>
          <div className="bg-white/[0.03] rounded-xl py-2 px-1 border border-white/5">
            <p className="text-lg font-bold text-purple-300">
              {stats.fulfilledCount}/{stats.goalCount}
            </p>
            <p className="text-[10px] text-purple-300/50">Goals</p>
          </div>
        </div>
      </div>

      {/* Primary Actions - 2x2 Grid */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setShowSettings(true)}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-medium rounded-xl transition-all shadow-lg shadow-purple-950/40 hover:shadow-purple-500/25 text-sm"
        >
          <DynamicIcon name="Settings" className="w-4 h-4" />
          <span>Story Editor</span>
        </button>

        <button
          onClick={handleSaveProgress}
          disabled={saving || !storyDbId}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-linear-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:from-white/5 disabled:to-white/5 disabled:text-blue-300/30 text-white font-medium rounded-xl transition-all shadow-lg shadow-emerald-950/40 hover:shadow-emerald-500/20 disabled:shadow-none text-sm"
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
          className="flex items-center justify-center gap-2 px-4 py-3 bg-linear-to-r from-teal-600 to-emerald-700 hover:from-teal-500 hover:to-emerald-600 disabled:from-white/5 disabled:to-white/5 disabled:text-blue-300/30 text-white font-medium rounded-xl transition-all shadow-lg shadow-emerald-950/30 hover:shadow-teal-500/20 disabled:shadow-none text-sm"
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
            className="flex items-center justify-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 backdrop-blur-sm border border-white/10 text-white font-medium rounded-xl transition-all text-sm"
          >
            <DynamicIcon name="Eye" className="w-4 h-4" />
            <span>AI Context</span>
          </button>
        )}

        {onViewLogs && (
          <button
            onClick={onViewLogs}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 backdrop-blur-sm border border-white/10 text-white font-medium rounded-xl transition-all text-sm"
          >
            <DynamicIcon name="Terminal" className="w-4 h-4" />
            <span>Debug Logs</span>
          </button>
        )}
      </div>

      {/* Secondary Actions Row */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setShowCompactModal(true)}
          className="flex items-center justify-center gap-2 px-3 py-2.5 bg-white/[0.03] hover:bg-white/[0.07] backdrop-blur-sm text-blue-200 font-medium rounded-xl transition-all text-sm border border-white/10"
          title="Shrink this story's storage, or spin off a lighter continuation"
        >
          <DynamicIcon name="Minimize2" className="w-3.5 h-3.5" />
          <span>Compact Story</span>
        </button>

        <button
          onClick={handleExportStory}
          disabled={exporting}
          className="flex items-center justify-center gap-2 px-3 py-2.5 bg-white/[0.03] hover:bg-white/[0.07] backdrop-blur-sm text-blue-200 font-medium rounded-xl transition-all text-sm border border-white/10"
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
          className="flex items-center justify-center gap-2 px-3 py-2.5 bg-white/[0.03] hover:bg-white/[0.07] backdrop-blur-sm text-blue-200 font-medium rounded-xl transition-all text-sm border border-white/10"
        >
          <DynamicIcon name="ArrowLeft" className="w-3.5 h-3.5" />
          <span>Explorer</span>
        </button>

        <button
          onClick={() => setShowAPIKeysModal(true)}
          className="flex items-center justify-center gap-2 px-3 py-2.5 bg-white/[0.03] hover:bg-white/[0.07] backdrop-blur-sm text-blue-200 font-medium rounded-xl transition-all text-sm border border-white/10"
          title="App-wide settings: API keys, voices, fonts, display"
        >
          <DynamicIcon name="Settings" className="w-3.5 h-3.5" />
          <span>Settings</span>
        </button>
      </div>

      <APIKeysModal
        isOpen={showAPIKeysModal}
        onClose={() => setShowAPIKeysModal(false)}
      />

      {/* OOC Chat Button - only while online co-op is active */}
      {onOpenOOCChat && netSession && (
        <button
          onClick={onOpenOOCChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-linear-to-r from-blue-600/80 to-cyan-600/80 hover:from-blue-500 hover:to-cyan-500 text-white font-semibold rounded-xl transition-all border border-blue-400/20 shadow-lg shadow-blue-950/30 hover:shadow-cyan-500/20"
        >
          <DynamicIcon name="MessageCircle" className="w-5 h-5" />
          <span>OOC Chat</span>
        </button>
      )}

      {/* Player Notes - Collapsible */}
      <div className="bg-white/[0.04] backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
        <button
          onClick={() => setEditingNotes(!editingNotes)}
          className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors"
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
              className="w-full h-24 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setPlayerNotes(storyData.player_notes || "");
                  setEditingNotes(false);
                }}
                className="px-3 py-1.5 text-xs bg-white/5 text-blue-200 rounded-lg hover:bg-white/10 border border-white/10"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNotes}
                className="px-3 py-1.5 text-xs bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg shadow-md shadow-purple-950/40"
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
      <div className="bg-white/[0.04] backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
        <button
          onClick={() => setEditingChatDisplay(!editingChatDisplay)}
          className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors"
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
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40"
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
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40"
                />
              </div>
            </div>

            {chatDisplayAvatar.trim() && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-blue-200/60">Preview:</span>
                <img
                  src={chatDisplayAvatar}
                  alt="Avatar preview"
                  className="w-8 h-8 rounded-full object-cover border border-purple-400/40 shadow-[0_0_10px_rgba(168,85,247,0.3)]"
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
                className="px-3 py-1.5 text-xs bg-white/5 text-blue-200 rounded-lg hover:bg-white/10 border border-white/10"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveChatDisplay}
                className="px-3 py-1.5 text-xs bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg shadow-md shadow-purple-950/40"
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
      <div className="bg-red-500/[0.03] backdrop-blur-xl rounded-2xl border border-red-500/20 overflow-hidden">
        <div className="p-3 border-b border-red-500/10">
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
                      restState: freshTemplate?.restState || {
                        quickRestsUsed: 0,
                        shortRestsUsed: 0,
                      },
                      unlockedNodes:
                        freshTemplate?.unlockedNodes || storyData.unlockedNodes,
                      // Always reset these
                      scene: { parts: [] },
                      memory: [],
                      currentChapter: 0,
                      chapters: [],
                      goals:
                        (freshTemplate?.goals || storyData.goals)?.map(
                          (g) => ({
                            ...g,
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
            className="flex items-center justify-center gap-2 px-3 py-2.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 font-medium rounded-xl transition-all text-sm border border-orange-400/20"
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
            className="flex items-center justify-center gap-2 px-3 py-2.5 bg-red-500/10 hover:bg-red-500/20 disabled:bg-white/5 disabled:text-blue-300/30 text-red-300 font-medium rounded-xl transition-all text-sm border border-red-400/20"
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
      <div className="bg-white/[0.04] backdrop-blur-xl rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.3)] p-6 border border-white/10">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-purple-500/10 ring-1 ring-purple-400/20">
            <DynamicIcon name="Info" className="w-4 h-4 text-purple-300" />
          </span>
          Story Information
        </h3>

        <div className="space-y-1 text-sm">
          <div className="flex justify-between py-2.5 border-b border-white/5">
            <span className="text-blue-200/60">Story Name:</span>
            <span className="font-semibold text-white">
              {storyData.story_name}
            </span>
          </div>
          <div className="flex justify-between py-2.5 border-b border-white/5">
            <span className="text-blue-200/60">Player Name:</span>
            <span className="font-semibold text-white">
              {storyData.player_name}
            </span>
          </div>
          <div className="flex justify-between py-2.5 border-b border-white/5">
            <span className="text-blue-200/60">Total Memory Entries:</span>
            <span className="font-semibold text-white">
              {storyData.memory.length}
            </span>
          </div>
          <div className="flex justify-between py-2.5 border-b border-white/5">
            <span className="text-blue-200/60">Inventory Items:</span>
            <span className="font-semibold text-white">
              {storyData.inventory.length}
            </span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-blue-200/60">Notes:</span>
            <span className="font-semibold text-white">
              {storyData.lore.length}
            </span>
          </div>
        </div>
      </div>

      {/* Comprehensive Settings Modal */}
      {showSettings && (
        <FullScreenView
          title="Story Editor"
          icon="Settings"
          onClose={() => setShowSettings(false)}
          navClassName="w-14 sm:w-56"
          nav={
            <div className="py-2 sm:py-4 px-1.5 sm:px-3 space-y-1">
              {sections.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => scrollToSection(tab.id)}
                  className={`w-full flex items-center gap-2 sm:gap-3 px-2 sm:px-4 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                    activeTab === tab.id
                      ? "bg-linear-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-950/40"
                      : "text-blue-200 hover:bg-white/5"
                  }`}
                >
                  <DynamicIcon
                    name={tab.icon}
                    className="w-4 h-4 sm:w-5 sm:h-5 shrink-0"
                  />
                  <span className="hidden sm:inline truncate">
                    {tab.label}
                  </span>
                </button>
              ))}
            </div>
          }
          bodyClassName="p-0"
          footer={
            <div className="flex gap-2 sm:gap-3 p-3 sm:p-6">
              <button
                onClick={() => {
                  setSettingsForm({
                    story_name: storyData.story_name,
                    player_name: storyData.player_name,
                    player_summary: storyData.player_summary,
                    premise: storyData.premise,
                    max_chapters: storyData.max_chapters,
                    displayName: storyData.displayName || "",
                    displayAvatar: storyData.displayAvatar || "",
                    diceMode: storyData.diceMode || "ai",
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
                className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-blue-200 text-sm sm:text-base font-semibold rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-sm sm:text-base font-semibold rounded-xl transition-all shadow-lg shadow-purple-950/40 hover:shadow-purple-500/25 flex items-center justify-center gap-1"
              >
                <DynamicIcon name="Save" className="w-4 h-4" />
                <span className="hidden sm:inline">Save All Changes</span>
                <span className="sm:hidden">Save</span>
              </button>
            </div>
          }
        >
          {/* Content Area - all categories stacked, scroll down to move through them */}
          <div
            ref={contentScrollRef}
            className="h-full overflow-y-auto px-3 sm:px-6 pb-6 min-h-0"
            style={{ scrollSnapType: "y proximity" }}
          >
            <div
                  ref={(el) => {
                    sectionRefs.current["basic"] = el;
                  }}
                  data-section-id="basic"
                  style={{ scrollSnapAlign: "start" }}
                  className="pt-4 sm:pt-6 pb-10 border-b border-white/5"
                >
                  <SectionHeading tab={getSection("basic")} />
                  <BasicSettings
                    form={settingsForm}
                    onChange={setSettingsForm}
                  />
                </div>

                <div
                  ref={(el) => {
                    sectionRefs.current["hotseat"] = el;
                  }}
                  data-section-id="hotseat"
                  style={{ scrollSnapAlign: "start" }}
                  className="pt-4 sm:pt-6 pb-10 border-b border-white/5"
                >
                  <SectionHeading tab={getSection("hotseat")} />
                  <p className="text-xs text-blue-200/50 -mt-3 mb-4">
                    Pass one device around the table - the GM collects each
                    player&apos;s action before generating.
                  </p>
                  <div className="space-y-5">
                  <div className="p-4 bg-white/[0.03] backdrop-blur-md rounded-xl border border-white/10">
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
                        <div className="w-14 h-7 bg-white/10 peer-focus:ring-4 peer-focus:ring-purple-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-1 after:bg-white after:border-white/20 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-linear-to-r peer-checked:from-purple-500 peer-checked:to-pink-500 peer-checked:shadow-[0_0_12px_rgba(168,85,247,0.5)]"></div>
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
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40"
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
                    <div className="p-4 bg-white/[0.02] backdrop-blur-md rounded-xl border border-white/10 space-y-2">
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
                          className="px-3 py-2 text-xs font-semibold rounded-lg transition-all border bg-purple-500/10 hover:bg-purple-500/20 text-purple-200 border-purple-400/20"
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
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40"
                      />
                    </div>
                  )}

                  <div className="pt-2 border-t border-white/5">
                    <CouchPlayersEditor
                      players={storyData.multiplayer?.couchPlayers || []}
                      onUpdate={(couchPlayers) =>
                        onUpdateStoryData({
                          multiplayer: {
                            enabled: !!storyData.multiplayer?.enabled,
                            mode: storyData.multiplayer?.mode,
                            timerMinutes: storyData.multiplayer?.timerMinutes,
                            hostUserId: storyData.multiplayer?.hostUserId,
                            players: storyData.multiplayer?.players,
                            host: storyData.multiplayer?.host,
                            couchPlayers,
                          },
                        })
                      }
                    />
                  </div>
                  </div>
                </div>

                <div
                  ref={(el) => {
                    sectionRefs.current["online"] = el;
                  }}
                  data-section-id="online"
                  style={{ scrollSnapAlign: "start" }}
                  className="pt-4 sm:pt-6 pb-10 border-b border-white/5"
                >
                  <SectionHeading tab={getSection("online")} />
                  <p className="text-xs text-blue-200/50 -mt-3 mb-4">
                    Peer-to-peer over the internet - no server, no account.
                    Host creates a room and shares the code; everyone else
                    joins with it.
                  </p>
                  <OnlinePlayEditor
                    netSession={netSession}
                    peers={netPeers}
                    defaultName={storyData.displayName || storyData.player_name}
                    createRoom={onCreateNetRoom}
                    joinRoom={onJoinNetRoom}
                    leaveRoom={onLeaveNetRoom}
                    switchBackend={onSwitchNetBackend}
                  />
                </div>

                <div
                  ref={(el) => {
                    sectionRefs.current["abilities"] = el;
                  }}
                  data-section-id="abilities"
                  style={{ scrollSnapAlign: "start" }}
                  className="pt-4 sm:pt-6 pb-10 border-b border-white/5"
                >
                  <SectionHeading tab={getSection("abilities")} />
                  <AbilitiesEditor
                    abilities={storyData.abilities || []}
                    resources={storyData.resources}
                    variables={storyData.variables || []}
                    onUpdate={(abilities) => onUpdateStoryData({ abilities })}
                  />
                </div>

                <div
                  ref={(el) => {
                    sectionRefs.current["goals"] = el;
                  }}
                  data-section-id="goals"
                  style={{ scrollSnapAlign: "start" }}
                  className="pt-4 sm:pt-6 pb-10 border-b border-white/5"
                >
                  <SectionHeading tab={getSection("goals")} />
                  <GoalEditor
                    goals={storyData.goals || []}
                    onUpdate={(goals) => onUpdateStoryData({ goals })}
                  />
                </div>

                <div
                  ref={(el) => {
                    sectionRefs.current["lore"] = el;
                  }}
                  data-section-id="lore"
                  style={{ scrollSnapAlign: "start" }}
                  className="pt-4 sm:pt-6 pb-10 border-b border-white/5"
                >
                  <SectionHeading tab={getSection("lore")} />
                  <LoreEditor
                    lore={storyData.lore}
                    variables={storyData.variables || []}
                    onUpdate={(lore) => onUpdateStoryData({ lore })}
                    onImportTables={(tables) =>
                      onUpdateStoryData({
                        customTables: [
                          ...(storyData.customTables || []),
                          ...tables,
                        ],
                      })
                    }
                    couchPlayers={storyData.multiplayer?.couchPlayers}
                  />
                </div>

                <div
                  ref={(el) => {
                    sectionRefs.current["npcs"] = el;
                  }}
                  data-section-id="npcs"
                  style={{ scrollSnapAlign: "start" }}
                  className="pt-4 sm:pt-6 pb-10 border-b border-white/5"
                >
                  <SectionHeading tab={getSection("npcs")} />
                  <NPCEditor
                    npcs={storyData.npcs || []}
                    onUpdate={(npcs) => onUpdateStoryData({ npcs })}
                  />
                </div>

                <div
                  ref={(el) => {
                    sectionRefs.current["tables"] = el;
                  }}
                  data-section-id="tables"
                  style={{ scrollSnapAlign: "start" }}
                  className="pt-4 sm:pt-6 pb-10 border-b border-white/5"
                >
                  <SectionHeading tab={getSection("tables")} />
                  <CustomTablesEditor
                    tables={storyData.customTables || []}
                    setTables={(tables) =>
                      onUpdateStoryData({ customTables: tables })
                    }
                  />
                </div>

                <div
                  ref={(el) => {
                    sectionRefs.current["variables"] = el;
                  }}
                  data-section-id="variables"
                  style={{ scrollSnapAlign: "start" }}
                  className="pt-4 sm:pt-6 pb-10 border-b border-white/5"
                >
                  <SectionHeading tab={getSection("variables")} />
                  <VariablesEditor
                    variables={storyData.variables || []}
                    onUpdate={(variables) => onUpdateStoryData({ variables })}
                  />
                </div>

                <div
                  ref={(el) => {
                    sectionRefs.current["relationships"] = el;
                  }}
                  data-section-id="relationships"
                  style={{ scrollSnapAlign: "start" }}
                  className="pt-4 sm:pt-6 pb-10 border-b border-white/5"
                >
                  <SectionHeading tab={getSection("relationships")} />
                  <RelationshipsEditor
                    relationships={storyData.relationships}
                    onUpdate={(relationships) =>
                      onUpdateStoryData({ relationships })
                    }
                  />
                </div>

                <div
                  ref={(el) => {
                    sectionRefs.current["threads"] = el;
                  }}
                  data-section-id="threads"
                  style={{ scrollSnapAlign: "start" }}
                  className="pt-4 sm:pt-6 pb-10 border-b border-white/5"
                >
                  <SectionHeading tab={getSection("threads")} />
                  <ThreadsEditor
                    threads={storyData.threads || []}
                    onUpdate={(threads) => onUpdateStoryData({ threads })}
                  />
                </div>

                <div
                  ref={(el) => {
                    sectionRefs.current["mythic"] = el;
                  }}
                  data-section-id="mythic"
                  style={{ scrollSnapAlign: "start" }}
                  className="pt-4 sm:pt-6 pb-10 border-b border-white/5"
                >
                  <SectionHeading tab={getSection("mythic")} />
                  <div className="space-y-6">
                  {/* Enable/Disable Advanced RPG Tools */}
                  <div className="p-6 bg-white/[0.03] backdrop-blur-md rounded-xl border border-white/10">
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
                        <div className="w-14 h-7 bg-white/10 peer-focus:ring-4 peer-focus:ring-purple-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-1 after:bg-white after:border-white/20 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-linear-to-r peer-checked:from-purple-500 peer-checked:to-pink-500 peer-checked:shadow-[0_0_12px_rgba(168,85,247,0.5)]"></div>
                      </label>
                    </div>
                  </div>

                  {storyData.agmtState && (
                    <>
                      {/* Chaos Factor */}
                      <div className="p-6 bg-white/[0.03] backdrop-blur-md rounded-xl border border-white/10">
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
                          className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer accent-purple-500"
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
                      <div className="p-6 bg-white/[0.03] backdrop-blur-md rounded-xl border border-white/10">
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
                            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-blue-200 rounded-lg transition-colors"
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
                            className="px-4 py-2 bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg shadow-md shadow-purple-950/40 transition-all"
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
                            className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-400/20 text-red-300 rounded-lg transition-colors"
                          >
                            Reset
                          </button>
                        </div>
                      </div>

                      {/* Performance Tracking */}
                      {storyData.agmtState && (
                        <div className="p-6 bg-white/[0.03] backdrop-blur-md rounded-xl border border-white/10">
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
                            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all ${
                                  storyData.agmtState.currentStreak > 0
                                    ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                                    : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
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
                          <div className="mt-4 pt-4 border-t border-white/10 text-xs text-blue-300/50">
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
                </div>

                <div
                  ref={(el) => {
                    sectionRefs.current["story"] = el;
                  }}
                  data-section-id="story"
                  style={{ scrollSnapAlign: "start" }}
                  className="pt-4 sm:pt-6 pb-4"
                >
                  <SectionHeading tab={getSection("story")} />
                  <StoryMetaEditor
                    memory={storyData.memory}
                    premise={storyData.premise}
                    authorNotes={storyData.author_notes}
                    onUpdate={(updates) => onUpdateStoryData(updates)}
                  />
                </div>
              </div>
        </FullScreenView>
      )}

      {/* Compact Story Modal */}
      {showCompactModal && (
        <CompactStoryModal
          storyData={storyData}
          apiOptions={compactionApiOptions}
          onClose={() => setShowCompactModal(false)}
          onCompacted={handleStoryCompacted}
          onSpinOff={handleStorySpinOff}
        />
      )}

      {/* Save Copy Modal */}
      {showSaveCopyModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-60 p-4">
          <div className="bg-[#0d1829]/95 backdrop-blur-2xl rounded-2xl border border-white/10 w-full max-w-md shadow-2xl shadow-black/50">
            <div className="p-4 border-b border-white/10">
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
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-blue-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400/40"
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
                  <div className="w-10 h-6 bg-white/5 border border-white/10 rounded-full peer-checked:bg-emerald-500/80 peer-checked:shadow-[0_0_10px_rgba(16,185,129,0.5)] transition-all"></div>
                  <div className="absolute left-1 top-1 w-4 h-4 bg-blue-300/60 rounded-full peer-checked:translate-x-4 peer-checked:bg-white transition-all"></div>
                </div>
                <span className="text-sm text-blue-200 group-hover:text-white transition-colors">
                  Jump to new save after creating
                </span>
              </label>
            </div>
            <div className="p-4 border-t border-white/10 flex justify-end gap-3">
              <button
                onClick={() => setShowSaveCopyModal(false)}
                className="px-4 py-2 text-blue-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCopyConfirm}
                disabled={!saveCopyName.trim()}
                className="px-4 py-2 bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-white/5 disabled:to-white/5 disabled:text-emerald-300/30 text-white font-medium rounded-lg transition-all shadow-md shadow-emerald-950/40 disabled:shadow-none flex items-center gap-2"
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
