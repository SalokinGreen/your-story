"use client";

import {
  StoryData,
  StoryLore,
  AGMTState,
  MemoryEntry,
  getMemoryContent,
  NPC,
  NPCStatus,
  NPCAttitude,
  Adventure,
} from "../misc/structs";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useNotification } from "../misc/NotificationContext";
import ConfirmDialog from "../components/ConfirmDialog";
import { getLocalPlayerId } from "../misc/localPlayerId";
import { DynamicIcon } from "../components/DynamicIcon";
import ChatDisplaySettings from "./menu/ChatDisplaySettings";
import SyncIndicator from "../components/SyncIndicator";
import NetStatusBadge from "../components/NetStatusBadge";
import { ChapterList } from "../components/ChapterNav";
import { computeChapterSegments } from "../misc/chapterNav";
import { getActiveObjectives } from "../misc/objectives";
import type { SyncStatus } from "../misc/localStoryManager";
import BasicSettings, { BasicSettingsForm } from "./menu/BasicSettings";
import GoalEditor from "./menu/GoalEditor";
import LoreEditor from "./menu/LoreEditor";
import NPCEditor from "./menu/NPCEditor";
import ThreadsEditor from "./menu/ThreadsEditor";
import PictureSettings from "./menu/PictureSettings";
import StoryMetaEditor from "./menu/StoryMetaEditor";
import CouchPlayersEditor from "./menu/CouchPlayersEditor";
import OnlinePlayEditor from "./menu/OnlinePlayEditor";
import PartyModeEditor from "./menu/PartyModeEditor";
import type { PartyHostApi } from "./usePartyHost";
import APIKeysModal from "../components/APIKeysModal";
import CompactStoryModal from "./menu/CompactStoryModal";
import FullScreenView from "../components/FullScreenView";
import { useAPIKeys } from "../misc/APIKeysContext";
import { pickProviderKeys } from "../misc/sideModelCall";
import { resolveSideCallModel } from "../misc/layerSettings";
import type { GuestJoinedInfo, NetSessionInfo } from "../misc/multiplayer/session";
import type { MPBackend } from "../misc/multiplayer/types";
import { useBackHandler } from "@/app/misc/useBackHandler";
import { saveFile } from "@/app/misc/saveFile";
import { feedbackAvailable } from "@/app/misc/feedbackClient";
import { openFeedback } from "@/app/misc/feedbackLauncher";
import { resetCampaignPlayState } from "@/app/misc/campaign/designer";

interface MenuProps extends StoryData {
  storyDbId: string | null;
  sourceAdventureId?: string | null;
  onSaveProgress: (updatedStoryData?: StoryData) => Promise<void>;
  onUpdateStoryData: (updates: Partial<StoryData>) => void;
  /** Opens another page of the story screen; the sheet closes with it. */
  onNavigate: (target: MenuNavTarget) => void;
  onOpenOOCChat?: () => void;
  syncStatus?: SyncStatus;
  /** Unread OOC chat messages (online co-op). */
  oocUnread: number;
  /** The scene part being read, or null for the live end. */
  viewingPartIndex: number | null;
  /** Jumps the story to a part (the Chapters row). */
  onJumpToPart: (index: number) => void;
  /** Closes the sheet this page lives in. */
  onClose: () => void;
  /**
   * Reports whether a full-screen view or dialog the menu opened is showing,
   * so the sheet leaves Escape and Tab to it.
   */
  onModalOpenChange?: (open: boolean) => void;
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
  // Party mode (desktop app): phones join over the home network. Omitted
  // where it can't run.
  party?: PartyHostApi;
  // Opens the Story Editor straight to this section on mount - used when
  // arriving here via an auto-host deep link from the Library/home page.
  autoOpenSection?: MenuTab;
}

/** The pages the menu can send the player to. Values are `StoryState` names. */
export type MenuNavTarget = "LORE" | "NPCS" | "GOALS" | "LOGS" | "CONTEXT";

// Row styles for the sheet. They read the story screen's colour tokens, so
// the menu is legible on a light theme as well as on Ink.
const ROW =
  "focus-ring w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-ys-text text-left hover:bg-ys-bg disabled:text-ys-muted disabled:hover:bg-transparent transition-colors";
const DANGER_ROW =
  "focus-ring w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-ys-danger text-left hover:bg-ys-danger/10 disabled:text-ys-muted disabled:hover:bg-transparent transition-colors";
