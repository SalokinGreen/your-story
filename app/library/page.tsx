"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useNotification } from "@/app/misc/NotificationContext";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import { DynamicIcon } from "@/app/components/DynamicIcon";
import { IconPicker } from "@/app/components/IconPicker";
import { DraggableScroll } from "../components/DraggableScroll";
import {
  LibrarySkeleton,
  AdventureGridSkeleton,
} from "@/app/components/Skeleton";
import {
  listLocalStories,
  LocalStory,
  deleteLocalStory,
  saveLocalStory,
  getLocalStory,
  startAdventureLocally,
  startFreeformStoryLocally,
} from "@/app/misc/localStoryManager";
import {
  listLocalAdventures,
  deleteLocalAdventure,
  LocalAdventure,
} from "@/app/misc/localAdventureManager";
import {
  listLocalFolders,
  createLocalFolder,
  updateLocalFolder,
  deleteLocalFolder,
  LocalFolder,
} from "@/app/misc/localFolderManager";
import NotesLibraryTab from "./NotesLibraryTab";
import {
  listLibraryNotes,
  unassignFolderFromNotes,
  libraryNoteToStoryLore,
  createLibraryNote,
} from "@/app/misc/localNotesLibraryManager";
import {
  libraryTableToCustomTable,
  createLibraryTable,
} from "@/app/misc/localTablesLibraryManager";
import LibraryPickerModal from "@/app/components/LibraryPickerModal";
import JoinGameModal from "@/app/components/JoinGameModal";
import HostGameModal from "@/app/components/HostGameModal";
import ExportFolderModal from "@/app/components/ExportFolderModal";
import { readFolderLibraryFile } from "@/app/misc/folderLibraryExport";
import { SYNC_COMPLETED_EVENT } from "@/app/misc/syncManager";
import type { CustomTable, StoryLore } from "@/app/misc/structs";

type LibraryView = "stories" | "adventures" | "notes";
type StorySortBy = "updated" | "created" | "name" | "chapter";
type AdventureSortBy = "updated" | "created" | "title" | "rating" | "plays";

// Helper for relative time display
function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString();
}

export default function LibraryPage() {
  const router = useRouter();
  const { addNotification } = useNotification();
  const [view, setView] = useState<LibraryView>("stories");
  const [localStories, setLocalStories] = useState<LocalStory[]>([]);
  const [localAdventures, setLocalAdventures] = useState<LocalAdventure[]>([]);
  const [notesCount, setNotesCount] = useState(0);
  const [folders, setFolders] = useState<LocalFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Ref to track if we've already loaded data (prevents reload on tab focus)
  const hasLoadedLocalRef = useRef(false); // Track if local data has been loaded

  // Filter and sort states
  const [storySearch, setStorySearch] = useState("");
  const [storyFilter, setStoryFilter] = useState<
    "all" | "completed" | "inProgress"
  >("all");
  const [storySortBy, setStorySortBy] = useState<StorySortBy>("updated");
  const [adventureSearch, setAdventureSearch] = useState("");
  const [adventureFilter, setAdventureFilter] = useState<
    "all" | "published" | "draft"
  >("all");
  const [adventureSortBy, setAdventureSortBy] =
    useState<AdventureSortBy>("updated");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  // Mass selection states
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedStories, setSelectedStories] = useState<Set<string>>(
    new Set(),
  );
  const [showMassMoveDropdown, setShowMassMoveDropdown] = useState(false);

  // Folder management states
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderIcon, setNewFolderIcon] = useState("Folder");
  const [newFolderColor, setNewFolderColor] = useState("#9333ea");
  const [editingFolder, setEditingFolder] = useState<LocalFolder | null>(null);
  const [movingStory, setMovingStory] = useState<string | null>(null);
  const [exportingFolder, setExportingFolder] = useState<LocalFolder | null>(
    null,
  );
  const [notesTablesRefreshKey, setNotesTablesRefreshKey] = useState(0);
  const importFolderInputRef = useRef<HTMLInputElement>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    icon?: string;
    confirmText?: string;
    cancelText?: string;
    confirmButtonClass?: string;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // Initial load: everything lives locally now, so this is instant.
  useEffect(() => {
    if (!hasLoadedLocalRef.current) {
      loadLocalData();
    }
  }, []);

  // A background sync writes straight to IndexedDB/localStorage and has no
  // way to update this page's already-loaded state on its own - reload once
  // a sync actually changes something, so newly-pulled-in stories/
  // adventures/folders/notes from another device show up without requiring
  // a manual page reload.
  useEffect(() => {
    function handleSyncCompleted() {
      loadLocalData();
    }
    window.addEventListener(SYNC_COMPLETED_EVENT, handleSyncCompleted);
    return () =>
      window.removeEventListener(SYNC_COMPLETED_EVENT, handleSyncCompleted);
  }, []);

  const loadLocalData = async () => {
    hasLoadedLocalRef.current = true;
    setLoading(true);

    try {
      const [localStoriesList, localAdvs, notesList] = await Promise.all([
        listLocalStories(),
        listLocalAdventures().catch((error) => {
          console.error("Error loading local adventures:", error);
          return [];
        }),
        listLibraryNotes().catch((error) => {
          console.error("Error loading notes library:", error);
          return [];
        }),
      ]);

      setLocalStories(localStoriesList);
      setLocalAdventures(localAdvs);
      setNotesCount(notesList.length);
      setFolders(listLocalFolders());
    } catch (error: any) {
      console.error("Error loading local data:", error);
      addNotification(`Failed to load library: ${error.message}`, "failure");
    } finally {
      setLoading(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showMassMoveDropdown) {
        const target = event.target as HTMLElement;
        if (!target.closest(".relative")) {
          setShowMassMoveDropdown(false);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMassMoveDropdown]);

  const handleDeleteStory = async (storyId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Delete Story?",
      message:
        "Are you sure you want to delete this story? This action cannot be undone.",
      icon: "Trash2",
      confirmText: "Delete Story",
      confirmButtonClass: "bg-red-600 hover:bg-red-700",
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        try {
          setDeleting(storyId);
          await deleteLocalStory(storyId);
          setLocalStories((prev) => prev.filter((s) => s.id !== storyId));
          addNotification("Story deleted successfully", "success");
        } catch (error: any) {
          console.error("Error deleting story:", error);
          addNotification(`Failed to delete: ${error.message}`, "failure");
        } finally {
          setDeleting(null);
        }
      },
    });
  };

  const handleDeleteAdventure = async (adventureId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Delete Adventure?",
      message:
        "Are you sure you want to delete this adventure? This action cannot be undone.",
      icon: "Trash2",
      confirmText: "Delete Adventure",
      confirmButtonClass: "bg-red-600 hover:bg-red-700",
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        try {
          setDeleting(adventureId);
          await deleteLocalAdventure(adventureId);
          setLocalAdventures((prev) =>
            prev.filter((a) => a.id !== adventureId),
          );
          addNotification("Adventure deleted successfully", "success");
        } catch (error: any) {
          console.error("Error deleting adventure:", error);
          addNotification(`Failed to delete: ${error.message}`, "failure");
        } finally {
          setDeleting(null);
        }
      },
    });
  };

  const [pendingPlay, setPendingPlay] = useState<
    { kind: "adventure"; adventure: LocalAdventure } | { kind: "freeform" } | null
  >(null);
  const [showJoinGameModal, setShowJoinGameModal] = useState(false);
  const [hostingStoryId, setHostingStoryId] = useState<string | null>(null);

  const handlePlayAdventure = (adventure: LocalAdventure) => {
    setPendingPlay({ kind: "adventure", adventure });
  };

  const handleStartFreeformStory = () => {
    setPendingPlay({ kind: "freeform" });
  };

  const beginPendingPlay = async (
    initialLore: StoryLore[],
    initialTables: CustomTable[] = [],
  ) => {
    if (!pendingPlay) return;
    const context = pendingPlay;
    setPendingPlay(null);
    try {
      const localId =
        context.kind === "adventure"
          ? await startAdventureLocally(
              context.adventure.adventureData,
              "Player",
              initialLore.length ? initialLore : undefined,
              initialTables.length ? initialTables : undefined,
            )
          : await startFreeformStoryLocally(
              "Player",
              initialLore.length ? initialLore : undefined,
              undefined,
              initialTables.length ? initialTables : undefined,
            );
      router.push(`/story?storyId=${localId}`);
    } catch (error: any) {
      console.error("Error starting story:", error);
      addNotification(`Failed to start: ${error.message}`, "failure");
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      addNotification("Please enter a folder name", "warning");
      return;
    }

    try {
      const folder = createLocalFolder(
        newFolderName,
        newFolderIcon,
        newFolderColor,
      );
      setFolders([...folders, folder]);
      setNewFolderName("");
      setNewFolderIcon("Folder");
      setNewFolderColor("#9333ea");
      setShowNewFolderDialog(false);
      addNotification("Folder created successfully", "success");
    } catch (error: any) {
      console.error("Error creating folder:", error);
      addNotification(`Failed to create folder: ${error.message}`, "failure");
    }
  };

  const handleUpdateFolder = async (
    folderId: string,
    updates: Partial<Pick<LocalFolder, "name" | "icon" | "color">>,
  ) => {
    try {
      const folder = updateLocalFolder(folderId, updates);
      if (!folder) {
        throw new Error("Folder not found");
      }
      setFolders(folders.map((f) => (f.id === folderId ? folder : f)));
      setEditingFolder(null);
      addNotification("Folder updated successfully", "success");
    } catch (error: any) {
      console.error("Error updating folder:", error);
      addNotification(`Failed to update folder: ${error.message}`, "failure");
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Delete Folder?",
      message:
        "Are you sure? Stories in this folder will not be deleted, just uncategorized.",
      icon: "Folder",
      confirmText: "Delete Folder",
      confirmButtonClass: "bg-orange-600 hover:bg-orange-700",
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        try {
          deleteLocalFolder(folderId);
          setFolders((prev) => prev.filter((f) => f.id !== folderId));
          setSelectedFolder((prev) => (prev === folderId ? null : prev));
          // Update stories to remove folder reference
          setLocalStories((prev) =>
            prev.map((s) =>
              s.folder_id === folderId ? { ...s, folder_id: null } : s,
            ),
          );
          // Notes share the same folder list; uncategorize any in this folder
          await unassignFolderFromNotes(folderId);
          addNotification("Folder deleted successfully", "success");
        } catch (error: any) {
          console.error("Error deleting folder:", error);
          addNotification(
            `Failed to delete folder: ${error.message}`,
            "failure",
          );
        }
      },
    });
  };

  const handleImportFolderFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const result = await readFolderLibraryFile(file);
    if (!result.success || !result.folder) {
      addNotification(result.error || "Failed to import folder", "failure");
      return;
    }

    try {
      const newFolder = createLocalFolder(
        result.folder.name,
        result.folder.icon,
        result.folder.color,
      );
      setFolders((prev) => [...prev, newFolder]);

      if (result.stories?.length) {
        await Promise.all(
          result.stories.map((s, index) => {
            const id = `local_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 9)}`;
            return saveLocalStory(id, s.storyData, newFolder.id);
          }),
        );
        setLocalStories(await listLocalStories());
      }

      if (result.notes?.length) {
        await Promise.all(
          result.notes.map((n) =>
            createLibraryNote({
              title: n.title,
              content: n.content,
              type: n.type,
              tags: n.tags,
              folderId: newFolder.id,
              pinned: n.pinned,
              source: n.source,
              sourceFile: n.sourceFile,
              relatedCharacters: n.relatedCharacters,
              relatedLocations: n.relatedLocations,
              keys: n.keys,
            }),
          ),
        );
      }

      if (result.tables?.length) {
        await Promise.all(
          result.tables.map((t) =>
            createLibraryTable({
              name: t.name,
              description: t.description,
              entries: t.entries,
              tags: t.tags,
              folderId: newFolder.id,
              pinned: t.pinned,
              source: t.source,
              sourceFile: t.sourceFile,
            }),
          ),
        );
      }

      // NotesLibraryTab keeps its own copy of notes/tables; force it to
      // reload if it's currently mounted so the import shows up right away.
      setNotesTablesRefreshKey((k) => k + 1);

      const parts = [
        result.stories?.length ? `${result.stories.length} stor${result.stories.length === 1 ? "y" : "ies"}` : null,
        result.notes?.length ? `${result.notes.length} note${result.notes.length === 1 ? "" : "s"}` : null,
        result.tables?.length ? `${result.tables.length} table${result.tables.length === 1 ? "" : "s"}` : null,
      ].filter(Boolean);
      addNotification(
        `Imported folder "${newFolder.name}"${parts.length ? ` (${parts.join(", ")})` : ""}${
          result.warnings.length > 0 ? ` - ${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"}` : ""
        }`,
        "success",
      );
    } catch (error: any) {
      console.error("Error importing folder:", error);
      addNotification(`Failed to import folder: ${error.message}`, "failure");
    }
  };

  const handleMoveStory = async (storyId: string, folderId: string | null) => {
    try {
      const localStory = await getLocalStory(storyId);
      if (!localStory) {
        throw new Error("Story not found");
      }

      await saveLocalStory(storyId, localStory.storyData, folderId);

      setLocalStories(
        localStories.map((s) =>
          s.id === storyId ? { ...s, folder_id: folderId } : s,
        ),
      );
      setMovingStory(null);
      addNotification("Story moved successfully", "success");
    } catch (error: any) {
      console.error("Error moving story:", error);
      addNotification(`Failed to move story: ${error.message}`, "failure");
    }
  };

  // Mass operation handlers
  const toggleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    setSelectedStories(new Set());
  };

  const toggleStorySelection = (storyId: string) => {
    const newSelection = new Set(selectedStories);
    if (newSelection.has(storyId)) {
      newSelection.delete(storyId);
    } else {
      newSelection.add(storyId);
    }
    setSelectedStories(newSelection);
  };

  const selectAllStories = () => {
    if (!selectionMode) setSelectionMode(true);
    const allIds = new Set(filteredLocalStories.map((s) => s.id));
    setSelectedStories(allIds);
  };

  const deselectAllStories = () => {
    setSelectedStories(new Set());
  };

  const handleMassDelete = () => {
    if (selectedStories.size === 0) return;

    // Capture the current selection to avoid stale closure
    const storiesToDelete = Array.from(selectedStories);

    setConfirmDialog({
      isOpen: true,
      title: "Delete Multiple Stories?",
      message: `Are you sure you want to delete ${storiesToDelete.length} ${
        storiesToDelete.length === 1 ? "story" : "stories"
      }? This action cannot be undone.`,
      icon: "Trash2",
      confirmText: `Delete ${storiesToDelete.length} ${
        storiesToDelete.length === 1 ? "Story" : "Stories"
      }`,
      confirmButtonClass: "bg-red-600 hover:bg-red-700",
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));

        const deletedIds: string[] = [];
        const failedIds: string[] = [];

        // Process deletions sequentially to avoid race conditions
        for (const storyId of storiesToDelete) {
          try {
            await deleteLocalStory(storyId);
            deletedIds.push(storyId);
          } catch (error) {
            console.error(`Failed to delete story ${storyId}:`, error);
            failedIds.push(storyId);
          }
        }

        // Update state for successfully deleted stories
        const deletedSet = new Set(deletedIds);
        setLocalStories((prev) => prev.filter((s) => !deletedSet.has(s.id)));
        setSelectedStories(new Set());
        setSelectionMode(false);

        if (failedIds.length > 0) {
          addNotification(
            `Deleted ${deletedIds.length} ${
              deletedIds.length === 1 ? "story" : "stories"
            }, ${failedIds.length} failed`,
            "warning",
          );
        } else if (deletedIds.length > 0) {
          addNotification(
            `${deletedIds.length} ${
              deletedIds.length === 1 ? "story" : "stories"
            } deleted successfully`,
            "success",
          );
        }
      },
    });
  };

  const handleMassMove = (folderId: string | null) => {
    if (selectedStories.size === 0) return;

    const moveStories = async () => {
      try {
        const movePromises = Array.from(selectedStories).map(
          async (storyId) => {
            const localStory = await getLocalStory(storyId);
            if (localStory) {
              await saveLocalStory(storyId, localStory.storyData, folderId);
            }
            return storyId;
          },
        );

        // Use allSettled to continue even if some moves fail
        const results = await Promise.allSettled(movePromises);

        // Separate successful and failed moves
        const movedIds = new Set<string>();
        const failedCount = results.filter((r) => {
          if (r.status === "fulfilled") {
            movedIds.add(r.value);
            return false;
          }
          return true;
        }).length;

        // Update state for successfully moved stories
        setLocalStories(
          localStories.map((s) =>
            movedIds.has(s.id) ? { ...s, folder_id: folderId } : s,
          ),
        );
        setSelectedStories(new Set());
        setSelectionMode(false);

        const folderName = folderId
          ? folders.find((f) => f.id === folderId)?.name || "folder"
          : "Uncategorized";

        if (failedCount > 0) {
          addNotification(
            `Moved ${movedIds.size} ${
              movedIds.size === 1 ? "story" : "stories"
            } to ${folderName}, ${failedCount} failed`,
            "warning",
          );
        } else {
          addNotification(
            `${movedIds.size} ${
              movedIds.size === 1 ? "story" : "stories"
            } moved to ${folderName}`,
            "success",
          );
        }
      } catch (error: any) {
        console.error("Error moving stories:", error);
        addNotification(
          `Failed to move some stories: ${error.message}`,
          "failure",
        );
      }
    };

    moveStories();
  };

  // Filter and sort stories
  const filteredLocalStories = localStories
    .filter((story) => {
      // Folder filter
      if (selectedFolder !== null) {
        if (selectedFolder === "uncategorized") {
          if (story.folder_id) return false;
        } else if (story.folder_id !== selectedFolder) {
          return false;
        }
      }
      // Search filter
      if (
        storySearch &&
        !story.title.toLowerCase().includes(storySearch.toLowerCase())
      ) {
        return false;
      }
      // Local stories are always "in progress"
      if (storyFilter === "completed") return false;
      return true;
    })
    .sort((a, b) => {
      switch (storySortBy) {
        case "updated":
        case "created":
          return (
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
        case "name":
          return a.title.localeCompare(b.title);
        case "chapter":
          const chapterA = a.storyData?.currentChapter ?? 0;
          const chapterB = b.storyData?.currentChapter ?? 0;
          return chapterB - chapterA;
        default:
          return 0;
      }
    });

  // Filter and sort adventures
  const filteredLocalAdventures = localAdventures
    .filter((adventure) => {
      // Search filter
      if (
        adventureSearch &&
        !adventure.title
          .toLowerCase()
          .includes(adventureSearch.toLowerCase()) &&
        !adventure.description
          .toLowerCase()
          .includes(adventureSearch.toLowerCase())
      ) {
        return false;
      }
      // Local adventures are drafts
      if (adventureFilter === "published") return false;
      return true;
    })
    .sort((a, b) => {
      switch (adventureSortBy) {
        case "updated":
        case "created":
          return (
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
        case "title":
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

  if (loading && localStories.length === 0 && localAdventures.length === 0) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-400"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 text-white">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 bg-blue-950/80 backdrop-blur-xl border-b border-blue-800/30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <DynamicIcon name="ArrowLeft" className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold">Library</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowJoinGameModal(true)}
              title="Join someone else's online room with a room code"
              className="flex items-center gap-2 px-4 py-2 bg-blue-900/50 hover:bg-blue-800/60 border border-blue-700/50 rounded-xl transition-colors text-sm font-medium"
            >
              <DynamicIcon name="Wifi" className="w-4 h-4" />
              <span className="hidden sm:inline">Join a Game</span>
            </button>
            {view === "stories" && (
              <button
                onClick={handleStartFreeformStory}
                title="Skip adventure setup - talk to the GM and build the world as you play"
                className="flex items-center gap-2 px-4 py-2 bg-blue-900/50 hover:bg-blue-800/60 border border-blue-700/50 rounded-xl transition-colors text-sm font-medium"
              >
                <DynamicIcon name="MessageCircle" className="w-4 h-4" />
                <span className="hidden sm:inline">Freeform Story</span>
              </button>
            )}
            {view !== "notes" && (
              <button
                onClick={() =>
                  view === "stories"
                    ? setView("adventures")
                    : router.push("/creator")
                }
                className="flex items-center gap-2 px-4 py-2 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-xl transition-colors text-sm font-medium"
              >
                <DynamicIcon name="Plus" className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {view === "stories" ? "New Story" : "New Adventure"}
                </span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Tab Pills */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setView("stories")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              view === "stories"
                ? "bg-linear-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/25"
                : "bg-blue-900/50 text-blue-200/70 hover:bg-blue-800/50 hover:text-white"
            }`}
          >
            <DynamicIcon name="Book" className="w-4 h-4 inline-block mr-2" />
            Stories ({localStories.length})
          </button>
          <button
            onClick={() => setView("adventures")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              view === "adventures"
                ? "bg-linear-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/25"
                : "bg-blue-900/50 text-blue-200/70 hover:bg-blue-800/50 hover:text-white"
            }`}
          >
            <DynamicIcon
              name="Gamepad2"
              className="w-4 h-4 inline-block mr-2"
            />
            Adventures ({localAdventures.length})
          </button>
          <button
            onClick={() => setView("notes")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              view === "notes"
                ? "bg-linear-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/25"
                : "bg-blue-900/50 text-blue-200/70 hover:bg-blue-800/50 hover:text-white"
            }`}
          >
            <DynamicIcon
              name="NotebookText"
              className="w-4 h-4 inline-block mr-2"
            />
            Notes ({notesCount})
          </button>
        </div>

        {/* Content */}
        {view === "notes" ? (
          <NotesLibraryTab
            key={notesTablesRefreshKey}
            onCountChange={setNotesCount}
            folders={folders}
            setFolders={setFolders}
            onExportFolder={setExportingFolder}
          />
        ) : loading ? (
          view === "stories" ? (
            <LibrarySkeleton />
          ) : (
            <AdventureGridSkeleton count={6} />
          )
        ) : view === "stories" ? (
          <div className="space-y-4">
            {/* Search + Folder Dropdown + Sort */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <DynamicIcon
                  name="Search"
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400/50"
                />
                <input
                  type="text"
                  value={storySearch}
                  onChange={(e) => setStorySearch(e.target.value)}
                  placeholder="Search stories..."
                  className="w-full pl-10 pr-4 py-2.5 bg-blue-900/50 border border-blue-700/50 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:border-purple-500/50 focus:bg-blue-900/70 transition-all"
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={selectedFolder || "all"}
                  onChange={(e) =>
                    setSelectedFolder(
                      e.target.value === "all" ? null : e.target.value,
                    )
                  }
                  className="px-4 py-2.5 bg-blue-900/50 border border-blue-700/50 rounded-xl text-white focus:outline-none focus:border-purple-500/50 transition-all"
                >
                  <option value="all">All Stories</option>
                  <option value="uncategorized">Uncategorized</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
                <select
                  value={storySortBy}
                  onChange={(e) =>
                    setStorySortBy(e.target.value as StorySortBy)
                  }
                  className="px-4 py-2.5 bg-blue-900/50 border border-blue-700/50 rounded-xl text-white focus:outline-none focus:border-purple-500/50 transition-all"
                >
                  <option value="updated">Recent</option>
                  <option value="created">Created</option>
                  <option value="name">A-Z</option>
                  <option value="chapter">Progress</option>
                </select>
              </div>
            </div>

            {/* Folder Chips */}
            <DraggableScroll className="pb-2" innerClassName="gap-2 px-1">
              <button
                onClick={() => setSelectedFolder(null)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  selectedFolder === null
                    ? "bg-linear-to-r from-purple-600 to-blue-600 text-white"
                    : "bg-blue-900/50 text-blue-200/70 hover:bg-blue-800/50"
                }`}
              >
                <DynamicIcon name="Book" className="w-3.5 h-3.5" />
                All ({localStories.length})
              </button>
              <button
                onClick={() => setSelectedFolder("uncategorized")}
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  selectedFolder === "uncategorized"
                    ? "bg-linear-to-r from-purple-600 to-blue-600 text-white"
                    : "bg-blue-900/50 text-blue-200/70 hover:bg-blue-800/50"
                }`}
              >
                <DynamicIcon name="FileText" className="w-3.5 h-3.5" />
                Uncategorized ({localStories.filter((s) => !s.folder_id).length}
                )
              </button>
              {folders.map((folder) => (
                <div key={folder.id} className="relative group shrink-0">
                  <button
                    onClick={() => setSelectedFolder(folder.id)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      selectedFolder === folder.id
                        ? "bg-linear-to-r from-purple-600 to-blue-600 text-white"
                        : "bg-blue-900/50 text-blue-200/70 hover:bg-blue-800/50"
                    }`}
                    style={{ borderLeft: `3px solid ${folder.color}` }}
                  >
                    <DynamicIcon name={folder.icon} className="w-3.5 h-3.5" />
                    {folder.name} (
                    {localStories.filter((s) => s.folder_id === folder.id).length}
                    )
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExportingFolder(folder);
                    }}
                    title="Export folder"
                    className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 p-0.5 rounded-full bg-blue-800 hover:bg-purple-600 border border-blue-950 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                  >
                    <DynamicIcon name="Download" className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setShowNewFolderDialog(true)}
                className="px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap bg-blue-900/30 text-blue-300/70 hover:bg-blue-800/50 transition-all flex items-center gap-1.5 border border-dashed border-blue-700/50"
              >
                <DynamicIcon name="Plus" className="w-3.5 h-3.5" />
                New Folder
              </button>
              <button
                onClick={() => importFolderInputRef.current?.click()}
                className="px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap bg-blue-900/30 text-blue-300/70 hover:bg-blue-800/50 transition-all flex items-center gap-1.5 border border-dashed border-blue-700/50"
              >
                <DynamicIcon name="Upload" className="w-3.5 h-3.5" />
                Import Folder
              </button>
              <input
                ref={importFolderInputRef}
                type="file"
                accept=".folder,.json"
                onChange={handleImportFolderFileChange}
                className="hidden"
              />
            </DraggableScroll>

            {/* Filter Pills + Select Button */}
            <div className="flex items-center gap-2">
              <div className="flex gap-2">
                {["all", "inProgress", "completed"].map((filter) => (
                  <button
                    key={filter}
                    onClick={() =>
                      setStoryFilter(
                        filter as "all" | "completed" | "inProgress",
                      )
                    }
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      storyFilter === filter
                        ? "bg-purple-600 text-white"
                        : "bg-blue-900/30 text-blue-200/60 hover:bg-blue-800/40"
                    }`}
                  >
                    {filter === "all"
                      ? "All"
                      : filter === "inProgress"
                        ? "In Progress"
                        : "Completed"}
                  </button>
                ))}
              </div>

              {/* Select mode + Select All buttons - only show when there are stories */}
              {filteredLocalStories.length > 0 && (
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={toggleSelectionMode}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                      selectionMode
                        ? "bg-purple-600 text-white"
                        : "bg-blue-900/30 text-blue-200/60 hover:bg-blue-800/40"
                    }`}
                  >
                    <DynamicIcon
                      name={selectionMode ? "Check" : "CheckSquare"}
                      className="w-3.5 h-3.5"
                    />
                    {selectionMode ? "Done" : "Select"}
                  </button>
                  <button
                    onClick={selectAllStories}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-blue-900/30 text-blue-200/60 hover:bg-blue-800/40"
                  >
                    Select All
                  </button>
                </div>
              )}
            </div>

            {/* Selection Actions Bar */}
            {selectionMode && selectedStories.size > 0 && (
              <div className="flex items-center gap-3 p-3 bg-purple-900/30 border border-purple-700/30 rounded-xl">
                <span className="text-sm font-medium">
                  {selectedStories.size} selected
                </span>
                <div className="flex-1" />
                <div className="relative">
                  <button
                    onClick={() =>
                      setShowMassMoveDropdown(!showMassMoveDropdown)
                    }
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-sm rounded-lg transition-colors flex items-center gap-2"
                  >
                    <DynamicIcon name="FolderOpen" className="w-4 h-4" />
                    Move
                  </button>
                  {showMassMoveDropdown && (
                    <div className="absolute top-full right-0 mt-1 bg-blue-950 border border-blue-800/50 rounded-lg shadow-xl p-2 min-w-[180px] z-50">
                      <button
                        onClick={() => {
                          handleMassMove(null);
                          setShowMassMoveDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-blue-900/50 rounded-lg text-sm"
                      >
                        Uncategorized
                      </button>
                      {folders.map((folder) => (
                        <button
                          key={folder.id}
                          onClick={() => {
                            handleMassMove(folder.id);
                            setShowMassMoveDropdown(false);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-blue-900/50 rounded-lg text-sm"
                          style={{ borderLeft: `3px solid ${folder.color}` }}
                        >
                          {folder.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={handleMassDelete}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-sm rounded-lg transition-colors flex items-center gap-2"
                >
                  <DynamicIcon name="Trash2" className="w-4 h-4" />
                  Delete
                </button>
                <button
                  onClick={deselectAllStories}
                  className="px-3 py-1.5 bg-blue-900/50 hover:bg-blue-800/50 text-sm rounded-lg transition-colors"
                >
                  Clear
                </button>
              </div>
            )}

            {/* Stories List */}
            {filteredLocalStories.length === 0 ? (
              <div className="bg-blue-950/50 rounded-2xl p-12 text-center border border-blue-800/30">
                <DynamicIcon
                  name="BookOpen"
                  className="w-16 h-16 text-blue-400/30 mx-auto mb-4"
                />
                <h3 className="text-xl font-bold mb-2">
                  {localStories.length === 0
                    ? "No Stories Yet"
                    : "No Stories Match Filters"}
                </h3>
                <p className="text-blue-200/60 mb-6">
                  {localStories.length === 0
                    ? "Start an adventure to create your first story!"
                    : "Try adjusting your search or filters."}
                </p>
                {localStories.length === 0 && (
                  <button
                    onClick={() => setView("adventures")}
                    className="px-6 py-3 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 font-semibold rounded-xl transition-colors"
                  >
                    Explore Adventures
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Local Stories */}
                {filteredLocalStories.map((story) => {
                  const chapter = story.storyData?.currentChapter ?? 0;
                  const timeSinceUpdate = getRelativeTime(
                    String(story.updatedAt),
                  );

                  return (
                    <div
                      key={story.id}
                      onClick={() =>
                        selectionMode
                          ? toggleStorySelection(story.id)
                          : router.push(`/story?storyId=${story.id}`)
                      }
                      className={`group relative p-4 rounded-xl border transition-all cursor-pointer ${
                        selectionMode && selectedStories.has(story.id)
                          ? "bg-purple-900/30 border-purple-500"
                          : "bg-blue-950/50 border-blue-800/30 hover:bg-blue-900/50 hover:border-blue-700/50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {selectionMode && (
                          <div
                            className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors shrink-0 ${
                              selectedStories.has(story.id)
                                ? "bg-purple-600 border-purple-600"
                                : "border-blue-600"
                            }`}
                          >
                            {selectedStories.has(story.id) && (
                              <DynamicIcon name="Check" className="w-3 h-3" />
                            )}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="font-semibold">{story.title}</h3>
                            <span className="px-1.5 py-0.5 bg-gray-500/20 text-gray-400 text-xs rounded flex items-center gap-1 shrink-0">
                              <DynamicIcon
                                name="HardDrive"
                                className="w-3 h-3"
                              />{" "}
                              Local
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-blue-200/50 mb-2">
                            <span>{timeSinceUpdate}</span>
                            <span>Ch. {chapter + 1}</span>
                          </div>
                          {/* Progress Bar */}
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-blue-900/50 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gray-500 rounded-full"
                                style={{ width: "10%" }}
                              />
                            </div>
                            <span className="text-xs text-blue-200/40">
                              New
                            </span>
                          </div>
                        </div>
                        {!selectionMode && (
                          <div
                            className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => setHostingStoryId(story.id)}
                              className="p-1.5 hover:bg-blue-800/50 rounded-lg transition-colors"
                              title="Host this story online"
                            >
                              <DynamicIcon name="Wifi" className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setMovingStory(story.id)}
                              className="p-1.5 hover:bg-blue-800/50 rounded-lg transition-colors"
                              title="Move"
                            >
                              <DynamicIcon name="Folder" className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteStory(story.id)}
                              disabled={deleting === story.id}
                              className="p-1.5 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                              title="Delete"
                            >
                              {deleting === story.id ? (
                                <DynamicIcon
                                  name="Loader2"
                                  className="w-4 h-4 animate-spin"
                                />
                              ) : (
                                <DynamicIcon
                                  name="Trash2"
                                  className="w-4 h-4"
                                />
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Search + Filter Row */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <DynamicIcon
                  name="Search"
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400/50"
                />
                <input
                  type="text"
                  value={adventureSearch}
                  onChange={(e) => setAdventureSearch(e.target.value)}
                  placeholder="Search adventures..."
                  className="w-full pl-10 pr-4 py-2.5 bg-blue-900/50 border border-blue-700/50 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:border-purple-500/50 focus:bg-blue-900/70 transition-all"
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={adventureFilter}
                  onChange={(e) =>
                    setAdventureFilter(
                      e.target.value as "all" | "published" | "draft",
                    )
                  }
                  className="px-4 py-2.5 bg-blue-900/50 border border-blue-700/50 rounded-xl text-white focus:outline-none focus:border-purple-500/50 transition-all"
                >
                  <option value="all">All</option>
                  <option value="published">Published</option>
                  <option value="draft">Drafts</option>
                </select>
                <select
                  value={adventureSortBy}
                  onChange={(e) =>
                    setAdventureSortBy(e.target.value as AdventureSortBy)
                  }
                  className="px-4 py-2.5 bg-blue-900/50 border border-blue-700/50 rounded-xl text-white focus:outline-none focus:border-purple-500/50 transition-all"
                >
                  <option value="updated">Recent</option>
                  <option value="created">Created</option>
                  <option value="title">A-Z</option>
                </select>
              </div>
            </div>

            {/* Adventures Grid */}
            {filteredLocalAdventures.length === 0 ? (
              <div className="bg-blue-950/50 rounded-2xl p-12 text-center border border-blue-800/30">
                <DynamicIcon
                  name="Gamepad2"
                  className="w-16 h-16 text-blue-400/30 mx-auto mb-4"
                />
                <h3 className="text-xl font-bold mb-2">
                  {localAdventures.length === 0
                    ? "No Adventures Yet"
                    : "No Adventures Match Filters"}
                </h3>
                <p className="text-blue-200/60 mb-6">
                  {localAdventures.length === 0
                    ? "Create your first adventure!"
                    : "Try adjusting your search or filters."}
                </p>
                {localAdventures.length === 0 && (
                  <button
                    onClick={() => router.push("/creator")}
                    className="px-6 py-3 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 font-semibold rounded-xl transition-colors"
                  >
                    Create Adventure
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Local Adventures */}
                {filteredLocalAdventures.map((adventure) => (
                  <div
                    key={adventure.id}
                    className="group relative bg-blue-950/50 rounded-xl overflow-hidden border border-blue-800/30 hover:border-blue-700/50 transition-all cursor-pointer"
                    onClick={() => handlePlayAdventure(adventure)}
                  >
                    {/* Thumbnail */}
                    <div className="relative h-32">
                      {adventure.adventureData.thumbnailUrl ? (
                        <div
                          className="absolute inset-0 bg-cover bg-center"
                          style={{
                            backgroundImage: `url(${adventure.adventureData.thumbnailUrl})`,
                          }}
                        />
                      ) : (
                        <div className="absolute inset-0 bg-linear-to-br from-gray-600 via-gray-700 to-gray-800" />
                      )}
                      <div className="absolute inset-0 bg-linear-to-t from-gray-900/90 via-transparent to-transparent" />

                      {/* Badge */}
                      <div className="absolute top-2 right-2">
                        <span className="px-1.5 py-0.5 bg-gray-500/20 backdrop-blur text-gray-300 text-xs rounded flex items-center gap-1">
                          <DynamicIcon name="HardDrive" className="w-3 h-3" />{" "}
                          Local
                        </span>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-3">
                      <h3 className="font-semibold truncate mb-1">
                        {adventure.title}
                      </h3>
                      <p className="text-xs text-blue-200/50 line-clamp-2 mb-2">
                        {adventure.description}
                      </p>

                      {/* Tags */}
                      <div className="flex flex-wrap gap-1 mb-2">
                        {adventure.adventureData.tags
                          ?.slice(0, 2)
                          .map((tag: string) => (
                            <span
                              key={tag}
                              className="px-1.5 py-0.5 bg-purple-500/20 text-purple-300 text-xs rounded"
                            >
                              {tag}
                            </span>
                          ))}
                      </div>

                      {/* Updated */}
                      <div className="text-xs text-blue-200/40 mb-3">
                        {getRelativeTime(String(adventure.updatedAt))}
                      </div>

                      {/* Actions */}
                      <div
                        className="flex gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => handlePlayAdventure(adventure)}
                          className="flex-1 px-3 py-1.5 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-sm rounded-lg transition-colors"
                        >
                          Play
                        </button>
                        <button
                          onClick={() =>
                            router.push(`/creator/manual?edit=${adventure.id}`)
                          }
                          className="px-3 py-1.5 bg-blue-900/50 hover:bg-blue-800/50 text-sm rounded-lg transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteAdventure(adventure.id)}
                          disabled={deleting === adventure.id}
                          className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg transition-colors"
                        >
                          {deleting === adventure.id ? (
                            <DynamicIcon
                              name="Loader2"
                              className="w-4 h-4 animate-spin"
                            />
                          ) : (
                            <DynamicIcon name="Trash2" className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Folder Management Dialogs */}
      {showNewFolderDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-blue-950 border border-blue-800/50 rounded-xl p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Create Folder</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-blue-200/70 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                  className="w-full px-3 py-2 bg-blue-900/50 border border-blue-700/50 rounded-lg text-white placeholder-blue-300/50 focus:outline-none focus:border-purple-500"
                  placeholder="My Folder"
                  autoFocus
                />
              </div>
              <div>
                <IconPicker
                  label="Icon"
                  value={newFolderIcon}
                  onChange={setNewFolderIcon}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200/70 mb-1">
                  Color
                </label>
                <input
                  type="color"
                  value={newFolderColor}
                  onChange={(e) => setNewFolderColor(e.target.value)}
                  className="w-full h-10 rounded-lg cursor-pointer bg-blue-900/50"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowNewFolderDialog(false);
                  setNewFolderName("");
                  setNewFolderIcon("Folder");
                  setNewFolderColor("#9333ea");
                }}
                className="flex-1 px-4 py-2 bg-blue-900/50 hover:bg-blue-800/50 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {editingFolder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-blue-950 border border-blue-800/50 rounded-xl p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Edit Folder</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-blue-200/70 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    editingFolder &&
                    handleUpdateFolder(editingFolder.id, {
                      name: newFolderName,
                      icon: newFolderIcon,
                      color: newFolderColor,
                    })
                  }
                  className="w-full px-3 py-2 bg-blue-900/50 border border-blue-700/50 rounded-lg text-white placeholder-blue-300/50 focus:outline-none focus:border-purple-500"
                  placeholder="My Folder"
                  autoFocus
                />
              </div>
              <div>
                <IconPicker
                  label="Icon"
                  value={newFolderIcon}
                  onChange={setNewFolderIcon}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200/70 mb-1">
                  Color
                </label>
                <input
                  type="color"
                  value={newFolderColor}
                  onChange={(e) => setNewFolderColor(e.target.value)}
                  className="w-full h-10 rounded-lg cursor-pointer bg-blue-900/50"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setEditingFolder(null);
                  setNewFolderName("");
                  setNewFolderIcon("Folder");
                  setNewFolderColor("#9333ea");
                }}
                className="flex-1 px-4 py-2 bg-blue-900/50 hover:bg-blue-800/50 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  editingFolder &&
                  handleUpdateFolder(editingFolder.id, {
                    name: newFolderName,
                    icon: newFolderIcon,
                    color: newFolderColor,
                  })
                }
                disabled={!newFolderName.trim()}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {movingStory && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-blue-950 border border-blue-800/50 rounded-xl p-6 max-w-md w-full">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Move to Folder
            </h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              <button
                onClick={() => {
                  if (!movingStory) return;
                  handleMoveStory(movingStory, null);
                }}
                className="w-full p-3 text-left rounded-lg border-2 border-gray-300 dark:border-gray-600 hover:border-purple-500 dark:hover:border-purple-400 transition-colors"
              >
                <span className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <DynamicIcon name="FolderOpen" className="w-5 h-5" />{" "}
                  Uncategorized
                </span>
              </button>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => {
                    if (!movingStory) return;
                    handleMoveStory(movingStory, folder.id);
                  }}
                  className="w-full p-3 text-left rounded-lg border-2 hover:border-purple-500 dark:hover:border-purple-400 transition-colors"
                  style={{
                    borderLeftColor: folder.color,
                    borderLeftWidth: "4px",
                  }}
                >
                  <span className="text-gray-900 dark:text-white flex items-center gap-2">
                    <DynamicIcon name={folder.icon} className="w-5 h-5" />{" "}
                    {folder.name}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setMovingStory(null)}
              className="w-full mt-4 px-4 py-2 bg-gray-200 dark:bg-gray-900 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        icon={confirmDialog.icon}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        confirmButtonClass={confirmDialog.confirmButtonClass}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />

      <LibraryPickerModal
        isOpen={pendingPlay !== null}
        onClose={() => setPendingPlay(null)}
        title="Bring a Character or Notes"
        description="Attach an existing character sheet, world notes, or random tables before you start, or skip and go in blank."
        confirmLabel="Attach & Start"
        includeTables
        onSkip={() => beginPendingPlay([])}
        onImport={(notes, tables) =>
          beginPendingPlay(
            notes.map(libraryNoteToStoryLore),
            tables.map(libraryTableToCustomTable),
          )
        }
      />

      <JoinGameModal
        isOpen={showJoinGameModal}
        onClose={() => setShowJoinGameModal(false)}
      />

      <HostGameModal
        isOpen={hostingStoryId !== null}
        onClose={() => setHostingStoryId(null)}
        storyId={hostingStoryId || ""}
      />

      {exportingFolder && (
        <ExportFolderModal
          folder={exportingFolder}
          stories={localStories}
          onClose={() => setExportingFolder(null)}
        />
      )}
    </div>
  );
}