const SECTION_LABEL =
  "px-3 pt-5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ys-muted";

type MenuTab =
  | "basic"
  | "hotseat"
  | "online"
  | "party"
  | "goals"
  | "lore"
  | "npcs"
  | "threads"
  | "mythic"
  | "story";

export default function MenuPage({
  storyDbId,
  sourceAdventureId,
  onSaveProgress,
  onUpdateStoryData,
  onNavigate,
  onOpenOOCChat,
  syncStatus,
  oocUnread,
  viewingPartIndex,
  onJumpToPart,
  onClose,
  onModalOpenChange,
  netSession,
  netPeers,
  onCreateNetRoom,
  onJoinNetRoom,
  onLeaveNetRoom,
  onSwitchNetBackend,
  party,
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
  const [chaptersOpen, setChaptersOpen] = useState(false);

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
  const [editingLore, setEditingLore] = useState(false);

  const [activeTab, setActiveTab] = useState<MenuTab>("basic");

  // Story Editor sections, in the order they're stacked in the scrolling content pane
  const sections: { id: MenuTab; label: string; icon: string }[] = [
    { id: "basic", label: "Basic", icon: "FileText" },
    { id: "hotseat", label: "Hot-seat", icon: "Users" },
    { id: "online", label: "Online Play", icon: "Wifi" },
    ...(party?.available
      ? [{ id: "party" as const, label: "Party Mode", icon: "Smartphone" }]
      : []),
    { id: "goals", label: "Goals", icon: "Scroll" },
    { id: "lore", label: "Notes", icon: "Book" },
    { id: "npcs", label: "NPCs", icon: "Users" },
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
      <span className="p-1.5 rounded-lg bg-ys-accent/10 ring-1 ring-ys-accent/20">
        <DynamicIcon name={tab.icon} className="w-4 h-4 text-ys-accent" />
      </span>
      <h4 className="text-base sm:text-lg font-bold text-ys-text">
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

  // "Compact Story" and the spin-off are side calls like the turn's own
  // compaction (generation.ts): the side-agent default, or the narration voice
  // when the player has no key for its provider (decision 51). Nothing writes
  // `aiModel`, so reading it only ever meant DeepSeek V4 Flash and a DeepSeek key.
  const providerKeys = pickProviderKeys(apiKeys);
  const compactionApiOptions = {
    ...resolveSideCallModel(null, providerKeys),
    token: null,
    ...providerKeys,
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

  const handleExportStory = async () => {
    setExporting(true);
    try {
      const exportData = {
        story_name: storyData.story_name,
        player_name: storyData.player_name,
        exported_at: new Date().toISOString(),
        data: storyData,
      };

      const { location } = await saveFile(
        `${storyData.story_name.replace(/[^a-z0-9]/gi, "_")}_${Date.now()}.json`,
        JSON.stringify(exportData, null, 2),
        "application/json",
      );

      addNotification(
        location ? `Saved to ${location}` : "Story exported successfully!",
        "success",
      );
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
      confirmButtonClass: "bg-ys-surface-2 hover:bg-ys-surface-2",
      onConfirm: () => {
        setConfirmDialog({ ...confirmDialog, isOpen: false });
        router.push("/library");
      },
    });
  };

  // Rows carry their counts (the old header and quick stats are gone).
  const chapterCount = computeChapterSegments(storyData.scene.parts).length;
  const activeObjectiveCount = getActiveObjectives(
    storyData as StoryData,
  ).length;

  // Tell the sheet when something the menu opened is on top of it.
  const modalOpen =
    showSettings ||
    showSaveCopyModal ||
    showCompactModal ||
    showAPIKeysModal ||
    confirmDialog.isOpen;
  useEffect(() => {
    onModalOpenChange?.(modalOpen);
  }, [modalOpen, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange?.(false), [onModalOpenChange]);
  // Android back dismisses Save Copy like its Cancel button (decision 133).
  useBackHandler(showSaveCopyModal, () => setShowSaveCopyModal(false));

  const goTo = (target: MenuNavTarget) => {
    onNavigate(target);
    onClose();
  };

  return (
    <div className="w-full">
      {/* 1. Status */}
      <section aria-label="Status" className="space-y-1">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm text-ys-muted">
          {syncStatus && syncStatus !== "local-only" ? (
            <span className="inline-flex items-center gap-2">
              <SyncIndicator status={syncStatus} />
              <span>
                {syncStatus === "synced"
                  ? "Synced with cloud"
                  : syncStatus === "pending"
                    ? "Syncing..."
                    : "Sync conflict"}
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <DynamicIcon name="HardDrive" className="w-4 h-4" />
              <span>Saved on this device</span>
            </span>
          )}
          {netSession && (
            <NetStatusBadge netSession={netSession} peers={netPeers} />
          )}
        </div>
        {onOpenOOCChat && netSession && (
          <button
            type="button"
            onClick={() => {
              // Close the sheet first, or it would stay over the chat.
              onClose();
              onOpenOOCChat();
            }}
            className={ROW}
          >
            <DynamicIcon
              name="MessageCircle"
              className="w-4 h-4 shrink-0 text-ys-muted"
            />
            <span className="flex-1 min-w-0 truncate">OOC Chat</span>
            {oocUnread > 0 && (
              <span className="min-w-5 h-5 px-1 flex items-center justify-center rounded-full bg-ys-accent text-ys-on-accent text-[11px] font-bold shrink-0">
                {oocUnread > 9 ? "9+" : oocUnread}
              </span>
            )}
            <DynamicIcon
              name="ChevronRight"
              className="w-4 h-4 shrink-0 text-ys-muted"
            />
          </button>
        )}
      </section>

      {/* 2. Notes, NPCs, Goals, Chapters */}
      <section
        aria-label="Story pages"
        className="space-y-1 pt-2 mt-2 border-t border-ys-border"
      >
        <button type="button" onClick={() => goTo("LORE")} className={ROW}>
          <DynamicIcon name="Scroll" className="w-4 h-4 shrink-0 text-ys-muted" />
          <span className="flex-1 min-w-0 truncate">Notes</span>
          <span className="text-xs text-ys-muted shrink-0">
            {storyData.lore.length}
          </span>
          <DynamicIcon
            name="ChevronRight"
            className="w-4 h-4 shrink-0 text-ys-muted"
          />
        </button>
        <button type="button" onClick={() => goTo("NPCS")} className={ROW}>
          <DynamicIcon name="Users" className="w-4 h-4 shrink-0 text-ys-muted" />
          <span className="flex-1 min-w-0 truncate">NPCs</span>
          <span className="text-xs text-ys-muted shrink-0">
            {storyData.npcs?.length ?? 0}
          </span>
          <DynamicIcon
            name="ChevronRight"
            className="w-4 h-4 shrink-0 text-ys-muted"
          />
        </button>
        <button type="button" onClick={() => goTo("GOALS")} className={ROW}>
          <DynamicIcon name="Target" className="w-4 h-4 shrink-0 text-ys-muted" />
          <span className="flex-1 min-w-0 truncate">Goals</span>
          <span className="text-xs text-ys-muted shrink-0">
            {activeObjectiveCount > 0
              ? `${activeObjectiveCount} active`
              : "none active"}
          </span>
          <DynamicIcon
            name="ChevronRight"
            className="w-4 h-4 shrink-0 text-ys-muted"
          />
        </button>
        {chapterCount >= 2 && (
          <>
            <button
              type="button"
              onClick={() => setChaptersOpen((prev) => !prev)}
              aria-expanded={chaptersOpen}
              className={ROW}
            >
              <DynamicIcon
                name="BookMarked"
                className="w-4 h-4 shrink-0 text-ys-muted"
              />
              <span className="flex-1 min-w-0 truncate">Chapters</span>
              <span className="text-xs text-ys-muted shrink-0">
                {chapterCount}
              </span>
              <DynamicIcon
                name={chaptersOpen ? "ChevronUp" : "ChevronDown"}
                className="w-4 h-4 shrink-0 text-ys-muted"
              />
            </button>
            {chaptersOpen && (
              <div className="max-h-64 overflow-y-auto rounded-xl border border-ys-border bg-ys-bg py-1">
                <ChapterList
                  parts={storyData.scene.parts}
                  currentIndex={viewingPartIndex}
                  onJump={(index) => {
                    onJumpToPart(index);
                    onClose();
                  }}
                />
              </div>
            )}
          </>
        )}
      </section>

      {/* 3. Story */}
      <section aria-label="Story" className="space-y-1">
        <h3 className={SECTION_LABEL}>Story</h3>
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          className={ROW}
        >
          <DynamicIcon name="Settings" className="w-4 h-4 shrink-0 text-ys-muted" />
          <span className="flex-1 min-w-0 truncate">Story Editor</span>
        </button>
        <button
          type="button"
          onClick={handleSaveProgress}
          disabled={saving || !storyDbId}
          className={ROW}
        >
          {saving ? (
            <div className="animate-spin rounded-full h-4 w-4 shrink-0 border-2 border-ys-muted border-t-transparent" />
          ) : (
            <DynamicIcon name="Save" className="w-4 h-4 shrink-0 text-ys-muted" />
          )}
          <span className="flex-1 min-w-0 truncate">
            {saving ? "Saving..." : "Save"}
          </span>
        </button>
        <button
          type="button"
          onClick={handleSaveAs}
          disabled={savingAs}
          className={ROW}
          title="Create a copy of this story as a save point"
        >
          {savingAs ? (
            <div className="animate-spin rounded-full h-4 w-4 shrink-0 border-2 border-ys-muted border-t-transparent" />
          ) : (
            <DynamicIcon name="Copy" className="w-4 h-4 shrink-0 text-ys-muted" />
          )}
          <span className="flex-1 min-w-0 truncate">
            {savingAs ? "Saving..." : "Save Copy"}
          </span>
        </button>
        <button
          type="button"
          onClick={handleExportStory}
          disabled={exporting}
          className={ROW}
        >
          {exporting ? (
            <div className="animate-spin rounded-full h-4 w-4 shrink-0 border-2 border-ys-muted border-t-transparent" />
          ) : (
            <DynamicIcon
              name="Download"
              className="w-4 h-4 shrink-0 text-ys-muted"
            />
          )}
          <span className="flex-1 min-w-0 truncate">
            {exporting ? "Exporting..." : "Export"}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setShowCompactModal(true)}
          className={ROW}
          title="Shrink this story's storage, or spin off a lighter continuation"
        >
          <DynamicIcon
            name="Minimize2"
            className="w-4 h-4 shrink-0 text-ys-muted"
          />
          <span className="flex-1 min-w-0 truncate">Compact Story</span>
        </button>
        <button type="button" onClick={handleReturnToExplorer} className={ROW}>
          <DynamicIcon
            name="ArrowLeft"
            className="w-4 h-4 shrink-0 text-ys-muted"
          />
          <span className="flex-1 min-w-0 truncate">Explorer</span>
        </button>
      </section>

      {/* 4. Settings */}
      <section aria-label="Settings" className="space-y-1">
        <h3 className={SECTION_LABEL}>App</h3>
        <button
          type="button"
          onClick={() => setShowAPIKeysModal(true)}
          className={ROW}
          title="App-wide settings: API keys, voices, fonts, display"
        >
          <DynamicIcon name="Settings" className="w-4 h-4 shrink-0 text-ys-muted" />
          <span className="flex-1 min-w-0 truncate">Settings</span>
        </button>
        {feedbackAvailable() && netSession?.role !== "guest" && (
          <button
            type="button"
            onClick={() => {
              // Close the sheet first, or it would stay over the form.
              onClose();
              openFeedback({ kind: "app", target: "app" });
            }}
            className={ROW}
            title="Tell the developer what works and what does not"
          >
            <DynamicIcon
              name="MessageSquare"
              className="w-4 h-4 shrink-0 text-ys-muted"
            />
            <span className="flex-1 min-w-0 truncate">Send feedback</span>
          </button>
        )}
      </section>

      <APIKeysModal
        isOpen={showAPIKeysModal}
        onClose={() => setShowAPIKeysModal(false)}
      />

      {/* 5. For the curious */}
      <section aria-label="For the curious" className="space-y-1">
        <h3 className={SECTION_LABEL}>For the curious</h3>
        <button type="button" onClick={() => goTo("CONTEXT")} className={ROW}>
          <DynamicIcon name="Eye" className="w-4 h-4 shrink-0 text-ys-muted" />
          <span className="flex-1 min-w-0 truncate">AI Context</span>
        </button>
        <button type="button" onClick={() => goTo("LOGS")} className={ROW}>
          <DynamicIcon
            name="Terminal"
            className="w-4 h-4 shrink-0 text-ys-muted"
          />
          <span className="flex-1 min-w-0 truncate">Debug Logs</span>
        </button>
      </section>

      {/* 6. Danger */}
      <section aria-label="Danger" className="space-y-1">
        <h3 className={SECTION_LABEL}>Danger</h3>
        <button
          onClick={() => {
            setConfirmDialog({
              isOpen: true,
              title: "Restart Story",
              message: "All progress will be lost. Are you sure?",
              icon: "RefreshCw",
              confirmText: "Restart",
              confirmButtonClass: "bg-ys-warning/15 hover:bg-ys-warning/25",
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
                    agmtState:
                      freshTemplate?.agmtState || storyData.agmtState,
                    customTables:
                      freshTemplate?.customTables || storyData.customTables,
                    // The campaign record starts over: the adventure's own copy
                    // when there is one, else this story's with its play state
                    // (clocks, found clues, beats) put back.
                    ...(freshTemplate?.campaign
                      ? { campaign: structuredClone(freshTemplate.campaign) }
                      : storyData.campaign
                        ? {
                            campaign: resetCampaignPlayState(
                              storyData.campaign,
                            ),
                          }
                        : {}),
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
          className={DANGER_ROW}
        >
          <DynamicIcon name="RefreshCw" className="w-4 h-4 shrink-0" />
          <span className="flex-1 min-w-0 truncate">Restart</span>
        </button>
        <button
          onClick={() => {
            setConfirmDialog({
              isOpen: true,
              title: "Delete Story?",
              message: "This action cannot be undone.",
              icon: "AlertTriangle",
              confirmText: "Delete",
              confirmButtonClass: "bg-ys-danger/15 hover:bg-ys-danger/25",
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
          className={DANGER_ROW}
        >
          {deleting ? (
            <div className="animate-spin rounded-full h-4 w-4 shrink-0 border-2 border-ys-danger border-t-transparent" />
          ) : (
            <DynamicIcon name="Trash2" className="w-4 h-4 shrink-0" />
          )}
          <span className="flex-1 min-w-0 truncate">
            {deleting ? "Deleting..." : "Delete"}
          </span>
        </button>
      </section>

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
                      ? "bg-ys-accent text-ys-on-accent shadow-lg shadow-ys-accent/40"
                      : "text-ys-text hover:bg-ys-surface-2"
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
                className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-ys-surface hover:bg-ys-surface-2 border border-ys-border text-ys-text text-sm sm:text-base font-semibold rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-ys-accent text-ys-on-accent text-sm sm:text-base font-semibold rounded-xl transition-all shadow-lg shadow-ys-accent/40 hover:shadow-ys-accent/25 flex items-center justify-center gap-1"
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
                  className="pt-4 sm:pt-6 pb-10 border-b border-ys-border"
                >
                  <SectionHeading tab={getSection("basic")} />
                  <BasicSettings
                    form={settingsForm}
                    onChange={setSettingsForm}
                  />
                  <div className="mt-5 space-y-5">
                    <ChatDisplaySettings
                      form={settingsForm}
                      onChange={(updates) =>
                        setSettingsForm((prev) => ({ ...prev, ...updates }))
                      }
                    />
              {/* Player Notes - Collapsible */}
              <div className="bg-ys-surface backdrop-blur-xl rounded-2xl border border-ys-border overflow-hidden">
                <button
                  onClick={() => setEditingNotes(!editingNotes)}
                  className="w-full flex items-center justify-between p-3 hover:bg-ys-surface-2 transition-colors"
                >
                  <span className="text-sm font-medium text-ys-text flex items-center gap-2">
                    <DynamicIcon
                      name="StickyNote"
                      className="w-4 h-4 text-ys-warning"
                    />
                    Player Notes
                  </span>
                  <DynamicIcon
                    name={editingNotes ? "ChevronUp" : "ChevronDown"}
                    className="w-4 h-4 text-ys-muted"
                  />
                </button>

                {editingNotes && (
                  <div className="p-3 pt-0 space-y-2">
                    <textarea
                      value={playerNotes}
                      onChange={(e) => setPlayerNotes(e.target.value)}
                      placeholder="Write your notes, strategies, or thoughts..."
                      className="w-full h-24 px-3 py-2 bg-ys-surface border border-ys-border rounded-xl text-ys-text text-sm placeholder-ys-muted focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 resize-none"
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => {
                          setPlayerNotes(storyData.player_notes || "");
                          setEditingNotes(false);
                        }}
                        className="px-3 py-1.5 text-xs bg-ys-surface text-ys-text rounded-lg hover:bg-ys-surface-2 border border-ys-border"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveNotes}
                        className="px-3 py-1.5 text-xs bg-ys-accent text-ys-on-accent rounded-lg shadow-md shadow-ys-accent/40"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}

                {!editingNotes && playerNotes && (
                  <div className="px-3 pb-3">
                    <p className="text-xs text-ys-muted whitespace-pre-wrap line-clamp-2">
                      {playerNotes}
                    </p>
                  </div>
                )}
              </div>
                  </div>
                </div>

                <div
                  ref={(el) => {
                    sectionRefs.current["hotseat"] = el;
                  }}
                  data-section-id="hotseat"
                  style={{ scrollSnapAlign: "start" }}
                  className="pt-4 sm:pt-6 pb-10 border-b border-ys-border"
                >
                  <SectionHeading tab={getSection("hotseat")} />
                  <p className="text-xs text-ys-muted -mt-3 mb-4">
                    Pass one device around the table - the GM collects each
                    player&apos;s action before generating.
                  </p>
                  <div className="space-y-5">
                  <div className="p-4 bg-ys-surface backdrop-blur-md rounded-xl border border-ys-border">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="block text-sm font-semibold text-ys-text mb-1">
                          Enable Multiplayer (Hot-seat)
                        </label>
                        <p className="text-xs text-ys-muted">
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
                        <div className="w-14 h-7 bg-ys-border peer-focus:ring-4 peer-focus:ring-ys-accent/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-ys-border after:content-[''] after:absolute after:top-0.5 after:left-1 after:bg-ys-bg after:border-ys-border after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-linear-to-r peer-checked:shadow-[0_0_12px_color-mix(in_srgb,var(--ys-accent)_50%,transparent)]"></div>
                      </label>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-ys-text mb-2">
                      Play Mode
                    </label>
                    <select
                      value={multiplayerMode}
                      onChange={(e) =>
                        setMultiplayerMode(
                          e.target.value as "host" | "any" | "timer",
                        )
                      }
                      className="w-full px-4 py-3 bg-ys-surface border border-ys-border rounded-xl text-ys-text focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40"
                    >
                      <option value="host">Generate on host command</option>
                      <option value="any">Generate on any command</option>
                      <option value="timer">Generate after timer</option>
                    </select>
                    <p className="text-xs text-ys-muted">
                      Timer starts after the first queued input.
                    </p>
                  </div>

                  {(multiplayerMode === "host" ||
                    multiplayerMode === "timer") && (
                    <div className="p-4 bg-ys-surface backdrop-blur-md rounded-xl border border-ys-border space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <label className="block text-sm font-semibold text-ys-text">
                            Host
                          </label>
                          <p className="text-xs text-ys-muted break-all">
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
                          className="px-3 py-2 text-xs font-semibold rounded-lg transition-all border bg-ys-accent/10 hover:bg-ys-accent/20 text-ys-text border-ys-accent/20"
                          title="Set the host to this device"
                        >
                          Set me as host
                        </button>
                      </div>
                      <p className="text-xs text-ys-muted">
                        Only the host can generate/clear in host and timer
                        modes.
                      </p>
                    </div>
                  )}

                  {multiplayerMode === "timer" && (
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-ys-text mb-2">
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
                        className="w-full px-4 py-3 bg-ys-surface border border-ys-border rounded-xl text-ys-text focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40"
                      />
                    </div>
                  )}

                  <div className="pt-2 border-t border-ys-border">
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
                  className="pt-4 sm:pt-6 pb-10 border-b border-ys-border"
                >
                  <SectionHeading tab={getSection("online")} />
                  <p className="text-xs text-ys-muted -mt-3 mb-4">
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

                {party?.available && (
                  <div
                    ref={(el) => {
                      sectionRefs.current["party"] = el;
                    }}
                    data-section-id="party"
                    style={{ scrollSnapAlign: "start" }}
                    className="pt-4 sm:pt-6 pb-10 border-b border-ys-border"
                  >
                    <SectionHeading tab={getSection("party")} />
                    <p className="text-xs text-ys-muted -mt-3 mb-4">
                      This desktop is the table and everyone plays from their
                      own phone, over your home Wi-Fi. No account and no
                      internet needed.
                    </p>
                    <PartyModeEditor party={party} onlineRoomOpen={!!netSession} />
                  </div>
                )}

                <div
                  ref={(el) => {
                    sectionRefs.current["goals"] = el;
                  }}
                  data-section-id="goals"
                  style={{ scrollSnapAlign: "start" }}
                  className="pt-4 sm:pt-6 pb-10 border-b border-ys-border"
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
                  className="pt-4 sm:pt-6 pb-10 border-b border-ys-border"
                >
                  <SectionHeading tab={getSection("lore")} />
                  <LoreEditor
                    lore={storyData.lore}
                    onUpdate={(lore) => onUpdateStoryData({ lore })}
                    couchPlayers={storyData.multiplayer?.couchPlayers}
                  />
                </div>

                <div
                  ref={(el) => {
                    sectionRefs.current["npcs"] = el;
                  }}
                  data-section-id="npcs"
                  style={{ scrollSnapAlign: "start" }}
                  className="pt-4 sm:pt-6 pb-10 border-b border-ys-border"
                >
                  <SectionHeading tab={getSection("npcs")} />
                  <NPCEditor
                    npcs={storyData.npcs || []}
                    onUpdate={(npcs) => onUpdateStoryData({ npcs })}
                  />
                </div>

                <div
                  ref={(el) => {
                    sectionRefs.current["threads"] = el;
                  }}
                  data-section-id="threads"
                  style={{ scrollSnapAlign: "start" }}
                  className="pt-4 sm:pt-6 pb-10 border-b border-ys-border"
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
                  className="pt-4 sm:pt-6 pb-10 border-b border-ys-border"
                >
                  <SectionHeading tab={getSection("mythic")} />
                  <div className="space-y-6">
                  {/* Enable/Disable Advanced RPG Tools */}
                  <div className="p-6 bg-ys-surface backdrop-blur-md rounded-xl border border-ys-border">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="block text-sm font-semibold text-ys-text mb-1">
                          Enable Advanced RPG Tools
                        </label>
                        <p className="text-xs text-ys-muted">
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
                        <div className="w-14 h-7 bg-ys-border peer-focus:ring-4 peer-focus:ring-ys-accent/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-ys-border after:content-[''] after:absolute after:top-0.5 after:left-1 after:bg-ys-bg after:border-ys-border after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-linear-to-r peer-checked:shadow-[0_0_12px_color-mix(in_srgb,var(--ys-accent)_50%,transparent)]"></div>
                      </label>
                    </div>
                  </div>

                  {storyData.agmtState && (
                    <>
                      {/* Chaos Factor */}
                      <div className="p-6 bg-ys-surface backdrop-blur-md rounded-xl border border-ys-border">
                        <label className="block text-sm font-semibold text-ys-text mb-3">
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
                          className="w-full h-2 bg-ys-surface-2 rounded-full appearance-none cursor-pointer accent-ys-accent"
                        />
                        <p className="text-sm text-ys-muted mt-2">
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
                      <div className="p-6 bg-ys-surface backdrop-blur-md rounded-xl border border-ys-border">
                        <label className="block text-sm font-semibold text-ys-text mb-3">
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
                            className="px-4 py-2 bg-ys-surface hover:bg-ys-surface-2 border border-ys-border text-ys-text rounded-lg transition-colors"
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
                            className="px-4 py-2 bg-ys-accent text-ys-on-accent rounded-lg shadow-md shadow-ys-accent/40 transition-all"
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
                            className="px-4 py-2 bg-ys-danger/10 hover:bg-ys-danger/20 border border-ys-danger/20 text-ys-danger rounded-lg transition-colors"
                          >
                            Reset
                          </button>
                        </div>
                      </div>

                      {/* Performance Tracking */}
                      {storyData.agmtState && (
                        <div className="p-6 bg-ys-surface backdrop-blur-md rounded-xl border border-ys-border">
                          <h4 className="text-sm font-semibold text-ys-text mb-4 flex items-center gap-2">
                            <DynamicIcon
                              name="TrendingUp"
                              className="w-4 h-4"
                            />
                            Performance Tracking
                          </h4>

                          {/* Current Streak */}
                          <div className="mb-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-ys-muted">
                                Current Streak
                              </span>
                              <span
                                className={`text-sm font-bold ${
                                  storyData.agmtState.currentStreak > 0
                                    ? "text-ys-success"
                                    : storyData.agmtState.currentStreak < 0
                                      ? "text-ys-danger"
                                      : "text-ys-muted"
                                }`}
                              >
                                {storyData.agmtState.currentStreak > 0 && "+"}
                                {storyData.agmtState.currentStreak || 0}
                                {Math.abs(storyData.agmtState.currentStreak) >=
                                  3 && " ??"}
                              </span>
                            </div>
                            <div className="h-2 bg-ys-surface-2 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all ${
                                  storyData.agmtState.currentStreak > 0
                                    ? "bg-ys-success shadow-[0_0_8px_color-mix(in_srgb,var(--ys-success)_60%,transparent)]"
                                    : "bg-ys-danger shadow-[0_0_8px_color-mix(in_srgb,var(--ys-danger)_60%,transparent)]"
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
                              <span className="text-xs text-ys-muted block mb-2">
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
                                          ? "bg-ys-success"
                                          : "bg-ys-danger"
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
                                <span className="text-ys-success">
                                  {
                                    storyData.agmtState.skillCheckHistory.filter(
                                      (c) => c.success,
                                    ).length
                                  }{" "}
                                  wins
                                </span>
                                <span className="text-ys-danger">
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
                          <div className="mt-4 pt-4 border-t border-ys-border text-xs text-ys-muted">
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
                  {/* Pictures made in play: this story's art style, the space
                      they take, and Clear (docs/image-generation-design.md §6) */}
                  <h4 className="text-sm font-semibold text-ys-text mt-8 mb-3 flex items-center gap-2">
                    <DynamicIcon name="Image" className="w-4 h-4" />
                    Pictures
                  </h4>
                  {storyDbId ? (
                    <PictureSettings
                      storyDbId={storyDbId}
                      storyData={storyData}
                      imageStyle={storyData.imageStyle}
                      onUpdateStoryData={onUpdateStoryData}
                    />
                  ) : (
                    <p className="text-sm text-ys-muted">
                      Save the story first to set its pictures.
                    </p>
                  )}
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
        <div className="fixed inset-0 ys-modal-backdrop flex items-center justify-center z-60 p-4">
          <div className="bg-ys-surface/95 backdrop-blur-2xl rounded-2xl border border-ys-border w-full max-w-md shadow-2xl">
            <div className="p-4 border-b border-ys-border">
              <h3 className="text-lg font-semibold text-ys-text flex items-center gap-2">
                <DynamicIcon name="Copy" className="w-5 h-5 text-ys-success" />
                Save Copy
              </h3>
              <p className="text-sm text-ys-muted mt-1">
                Create a save point you can return to later
              </p>
            </div>
            <div className="p-4">
              <label className="block text-sm font-medium text-ys-text mb-2">
                Save Name
              </label>
              <input
                type="text"
                value={saveCopyName}
                onChange={(e) => setSaveCopyName(e.target.value)}
                placeholder="Enter a name for this save..."
                className="w-full px-3 py-2 bg-ys-surface border border-ys-border rounded-xl text-ys-text placeholder-ys-muted focus:outline-none focus:ring-2 focus:ring-ys-success/40 focus:border-ys-success/40"
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
                  <div className="w-10 h-6 bg-ys-border border border-ys-border rounded-full peer-checked:bg-ys-success peer-checked:shadow-[0_0_10px_color-mix(in_srgb,var(--ys-success)_50%,transparent)] transition-all"></div>
                  <div className="absolute left-1 top-1 w-4 h-4 bg-ys-muted rounded-full peer-checked:translate-x-4 peer-checked:bg-ys-bg transition-all"></div>
                </div>
                <span className="text-sm text-ys-muted group-hover:text-ys-text transition-colors">
                  Jump to new save after creating
                </span>
              </label>
            </div>
            <div className="p-4 border-t border-ys-border flex justify-end gap-3">
              <button
                onClick={() => setShowSaveCopyModal(false)}
                className="px-4 py-2 text-ys-muted hover:text-ys-text hover:bg-ys-surface-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCopyConfirm}
                disabled={!saveCopyName.trim()}
                className="px-4 py-2 bg-ys-success/15 border border-ys-success/40 disabled:bg-ys-surface disabled:border-ys-border disabled:text-ys-muted text-ys-success font-medium rounded-lg transition-all flex items-center gap-2"
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
